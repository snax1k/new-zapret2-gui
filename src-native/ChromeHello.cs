// Проба автоподбора с настоящим приветствием браузера.
//
// Зачем. До 0.3.3 проба подбора слала ClientHello силами .NET: сначала TLS 1.0
// на 115 байт (из-за чего подбор для Discord не находил ничего), после
// исправления — TLS 1.2 на 173 байта. Настоящий Discord — это Chromium: его
// приветствие весит около 1,7 КБ (постквантовый обмен ключами X25519MLKEM768
// один занимает 1216 байт) и не помещается в один TCP-сегмент. DPI и
// стратегии обхода ведут себя с такими приветствиями по-разному: где резать,
// в какой сегмент попадёт имя сайта, что увидит фильтр. Стратегия, прошедшая
// короткую пробу, могла не пройти с настоящим клиентом.
//
// Как. Ниже — приветствие, записанное с Edge 153 (Chromium) 2026-09-24:
// браузер отправил его на локальный сокет, думая, что соединяется с
// discord.com. Перед каждой пробой в нём меняются случайное число, номер
// сессии и имя сайта, остальное — байт в байт как у браузера: порядок
// расширений, GREASE, ECH, ALPN, ключи.
//
// Полное рукопожатие не нужно. Вопрос пробы — пропустил ли DPI приветствие.
// Ответ — ServerHello от сервера: его может прислать только тот, кто
// приветствие получил. Сервер обязан повторить в ответе наш номер сессии
// (RFC 8446, 4.1.3), и это отсекает заглушки, отвечающие что попало.
//
// Ключи в образце настоящие и повторяются от пробы к пробе. Для пробы это
// безразлично: рукопожатие не завершается, секретов никто не получает.
// Случайные ключи не годятся — сервер проверяет ключ ML-KEM на корректность и
// отвечает на мусор отказом, и тогда провалом выглядела бы любая стратегия.
//
// Переснять образец: scripts/diag/ (см. MEMORY §8) — поймать приветствие
// свежего Edge на локальном сокете и заменить строку ниже.
using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;

namespace Zapret2App
{
    internal static class ChromeHello
    {
        /// <summary>Откуда образец — пишется в отчёт подбора.</summary>
        public const string Origin = "Edge 153 (Chromium), записан 2026-09-24";

        private const string TemplateB64 =
            "FgMBBrwBAAa4AwNmg7d3lkgiwTo0keei5jztXZPUrKboyy2Y2qHEY8uI5SA2oeTa6UYzF/qAa/0gt8nxyxvAYttiTVzqM+pP" +
            "fg0JFQAgqqoTARMCEwPAK8AvwCzAMMypzKjAE8AUAJwAnQAvADUBAAZPGhoAAAAFAAUBAAAAAAAtAAIBAf8BAAEAAA0AGgAY" +
            "qqoJBAkFCQYEAwgEBAEFAwgFBQEIBgYBAAoADAAKenoR7AAdABcAGAAXAAAAKwAHBrq6AwQDAwAAABAADgAAC2Rpc2NvcmQu" +
            "Y29tADME7wTtenoAAQAR7ATA8zMfqrhe79aQ+Rhg72A1SitHlbc0EqJU7leIoGxZ+hKuQhYOfWa0VeELTnHEt9VvjMYAGUKG" +
            "gTo4CdUp1yQvSutdW4cSt9xdv5WrXMURfbpmlKrIPKGRjTxDGaie6GRPnBZB6NIhsjMasZe0+8IKKnYN8aALwySWEFRAtwxR" +
            "w9TDDelzxdSycutC8GRHI1s4ifYG2mCPCORPYGrHyQpeiwqh3EXFhQVdAdcAyjeB/LV28bbKvRNN2LnAWMkpMdlNDWYoFzZ6" +
            "qHnI1Qinf2c8PRlSfUMwffZP7tWnWVx1zSiMaKYC1/Iu7cgEQvWpvtgnLTU9JBfP05ZHDFcY67uHYGoXeAZNH4xhdXolkQZm" +
            "vzHGtQobnzqdg9k53fAA3+V5RRNslMJ/jLFxulmM3ERagCMvHLKfoeiSwPy5ySoK8LoieoGe5icn4bq7bdWxxteBlTyMDmsJ" +
            "rYcgSSdVfpQ0RmCTnDKQCke/RdGH0lBXzGtzDQay7YWB5AQGoDNZgfKNTQoRnGZOf6LD4Qd2abK50rStxbphVwx/wDVPVLi/" +
            "X3MCpqeWM4S3W8y3d0ZmYBB3xTCSdjqFZ/pPXnC/p5mPz3huv5lYczd5o5lD67fOhpHLPKYy5fa8GhM/YEaykZI/StElEGQ0" +
            "fOCPhkKHuPCtGJi16OoGq8mPM/agu/svEtXLIFJ6iSo5llAsVkUbmcyzC8R63pcXAxFv7rW/2shdmkVKlwmds/EfTPG0QsNN" +
            "DZGBFHY1pwpxzqgvqRcNORIgWfs7/qW6PkujxdNlVGEWs3k3Q7e0oJg8CHBH00ZDErxewjk2QtwCIXxhgdQ+yLCV1CgVf+qp" +
            "JpgvvzxnVZCcC/EsBseTdMhw9eicbAiMcdIETHQ1mVymBZehM2BIOotGXnJvUZZnbnh3D9Ri8PtGF3KjM6wgCKs6JUl/gnYl" +
            "/fIhSWowh6EBMak+uAqnlgmlFKOvrGTPqtpmRCAXRllLvFjLIXsw2dACMgtW4LsGQWMV2iLDGpF9fDXDFyRJauklQwm49OeG" +
            "QrEc/FNS6jkiRrM9XYa9Gim2MFWrcSUgYjaT1pqpvNNu85Y+T9eYcHMVsgN3JlCDojsUIhiJ0hRHYtAugJbPwFunISAQVchU" +
            "ADYrwdZ2XMcrAJs7TJcrgQGR7pJaiZK0D/Rv9yuevoheICeqhIx1p9HMj6NVoAGGpSmrVBORDjm5tQCzdUqiu/u5FLEuCXdk" +
            "CioA01uWoRY1g1hb5hp99oYWw8psvad4ScSJGJJ+drqgA2Re+aMBs/d/61mkb3d5c9Osv0aXYGS+zuQrHzWOM4eB/pa7hzGB" +
            "LDIXShBEqgYyniVagTSN50qi9FbIEsDPYylisykJ8CCV4Uok4oencfCA4DW++TKuxEMy5GJmKevPPQQLL2lRQjRyhFwPoFuq" +
            "EWWLeqWGVny9TCUA4ZkJbzFdBCQECcpw++zM2kqlEnU7jKEtXDZ6HrO0sjBZu8CzfnGJU6R+XFCfzsM2/HuueGhpNTGI/3kZ" +
            "+5STQrzGdtcnHylvjOSBfdl1OaNvcd4Is56+AZIUgUABLtPiJ9ajwckQuIeK91sGH169w5/JrS4CcEoNYZnDbViE91PYgWos" +
            "2uzrS/5GTDSURgAdACCUYRNeQAhY9YZHU7O2i3XVoG10uuPk6pvWft+4GJtKKwASAABEzQAFAAMCaDIACwACAQAAGwADAgAC" +
            "/g0AugAAAQABzAAgmpRv9iYNpSDpjKZW+G/1iLajPS1ldRZJAcjrIS9bx30AkJnxVOrZ3PBeosBQpDlY2iHHD5IjQyKocatb" +
            "Rwe3uYv1umFFoMRlqb0HG/oje0QBb1Gj/jCA1en+vc5QUr3vcC/GjQWuGAVcqoX+WYBkMBCIEtKs5Tf+15lj3Jf/Roax/oht" +
            "3eF8G5kVidBTqr4R2aU1hwcz3wvF6Nzkz9riIBAzrIWagMPzb0k7c7PsadBNFgAjAAAAEAAOAAwCaDIIaHR0cC8xLjFKSgAB" +
            "AA==";

        private static readonly byte[] Template = Convert.FromBase64String(TemplateB64);
        private static readonly RNGCryptoServiceProvider Rng = new RNGCryptoServiceProvider();

        /// <summary>Размер образца — для отчёта.</summary>
        public static int TemplateSize { get { return Template.Length; } }

        /// <summary>
        /// Приветствие для имени <paramref name="sni"/>: образец браузера с новым
        /// случайным числом, новым номером сессии и подменённым именем сайта.
        /// </summary>
        public static byte[] Build(string sni, out byte[] sessionId)
        {
            byte[] t = Template;
            // Запись: 16 03 01 <len2>; рукопожатие: 01 <len3>; дальше тело.
            int p = 9;
            byte[] version = Sub(t, p, 2); p += 2;
            p += 32;                                   // random
            int sidLen = t[p]; p += 1 + sidLen;        // legacy_session_id
            int csLen = (t[p] << 8) | t[p + 1];
            byte[] ciphers = Sub(t, p, 2 + csLen); p += 2 + csLen;
            int compLen = t[p];
            byte[] comp = Sub(t, p, 1 + compLen); p += 1 + compLen;
            int extLen = (t[p] << 8) | t[p + 1]; p += 2;
            int end = p + extLen;

            byte[] name = Encoding.ASCII.GetBytes(sni);
            var exts = new List<byte>(extLen + name.Length);
            bool replaced = false;
            while (p + 4 <= end)
            {
                int type = (t[p] << 8) | t[p + 1];
                int len = (t[p + 2] << 8) | t[p + 3];
                if (type == 0)
                {
                    // server_name: список(2) | тип имени(1)=0 | длина(2) | имя
                    int listLen = 3 + name.Length;
                    int dataLen = 2 + listLen;
                    exts.Add(0); exts.Add(0);
                    exts.Add((byte)(dataLen >> 8)); exts.Add((byte)dataLen);
                    exts.Add((byte)(listLen >> 8)); exts.Add((byte)listLen);
                    exts.Add(0);
                    exts.Add((byte)(name.Length >> 8)); exts.Add((byte)name.Length);
                    exts.AddRange(name);
                    replaced = true;
                }
                else
                {
                    for (int i = 0; i < 4 + len; i++) exts.Add(t[p + i]);
                }
                p += 4 + len;
            }
            if (!replaced) throw new InvalidOperationException("в образце приветствия нет server_name");

            sessionId = new byte[32];
            Rng.GetBytes(sessionId);
            byte[] random = new byte[32];
            Rng.GetBytes(random);

            var body = new List<byte>(t.Length + name.Length);
            body.AddRange(version);
            body.AddRange(random);
            body.Add(32);
            body.AddRange(sessionId);
            body.AddRange(ciphers);
            body.AddRange(comp);
            body.Add((byte)(exts.Count >> 8)); body.Add((byte)exts.Count);
            body.AddRange(exts);

            var rec = new List<byte>(body.Count + 9);
            int hsLen = body.Count;
            int recLen = 4 + hsLen;
            rec.Add(0x16); rec.Add(t[1]); rec.Add(t[2]);
            rec.Add((byte)(recLen >> 8)); rec.Add((byte)recLen);
            rec.Add(1);
            rec.Add((byte)(hsLen >> 16)); rec.Add((byte)(hsLen >> 8)); rec.Add((byte)hsLen);
            rec.AddRange(body);
            return rec.ToArray();
        }

        /// <summary>
        /// Сколько байт ответа нужно, чтобы вынести вердикт. Для ServerHello —
        /// до конца повторённого номера сессии: 5 запись + 4 рукопожатие +
        /// 2 версия + 32 random + 1 длина + 32 номер.
        /// </summary>
        public const int ResponseNeeded = 76;

        /// <summary>
        /// Разбор ответа сервера.
        /// </summary>
        /// <returns>true — сервер получил приветствие и ответил на него.</returns>
        public static bool Judge(byte[] r, int n, byte[] sessionId, out string verdict)
        {
            if (n < 5) { verdict = "ответ слишком короткий (" + n + " байт)"; return false; }

            if (r[0] == 0x15 && n >= 7)
            {
                // Отказ самого сервера. DPI его не присылает — значит,
                // приветствие дошло. Но проба на этом не проходит: если такое
                // случается, испорчен образец, и это надо видеть в отчёте.
                verdict = "сервер ответил отказом TLS: alert " + r[6];
                return false;
            }

            if (r[0] != 0x16)
            {
                verdict = string.Format("в ответ пришла не TLS-запись (первый байт 0x{0:x2}) — похоже на заглушку", r[0]);
                return false;
            }
            if (n < ResponseNeeded || r[5] != 0x02)
            {
                verdict = n < ResponseNeeded ? "ответ оборвался на " + n + " байтах" : "первое сообщение сервера — не ServerHello";
                return false;
            }
            if (r[43] != 32)
            {
                verdict = "ServerHello без нашего номера сессии — отвечает не тот сервер";
                return false;
            }
            for (int i = 0; i < 32; i++)
            {
                if (r[44 + i] != sessionId[i])
                {
                    verdict = "ServerHello с чужим номером сессии — отвечает не тот сервер";
                    return false;
                }
            }
            verdict = "ServerHello";
            return true;
        }

        private static byte[] Sub(byte[] src, int offset, int count)
        {
            byte[] dst = new byte[count];
            Buffer.BlockCopy(src, offset, dst, 0, count);
            return dst;
        }
    }
}
