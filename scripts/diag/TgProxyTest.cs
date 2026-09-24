// Проверка моста без Telegram: программа сама изображает клиента.
//
// Делает ровно то, что делает настоящий клиент при подключении к MTProxy:
// собирает обфусцированный init-пакет, отправляет его, затем шлёт запрос
// req_pq_multi — первый пакет любого сеанса MTProto. Если в ответ пришёл
// resPQ, значит сквозь мост прошла вся цепочка: разбор рукопожатия, четыре
// потока шифрования, нарезка на кадры, WebSocket и сам дата-центр.
//
// Сборка и запуск из корня репозитория (PowerShell):
//
//   & "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo `
//     /target:exe /platform:x64 /out:$env:TEMP\tgtest.exe `
//     src-native\TgProxy.cs scripts\diag\TgProxyTest.cs
//   & $env:TEMP\tgtest.exe
//
// Нужен выход в интернет. Прогоняет дата-центры 2, 2, 1, 4, 5: второе
// соединение к ДЦ2 проверяет, что закрытый адрес уже отложен и мост идёт
// в обход без таймаута.
using System;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Threading;

namespace Zapret2App
{
    public static class TgTest
    {
        private static readonly RNGCryptoServiceProvider Rng = new RNGCryptoServiceProvider();

        public static void Main(string[] args)
        {
            Console.OutputEncoding = Encoding.UTF8;
            int port = 14431;
            int dc = 2;
            if (args.Length > 0) int.TryParse(args[0], out dc);

            byte[] secret = new byte[16];
            Rng.GetBytes(secret);
            string secretHex = TgBytes.Hex(secret, 0, 16);

            var server = new TgProxyServer(delegate(string level, string msg)
            {
                Console.WriteLine("  [" + level + "] " + msg);
            });

            Console.WriteLine("== Поднимаю мост на 127.0.0.1:" + port + ", секрет " + secretHex);
            server.Start("127.0.0.1", port, secretHex);
            Thread.Sleep(300);

            int[] dcs = new int[] { 2, 2, 1, 4, 5 };
            for (int i = 0; i < dcs.Length; i++)
            {
                Console.WriteLine();
                Console.WriteLine("---- попытка " + (i + 1) + " ----");
                var sw = System.Diagnostics.Stopwatch.StartNew();
                try
                {
                    RunClient(port, secret, dcs[i]);
                }
                catch (Exception ex)
                {
                    Console.WriteLine("!! Клиент упал: " + ex.Message);
                }
                sw.Stop();
                Console.WriteLine("   заняло " + sw.ElapsedMilliseconds + " мс");
            }

            Thread.Sleep(500);
            var st = server.Snapshot();
            Console.WriteLine();
            Console.WriteLine("== Счётчики моста:");
            Console.WriteLine("   всего соединений: " + st.Total + ", через веб-транспорт: " + st.ViaWs +
                              ", через запасной узел: " + st.ViaCf + ", напрямую: " + st.ViaTcp +
                              ", не прошло: " + st.Failed + ", отвергнуто: " + st.Bad);
            Console.WriteLine("   отправлено " + TgBytes.HumanSize(st.BytesUp) + ", получено " + TgBytes.HumanSize(st.BytesDown));
            server.Stop();
        }

        private static void RunClient(int port, byte[] secret, int dc)
        {
            // --- 1. Собираем init-пакет так же, как настоящий клиент --------
            byte[] init = new byte[64];
            for (; ; )
            {
                Rng.GetBytes(init);
                if (init[0] == 0xef) continue;
                string head = TgBytes.Hex(init, 0, 4);
                if (head == "48454144" || head == "504f5354" || head == "47455420" ||
                    head == "eeeeeeee" || head == "dddddddd" || head == "16030102") continue;
                if (init[4] == 0 && init[5] == 0 && init[6] == 0 && init[7] == 0) continue;
                break;
            }
            // Транспорт intermediate: длина пакета четырьмя байтами.
            init[56] = 0xee; init[57] = 0xee; init[58] = 0xee; init[59] = 0xee;
            init[60] = (byte)(dc & 0xff);
            init[61] = (byte)((dc >> 8) & 0xff);

            byte[] prekeyIv = TgBytes.Sub(init, 8, 48);
            byte[] encKey = Sha256(TgBytes.Concat(TgBytes.Sub(prekeyIv, 0, 32), secret));
            byte[] encIv = TgBytes.Sub(prekeyIv, 32, 16);

            byte[] rev = TgBytes.Reversed(prekeyIv);
            byte[] decKey = Sha256(TgBytes.Concat(TgBytes.Sub(rev, 0, 32), secret));
            byte[] decIv = TgBytes.Sub(rev, 32, 16);

            var enc = new AesCtr(encKey, encIv);
            var dec = new AesCtr(decKey, decIv);

            // Наружу уходят первые 56 байт как есть и последние 8 шифрованными.
            byte[] encrypted = enc.Update(init);
            byte[] packet = new byte[64];
            Buffer.BlockCopy(init, 0, packet, 0, 56);
            Buffer.BlockCopy(encrypted, 56, packet, 56, 8);

            Console.WriteLine("== Клиент: дата-центр " + dc + ", транспорт intermediate");

            var tcp = new TcpClient();
            tcp.NoDelay = true;
            tcp.Connect("127.0.0.1", port);
            tcp.ReceiveTimeout = 20000;
            var s = tcp.GetStream();
            s.Write(packet, 0, packet.Length);
            Console.WriteLine("   init-пакет отправлен (64 байта)");

            // --- 2. req_pq_multi — первый запрос любого сеанса --------------
            byte[] nonce = new byte[16];
            Rng.GetBytes(nonce);
            byte[] body = new byte[20];
            // Конструктор req_pq_multi, little-endian.
            body[0] = 0xf1; body[1] = 0x8e; body[2] = 0x7e; body[3] = 0xbe;
            Buffer.BlockCopy(nonce, 0, body, 4, 16);

            long unix = (long)(DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalSeconds;
            byte[] msg = new byte[8 + 8 + 4 + body.Length];
            // auth_key_id = 0 — сообщение без шифрования.
            WriteLong(msg, 8, unix << 32);
            WriteInt(msg, 16, body.Length);
            Buffer.BlockCopy(body, 0, msg, 20, body.Length);

            byte[] framed = new byte[4 + msg.Length];
            WriteInt(framed, 0, msg.Length);
            Buffer.BlockCopy(msg, 0, framed, 4, msg.Length);

            byte[] wire = enc.Update(framed);
            s.Write(wire, 0, wire.Length);
            Console.WriteLine("   req_pq_multi отправлен (" + framed.Length + " байт)");

            // --- 3. Ответ ---------------------------------------------------
            byte[] lenBuf = ReadExactly(s, 4);
            if (lenBuf == null)
            {
                Console.WriteLine("!! Ответа не было: соединение закрылось.");
                return;
            }
            byte[] lenPlain = dec.Update(lenBuf);
            int respLen = lenPlain[0] | (lenPlain[1] << 8) | (lenPlain[2] << 16) | ((lenPlain[3] & 0x7f) << 24);
            Console.WriteLine("   ответ: заявлено " + respLen + " байт");
            if (respLen <= 0 || respLen > 65536)
            {
                Console.WriteLine("!! Длина бессмысленная — расшифровка не сошлась.");
                return;
            }

            byte[] respRaw = ReadExactly(s, respLen);
            if (respRaw == null)
            {
                Console.WriteLine("!! Тело ответа не дошло.");
                return;
            }
            byte[] resp = dec.Update(respRaw);

            // Внутри: auth_key_id(8) + msg_id(8) + len(4) + тело.
            if (resp.Length < 24)
            {
                Console.WriteLine("!! Ответ слишком короткий.");
                return;
            }
            uint ctor = (uint)(resp[20] | (resp[21] << 8) | (resp[22] << 16) | (resp[23] << 24));
            Console.WriteLine("   конструктор ответа: 0x" + ctor.ToString("x8"));
            if (ctor == 0x05162463)
            {
                Console.WriteLine();
                Console.WriteLine("== resPQ получен. Мост работает: MTProto дошёл до дата-центра и вернулся.");
            }
            else
            {
                Console.WriteLine("!! Ожидался resPQ (0x05162463).");
            }

            try { tcp.Close(); } catch { }
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

        private static void WriteInt(byte[] dst, int offset, int v)
        {
            dst[offset] = (byte)(v & 0xff);
            dst[offset + 1] = (byte)((v >> 8) & 0xff);
            dst[offset + 2] = (byte)((v >> 16) & 0xff);
            dst[offset + 3] = (byte)((v >> 24) & 0xff);
        }

        private static void WriteLong(byte[] dst, int offset, long v)
        {
            for (int i = 0; i < 8; i++) dst[offset + i] = (byte)((v >> (8 * i)) & 0xff);
        }

        private static byte[] Sha256(byte[] data)
        {
            using (var sha = SHA256.Create()) return sha.ComputeHash(data);
        }
    }
}
