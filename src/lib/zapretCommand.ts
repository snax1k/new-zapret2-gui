import { Preset, PresetArgs, QuickToggleState, StrategyGroup, YoutubeStrategyId } from '../types';

/**
 * Сборка командной строки winws.exe (bol-van/zapret v72.x).
 *
 * Ключевые правила ядра, которые обязан соблюдать билдер:
 *  1. Без --wf-tcp / --wf-udp / --wf-raw winws завершается с ошибкой
 *     "windivert filter : must specify port or/and partial raw filter".
 *     --filter-tcp/--filter-udp это фильтр ПРОФИЛЯ, он НЕ заменяет --wf-*.
 *  2. --dpi-desync-autottl принимает только [+|-]<delta>[:<min>[-<max>]].
 *     Значения вида "auto:2:3-12" приводят к немедленному выходу с кодом 1.
 *  3. Повторное указание одной и той же опции внутри одного профиля
 *     перезаписывает предыдущее значение — дубликаты нужно убирать.
 */

/** Опции winws, у которых значение задаётся через "=" и которые нас интересуют. */
const OPT_FILTER_TCP = '--filter-tcp=';
const OPT_FILTER_UDP = '--filter-udp=';

const HOSTLIST_PREFIXES = [
  '--hostlist=',
  '--hostlist-domains=',
  '--hostlist-auto=',
];

/** Разбивает строку аргументов на токены, уважая кавычки. */
export function tokenize(args: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(args)) !== null) {
    out.push(m[1] !== undefined ? m[1] : m[2]);
  }
  return out;
}

/** Имя опции без значения: "--filter-tcp=443" -> "--filter-tcp". */
function optName(token: string): string {
  const eq = token.indexOf('=');
  return eq === -1 ? token : token.slice(0, eq);
}

function optValue(tokens: string[], prefix: string): string | null {
  for (const t of tokens) {
    if (t.startsWith(prefix)) return t.slice(prefix.length);
  }
  return null;
}

/**
 * Приводит значение TTL к синтаксису, который понимает ядро.
 * Возвращает null, если значение некорректно (тогда опция не добавляется).
 *
 * Поддерживаемые пользователем формы:
 *   "auto:2:3-12" (устаревший формат из старых пресетов) -> "2:3-12"
 *   "2:3-12", "+2:3-12", "-2", "4" -> как есть
 */
export function normalizeAutoTtl(raw: string): string | null {
  let v = raw.trim();
  if (!v) return null;
  if (v.toLowerCase().startsWith('auto:')) v = v.slice(5);
  if (v === '-') return '-';
  return /^[+-]?\d{1,3}(:\d{1,3}(-\d{1,3})?)?$/.test(v) ? v : null;
}

/** Строит один профиль из структурированных полей пресета. */
function profileFromArgs(a: PresetArgs): string[] {
  const p: string[] = [];

  if (a.filterTcp) p.push(`${OPT_FILTER_TCP}${a.filterTcp}`);
  if (a.filterUdp) p.push(`${OPT_FILTER_UDP}${a.filterUdp}`);
  if (a.filterL7) p.push(`--filter-l7=${a.filterL7}`);
  if (a.hostlist) p.push(`--hostlist=${a.hostlist}`);
  if (a.desyncMode) p.push(`--dpi-desync=${a.desyncMode}`);
  if (a.desyncFooling && a.desyncFooling !== 'none') p.push(`--dpi-desync-fooling=${a.desyncFooling}`);
  if (a.splitPos) p.push(`--dpi-desync-split-pos=${a.splitPos}`);
  if (a.splitSeqovl) p.push(`--dpi-desync-split-seqovl=${a.splitSeqovl}`);
  if (a.repeats) p.push(`--dpi-desync-repeats=${a.repeats}`);

  if (a.desyncTtl) {
    const ttl = normalizeAutoTtl(a.desyncTtl);
    if (ttl) p.push(`--dpi-desync-autottl=${ttl}`);
  }

  if (a.desyncFakeTls) p.push(`--dpi-desync-fake-tls=${a.desyncFakeTls}`);
  if (a.desyncFakeHttp) p.push(`--dpi-desync-fake-http=${a.desyncFakeHttp}`);
  if (a.desyncFakeQuic) p.push(`--dpi-desync-fake-quic=${a.desyncFakeQuic}`);
  if (a.wssize) p.push(`--wssize=${a.wssize}`);

  // --dpi-desync-any-protocol без cutoff ломает соединения: ядро само об этом
  // предупреждает. Поэтому cutoff добавляется принудительно.
  if (a.anyProtocol) {
    p.push('--dpi-desync-any-protocol');
    if (!a.desyncCutoff) p.push('--dpi-desync-cutoff=d4');
  }
  if (a.desyncCutoff) p.push(`--dpi-desync-cutoff=${a.desyncCutoff}`);

  if (a.extraArgs) p.push(...tokenize(a.extraArgs));

  return p;
}

/** Убирает дубликаты опций внутри профиля — побеждает последнее значение. */
function dedupeProfile(tokens: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    const name = optName(t);
    // Опции, которые допустимо повторять (списки складываются в ядре).
    const repeatable =
      name === '--hostlist' ||
      name === '--hostlist-exclude' ||
      name === '--ipset' ||
      name === '--ipset-exclude' ||
      name === '--wf-raw-part' ||
      name === '--dpi-desync-fake-tls' ||
      name === '--dpi-desync-fake-quic';
    if (!repeatable) {
      if (seen.has(name)) continue;
      seen.add(name);
    }
    out.push(t);
  }
  return out.reverse();
}

/** Профиль обработки QUIC: UDP 443, но не голосовой диапазон Discord. */
function isQuicProfile(tokens: string[]): boolean {
  if (isDiscordProfile(tokens)) return false;
  const udp = optValue(tokens, OPT_FILTER_UDP);
  if (!udp) return false;
  return udp.split(',').some(r => r === '443');
}

/**
 * Профиль Discord: голосовой UDP (l7 discord/stun) либо медиасерверы
 * discord.media на альтернативных TCP-портах Cloudflare.
 */
function isDiscordProfile(tokens: string[]): boolean {
  const l7 = optValue(tokens, '--filter-l7=');
  if (l7 && /discord|stun/.test(l7)) return true;
  const domains = optValue(tokens, '--hostlist-domains=');
  return !!domains && /discord/.test(domains);
}

/**
 * Профиль медиасерверов Discord: discord.media на альтернативных TCP-портах
 * Cloudflare (2053, 2083, 2087, 2096, 8443).
 */
function isDiscordMediaProfile(tokens: string[]): boolean {
  if (optValue(tokens, OPT_FILTER_TCP) === null) return false;
  const domains = optValue(tokens, '--hostlist-domains=');
  return !!domains && /discord\.media/.test(domains);
}

/** Профиль YouTube/Google: TCP-профиль, отбирающий домены по list-google.txt. */
function isGoogleTcpProfile(tokens: string[]): boolean {
  if (optValue(tokens, OPT_FILTER_TCP) === null) return false;
  return tokens.some(t => t.startsWith('--hostlist=') && /list-google/i.test(t));
}

export interface YoutubeStrategy {
  id: YoutubeStrategyId;
  label: string;
  /** Короткое пояснение сути метода для интерфейса. */
  hint: string;
  /**
   * Опции десинхронизации профиля. Фильтр портов и хостлисты берутся из
   * пресета и не трогаются, поэтому здесь только --ip-id / --dpi-desync-*.
   * Пустой массив = профиль полностью отключается (эталон для сравнения).
   */
  options: string[];
}

const FAKE_TLS_BIN = 'tls_clienthello_www_google_com.bin';
/** Приветствия российских сайтов из поставки ядра — для белого списка ТСПУ. */
const RU_TLS_BIN = 'tls_clienthello_gosuslugi_ru.bin';
const RU_TLS_KYBER_BIN = 'tls_clienthello_vk_com_kyber.bin';

/**
 * Варианты обхода — общая библиотека для профиля YouTube и профиля сайтов.
 *
 * Какой из них сработает — зависит от конкретного ТСПУ провайдера, определить
 * это заранее нельзя. Все варианты собраны из техник, документированных в
 * docs/readme.md ядра zapret v72.13, и используют только те режимы, маркеры
 * позиций и виды fooling, которые ядро действительно принимает
 * (desync.c:203-209, nfqws.c:1273-1285, protocol.c:74-80).
 *
 * ПОРЯДОК ВАЖЕН. Подбор делает быстрый отсев и берёт на полную проверку
 * первых прошедших, поэтому впереди стоят те, что чаще всего побеждают на
 * живых замерах (multidisorder — 9 из 9 у тестеров в Москве и Петербурге),
 * а в хвосте — экзотика.
 *
 * Не вошли намеренно: fooling=ts (на Windows метки времени TCP по умолчанию
 * выключены, readme.md:379) и hopbyhop (только IPv6).
 */
export const YOUTUBE_STRATEGIES: YoutubeStrategy[] = [
  {
    id: 'multidisorder',
    label: 'multidisorder без фейков',
    hint: 'Только перестановка сегментов по четырём позициям, ничего не шлётся лишнего.',
    options: [
      '--ip-id=zero',
      '--dpi-desync=multidisorder',
      '--dpi-desync-split-pos=1,midsld,host+1,sniext+1',
    ],
  },
  {
    id: 'seqovl681',
    label: 'seqovl 681',
    hint: 'Перекрытие sequence фейковым ClientHello google.com. Базовый вариант.',
    options: [
      '--ip-id=zero',
      '--dpi-desync=multisplit',
      '--dpi-desync-split-pos=1',
      '--dpi-desync-split-seqovl=681',
      '--dpi-desync-split-seqovl-pattern=' + FAKE_TLS_BIN,
    ],
  },
  {
    id: 'seqovl568',
    label: 'seqovl 568',
    hint: 'Перекрытие обрезанной записью ClientHello. Так профиль сайтов работал до 0.1.5.',
    options: [
      '--dpi-desync=multisplit',
      '--dpi-desync-split-pos=1',
      '--dpi-desync-split-seqovl=568',
      '--dpi-desync-split-seqovl-pattern=' + FAKE_TLS_BIN,
    ],
  },
  {
    id: 'seqovl652-pos2',
    label: 'seqovl 652, разрез на 2',
    hint: 'Перекрытие 652 байта с разрезом после второго байта — распространённый вариант из сборок сообщества.',
    options: [
      '--dpi-desync=multisplit',
      '--dpi-desync-split-pos=2',
      '--dpi-desync-split-seqovl=652',
      '--dpi-desync-split-seqovl-pattern=' + FAKE_TLS_BIN,
    ],
  },
  {
    id: 'fake-md5sig',
    label: 'fake + multidisorder (md5sig)',
    hint: 'Фейк с опцией TCP MD5: DPI его принимает, сервер отбрасывает.',
    options: [
      '--ip-id=zero',
      '--dpi-desync=fake,multidisorder',
      '--dpi-desync-split-pos=1,midsld',
      '--dpi-desync-repeats=6',
      '--dpi-desync-fooling=md5sig',
      '--dpi-desync-fake-tls=' + FAKE_TLS_BIN,
    ],
  },
  {
    id: 'fake-badseq-md5sig',
    label: 'fake + multidisorder (badseq + md5sig)',
    hint: 'Два способа испортить фейк сразу — пример из документации ядра (readme.md:2090).',
    options: [
      '--ip-id=zero',
      '--dpi-desync=fake,multidisorder',
      '--dpi-desync-split-pos=1,midsld',
      '--dpi-desync-repeats=6',
      '--dpi-desync-fooling=badseq,md5sig',
      '--dpi-desync-fake-tls=' + FAKE_TLS_BIN,
    ],
  },
  {
    id: 'fake-badseq',
    label: 'fake + multisplit (badseq)',
    hint: 'Фейк с неверным sequence: сервер его игнорирует, DPI — нет.',
    options: [
      '--ip-id=zero',
      '--dpi-desync=fake,multisplit',
      '--dpi-desync-split-pos=1,midsld',
      '--dpi-desync-repeats=6',
      '--dpi-desync-fooling=badseq',
      '--dpi-desync-fake-tls=' + FAKE_TLS_BIN,
    ],
  },
  {
    id: 'fake-split-md5sig',
    label: 'fake + multisplit (md5sig)',
    hint: 'Фейк с опцией TCP MD5, а сам запрос режется в прямом порядке.',
    options: [
      '--ip-id=zero',
      '--dpi-desync=fake,multisplit',
      '--dpi-desync-split-pos=1,midsld',
      '--dpi-desync-repeats=6',
      '--dpi-desync-fooling=md5sig',
      '--dpi-desync-fake-tls=' + FAKE_TLS_BIN,
    ],
  },
  {
    id: 'fake-autottl',
    label: 'fake + автоподбор TTL',
    hint: 'Фейк с укороченным TTL: доходит до DPI, но не до сервера Google.',
    options: [
      '--ip-id=zero',
      '--dpi-desync=fake,multisplit',
      '--dpi-desync-split-pos=1,midsld',
      '--dpi-desync-repeats=6',
      '--dpi-desync-autottl=2:3-12',
      '--dpi-desync-fake-tls=' + FAKE_TLS_BIN,
    ],
  },
  {
    id: 'multisplit-sni',
    label: 'multisplit по SNI',
    hint: 'Разрез в прямом порядке по четырём позициям вокруг имени сайта, без фейков.',
    options: [
      '--ip-id=zero',
      '--dpi-desync=multisplit',
      '--dpi-desync-split-pos=1,sniext+1,host+1,midsld',
    ],
  },
  {
    id: 'seqovl-midsld',
    label: 'disorder + seqovl на midsld',
    hint: 'Разрез в середине домена 2 уровня с перекрытием — рвёт само поле SNI.',
    options: [
      '--ip-id=zero',
      // Маркер в seqovl допустим только для disorder (readme.md:556-558):
      // в режиме split ядро принимает лишь абсолютное число.
      '--dpi-desync=multidisorder',
      '--dpi-desync-split-pos=midsld',
      '--dpi-desync-split-seqovl=midsld-1',
      '--dpi-desync-split-seqovl-pattern=' + FAKE_TLS_BIN,
    ],
  },
  {
    id: 'fakedsplit-badseq',
    label: 'fakedsplit (badseq)',
    hint: 'Части запроса перемешаны с фейками в прямом порядке; фейки с неверным sequence.',
    options: [
      '--ip-id=zero',
      '--dpi-desync=fakedsplit',
      '--dpi-desync-split-pos=midsld',
      '--dpi-desync-repeats=4',
      '--dpi-desync-fooling=badseq',
    ],
  },
  {
    id: 'fakeddisorder-md5sig',
    label: 'fakeddisorder (md5sig)',
    hint: 'Части запроса перемешаны с фейками в обратном порядке; фейки с опцией TCP MD5.',
    options: [
      '--ip-id=zero',
      '--dpi-desync=fakeddisorder',
      '--dpi-desync-split-pos=midsld',
      '--dpi-desync-repeats=4',
      '--dpi-desync-fooling=md5sig',
    ],
  },
  {
    id: 'hostfakesplit',
    label: 'hostfakesplit (подмена имени)',
    hint: 'Имя сайта вырезается в отдельный сегмент, рядом летит его копия с именем google.com.',
    options: [
      '--ip-id=zero',
      '--dpi-desync=hostfakesplit',
      '--dpi-desync-hostfakesplit-mod=host=www.google.com',
      '--dpi-desync-repeats=4',
      '--dpi-desync-fooling=md5sig',
    ],
  },
  {
    id: 'fake-rndsni',
    label: 'fake со случайным SNI',
    hint: 'Каждый фейк получает случайное имя сайта и номер сессии — DPI не может запомнить шаблон.',
    options: [
      '--ip-id=zero',
      '--dpi-desync=fake,multidisorder',
      '--dpi-desync-split-pos=1,midsld',
      '--dpi-desync-repeats=6',
      '--dpi-desync-fooling=md5sig',
      '--dpi-desync-fake-tls=' + FAKE_TLS_BIN,
      '--dpi-desync-fake-tls-mod=rnd,rndsni,dupsid',
    ],
  },
  {
    id: 'fake-datanoack',
    label: 'fake + multidisorder (datanoack)',
    hint: 'Фейк без флага ACK: сервер его не примет, а часть DPI не смотрит на флаги.',
    options: [
      '--ip-id=zero',
      '--dpi-desync=fake,multidisorder',
      '--dpi-desync-split-pos=1,midsld',
      '--dpi-desync-repeats=6',
      '--dpi-desync-fooling=datanoack',
      '--dpi-desync-fake-tls=' + FAKE_TLS_BIN,
    ],
  },
  {
    id: 'fake-autottl-disorder',
    label: 'fake + TTL + multidisorder',
    hint: 'Укороченный TTL у фейка, а сам запрос — в обратном порядке.',
    options: [
      '--ip-id=zero',
      '--dpi-desync=fake,multidisorder',
      '--dpi-desync-split-pos=1,midsld',
      '--dpi-desync-repeats=6',
      '--dpi-desync-autottl=2:3-12',
      '--dpi-desync-fake-tls=' + FAKE_TLS_BIN,
    ],
  },
  {
    id: 'fake-badsum',
    label: 'fake + multisplit (badsum)',
    hint: 'Фейк с испорченной контрольной суммой. Часто глушится роутером — поэтому в хвосте списка.',
    options: [
      '--ip-id=zero',
      '--dpi-desync=fake,multisplit',
      '--dpi-desync-split-pos=1,midsld',
      '--dpi-desync-repeats=6',
      '--dpi-desync-fooling=badsum',
      '--dpi-desync-fake-tls=' + FAKE_TLS_BIN,
    ],
  },
  {
    id: 'fake-ttl4',
    label: 'fake + TTL 4',
    hint: 'Фиксированный TTL фейка вместо подбора: помогает, когда автоподбор TTL ошибается.',
    options: [
      '--ip-id=zero',
      '--dpi-desync=fake,multisplit',
      '--dpi-desync-split-pos=1,midsld',
      '--dpi-desync-repeats=6',
      '--dpi-desync-ttl=4',
      '--dpi-desync-fake-tls=' + FAKE_TLS_BIN,
    ],
  },
  {
    id: 'multisplit-pos2',
    label: 'простой разрез на 2',
    hint: 'Самый простой вариант: запрос режется после второго байта, больше ничего.',
    options: [
      '--dpi-desync=multisplit',
      '--dpi-desync-split-pos=2',
    ],
  },
  // ---- 0.4.2: по образцу Flowseal (zapret-discord-youtube, MIT) ----------
  //
  // Главное, что у них есть и чего не было у нас: фейки с именами
  // РОССИЙСКИХ сайтов для профиля, через который идёт Discord. ТСПУ
  // замораживает соединения к иностранным дата-центрам после 16–20 КБ
  // ответа и делает исключения по белому списку имён (net4people/bbs#490).
  // Фейк с vk.com / gosuslugi.ru / ya.ru перед настоящим приветствием
  // заставляет DPI записать соединение в белый список. Файлы приветствий
  // берутся из поставки ядра; ya.ru, mail.ru, ozon.ru подставляются самим
  // ядром (fake-tls-mod=sni, hostfakesplit-mod=host).
  //
  // Второе — fooling=ts: ядро портит в фейке метку времени TCP, сервер его
  // отбрасывает, DPI — нет. Работает только при включённых метках времени
  // в Windows; предполётная проверка показывает их состояние.
  {
    id: 'seqovl568-ru',
    label: 'seqovl 568, начало от gosuslugi.ru',
    hint: 'Как «seqovl 568», но ложное начало — от российского сайта. Основной вариант Flowseal для сайтов.',
    options: [
      '--dpi-desync=multisplit',
      '--dpi-desync-split-pos=1',
      '--dpi-desync-split-seqovl=568',
      '--dpi-desync-split-seqovl-pattern=' + RU_TLS_BIN,
    ],
  },
  {
    id: 'ts-fake-ru',
    label: 'fake vk.com (ts)',
    hint: 'Перед запросом — поддельное приветствие vk.com с испорченной меткой времени: DPI видит российский сайт, сервер фейк отбрасывает.',
    options: [
      '--dpi-desync=fake',
      '--dpi-desync-repeats=6',
      '--dpi-desync-fooling=ts',
      '--dpi-desync-fake-tls=' + RU_TLS_KYBER_BIN,
    ],
  },
  {
    id: 'ts-seqovl664-ru',
    label: 'fake + seqovl 664, vk.com (ts)',
    hint: 'Фейк vk.com и перекрытие начала запроса тем же приветствием (Flowseal ALT11).',
    options: [
      '--dpi-desync=fake,multisplit',
      '--dpi-desync-split-seqovl=664',
      '--dpi-desync-split-pos=1',
      '--dpi-desync-fooling=ts',
      '--dpi-desync-repeats=8',
      '--dpi-desync-split-seqovl-pattern=' + RU_TLS_KYBER_BIN,
      '--dpi-desync-fake-tls=' + RU_TLS_KYBER_BIN,
    ],
  },
  {
    id: 'ts-hostfakesplit-ru',
    label: 'hostfakesplit mail.ru (ts)',
    hint: 'Имя сайта отправляется отдельно, рядом — копия с именем mail.ru, плюс фейк gosuslugi.ru (Flowseal ALT13).',
    options: [
      '--dpi-desync=fake,hostfakesplit',
      '--dpi-desync-fooling=ts',
      '--dpi-desync-hostfakesplit-mod=host=mail.ru,altorder=1',
      '--dpi-desync-repeats=5',
      '--dpi-desync-fake-tls=' + RU_TLS_BIN,
    ],
  },
  {
    id: 'ts-hostfakesplit-ozon',
    label: 'hostfakesplit ozon.ru (ts + md5sig)',
    hint: 'Имя сайта отправляется отдельно, рядом — копия с именем ozon.ru (Flowseal ALT9).',
    options: [
      '--dpi-desync=hostfakesplit',
      '--dpi-desync-repeats=4',
      '--dpi-desync-fooling=ts,md5sig',
      '--dpi-desync-hostfakesplit-mod=host=ozon.ru',
    ],
  },
  {
    id: 'ts-sni-yaru',
    label: 'fake + hostfakesplit ya.ru (ts)',
    hint: 'Фейк со случайным содержимым и именем ya.ru, имя сайта — отдельным сегментом (Flowseal ALT3).',
    options: [
      '--dpi-desync=fake,hostfakesplit',
      '--dpi-desync-fake-tls-mod=rnd,dupsid,sni=ya.ru',
      '--dpi-desync-hostfakesplit-mod=host=ya.ru,altorder=1',
      '--dpi-desync-fooling=ts',
    ],
  },
  {
    id: 'ts-fakedsplit-ru',
    label: 'fake + fakedsplit vk.com (ts)',
    hint: 'Запрос перемешан с пустыми фейками, перед ним — приветствие vk.com (Flowseal ALT).',
    options: [
      '--dpi-desync=fake,fakedsplit',
      '--dpi-desync-repeats=6',
      '--dpi-desync-fooling=ts',
      '--dpi-desync-fakedsplit-pattern=0x00',
      '--dpi-desync-fake-tls=' + RU_TLS_KYBER_BIN,
    ],
  },
  {
    id: 'ts-fake-google',
    label: 'fake google.com (ts)',
    hint: 'Простой фейк с испорченной меткой времени (Flowseal SIMPLE FAKE).',
    options: [
      '--ip-id=zero',
      '--dpi-desync=fake',
      '--dpi-desync-repeats=6',
      '--dpi-desync-fooling=ts',
      '--dpi-desync-fake-tls=' + FAKE_TLS_BIN,
    ],
  },
  {
    id: 'badseq1000',
    label: 'fake + multisplit (badseq +1000)',
    hint: 'Фейк с номером, сдвинутым на 1000 — сервер его не примет (Flowseal ALT4).',
    options: [
      '--ip-id=zero',
      '--dpi-desync=fake,multisplit',
      '--dpi-desync-repeats=6',
      '--dpi-desync-fooling=badseq',
      '--dpi-desync-badseq-increment=1000',
      '--dpi-desync-fake-tls=' + FAKE_TLS_BIN,
    ],
  },
  {
    id: 'badseq2-fake',
    label: 'fake (badseq +2)',
    hint: 'Один фейк с номером, сдвинутым на 2, без разрезания запроса (Flowseal SIMPLE FAKE ALT).',
    options: [
      '--ip-id=zero',
      '--dpi-desync=fake',
      '--dpi-desync-repeats=6',
      '--dpi-desync-fooling=badseq',
      '--dpi-desync-badseq-increment=2',
      '--dpi-desync-fake-tls=' + FAKE_TLS_BIN,
    ],
  },
  {
    id: 'fake-tls-auto',
    label: 'fake TLS auto + multidisorder',
    hint: 'Стандартный фейк ядра со случайным содержимым и именем google.com, 11 повторов (Flowseal FAKE TLS AUTO).',
    options: [
      '--ip-id=zero',
      '--dpi-desync=fake,multidisorder',
      '--dpi-desync-split-pos=1,midsld',
      '--dpi-desync-repeats=11',
      '--dpi-desync-fooling=badseq',
      '--dpi-desync-fake-tls=0x00000000',
      '--dpi-desync-fake-tls=!',
      '--dpi-desync-fake-tls-mod=rnd,dupsid,sni=www.google.com',
    ],
  },
  {
    id: 'seqovl679-sniext',
    label: 'seqovl 679, разрезы 2 и SNI',
    hint: 'Перекрытие 679 байт и разрез у начала расширения SNI (Flowseal ALT7).',
    options: [
      '--dpi-desync=multisplit',
      '--dpi-desync-split-pos=2,sniext+1',
      '--dpi-desync-split-seqovl=679',
      '--dpi-desync-split-seqovl-pattern=' + FAKE_TLS_BIN,
    ],
  },
  {
    id: 'off',
    label: 'Выключено (эталон)',
    hint: 'Профиль не применяется. Нужен, чтобы сравнить: мешает обход или блокирует провайдер.',
    options: [],
  },
];

/**
 * Порядок перебора по группам.
 *
 * Подбор берёт на полную проверку первых прошедших отсев, поэтому впереди —
 * то, что чаще побеждает. Для Discord это multidisorder (9 из 9 у тестеров
 * в Москве и Петербурге, у автора — четыре победителя 2026-10-08:
 * multidisorder, fakedsplit, hostfakesplit, datanoack) и варианты Flowseal с
 * российскими именами. Для YouTube российские имена не нужны: Google в
 * белых списках ТСПУ не значится, а SNI-блокировка снимается и без них.
 */
export const STRATEGY_ORDER: Record<StrategyGroup, YoutubeStrategyId[]> = {
  sites: [
    'multidisorder', 'seqovl568-ru', 'ts-fake-ru', 'ts-seqovl664-ru',
    'hostfakesplit', 'ts-hostfakesplit-ru', 'ts-sni-yaru', 'fakedsplit-badseq',
    'fake-datanoack', 'ts-hostfakesplit-ozon', 'ts-fakedsplit-ru', 'fake-tls-auto',
    'badseq1000', 'badseq2-fake', 'seqovl681', 'seqovl568', 'seqovl652-pos2',
    'seqovl679-sniext', 'fake-md5sig', 'fake-badseq-md5sig', 'fake-autottl-disorder',
    'multisplit-sni', 'fake-rndsni', 'fake-split-md5sig', 'fake-badseq', 'fake-autottl',
    'fakeddisorder-md5sig', 'seqovl-midsld', 'fake-badsum', 'fake-ttl4', 'multisplit-pos2',
    'off'
  ],
  youtube: [
    'multidisorder', 'seqovl681', 'ts-fake-google', 'seqovl652-pos2', 'seqovl679-sniext',
    'hostfakesplit', 'fake-tls-auto', 'badseq1000', 'badseq2-fake', 'fake-md5sig',
    'fake-badseq-md5sig', 'fake-badseq', 'fake-split-md5sig', 'fakedsplit-badseq',
    'fake-autottl', 'fake-autottl-disorder', 'multisplit-sni', 'seqovl-midsld',
    'fakeddisorder-md5sig', 'fake-rndsni', 'fake-datanoack', 'fake-badsum', 'fake-ttl4',
    'seqovl568', 'multisplit-pos2',
    'off'
  ]
};

/** Стратегии группы в порядке перебора. */
export function strategiesFor(group: StrategyGroup): YoutubeStrategy[] {
  return STRATEGY_ORDER[group].map(id => findYoutubeStrategy(id));
}

export const DEFAULT_YOUTUBE_STRATEGY: YoutubeStrategyId = 'seqovl681';

/**
 * Профиль сайтов по умолчанию оставлен таким, каким был до 0.1.5, чтобы
 * обновление никому не сломало уже работающую настройку. Кому не работает —
 * подбирает автоподбором.
 */
export const DEFAULT_SITES_STRATEGY: YoutubeStrategyId = 'seqovl568';

/**
 * Профиль обычных сайтов из списков. Через него идут discord.com,
 * gateway.discord.gg и updates.discord.com — то есть всё, что держит клиент
 * Discord на заставке, если не проходит.
 */
export function isGeneralSitesProfile(tokens: string[]): boolean {
  if (optValue(tokens, OPT_FILTER_TCP) === null) return false;
  return tokens.some(t => t.startsWith('--hostlist=') && /list-general/i.test(t));
}

export function findYoutubeStrategy(id: YoutubeStrategyId): YoutubeStrategy {
  return YOUTUBE_STRATEGIES.find(s => s.id === id)
    || YOUTUBE_STRATEGIES[0];
}

/**
 * Заменяет в профиле YouTube/Google опции десинхронизации на выбранную
 * стратегию. Фильтр портов, хостлисты и исключения остаются как в пресете.
 */
function applyStrategy(tokens: string[], id: YoutubeStrategyId): string[] {
  const strategy = findYoutubeStrategy(id);
  const base = tokens.filter(t =>
    !t.startsWith('--dpi-desync') && !t.startsWith('--ip-id=')
  );
  return [...base, ...strategy.options];
}

/** Объединяет списки портов в один нормализованный список для --wf-*. */
function mergePorts(values: string[]): string {
  const set = new Set<string>();
  for (const v of values) {
    for (const part of v.split(',')) {
      const p = part.trim();
      if (p) set.add(p);
    }
  }
  // Сортируем по возрастанию: набор портов собирается из разных профилей,
  // и без сортировки список выглядит случайным (2053,...,443,80).
  return Array.from(set)
    .sort((x, y) => parseInt(x, 10) - parseInt(y, 10))
    .join(',');
}

export const DEFAULT_TOGGLES: QuickToggleState = {
  quicDesync: true,
  discordVoice: true,
  allTrafficMode: false,
  autoTtl: false,
  // Пакетный лог ядра пишется в файл с ротацией, поэтому включён по умолчанию:
  // без него в логах не видно, как проходят соединения Discord и YouTube.
  verboseLog: true,
  youtubeStrategy: DEFAULT_YOUTUBE_STRATEGY,
  sitesStrategy: DEFAULT_SITES_STRATEGY,
};

/**
 * Возвращает готовую строку аргументов для winws.exe (без имени exe).
 *
 * @param ifIdx индекс физической сетевой карты для --wf-iface. 0 — не
 *   ограничивать (так было до 0.2.4 и так остаётся, если карту не нашли).
 */
export function buildPresetArgs(
  preset: Preset,
  toggles: QuickToggleState = DEFAULT_TOGGLES,
  ifIdx: number = 0
): string {
  const a = preset.args;

  // 1. Разбираем пресет на профили (разделитель --new).
  const flat = a.rawArgs && a.rawArgs.trim() ? tokenize(a.rawArgs) : profileFromArgs(a);

  const allProfiles: string[][] = [];
  let current: string[] = [];
  for (const t of flat) {
    if (t === '--new') {
      allProfiles.push(current);
      current = [];
    } else {
      current.push(t);
    }
  }
  allProfiles.push(current);

  // 2. Отбрасываем профили, отключённые быстрыми переключателями.
  let profiles = allProfiles.filter(p => p.length > 0);
  const ytStrategy = toggles.youtubeStrategy || DEFAULT_YOUTUBE_STRATEGY;
  const sitesStrategy = toggles.sitesStrategy || DEFAULT_SITES_STRATEGY;
  const kept = profiles.filter(p => {
    if (!toggles.quicDesync && isQuicProfile(p)) return false;
    if (!toggles.discordVoice && isDiscordProfile(p)) return false;
    // Стратегия «off» убирает профиль Google целиком: трафик YouTube пойдёт
    // без вмешательства, и станет видно, мешает обход или блокирует провайдер.
    if (ytStrategy === 'off' && isGoogleTcpProfile(p)) return false;
    if (sitesStrategy === 'off' && (isGeneralSitesProfile(p) || isDiscordMediaProfile(p))) return false;
    return true;
  });
  // Никогда не отдаём ядру пустую конфигурацию.
  if (kept.length > 0) profiles = kept;

  // 3. Модификации внутри профилей.
  profiles = profiles.map(p => {
    let tokens = p;
    if (isGoogleTcpProfile(p)) tokens = applyStrategy(p, ytStrategy);
    else if (isGeneralSitesProfile(p)) tokens = applyStrategy(p, sitesStrategy);
    // Медиасерверы Discord — та же группа, что discord.com: тот же Cloudflare,
    // тот же DPI. До 0.4.2 профиль был зашит на seqovl 681 и не подбирался —
    // у Flowseal он меняется в каждом варианте вместе с остальными.
    else if (isDiscordMediaProfile(p)) tokens = applyStrategy(p, sitesStrategy);

    if (toggles.allTrafficMode) {
      tokens = tokens.filter(t => !HOSTLIST_PREFIXES.some(pref => t.startsWith(pref)));
    }

    if (toggles.autoTtl) {
      const desync = optValue(tokens, '--dpi-desync=') || '';
      const hasTtl = tokens.some(t =>
        t.startsWith('--dpi-desync-ttl=') || t.startsWith('--dpi-desync-autottl='));
      if (desync.includes('fake') && !hasTtl) {
        tokens = [...tokens, '--dpi-desync-autottl=2:3-12'];
      }
    }

    return dedupeProfile(tokens);
  }).filter(p => p.length > 0);

  // 4. Фильтр захвата WinDivert. Без него winws не стартует вообще.
  const tcpValues: string[] = [];
  const udpValues: string[] = [];
  let wildcard = false;
  for (const p of profiles) {
    const tcp = optValue(p, OPT_FILTER_TCP);
    const udp = optValue(p, OPT_FILTER_UDP);
    if (tcp === null && udp === null) {
      wildcard = true;
      continue;
    }
    if (tcp !== null) {
      if (tcp === '*' || tcp.includes('~')) wildcard = true;
      else tcpValues.push(tcp);
    }
    if (udp !== null) {
      if (udp === '*' || udp.includes('~')) wildcard = true;
      else udpValues.push(udp);
    }
  }

  let wfTcp: string;
  let wfUdp: string;
  if (wildcard) {
    wfTcp = a.wfTcp || '80,443';
    wfUdp = a.wfUdp || '443,50000-65535';
  } else {
    wfTcp = mergePorts(tcpValues);
    wfUdp = mergePorts(udpValues);
  }

  const head: string[] = [];
  // Привязка к физической сетевой карте.
  //
  // WinDivert перехватывает пакеты на уровне IP, включая те, что идут В
  // туннельный адаптер, то есть ещё не зашифрованные. Без этого ограничения
  // ядро резало бы содержимое чужого VPN: провайдер внутри туннеля всё равно
  // ничего не видит, пользы ноль, а сломать соединение можно.
  //
  // Ограничить можно только так: --wf-raw-part складывается с фильтром по
  // ИЛИ и потому расширяет его, а не сужает (nfqws.c, wf_make_filter).
  if (ifIdx > 0) head.push(`--wf-iface=${ifIdx}`);

  if (wfTcp) head.push(`--wf-tcp=${wfTcp}`);
  if (wfUdp) head.push(`--wf-udp=${wfUdp}`);
  // Совсем без портов ядро не запустится — подстраховка.
  if (head.length === 0) head.push('--wf-tcp=80,443');

  if (toggles.verboseLog) head.push('--debug');

  const body = profiles.map(p => p.join(' ')).join(' --new ');
  return [...head, body].filter(Boolean).join(' ');
}

/** Строка для отображения пользователю (с именем исполняемого файла). */
export function buildPresetCommand(
  preset: Preset,
  toggles: QuickToggleState = DEFAULT_TOGGLES,
  ifIdx: number = 0
): string {
  return 'winws.exe ' + buildPresetArgs(preset, toggles, ifIdx);
}

export interface ProfileSummary {
  /** Понятное название того, за что отвечает профиль. */
  title: string;
  /** Порты профиля в читаемом виде, например "TCP 80,443". */
  ports: string;
  /** Флаги профиля без портов — для отображения чипами. */
  flags: string[];
}

/** Человекочитаемое название профиля по его фильтрам. */
function profileTitle(tokens: string[]): string {
  const l7 = optValue(tokens, '--filter-l7=') || '';
  const domains = optValue(tokens, '--hostlist-domains=') || '';
  const tcp = optValue(tokens, OPT_FILTER_TCP);
  const udp = optValue(tokens, OPT_FILTER_UDP);
  const hostlists = tokens.filter(t => t.startsWith('--hostlist=')).join(' ');

  if (/discord|stun/.test(l7)) return 'Голосовые серверы Discord';
  if (/discord/.test(domains)) return 'Медиасерверы Discord';
  if (udp && udp.split(',').indexOf('443') !== -1) return 'QUIC / HTTP-3 (UDP 443)';
  if (/list-google/.test(hostlists)) return 'YouTube и сервисы Google';
  if (tcp) return 'Сайты из списков доменов';
  return 'Дополнительный профиль';
}

/**
 * Разбирает итоговую команду на профили для наглядного показа в интерфейсе.
 * Используется вместо полей-заглушек: у пресета со стратегией нет отдельных
 * «одного режима» и «одной позиции разреза» — у каждого профиля они свои.
 */
export function describeProfiles(
  preset: Preset,
  toggles: QuickToggleState = DEFAULT_TOGGLES
): ProfileSummary[] {
  const args = buildPresetArgs(preset, toggles);
  const chunks = args.split(' --new ');

  return chunks.map((chunk, i) => {
    const tokens = tokenize(chunk).filter(t =>
      // Глобальные флаги показываем отдельно, в карточке профиля они лишние.
      !t.startsWith('--wf-tcp=') && !t.startsWith('--wf-udp=') && t !== '--debug'
    );

    const tcp = optValue(tokens, OPT_FILTER_TCP);
    const udp = optValue(tokens, OPT_FILTER_UDP);
    const ports = [
      tcp ? 'TCP ' + tcp : null,
      udp ? 'UDP ' + udp : null
    ].filter(Boolean).join(' · ');

    return {
      title: (i + 1) + '. ' + profileTitle(tokens),
      ports: ports || '—',
      flags: tokens.filter(t => !t.startsWith(OPT_FILTER_TCP) && !t.startsWith(OPT_FILTER_UDP))
    };
  });
}

/** Глобальные флаги команды (фильтр захвата WinDivert и режим лога). */
export function describeGlobalFlags(
  preset: Preset,
  toggles: QuickToggleState = DEFAULT_TOGGLES
): string[] {
  const first = buildPresetArgs(preset, toggles).split(' --new ')[0];
  return tokenize(first).filter(t =>
    t.startsWith('--wf-tcp=') || t.startsWith('--wf-udp=') || t === '--debug'
  );
}
