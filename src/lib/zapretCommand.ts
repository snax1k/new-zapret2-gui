import { Preset, PresetArgs, QuickToggleState, YoutubeStrategyId } from '../types';

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

/** Профиль Telegram: отбор по подсетям, потому что у MTProto нет имени хоста. */
function isTelegramProfile(tokens: string[]): boolean {
  return tokens.some(t => t.startsWith('--ipset=') && /telegram/i.test(t));
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

/**
 * Варианты обхода для YouTube/Google.
 *
 * Какой из них сработает — зависит от конкретного ТСПУ провайдера, определить
 * это заранее нельзя. Все варианты собраны из техник, документированных в
 * docs/readme.md ядра zapret v72.13, и используют только те режимы, маркеры
 * позиций и виды fooling, которые ядро действительно принимает
 * (desync.c:203-209, nfqws.c:1273-1285, protocol.c:74-80).
 */
export const YOUTUBE_STRATEGIES: YoutubeStrategy[] = [
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
    id: 'off',
    label: 'Выключено (эталон)',
    hint: 'Профиль не применяется. Нужен, чтобы сравнить: мешает обход или блокирует провайдер.',
    options: [],
  },
];

export const DEFAULT_YOUTUBE_STRATEGY: YoutubeStrategyId = 'seqovl681';

export function findYoutubeStrategy(id: YoutubeStrategyId): YoutubeStrategy {
  return YOUTUBE_STRATEGIES.find(s => s.id === id)
    || YOUTUBE_STRATEGIES[0];
}

/**
 * Заменяет в профиле YouTube/Google опции десинхронизации на выбранную
 * стратегию. Фильтр портов, хостлисты и исключения остаются как в пресете.
 */
function applyYoutubeStrategy(tokens: string[], id: YoutubeStrategyId): string[] {
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
  telegramFix: true,
  allTrafficMode: false,
  autoTtl: false,
  // Пакетный лог ядра пишется в файл с ротацией, поэтому включён по умолчанию:
  // без него в логах не видно, как проходят соединения Discord/YouTube/Telegram.
  verboseLog: true,
  youtubeStrategy: DEFAULT_YOUTUBE_STRATEGY,
};

/**
 * Возвращает готовую строку аргументов для winws.exe (без имени exe).
 */
export function buildPresetArgs(preset: Preset, toggles: QuickToggleState = DEFAULT_TOGGLES): string {
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
  const kept = profiles.filter(p => {
    if (!toggles.quicDesync && isQuicProfile(p)) return false;
    if (!toggles.discordVoice && isDiscordProfile(p)) return false;
    if (!toggles.telegramFix && isTelegramProfile(p)) return false;
    // Стратегия «off» убирает профиль Google целиком: трафик YouTube пойдёт
    // без вмешательства, и станет видно, мешает обход или блокирует провайдер.
    if (ytStrategy === 'off' && isGoogleTcpProfile(p)) return false;
    return true;
  });
  // Никогда не отдаём ядру пустую конфигурацию.
  if (kept.length > 0) profiles = kept;

  // 3. Модификации внутри профилей.
  profiles = profiles.map(p => {
    let tokens = isGoogleTcpProfile(p) ? applyYoutubeStrategy(p, ytStrategy) : p;

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
  if (wfTcp) head.push(`--wf-tcp=${wfTcp}`);
  if (wfUdp) head.push(`--wf-udp=${wfUdp}`);
  // Совсем без портов ядро не запустится — подстраховка.
  if (head.length === 0) head.push('--wf-tcp=80,443');

  if (toggles.verboseLog) head.push('--debug');

  const body = profiles.map(p => p.join(' ')).join(' --new ');
  return [...head, body].filter(Boolean).join(' ');
}

/** Строка для отображения пользователю (с именем исполняемого файла). */
export function buildPresetCommand(preset: Preset, toggles: QuickToggleState = DEFAULT_TOGGLES): string {
  return 'winws.exe ' + buildPresetArgs(preset, toggles);
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
  if (isTelegramProfile(tokens)) return 'Telegram (отбор по подсетям)';
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
