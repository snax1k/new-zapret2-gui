// Встроенный прокси Telegram: мост MTProto → WebSocket.
//
// Зачем это отдельно от обхода DPI. Блокировка Telegram в России устроена
// иначе, чем блокировка YouTube: закрывают маршрут до подсетей дата-центров,
// а не разбирают содержимое пакетов. SYN уходит, SYN-ACK не приходит ни разу.
// Десинхронизация тут бессильна по своей природе — резать нечего, соединение
// не устанавливается вовсе. Именно поэтому профиль Telegram убран из winws
// в 0.1.5 (коммит 30c3990), и возвращать его бессмысленно.
//
// Работающий путь — подменить транспорт. Клиент Telegram умеет ходить через
// MTProxy, а у самого Telegram есть веб-транспорт: веб-версия говорит с
// дата-центрами по WebSocket поверх TLS на kws{dc}.web.telegram.org. Эти
// адреса не в заблокированных подсетях, а снаружи соединение выглядит как
// обычный HTTPS к сайту. Мост принимает от клиента MTProto и отдаёт его в
// этот WebSocket.
//
// Схема целиком:
//
//   Telegram Desktop --MTProto--> 127.0.0.1:1443 --WSS--> kws2.web.telegram.org
//                     (localhost, DPI не видит)   (обычный TLS с SNI)
//
// Порт логики с Flowseal/tg-ws-proxy (MIT, Python) через его перенос на
// TypeScript в AvenCores/zapret-gui-nodejs. Здесь реализовано ядро схемы:
// разбор рукопожатия, перешифровка, нарезка на кадры, WebSocket-клиент,
// домен-фронтинг и прямой TCP как резерв. Не портированы FakeTLS,
// фолбэки через Cloudflare, PROXY-протокол и пул прогретых соединений.
using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography;
using System.Text;
using System.Threading;

namespace Zapret2App
{
    /// <summary>Мелкие операции с массивами байт — в C# 5 их приходится писать руками.</summary>
    internal static class TgBytes
    {
        public static byte[] Sub(byte[] src, int offset, int count)
        {
            byte[] dst = new byte[count];
            Buffer.BlockCopy(src, offset, dst, 0, count);
            return dst;
        }

        public static byte[] Concat(byte[] a, byte[] b)
        {
            byte[] dst = new byte[a.Length + b.Length];
            Buffer.BlockCopy(a, 0, dst, 0, a.Length);
            Buffer.BlockCopy(b, 0, dst, a.Length, b.Length);
            return dst;
        }

        public static byte[] Reversed(byte[] src)
        {
            byte[] dst = new byte[src.Length];
            for (int i = 0; i < src.Length; i++) dst[i] = src[src.Length - 1 - i];
            return dst;
        }

        public static bool Eq(byte[] a, byte[] b)
        {
            if (a.Length != b.Length) return false;
            for (int i = 0; i < a.Length; i++) if (a[i] != b[i]) return false;
            return true;
        }

        public static string Hex(byte[] src, int offset, int count)
        {
            var sb = new StringBuilder(count * 2);
            for (int i = 0; i < count; i++) sb.Append(src[offset + i].ToString("x2"));
            return sb.ToString();
        }

        public static byte[] FromHex(string hex)
        {
            if (hex == null) return null;
            hex = hex.Trim().ToLowerInvariant();
            if (hex.Length % 2 != 0) return null;
            byte[] dst = new byte[hex.Length / 2];
            for (int i = 0; i < dst.Length; i++)
            {
                int hi = HexVal(hex[i * 2]);
                int lo = HexVal(hex[i * 2 + 1]);
                if (hi < 0 || lo < 0) return null;
                dst[i] = (byte)((hi << 4) | lo);
            }
            return dst;
        }

        private static int HexVal(char c)
        {
            if (c >= '0' && c <= '9') return c - '0';
            if (c >= 'a' && c <= 'f') return c - 'a' + 10;
            return -1;
        }

        public static string HumanSize(long n)
        {
            if (n >= 1073741824L) return (n / 1073741824.0).ToString("0.0") + " ГБ";
            if (n >= 1048576L) return (n / 1048576.0).ToString("0.0") + " МБ";
            if (n >= 1024L) return (n / 1024.0).ToString("0.0") + " КБ";
            return n + " Б";
        }
    }

    /// <summary>
    /// Потоковый AES-256-CTR.
    /// </summary>
    /// <remarks>
    /// В .NET Framework режима CTR нет — есть только CBC, ECB и CFB. CTR
    /// собирается из ECB вручную: шифруется счётчик, результат складывается с
    /// данными по XOR. Счётчик — все 16 байт как одно число с инкрементом
    /// справа налево, так его считает и эталонная реализация.
    ///
    /// Объект хранит состояние: остаток гаммы от прошлого вызова и текущее
    /// значение счётчика. Поэтому один экземпляр обслуживает ровно одно
    /// направление одного соединения и не может использоваться из двух потоков.
    /// </remarks>
    internal sealed class AesCtr : IDisposable
    {
        private readonly SymmetricAlgorithm aes;
        private readonly ICryptoTransform ecb;
        private readonly byte[] counter = new byte[16];
        private readonly byte[] pad = new byte[16];
        private int padPos = 16;

        public AesCtr(byte[] key, byte[] iv)
        {
            if (key == null || key.Length != 32) throw new ArgumentException("ключ AES-CTR должен быть 32 байта");
            if (iv == null || iv.Length != 16) throw new ArgumentException("IV AES-CTR должен быть 16 байт");
            aes = new AesCryptoServiceProvider();
            aes.Mode = CipherMode.ECB;
            aes.Padding = PaddingMode.None;
            aes.Key = key;
            ecb = aes.CreateEncryptor();
            Buffer.BlockCopy(iv, 0, counter, 0, 16);
        }

        public byte[] Update(byte[] data)
        {
            return Update(data, 0, data.Length);
        }

        public byte[] Update(byte[] data, int offset, int count)
        {
            byte[] res = new byte[count];
            int pos = 0;
            while (pos < count)
            {
                if (padPos == 16)
                {
                    int whole = (count - pos) / 16;
                    if (whole > 1)
                    {
                        // Гамма сразу на несколько блоков: ECB не имеет сцепления,
                        // и один вызов шифра на 64 блока заметно дешевле, чем 64
                        // вызова на каждые 16 байт.
                        int blocks = whole > 64 ? 64 : whole;
                        byte[] ctrs = new byte[blocks * 16];
                        for (int b = 0; b < blocks; b++)
                        {
                            Buffer.BlockCopy(counter, 0, ctrs, b * 16, 16);
                            Increment();
                        }
                        byte[] gamma = new byte[ctrs.Length];
                        ecb.TransformBlock(ctrs, 0, ctrs.Length, gamma, 0);
                        for (int i = 0; i < gamma.Length; i++)
                        {
                            res[pos + i] = (byte)(data[offset + pos + i] ^ gamma[i]);
                        }
                        pos += gamma.Length;
                        continue;
                    }
                    ecb.TransformBlock(counter, 0, 16, pad, 0);
                    Increment();
                    padPos = 0;
                }
                res[pos] = (byte)(data[offset + pos] ^ pad[padPos]);
                padPos++;
                pos++;
            }
            return res;
        }

        private void Increment()
        {
            for (int i = 15; i >= 0; i--)
            {
                counter[i]++;
                if (counter[i] != 0) break;
            }
        }

        public void Dispose()
        {
            try { ecb.Dispose(); } catch { }
            try { aes.Clear(); } catch { }
        }
    }

    /// <summary>Что удалось вытащить из 64-байтового init-пакета клиента.</summary>
    internal sealed class MtHandshake
    {
        public int DcId;
        public bool IsMedia;
        public byte[] ProtoTag;
        /// <summary>Байты 8..56 исходного пакета — из них выводятся ключи клиента.</summary>
        public byte[] PrekeyIv;
    }

    /// <summary>
    /// Четыре потока шифрования одной сессии.
    /// </summary>
    /// <remarks>
    /// Прокси сидит посередине и перешифровывает поток: у клиента свои ключи
    /// (выведены из его init-пакета и общего секрета), у дата-центра свои
    /// (выведены из init-пакета, который прокси сочинил сам). Полезную
    /// нагрузку это не раскрывает — внутри ещё слой шифрования самого
    /// Telegram, и ключей от него у прокси нет.
    /// </remarks>
    internal sealed class CryptoCtx : IDisposable
    {
        public readonly AesCtr CltDec;
        public readonly AesCtr CltEnc;
        public readonly AesCtr TgEnc;
        public readonly AesCtr TgDec;

        public CryptoCtx(AesCtr cltDec, AesCtr cltEnc, AesCtr tgEnc, AesCtr tgDec)
        {
            CltDec = cltDec; CltEnc = cltEnc; TgEnc = tgEnc; TgDec = tgDec;
        }

        public void Dispose()
        {
            CltDec.Dispose(); CltEnc.Dispose(); TgEnc.Dispose(); TgDec.Dispose();
        }
    }

    /// <summary>Разбор рукопожатия MTProto и вывод ключей.</summary>
    internal static class TgCrypto
    {
        public const int HandshakeLen = 64;

        public static readonly byte[] TagAbridged = new byte[] { 0xef, 0xef, 0xef, 0xef };
        public static readonly byte[] TagIntermediate = new byte[] { 0xee, 0xee, 0xee, 0xee };
        public static readonly byte[] TagSecure = new byte[] { 0xdd, 0xdd, 0xdd, 0xdd };

        public const uint ProtoAbridged = 0xefefefef;
        public const uint ProtoIntermediate = 0xeeeeeeee;
        public const uint ProtoPaddedIntermediate = 0xdddddddd;

        private static readonly byte[] Zero64 = new byte[64];
        private static readonly RNGCryptoServiceProvider Rng = new RNGCryptoServiceProvider();

        // Первые четыре байта случайного init-пакета не должны совпасть ни с
        // одним из этих значений: иначе сервер примет его за HTTP-запрос или
        // за уже опознанный протокол.
        private static readonly string[] ReservedStarts = new string[]
        {
            "48454144", "504f5354", "47455420", "eeeeeeee", "dddddddd", "16030102"
        };

        public static byte[] RandomBytes(int n)
        {
            byte[] b = new byte[n];
            Rng.GetBytes(b);
            return b;
        }

        private static byte[] Sha256(byte[] data)
        {
            using (var sha = SHA256.Create()) return sha.ComputeHash(data);
        }

        /// <summary>
        /// Расшифровать init-пакет клиента и достать из него номер дата-центра.
        /// </summary>
        /// <returns>null, если секрет не подошёл или протокол незнакомый.</returns>
        public static MtHandshake TryHandshake(byte[] handshake, byte[] secret)
        {
            if (handshake == null || handshake.Length != HandshakeLen) return null;
            if (secret == null || secret.Length != 16) return null;

            byte[] prekeyIv = TgBytes.Sub(handshake, 8, 48);
            byte[] decKey = Sha256(TgBytes.Concat(TgBytes.Sub(prekeyIv, 0, 32), secret));
            byte[] decrypted;
            using (var ctr = new AesCtr(decKey, TgBytes.Sub(prekeyIv, 32, 16)))
            {
                decrypted = ctr.Update(handshake);
            }

            byte[] tag = TgBytes.Sub(decrypted, 56, 4);
            if (!TgBytes.Eq(tag, TagAbridged) && !TgBytes.Eq(tag, TagIntermediate) && !TgBytes.Eq(tag, TagSecure))
            {
                return null;
            }

            // Номер дата-центра лежит знаковым int16 сразу за тегом протокола.
            // Отрицательное значение означает медиа-адрес того же центра.
            short dcIdx = (short)(decrypted[60] | (decrypted[61] << 8));
            var res = new MtHandshake();
            res.DcId = Math.Abs((int)dcIdx);
            res.IsMedia = dcIdx < 0;
            res.ProtoTag = tag;
            res.PrekeyIv = prekeyIv;
            return res;
        }

        /// <summary>
        /// Сочинить свой init-пакет к дата-центру: тот же протокол и тот же
        /// номер центра, но со случайными ключами и без хеша секрета.
        /// </summary>
        public static byte[] GenerateRelayInit(byte[] protoTag, int dcIdx)
        {
            byte[] rnd = new byte[HandshakeLen];
            for (; ; )
            {
                Rng.GetBytes(rnd);
                if (rnd[0] == 0xef) continue;
                string head = TgBytes.Hex(rnd, 0, 4);
                bool reserved = false;
                for (int i = 0; i < ReservedStarts.Length; i++)
                {
                    if (head == ReservedStarts[i]) { reserved = true; break; }
                }
                if (reserved) continue;
                if (rnd[4] == 0 && rnd[5] == 0 && rnd[6] == 0 && rnd[7] == 0) continue;
                break;
            }

            byte[] encryptedFull;
            using (var enc = new AesCtr(TgBytes.Sub(rnd, 8, 32), TgBytes.Sub(rnd, 40, 16)))
            {
                encryptedFull = enc.Update(rnd);
            }

            byte[] tail = new byte[8];
            Buffer.BlockCopy(protoTag, 0, tail, 0, 4);
            tail[4] = (byte)(dcIdx & 0xff);
            tail[5] = (byte)((dcIdx >> 8) & 0xff);
            byte[] r2 = RandomBytes(2);
            tail[6] = r2[0];
            tail[7] = r2[1];

            // Хвост подменяется так, чтобы ПОСЛЕ шифрования на месте байт
            // 56..64 оказались тег протокола и номер центра. Для этого из
            // шифротекста вычитается гамма и на её место кладётся нужное.
            byte[] outBuf = (byte[])rnd.Clone();
            for (int i = 0; i < 8; i++)
            {
                byte gamma = (byte)(encryptedFull[56 + i] ^ rnd[56 + i]);
                outBuf[56 + i] = (byte)(tail[i] ^ gamma);
            }
            return outBuf;
        }

        /// <summary>Вывести четыре потока шифрования сессии.</summary>
        public static CryptoCtx BuildCryptoCtx(byte[] clientPrekeyIv, byte[] secret, byte[] relayInit)
        {
            byte[] cltDecKey = Sha256(TgBytes.Concat(TgBytes.Sub(clientPrekeyIv, 0, 32), secret));
            byte[] cltDecIv = TgBytes.Sub(clientPrekeyIv, 32, 16);

            // Обратное направление использует те же байты, развёрнутые задом
            // наперёд — так устроен обфусцированный транспорт MTProto.
            byte[] rev = TgBytes.Reversed(clientPrekeyIv);
            byte[] cltEncKey = Sha256(TgBytes.Concat(TgBytes.Sub(rev, 0, 32), secret));
            byte[] cltEncIv = TgBytes.Sub(rev, 32, 16);

            var cltDec = new AesCtr(cltDecKey, cltDecIv);
            var cltEnc = new AesCtr(cltEncKey, cltEncIv);
            // Первые 64 байта гаммы приходятся на сам init-пакет, который уже
            // прочитан. Прокручиваем их вхолостую, иначе поток разъедется.
            cltDec.Update(Zero64);

            var tgEnc = new AesCtr(TgBytes.Sub(relayInit, 8, 32), TgBytes.Sub(relayInit, 40, 16));
            byte[] relayRev = TgBytes.Reversed(TgBytes.Sub(relayInit, 8, 48));
            var tgDec = new AesCtr(TgBytes.Sub(relayRev, 0, 32), TgBytes.Sub(relayRev, 32, 16));
            tgEnc.Update(Zero64);

            return new CryptoCtx(cltDec, cltEnc, tgEnc, tgDec);
        }

        public static uint ProtoInt(byte[] protoTag)
        {
            if (TgBytes.Eq(protoTag, TagAbridged)) return ProtoAbridged;
            if (TgBytes.Eq(protoTag, TagIntermediate)) return ProtoIntermediate;
            return ProtoPaddedIntermediate;
        }
    }

    /// <summary>
    /// Режет поток к дата-центру на отдельные пакеты MTProto.
    /// </summary>
    /// <remarks>
    /// В TCP это сплошной поток, а веб-транспорт ждёт по одному пакету в
    /// кадре WebSocket. Границы видны только в расшифрованном виде, поэтому
    /// здесь работает второй расшифровщик того же потока: ключи те же, что у
    /// шифратора, и он честно возвращает открытый текст. Сами данные наружу
    /// уходят зашифрованными — расшифровка нужна только чтобы прочитать длину.
    ///
    /// Если длина оказалась бессмысленной, нарезка отключается и остаток
    /// потока передаётся как есть: лучше потерять деление на кадры, чем
    /// развалить сессию.
    /// </remarks>
    internal sealed class MsgSplitter : IDisposable
    {
        private readonly AesCtr dec;
        private readonly uint proto;
        private byte[] cipherBuf = new byte[0];
        private byte[] plainBuf = new byte[0];
        private bool disabled;

        public MsgSplitter(byte[] relayInit, uint protoInt)
        {
            dec = new AesCtr(TgBytes.Sub(relayInit, 8, 32), TgBytes.Sub(relayInit, 40, 16));
            dec.Update(new byte[64]);
            proto = protoInt;
        }

        public List<byte[]> Split(byte[] chunk)
        {
            var parts = new List<byte[]>();
            if (chunk == null || chunk.Length == 0) return parts;
            if (disabled)
            {
                parts.Add(chunk);
                return parts;
            }

            cipherBuf = TgBytes.Concat(cipherBuf, chunk);
            plainBuf = TgBytes.Concat(plainBuf, dec.Update(chunk));

            int offset = 0;
            int total = cipherBuf.Length;
            for (; ; )
            {
                int packetLen = NextPacketLen(offset, total - offset);
                if (packetLen == -1) break;
                if (packetLen <= 0)
                {
                    parts.Add(TgBytes.Sub(cipherBuf, offset, total - offset));
                    offset = total;
                    disabled = true;
                    break;
                }
                parts.Add(TgBytes.Sub(cipherBuf, offset, packetLen));
                offset += packetLen;
            }

            if (offset > 0)
            {
                cipherBuf = TgBytes.Sub(cipherBuf, offset, cipherBuf.Length - offset);
                plainBuf = TgBytes.Sub(plainBuf, offset, plainBuf.Length - offset);
            }
            return parts;
        }

        /// <summary>Хвост, не сложившийся в целый пакет — отдаётся при закрытии.</summary>
        public byte[] Flush()
        {
            if (cipherBuf.Length == 0) return null;
            byte[] tail = cipherBuf;
            cipherBuf = new byte[0];
            plainBuf = new byte[0];
            return tail;
        }

        /// <returns>Длина пакета, -1 если данных не хватает, 0 если поток непонятен.</returns>
        private int NextPacketLen(int offset, int avail)
        {
            if (avail <= 0) return -1;
            if (proto == TgCrypto.ProtoAbridged) return NextAbridged(offset, avail);
            if (proto == TgCrypto.ProtoIntermediate || proto == TgCrypto.ProtoPaddedIntermediate)
            {
                return NextIntermediate(offset, avail);
            }
            return 0;
        }

        private int NextAbridged(int offset, int avail)
        {
            byte first = plainBuf[offset];
            int payloadLen;
            int headerLen;
            if (first == 0x7f || first == 0xff)
            {
                if (avail < 4) return -1;
                payloadLen = (plainBuf[offset + 1] | (plainBuf[offset + 2] << 8) | (plainBuf[offset + 3] << 16)) * 4;
                headerLen = 4;
            }
            else
            {
                payloadLen = (first & 0x7f) * 4;
                headerLen = 1;
            }
            if (payloadLen <= 0) return 0;
            int packetLen = headerLen + payloadLen;
            if (avail < packetLen) return -1;
            return packetLen;
        }

        private int NextIntermediate(int offset, int avail)
        {
            if (avail < 4) return -1;
            uint raw = (uint)(plainBuf[offset] | (plainBuf[offset + 1] << 8) | (plainBuf[offset + 2] << 16) | (plainBuf[offset + 3] << 24));
            int payloadLen = (int)(raw & 0x7fffffff);
            if (payloadLen <= 0) return 0;
            long packetLen = 4L + payloadLen;
            if (packetLen > int.MaxValue) return 0;
            if (avail < packetLen) return -1;
            return (int)packetLen;
        }

        public void Dispose()
        {
            dec.Dispose();
        }
    }

    /// <summary>
    /// Не удалось открыть WebSocket.
    /// </summary>
    /// <remarks>
    /// Различие принципиальное. Если не установилось само соединение TCP —
    /// закрыт маршрут, и никакие ухищрения с именем в TLS не помогут, надо
    /// сразу идти в обход. Если TCP встал, а сорвалось рукопожатие — смотрят
    /// на содержимое, и подмена имени может сработать.
    /// </remarks>
    internal sealed class TgWsException : Exception
    {
        public readonly bool TcpFailed;

        public TgWsException(string message, bool tcpFailed) : base(message)
        {
            TcpFailed = tcpFailed;
        }
    }

    /// <summary>
    /// Минимальный клиент WebSocket поверх TLS.
    /// </summary>
    /// <remarks>
    /// Готовый ClientWebSocket из .NET не подходит: соединение открывается по
    /// IP-адресу, а имя в SNI и в заголовке Host задаётся отдельно — иначе не
    /// сделать ни обращение по фиксированному адресу дата-центра, ни
    /// домен-фронтинг. Поэтому рукопожатие HTTP и кадры пишутся руками, благо
    /// нужен только двоичный режим без расширений.
    /// </remarks>
    internal sealed class RawWebSocket : IDisposable
    {
        private const int OpCont = 0x0;
        private const int OpText = 0x1;
        private const int OpBinary = 0x2;
        private const int OpClose = 0x8;
        private const int OpPing = 0x9;
        private const int OpPong = 0xa;
        private const int MaxMessage = 16 * 1024 * 1024;

        private readonly TcpClient tcp;
        private readonly SslStream ssl;
        private readonly object writeLock = new object();
        private byte[] pending = new byte[0];
        private List<byte[]> frag = new List<byte[]>();
        private int fragLen;
        private volatile bool closed;

        private RawWebSocket(TcpClient tcp, SslStream ssl, byte[] extra)
        {
            this.tcp = tcp;
            this.ssl = ssl;
            if (extra != null && extra.Length > 0) pending = extra;
        }

        public bool Closed { get { return closed; } }

        /// <param name="ip">Адрес дата-центра, куда открывается соединение.</param>
        /// <param name="hostDomain">Имя в заголовке Host — его видит сервер Telegram.</param>
        /// <param name="sni">Имя в TLS. Отличается от Host только при домен-фронтинге.</param>
        /// <param name="target">Адрес или имя узла, куда открывается соединение.</param>
        public static RawWebSocket Connect(string target, string hostDomain, string sni, string wsPath, int timeoutMs)
        {
            var tcp = new TcpClient();
            tcp.NoDelay = true;
            SslStream ssl = null;
            try
            {
                try
                {
                    IAsyncResult ar = tcp.BeginConnect(target, 443, null, null);
                    if (!ar.AsyncWaitHandle.WaitOne(timeoutMs))
                    {
                        throw new TgWsException("таймаут соединения с " + target, true);
                    }
                    tcp.EndConnect(ar);
                }
                catch (TgWsException) { throw; }
                catch (Exception ex)
                {
                    throw new TgWsException("соединение с " + target + " не установилось: " + ex.Message, true);
                }
                tcp.ReceiveTimeout = timeoutMs;
                tcp.SendTimeout = timeoutMs;

                bool fronting = !string.Equals(sni, hostDomain, StringComparison.OrdinalIgnoreCase);
                ssl = new SslStream(tcp.GetStream(), false, delegate(object s, System.Security.Cryptography.X509Certificates.X509Certificate cert,
                    System.Security.Cryptography.X509Certificates.X509Chain chain, SslPolicyErrors errors)
                {
                    if (errors == SslPolicyErrors.None) return true;
                    // При домен-фронтинге имя в сертификате заведомо не совпадёт
                    // с тем, что ушло в SNI: сертификат выдан на web.telegram.org.
                    // Цепочку при этом проверяем как обычно — отказываемся только
                    // от проверки имени, и только в этом режиме.
                    return fronting && errors == SslPolicyErrors.RemoteCertificateNameMismatch;
                });
                ssl.AuthenticateAsClient(sni, null, SslProtocols.Tls12, false);

                string key = Convert.ToBase64String(TgCrypto.RandomBytes(16));
                var req = new StringBuilder();
                req.Append("GET ").Append(wsPath).Append(" HTTP/1.1\r\n");
                req.Append("Host: ").Append(hostDomain).Append("\r\n");
                req.Append("Upgrade: websocket\r\n");
                req.Append("Connection: Upgrade\r\n");
                req.Append("Sec-WebSocket-Key: ").Append(key).Append("\r\n");
                req.Append("Sec-WebSocket-Version: 13\r\n");
                req.Append("Sec-WebSocket-Protocol: binary\r\n");
                req.Append("\r\n");
                byte[] reqBytes = Encoding.ASCII.GetBytes(req.ToString());
                ssl.Write(reqBytes, 0, reqBytes.Length);
                ssl.Flush();

                string head = ReadHttpHead(ssl);
                string firstLine = head.Split('\r')[0];
                string[] parts = firstLine.Split(' ');
                int status = 0;
                if (parts.Length >= 2) int.TryParse(parts[1], out status);
                if (status != 101)
                {
                    throw new IOException("сервер ответил «" + firstLine.Trim() + "» вместо 101");
                }

                // Сервер не шлёт кадры до нашего первого сообщения, поэтому
                // заголовок читается побайтно и хвоста после него не остаётся.
                var ws = new RawWebSocket(tcp, ssl, null);
                // Сессия живёт долго и может молчать: клиент шлёт пинги сам.
                tcp.ReceiveTimeout = 600000;
                tcp.SendTimeout = 60000;
                return ws;
            }
            catch
            {
                try { if (ssl != null) ssl.Dispose(); } catch { }
                try { tcp.Close(); } catch { }
                throw;
            }
        }

        private static string ReadHttpHead(Stream s)
        {
            var sb = new StringBuilder();
            byte[] one = new byte[1];
            int matched = 0;
            while (sb.Length < 8192)
            {
                int r = s.Read(one, 0, 1);
                if (r <= 0) throw new IOException("сервер закрыл соединение до ответа");
                char c = (char)one[0];
                sb.Append(c);
                if (c == '\r' && (matched == 0 || matched == 2)) matched++;
                else if (c == '\n' && (matched == 1 || matched == 3)) matched++;
                else matched = 0;
                if (matched == 4) break;
            }
            return sb.ToString();
        }

        public void SendBinary(byte[] data)
        {
            WriteRaw(BuildFrame(OpBinary, data));
        }

        public void SendBatch(List<byte[]> items)
        {
            int total = 0;
            var frames = new List<byte[]>(items.Count);
            for (int i = 0; i < items.Count; i++)
            {
                byte[] f = BuildFrame(OpBinary, items[i]);
                frames.Add(f);
                total += f.Length;
            }
            byte[] all = new byte[total];
            int off = 0;
            for (int i = 0; i < frames.Count; i++)
            {
                Buffer.BlockCopy(frames[i], 0, all, off, frames[i].Length);
                off += frames[i].Length;
            }
            WriteRaw(all);
        }

        /// <summary>Следующее двоичное сообщение, либо null если соединение закрыто.</summary>
        public byte[] ReadMessage()
        {
            while (!closed)
            {
                byte[] hdr = ReadExactly(2);
                bool fin = (hdr[0] & 0x80) != 0;
                int opcode = hdr[0] & 0x0f;
                long length = hdr[1] & 0x7f;
                bool masked = (hdr[1] & 0x80) != 0;

                if (length == 126)
                {
                    byte[] ext = ReadExactly(2);
                    length = (ext[0] << 8) | ext[1];
                }
                else if (length == 127)
                {
                    byte[] ext = ReadExactly(8);
                    length = 0;
                    for (int i = 0; i < 8; i++) length = (length << 8) | ext[i];
                }
                if (length < 0 || length > MaxMessage)
                {
                    throw new IOException("кадр WebSocket неправдоподобной длины: " + length);
                }

                byte[] mask = masked ? ReadExactly(4) : null;
                byte[] payload = length > 0 ? ReadExactly((int)length) : new byte[0];
                if (mask != null)
                {
                    for (int i = 0; i < payload.Length; i++) payload[i] = (byte)(payload[i] ^ mask[i & 3]);
                }

                if (opcode == OpClose)
                {
                    closed = true;
                    try { WriteRaw(BuildFrame(OpClose, payload.Length >= 2 ? TgBytes.Sub(payload, 0, 2) : new byte[0])); } catch { }
                    return null;
                }
                if (opcode == OpPing)
                {
                    try { WriteRaw(BuildFrame(OpPong, payload)); } catch { }
                    continue;
                }
                if (opcode == OpPong) continue;

                if (opcode == OpCont || opcode == OpText || opcode == OpBinary)
                {
                    if (fin && frag.Count == 0) return payload;
                    frag.Add(payload);
                    fragLen += payload.Length;
                    if (fragLen > MaxMessage) throw new IOException("собранное сообщение слишком велико");
                    if (!fin) continue;
                    byte[] message = new byte[fragLen];
                    int off = 0;
                    for (int i = 0; i < frag.Count; i++)
                    {
                        Buffer.BlockCopy(frag[i], 0, message, off, frag[i].Length);
                        off += frag[i].Length;
                    }
                    frag = new List<byte[]>();
                    fragLen = 0;
                    return message;
                }
                // Незнакомый код операции — пропускаем кадр.
            }
            return null;
        }

        private static byte[] BuildFrame(int opcode, byte[] data)
        {
            int len = data.Length;
            byte[] header;
            if (len < 126)
            {
                header = new byte[2];
                header[1] = (byte)(0x80 | len);
            }
            else if (len < 65536)
            {
                header = new byte[4];
                header[1] = 0x80 | 126;
                header[2] = (byte)((len >> 8) & 0xff);
                header[3] = (byte)(len & 0xff);
            }
            else
            {
                header = new byte[10];
                header[1] = 0x80 | 127;
                long l = len;
                for (int i = 0; i < 8; i++) header[2 + i] = (byte)((l >> (8 * (7 - i))) & 0xff);
            }
            header[0] = (byte)(0x80 | opcode);

            // Клиент обязан маскировать кадры — таково требование протокола.
            byte[] mask = TgCrypto.RandomBytes(4);
            byte[] frame = new byte[header.Length + 4 + len];
            Buffer.BlockCopy(header, 0, frame, 0, header.Length);
            Buffer.BlockCopy(mask, 0, frame, header.Length, 4);
            int off = header.Length + 4;
            for (int i = 0; i < len; i++) frame[off + i] = (byte)(data[i] ^ mask[i & 3]);
            return frame;
        }

        private void WriteRaw(byte[] data)
        {
            if (closed) throw new IOException("WebSocket уже закрыт");
            lock (writeLock)
            {
                ssl.Write(data, 0, data.Length);
                ssl.Flush();
            }
        }

        private byte[] ReadExactly(int n)
        {
            byte[] dst = new byte[n];
            int got = 0;
            if (pending.Length > 0)
            {
                int take = pending.Length < n ? pending.Length : n;
                Buffer.BlockCopy(pending, 0, dst, 0, take);
                pending = TgBytes.Sub(pending, take, pending.Length - take);
                got = take;
            }
            while (got < n)
            {
                int r = ssl.Read(dst, got, n - got);
                if (r <= 0) throw new IOException("соединение с сервером закрыто");
                got += r;
            }
            return dst;
        }

        public void Dispose()
        {
            closed = true;
            try { ssl.Dispose(); } catch { }
            try { tcp.Close(); } catch { }
        }
    }

    /// <summary>
    /// Запасные узлы за Cloudflare.
    /// </summary>
    /// <remarks>
    /// Это главный рабочий путь там, где адреса Telegram закрыты целиком —
    /// а закрыты они обычно именно так, подсетями. Веб-транспорт живёт на тех
    /// же адресах, что и всё остальное хозяйство Telegram, и под блокировку
    /// попадает вместе с ними. Узел за Cloudflare — чужой адрес, к которому
    /// претензий нет, и он передаёт тот же самый WebSocket дальше.
    ///
    /// Список в исходнике лежит сдвинутым, а не открытым текстом, и это не
    /// ребячество: открытый список вытаскивается из сборки простым поиском по
    /// строкам, после чего домены закрывают пачкой. Сдвиг ровно такой же, как
    /// в эталонной реализации, иначе списки разъехались бы.
    /// </remarks>
    internal static class TgCfDomains
    {
        private const string TldSuffix = ".co.uk";
        private const string ListUrl = "https://raw.githubusercontent.com/Flowseal/tg-ws-proxy/main/.github/cfproxy-domains.txt";

        private static readonly string[] Builtin = new string[]
        {
            "virkgj.com", "vmmzovy.com", "mkuosckvso.com", "zaewayzmplad.com", "twdmbzcm.com",
            "awzwsldi.com", "clngqrflngqin.com", "tjacxbqtj.com", "bxaxtxmrw.com", "dmohrsgmohcrwb.com",
            "vwbmtmoi.com", "khgrre.com", "ulihssf.com", "tmhqsdqmfpmk.com", "xwuwoqbm.com",
            "orgcnunpj.com", "zhkuldz.com", "zypoljnslxa.com", "efabnxaowuzs.com", "zaftuzsftqdq.com"
        };

        private static readonly object gate = new object();
        private static List<string> current;

        /// <summary>Сдвиг каждой буквы назад на число букв в строке.</summary>
        public static string Decode(string s)
        {
            if (s == null || !s.EndsWith(".com", StringComparison.Ordinal)) return s;
            string p = s.Substring(0, s.Length - 4);
            int n = 0;
            for (int i = 0; i < p.Length; i++)
            {
                char c = p[i];
                if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) n++;
            }
            var sb = new StringBuilder(p.Length + TldSuffix.Length);
            for (int i = 0; i < p.Length; i++)
            {
                char c = p[i];
                bool upper = c >= 'A' && c <= 'Z';
                bool lower = c >= 'a' && c <= 'z';
                if (!upper && !lower) { sb.Append(c); continue; }
                int b = upper ? 65 : 97;
                int shifted = ((c - b - n) % 26 + 26) % 26 + b;
                sb.Append((char)shifted);
            }
            sb.Append(TldSuffix);
            return sb.ToString();
        }

        public static List<string> All()
        {
            lock (gate)
            {
                if (current != null) return new List<string>(current);
                var list = new List<string>(Builtin.Length);
                for (int i = 0; i < Builtin.Length; i++) list.Add(Decode(Builtin[i]));
                current = list;
                return new List<string>(current);
            }
        }

        /// <summary>
        /// Подтянуть свежий список. Молча ничего не делает, если не вышло:
        /// встроенного списка хватает, а падать из-за этого нельзя.
        /// </summary>
        public static bool Refresh()
        {
            try
            {
                // Без этого WebClient в нашем exe идёт по TLS 1.0, и GitHub
                // отвечает отказом — список ни разу не обновился до 0.3.3.
                try { ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072; } catch { }
                using (var wc = new WebClient())
                {
                    wc.Headers.Add("User-Agent", "Zapret2-GUI");
                    string body = wc.DownloadString(ListUrl + "?" + Guid.NewGuid().ToString("N").Substring(0, 8));
                    var fresh = new List<string>();
                    string[] lines = body.Split(new char[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);
                    for (int i = 0; i < lines.Length; i++)
                    {
                        string line = lines[i].Trim();
                        if (line.Length == 0 || line.StartsWith("#")) continue;
                        string d = Decode(line);
                        if (d.Length > 0 && d.IndexOf('.') > 0) fresh.Add(d);
                    }
                    if (fresh.Count == 0) return false;
                    lock (gate) current = fresh;
                    return true;
                }
            }
            catch
            {
                return false;
            }
        }
    }

    /// <summary>Счётчики для панели состояния.</summary>
    internal sealed class TgProxyStats
    {
        public long Total;
        public long Active;
        public long Bad;
        public long ViaWs;
        public long ViaCf;
        public long ViaTcp;
        public long Failed;
        public long BytesUp;
        public long BytesDown;
    }

    /// <summary>
    /// Слушатель MTProxy и мост до веб-транспорта Telegram.
    /// </summary>
    internal sealed class TgProxyServer
    {
        public const int DefaultPort = 1443;
        private const int ClientInitTimeoutMs = 10000;
        private const int WsConnectTimeoutMs = 7000;
        private const int TcpFallbackTimeoutMs = 10000;
        /// <summary>Сколько ждать один запасной узел.</summary>
        private const int CfNodeTimeoutMs = 3500;
        /// <summary>Сколько перебирать запасные узлы на одно соединение.</summary>
        private const int CfBudgetMs = 8000;
        private const string WsPath = "/apiws";
        private const string FrontingSni = "sprinthost.ru";

        /// <summary>Адреса дата-центров для веб-транспорта.</summary>
        private static readonly Dictionary<int, string> DcIps = new Dictionary<int, string>
        {
            { 1, "149.154.175.50" },
            { 2, "149.154.167.51" },
            { 3, "149.154.175.100" },
            { 4, "149.154.167.91" },
            { 5, "149.154.171.5" }
        };

        /// <summary>Адреса для прямого резерва: тот же список плюс 203-й центр.</summary>
        private static readonly Dictionary<int, string> DcFallbackIps = new Dictionary<int, string>
        {
            { 1, "149.154.175.50" },
            { 2, "149.154.167.51" },
            { 3, "149.154.175.100" },
            { 4, "149.154.167.91" },
            { 5, "149.154.171.5" },
            { 203, "91.105.192.100" }
        };

        private readonly Action<string, string> log;
        private readonly object gate = new object();
        private readonly List<TcpClient> clients = new List<TcpClient>();

        private TcpListener listener;
        private Thread acceptThread;
        private volatile bool running;
        private byte[] secret;

        private long cTotal, cActive, cBad, cWs, cCf, cTcp, cFailed, cUp, cDown;

        /// <summary>
        /// До какого времени не трогать этот адрес.
        /// </summary>
        /// <remarks>
        /// Если адрес дата-центра закрыт, соединение с ним не установится
        /// никогда — а каждая попытка стоит секунд ожидания. Telegram
        /// открывает соединения пачками, и без этой заметки каждое из них
        /// упиралось бы в ту же стену. Поэтому после отказа по TCP адрес
        /// откладывается на час, и следующие сессии сразу идут в обход.
        /// </remarks>
        private readonly Dictionary<string, DateTime> ipFailUntil = new Dictionary<string, DateTime>();
        /// <summary>Какой узел за Cloudflare сработал для этого дата-центра в прошлый раз.</summary>
        private readonly Dictionary<int, string> cfDomainForDc = new Dictionary<int, string>();
        private readonly Random rnd = new Random();

        /// <summary>Разрешить прямое соединение с дата-центром, если веб-транспорт не прошёл.</summary>
        public bool AllowDirectTcp = true;
        /// <summary>Пробовать чужое имя в SNI, если прямое рукопожатие не прошло.</summary>
        public bool AllowFronting = true;
        /// <summary>Разрешить обход через узлы за Cloudflare.</summary>
        public bool AllowCloudflare = true;

        public bool IsRunning { get { return running; } }
        public string BindHost { get; private set; }
        public int BindPort { get; private set; }

        public TgProxyServer(Action<string, string> logger)
        {
            log = logger;
            BindHost = "127.0.0.1";
            BindPort = DefaultPort;
        }

        public TgProxyStats Snapshot()
        {
            var s = new TgProxyStats();
            s.Total = Interlocked.Read(ref cTotal);
            s.Active = Interlocked.Read(ref cActive);
            s.Bad = Interlocked.Read(ref cBad);
            s.ViaWs = Interlocked.Read(ref cWs);
            s.ViaCf = Interlocked.Read(ref cCf);
            s.ViaTcp = Interlocked.Read(ref cTcp);
            s.Failed = Interlocked.Read(ref cFailed);
            s.BytesUp = Interlocked.Read(ref cUp);
            s.BytesDown = Interlocked.Read(ref cDown);
            return s;
        }

        private void Log(string level, string message)
        {
            if (log != null) log(level, message);
        }

        /// <summary>Поднять слушатель. Бросает исключение, если порт занят.</summary>
        public void Start(string host, int port, string secretHex)
        {
            Stop();

            byte[] sec = TgBytes.FromHex(secretHex);
            if (sec == null || sec.Length != 16)
            {
                throw new ArgumentException("секрет должен быть 32 шестнадцатеричными символами");
            }
            if (port < 1 || port > 65535) port = DefaultPort;

            IPAddress bind = IPAddress.Loopback;
            if (host == "0.0.0.0") bind = IPAddress.Any;
            else if (!IPAddress.TryParse(host, out bind)) bind = IPAddress.Loopback;

            secret = sec;
            BindHost = bind.ToString();
            BindPort = port;

            listener = new TcpListener(bind, port);
            try
            {
                listener.Start(64);
            }
            catch (SocketException ex)
            {
                listener = null;
                if (ex.SocketErrorCode == SocketError.AddressAlreadyInUse)
                {
                    throw new IOException("порт " + port + " уже занят другой программой");
                }
                throw new IOException("не удалось занять порт " + port + ": " + ex.Message);
            }

            running = true;
            Interlocked.Exchange(ref cTotal, 0);
            Interlocked.Exchange(ref cActive, 0);
            Interlocked.Exchange(ref cBad, 0);
            Interlocked.Exchange(ref cWs, 0);
            Interlocked.Exchange(ref cCf, 0);
            Interlocked.Exchange(ref cTcp, 0);
            Interlocked.Exchange(ref cFailed, 0);
            Interlocked.Exchange(ref cUp, 0);
            Interlocked.Exchange(ref cDown, 0);

            lock (gate) ipFailUntil.Clear();

            acceptThread = new Thread(AcceptLoop);
            acceptThread.IsBackground = true;
            acceptThread.Name = "tg-proxy-accept";
            acceptThread.Start();

            // Список запасных узлов стареет: домены закрывают, авторы заводят
            // новые. Обновляем в фоне и не ждём результата — встроенного
            // списка достаточно, чтобы работать прямо сейчас.
            if (AllowCloudflare)
            {
                var refresh = new Thread(delegate()
                {
                    if (TgCfDomains.Refresh()) Log("info", "Список запасных узлов обновлён.");
                });
                refresh.IsBackground = true;
                refresh.Name = "tg-proxy-cf-list";
                refresh.Start();
            }

            Log("success", "Прокси Telegram слушает " + BindHost + ":" + BindPort + ".");
        }

        public void Stop()
        {
            if (!running && listener == null) return;
            running = false;
            try { if (listener != null) listener.Stop(); } catch { }
            listener = null;

            TcpClient[] snapshot;
            lock (gate)
            {
                snapshot = clients.ToArray();
                clients.Clear();
            }
            for (int i = 0; i < snapshot.Length; i++)
            {
                try { snapshot[i].Close(); } catch { }
            }
            Interlocked.Exchange(ref cActive, 0);
            Log("info", "Прокси Telegram остановлен.");
        }

        private void AcceptLoop()
        {
            while (running)
            {
                TcpClient client;
                try
                {
                    client = listener.AcceptTcpClient();
                }
                catch
                {
                    // Слушатель закрыт при остановке — это штатный выход.
                    break;
                }
                lock (gate) clients.Add(client);
                byte[] sec = secret;
                var t = new Thread(delegate() { HandleClient(client, sec); });
                t.IsBackground = true;
                t.Name = "tg-proxy-session";
                t.Start();
            }
        }

        private static string[] WsDomains(int dc, bool isMedia)
        {
            int d = dc == 203 ? 2 : dc;
            string main = "kws" + d + ".web.telegram.org";
            string alt = "kws" + d + "-1.web.telegram.org";
            // Медиа-соединения у Telegram обслуживает в первую очередь «-1».
            return isMedia ? new string[] { alt, main } : new string[] { main, alt };
        }

        private void HandleClient(TcpClient client, byte[] sec)
        {
            Interlocked.Increment(ref cTotal);
            Interlocked.Increment(ref cActive);
            string label = "?";
            try { label = client.Client.RemoteEndPoint.ToString(); } catch { }

            CryptoCtx ctx = null;
            MsgSplitter splitter = null;
            RawWebSocket ws = null;
            try
            {
                client.NoDelay = true;
                client.ReceiveTimeout = ClientInitTimeoutMs;
                NetworkStream stream = client.GetStream();

                byte[] handshake = ReadExactly(stream, TgCrypto.HandshakeLen);
                if (handshake == null)
                {
                    Log("warn", "[" + label + "] клиент отключился, не прислав рукопожатие.");
                    return;
                }

                MtHandshake parsed = TgCrypto.TryHandshake(handshake, sec);
                if (parsed == null)
                {
                    Interlocked.Increment(ref cBad);
                    Log("warn", "[" + label + "] рукопожатие не подошло: неверный секрет или чужой протокол.");
                    return;
                }

                int dc = parsed.DcId;
                if (dc >= 10000)
                {
                    Log("warn", "[" + label + "] тестовый дата-центр " + dc + " не поддерживается.");
                    return;
                }

                // Дальше соединение живёт долго и может молчать между пингами.
                client.ReceiveTimeout = 600000;
                client.SendTimeout = 60000;

                int dcIdx = parsed.IsMedia ? -dc : dc;
                byte[] relayInit = TgCrypto.GenerateRelayInit(parsed.ProtoTag, dcIdx);
                ctx = TgCrypto.BuildCryptoCtx(parsed.PrekeyIv, sec, relayInit);
                string mediaTag = parsed.IsMedia ? " (медиа)" : "";

                // Путей до дата-центра три, и порядок здесь не случаен.
                //
                // Сначала прямой веб-транспорт: он самый короткий и быстрый.
                // Если адреса Telegram у провайдера закрыты — а это самый
                // частый случай — он не пройдёт, и адрес уходит в отложенные,
                // чтобы следующие сессии не ждали то же самое впустую.
                //
                // Затем узел за Cloudflare: чужой адрес, к которому претензий
                // нет, передающий тот же WebSocket дальше. На закрытых сетях
                // работает именно он.
                //
                // И в конце прямой MTProto — он имеет смысл только там, где
                // Telegram вообще не блокируют.
                string target;
                if (!DcIps.TryGetValue(dc, out target)) target = null;

                bool viaCf = false;

                if (target != null)
                {
                    if (IsCoolingDown(target))
                    {
                        Log("info", "[" + label + "] ДЦ" + dc + mediaTag + ": адрес " + target +
                            " недавно не отвечал, иду сразу в обход.");
                    }
                    else
                    {
                        string[] domains = WsDomains(dc, parsed.IsMedia);
                        for (int i = 0; i < domains.Length && ws == null; i++)
                        {
                            ws = TryWs(target, domains[i], label, dc, mediaTag);
                            // Адрес только что признан недоступным — второе имя
                            // ведёт туда же, и ждать его таймаут незачем.
                            if (ws == null && IsCoolingDown(target)) break;
                        }
                        if (ws != null) ClearCooldown(target);
                    }
                }

                if (ws == null && AllowCloudflare)
                {
                    ws = TryCf(dc, label, mediaTag);
                    if (ws != null) viaCf = true;
                }

                if (ws != null)
                {
                    if (viaCf) Interlocked.Increment(ref cCf);
                    else Interlocked.Increment(ref cWs);
                    splitter = new MsgSplitter(relayInit, TgCrypto.ProtoInt(parsed.ProtoTag));
                    ws.SendBinary(relayInit);
                    BridgeWs(client, stream, ws, ctx, splitter, label, dc, mediaTag);
                    return;
                }

                if (!AllowDirectTcp)
                {
                    Interlocked.Increment(ref cFailed);
                    Log("error", "[" + label + "] ДЦ" + dc + mediaTag + ": ни один обходной путь не прошёл, прямой резерв выключен.");
                    return;
                }

                // Адрес только что не ответил по TCP — прямое соединение с ним
                // заведомо упрётся в тот же таймаут и задержит клиента ещё на
                // десять секунд. Быстрый отказ лучше: Telegram переподключится
                // сразу и попадёт на другой узел.
                if (target != null && IsCoolingDown(target))
                {
                    Interlocked.Increment(ref cFailed);
                    Log("warn", "[" + label + "] ДЦ" + dc + mediaTag +
                        ": запасные узлы не ответили, а адрес дата-центра закрыт — соединение сброшено, клиент переподключится.");
                    return;
                }

                string dst;
                if (!DcFallbackIps.TryGetValue(dc, out dst))
                {
                    Interlocked.Increment(ref cFailed);
                    Log("error", "[" + label + "] неизвестный дата-центр " + dc + " — идти некуда.");
                    return;
                }

                BridgeDirectTcp(client, stream, ctx, relayInit, label, dc, mediaTag, dst);
            }
            catch (Exception ex)
            {
                Log("error", "[" + label + "] сессия оборвалась: " + ex.Message);
            }
            finally
            {
                try { if (ws != null) ws.Dispose(); } catch { }
                try { if (splitter != null) splitter.Dispose(); } catch { }
                try { if (ctx != null) ctx.Dispose(); } catch { }
                try { client.Close(); } catch { }
                lock (gate) clients.Remove(client);
                Interlocked.Decrement(ref cActive);
            }
        }

        private bool IsCoolingDown(string ip)
        {
            lock (gate)
            {
                DateTime until;
                if (!ipFailUntil.TryGetValue(ip, out until)) return false;
                if (DateTime.UtcNow >= until) { ipFailUntil.Remove(ip); return false; }
                return true;
            }
        }

        /// <summary>
        /// Отложить адрес, а заодно и остальные дата-центры.
        /// </summary>
        /// <remarks>
        /// Блокируют Telegram подсетями, а не отдельными адресами: если не
        /// отвечает один центр, почти наверняка закрыты и соседние. Без этого
        /// каждый новый центр стоил бы клиенту ещё одного полного таймаута, а
        /// Telegram при запуске стучится сразу в несколько.
        ///
        /// Отложенный адрес ждёт час, соседние — пять минут. Если дело было не
        /// в блокировке, а в разовом сбое одного узла, короткая пауза сама
        /// вернёт прямой путь и мост не застрянет в обходе на час.
        /// </remarks>
        private void MarkCooldown(string ip)
        {
            DateTime now = DateTime.UtcNow;
            lock (gate)
            {
                ipFailUntil[ip] = now.AddHours(1);
                DateTime shortStop = now.AddMinutes(5);
                foreach (var pair in DcIps)
                {
                    if (pair.Value == ip) continue;
                    DateTime existing;
                    if (ipFailUntil.TryGetValue(pair.Value, out existing) && existing > shortStop) continue;
                    ipFailUntil[pair.Value] = shortStop;
                }
            }
        }

        private void ClearCooldown(string ip)
        {
            lock (gate) ipFailUntil.Remove(ip);
        }

        private RawWebSocket TryWs(string target, string domain, string label, int dc, string mediaTag)
        {
            try
            {
                Log("info", "[" + label + "] ДЦ" + dc + mediaTag + " -> wss://" + domain + WsPath + " через " + target);
                return RawWebSocket.Connect(target, domain, domain, WsPath, WsConnectTimeoutMs);
            }
            catch (TgWsException ex)
            {
                Log("warn", "[" + label + "] ДЦ" + dc + mediaTag + " не подключился к " + domain + ": " + ex.Message);
                if (ex.TcpFailed)
                {
                    // Соединение не встало вовсе — закрыт маршрут. Подменять
                    // имя в TLS бессмысленно: до рукопожатия дело не доходит.
                    MarkCooldown(target);
                    return null;
                }
            }
            catch (Exception ex)
            {
                Log("warn", "[" + label + "] ДЦ" + dc + mediaTag + " не подключился к " + domain + ": " + ex.Message);
            }

            if (!AllowFronting) return null;

            try
            {
                // Тот же сервер, но в TLS уходит чужое имя. Помогает, когда
                // фильтр смотрит только на SNI: имя kws*.web.telegram.org он
                // видит, а зашифрованный заголовок Host — уже нет.
                Log("info", "[" + label + "] ДЦ" + dc + mediaTag + " -> повтор с чужим именем в TLS (" + FrontingSni + ")");
                return RawWebSocket.Connect(target, domain, FrontingSni, WsPath, WsConnectTimeoutMs);
            }
            catch (Exception ex)
            {
                Log("warn", "[" + label + "] ДЦ" + dc + mediaTag + " не подключился и с чужим именем: " + ex.Message);
                return null;
            }
        }

        /// <summary>
        /// Обход через узел за Cloudflare.
        /// </summary>
        /// <remarks>
        /// Узел поднимает тот же WebSocket, что и веб-транспорт Telegram, но
        /// живёт по чужому адресу. Имя составное: kws&lt;номер центра&gt; плюс
        /// домен узла — так узел понимает, какому центру передавать.
        ///
        /// Сработавший узел запоминается и в следующий раз пробуется первым:
        /// перебирать всю очередь на каждое соединение слишком дорого, а
        /// Telegram открывает их по нескольку сразу.
        /// </remarks>
        private RawWebSocket TryCf(int dc, string label, string mediaTag)
        {
            List<string> pool = TgCfDomains.All();
            if (pool.Count == 0) return null;

            string preferred = null;
            lock (gate) cfDomainForDc.TryGetValue(dc, out preferred);

            var order = new List<string>();
            if (preferred != null && pool.Contains(preferred)) order.Add(preferred);
            var rest = new List<string>();
            for (int i = 0; i < pool.Count; i++)
            {
                if (pool[i] != preferred) rest.Add(pool[i]);
            }
            lock (gate)
            {
                for (int i = rest.Count - 1; i > 0; i--)
                {
                    int j = rnd.Next(i + 1);
                    string tmp = rest[i]; rest[i] = rest[j]; rest[j] = tmp;
                }
            }
            order.AddRange(rest);

            // Перебор ограничен временем, а не числом узлов. Узлы нередко
            // отвечают «503 Service Unavailable» — быстро, за 100-300 мс, и
            // тот же узел через пару секунд снова работает. При лимите в три
            // попытки три таких ответа подряд срывали соединение, хотя за
            // секунду нашёлся бы живой узел. Таймаут же стоит 10 с, и после
            // него перебирать дальше клиент уже не дождётся.
            var budget = System.Diagnostics.Stopwatch.StartNew();
            for (int i = 0; i < order.Count; i++)
            {
                if (i > 0 && budget.ElapsedMilliseconds > CfBudgetMs) break;
                string domain = "kws" + dc + "." + order[i];
                try
                {
                    Log("info", "[" + label + "] ДЦ" + dc + mediaTag + " -> обход через " + domain);
                    // Живой узел отвечает быстрее секунды, отказ «503» — за
                    // 100-300 мс. Узел, который принял соединение и молчит,
                    // ждать дольше нескольких секунд незачем: однажды такой
                    // съел весь бюджет, остальные узлы так и не попробовали,
                    // и клиент сорвался через 18 с. Ожидание к тому же не
                    // выходит за общий бюджет.
                    int left = CfBudgetMs - (int)budget.ElapsedMilliseconds;
                    int timeout = Math.Min(CfNodeTimeoutMs, Math.Max(1500, left));
                    RawWebSocket ws = RawWebSocket.Connect(domain, domain, domain, WsPath, timeout);
                    lock (gate) cfDomainForDc[dc] = order[i];
                    return ws;
                }
                catch (Exception ex)
                {
                    Log("warn", "[" + label + "] ДЦ" + dc + mediaTag + " узел " + domain + " не ответил: " + ex.Message);
                }
            }
            return null;
        }

        private void BridgeWs(TcpClient client, NetworkStream stream, RawWebSocket ws, CryptoCtx ctx,
            MsgSplitter splitter, string label, int dc, string mediaTag)
        {
            long up0 = Interlocked.Read(ref cUp);
            long down0 = Interlocked.Read(ref cDown);
            DateTime t0 = DateTime.Now;
            string reason = "закрыто клиентом";

            var down = new Thread(delegate()
            {
                try
                {
                    for (; ; )
                    {
                        byte[] msg = ws.ReadMessage();
                        if (msg == null) break;
                        Interlocked.Add(ref cDown, msg.Length);
                        byte[] outBuf = ctx.CltEnc.Update(ctx.TgDec.Update(msg));
                        stream.Write(outBuf, 0, outBuf.Length);
                    }
                }
                catch { }
                finally
                {
                    // Закрываем клиента, чтобы разбудить встречный поток.
                    try { client.Close(); } catch { }
                }
            });
            down.IsBackground = true;
            down.Name = "tg-proxy-down";
            down.Start();

            try
            {
                byte[] buf = new byte[32768];
                for (; ; )
                {
                    int r = stream.Read(buf, 0, buf.Length);
                    if (r <= 0) break;
                    Interlocked.Add(ref cUp, r);
                    byte[] outBuf = ctx.TgEnc.Update(ctx.CltDec.Update(buf, 0, r));
                    List<byte[]> parts = splitter.Split(outBuf);
                    if (parts.Count == 1) ws.SendBinary(parts[0]);
                    else if (parts.Count > 1) ws.SendBatch(parts);
                }
                byte[] tail = splitter.Flush();
                if (tail != null)
                {
                    try { ws.SendBinary(tail); } catch { }
                }
            }
            catch (Exception ex)
            {
                reason = ex.Message;
            }
            finally
            {
                try { ws.Dispose(); } catch { }
                try { client.Close(); } catch { }
            }

            down.Join(2000);
            double sec = (DateTime.Now - t0).TotalSeconds;
            Log("info", string.Format("[{0}] ДЦ{1}{2} сессия закрыта ({3}): отправлено {4}, получено {5}, длилась {6:0.0} с",
                label, dc, mediaTag, reason,
                TgBytes.HumanSize(Interlocked.Read(ref cUp) - up0),
                TgBytes.HumanSize(Interlocked.Read(ref cDown) - down0),
                sec));
        }

        private void BridgeDirectTcp(TcpClient client, NetworkStream stream, CryptoCtx ctx, byte[] relayInit,
            string label, int dc, string mediaTag, string dst)
        {
            Log("info", "[" + label + "] ДЦ" + dc + mediaTag + " -> прямое соединение с " + dst + ":443");
            TcpClient remote = new TcpClient();
            try
            {
                remote.NoDelay = true;
                IAsyncResult ar = remote.BeginConnect(dst, 443, null, null);
                if (!ar.AsyncWaitHandle.WaitOne(TcpFallbackTimeoutMs))
                {
                    throw new TimeoutException("таймаут подключения");
                }
                remote.EndConnect(ar);
            }
            catch (Exception ex)
            {
                Interlocked.Increment(ref cFailed);
                Log("error", "[" + label + "] прямое соединение с " + dst + ":443 не удалось: " + ex.Message +
                    ". Похоже, дата-центры Telegram у провайдера закрыты — этого мост обойти не может.");
                try { remote.Close(); } catch { }
                return;
            }

            Interlocked.Increment(ref cTcp);
            NetworkStream rs = remote.GetStream();
            rs.Write(relayInit, 0, relayInit.Length);

            var down = new Thread(delegate()
            {
                try
                {
                    byte[] buf = new byte[32768];
                    for (; ; )
                    {
                        int r = rs.Read(buf, 0, buf.Length);
                        if (r <= 0) break;
                        Interlocked.Add(ref cDown, r);
                        byte[] outBuf = ctx.CltEnc.Update(ctx.TgDec.Update(buf, 0, r));
                        stream.Write(outBuf, 0, outBuf.Length);
                    }
                }
                catch { }
                finally
                {
                    try { client.Close(); } catch { }
                }
            });
            down.IsBackground = true;
            down.Name = "tg-proxy-down-tcp";
            down.Start();

            try
            {
                byte[] buf = new byte[32768];
                for (; ; )
                {
                    int r = stream.Read(buf, 0, buf.Length);
                    if (r <= 0) break;
                    Interlocked.Add(ref cUp, r);
                    byte[] outBuf = ctx.TgEnc.Update(ctx.CltDec.Update(buf, 0, r));
                    rs.Write(outBuf, 0, outBuf.Length);
                }
            }
            catch { }
            finally
            {
                try { remote.Close(); } catch { }
                try { client.Close(); } catch { }
            }
            down.Join(2000);
            Log("info", "[" + label + "] ДЦ" + dc + mediaTag + " прямая сессия закрыта.");
        }

        private static byte[] ReadExactly(NetworkStream s, int n)
        {
            byte[] dst = new byte[n];
            int got = 0;
            while (got < n)
            {
                int r;
                try { r = s.Read(dst, got, n - got); }
                catch { return null; }
                if (r <= 0) return null;
                got += r;
            }
            return dst;
        }
    }
}
