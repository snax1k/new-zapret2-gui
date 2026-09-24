export type AppStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type TabType = 'dashboard' | 'presets' | 'hostlists' | 'tgproxy' | 'diagnostics' | 'logs' | 'settings';

export type EngineMode = 'windivert' | 'nfqws' | 'tpws';

export type ThemeMode = 'dark' | 'light';

export type CloseBehavior = 'minimize_to_tray' | 'exit_app';

declare global {
  interface Window {
    chrome?: {
      webview?: {
        postMessage: (message: any) => void;
        addEventListener: (event: string, handler: (e: any) => void) => void;
        removeEventListener: (event: string, handler: (e: any) => void) => void;
      };
    };
  }
}

export interface PresetArgs {
  /** Порты захвата WinDivert (--wf-tcp). Без них winws не стартует. */
  wfTcp?: string;
  /** Порты захвата WinDivert (--wf-udp). */
  wfUdp?: string;
  /**
   * Готовая многопрофильная строка аргументов (профили разделяются --new).
   * Если задана — используется вместо структурированных полей ниже.
   */
  rawArgs?: string;
  filterTcp?: string;
  filterUdp?: string;
  filterL7?: string;
  hostlist?: string;
  desyncMode: string;
  desyncFooling?: string;
  splitPos?: string;
  splitSeqovl?: string;
  splitSeqovlPattern?: string;
  desyncCutoff?: string;
  repeats?: string;
  desyncTtl?: string;
  desyncFakeTls?: string;
  desyncFakeHttp?: string;
  desyncFakeQuic?: string;
  wssize?: string;
  anyProtocol?: boolean;
  badsum?: boolean;
  extraArgs?: string;
}

export interface Preset {
  id: string;
  name: string;
  badge?: string;
  description: string;
  tags: string[];
  recommended?: boolean;
  args: PresetArgs;
}

export interface QuickToggleState {
  /** Обрабатывать QUIC (UDP 443). */
  quicDesync: boolean;
  /** Обрабатывать голосовой трафик Discord (UDP 50000-65535, l7 discord/stun). */
  discordVoice: boolean;

  /** Игнорировать хостлисты — применять обход ко всему трафику на портах. */
  allTrafficMode: boolean;
  /** Добавлять --dpi-desync-autottl к профилям с fake. */
  autoTtl: boolean;
  /** Запускать winws с --debug (подробный лог в окно логов). */
  verboseLog: boolean;
  /**
   * Стратегия обхода для профиля YouTube/Google (TCP 443, list-google.txt).
   * Какая техника пробивает DPI, зависит от провайдера, поэтому вариант
   * выбирается пользователем. Профили Discord при этом не меняются.
   */
  youtubeStrategy: YoutubeStrategyId;
  /**
   * Стратегия профиля обычных сайтов. Через него идут discord.com,
   * gateway.discord.gg и updates.discord.com, поэтому он подбирается
   * отдельно от YouTube: у провайдеров эти два случая ведут себя по-разному.
   */
  sitesStrategy: YoutubeStrategyId;
}

/**
 * Одна найденная сборка Discord и размер её кэша.
 *
 * Размер считается только по каталогам из белого списка — тем, которые
 * программа и правда удалит. Показывать общий размер папки было бы обманом:
 * освободится меньше.
 */
export interface DiscordCacheItem {
  /** Имя каталога в %APPDATA%: discord, discordptb, discordcanary, discorddevelopment. */
  id: string;
  /** Человеческое имя: Discord, Discord PTB и так далее. */
  name: string;
  /** Сколько занимают каталоги кэша. */
  sizeBytes: number;
  /** Сколько таких каталогов нашлось. */
  dirs: number;
  /** Запущен ли сейчас — пока процесс жив, файлы заблокированы. */
  running: boolean;
}

/**
 * Куда система на самом деле отправляет трафик.
 *
 * Приходит из нативной части: она спрашивает таблицу маршрутизации, какой
 * интерфейс будет выбран до публичного адреса. Поднятый, но простаивающий
 * туннель обходу не мешает, поэтому важен именно маршрут, а не наличие
 * адаптера.
 */
export interface NetRoute {
  /** Индекс интерфейса, которым система идёт в интернет. */
  ifIdx: number;
  name: string;
  /** Выход идёт через туннель (VPN, WireGuard, SOCKS-туннель). */
  isTunnel: boolean;
  /** Физическая карта — к ней привязывается ядро. 0 — не нашли. */
  physIfIdx: number;
  physName: string;
}

/** Какой профиль настраивается: YouTube/Google или обычные сайты и Discord. */
export type StrategyGroup = 'youtube' | 'sites';

/** Идентификаторы стратегий десинхронизации. */
export type YoutubeStrategyId =
  | 'seqovl568'
  | 'seqovl681'
  | 'seqovl-midsld'
  | 'fake-md5sig'
  | 'fake-badseq'
  | 'fake-autottl'
  | 'multidisorder'
  | 'off';

/** Ключи QuickToggleState с булевым значением — только их переключает toggleQuickSetting. */
export type QuickToggleBooleanKey = {
  [K in keyof QuickToggleState]: QuickToggleState[K] extends boolean ? K : never
}[keyof QuickToggleState];

/** Строка предполётной проверки окружения. */
export interface PreflightItem {
  id: string;
  level: 'ok' | 'warn' | 'error';
  title: string;
  detail: string;
}

/** Состояние одного варианта в автоподборе стратегии. */
export interface AutotuneRow {
  id: YoutubeStrategyId;
  label: string;
  /** idle — ещё не проверялся, starting — поднимается ядро, testing — идёт проверка. */
  phase: 'idle' | 'starting' | 'testing' | 'done';
  ok: boolean;
  passed: number;
  total: number;
  ms: number;
  detail: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'packet' | 'success';
  message: string;
  source?: string;
}

export interface DiagnosticStep {
  title: string;
  detail: string;
  latencyMs?: number;
  status: 'idle' | 'testing' | 'success' | 'blocked' | 'error';
  isControlStep?: boolean;
  controlExplanation?: string;
}

export interface DiagnosticsItem {
  id: string;
  name: string;
  target: string;
  category: 'youtube' | 'discord' | 'gaming' | 'general';
  status: 'idle' | 'testing' | 'success' | 'blocked' | 'error';
  latencyMs?: number;
  ipAddress?: string;
  steps: DiagnosticStep[];
}

export interface HostlistItem {
  id: string;
  domain: string;
  category: 'youtube' | 'discord' | 'custom' | 'exclude';
  hits?: number;
  addedAt: string;
  enabled: boolean;
}

export interface UpdateInfo {
  isChecking: boolean;
  isDownloading: boolean;
  downloadProgress: number;
  downloadStep: string;
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseDate: string;
  releaseUrl: string;
  releaseTitle: string;
  highlights: string[];
  isInstalled: boolean;
  /** Прямая ссылка на .exe из ассетов релиза. Пусто — ставить нечего. */
  assetUrl: string;
  /** SHA-256 сборки, если её удалось получить. Обычно пусто: см. assetSumsUrl. */
  assetSha256: string;
  /**
   * Ссылка на SHA256SUMS.txt из ассетов релиза.
   *
   * Скачать его из веб-слоя нельзя: ассеты раздаются с хоста без заголовков
   * CORS. Поэтому сюда кладётся ссылка, а качает и сверяет нативная часть.
   * Пусто — значит файла сумм в релизе нет и установка невозможна.
   */
  assetSumsUrl: string;
  /** Текст ошибки последней попытки обновления. */
  error: string;
  /** Когда последний раз удалось спросить GitHub. ISO, пусто — ещё ни разу. */
  lastCheckedAt: string;
}

/**
 * Счётчики прокси Telegram, как их видит нативная часть.
 *
 * ws и tcp — это два разных пути до дата-центра. Веб-транспорт (ws) и есть
 * обход; прямое соединение (tcp) — резерв, который работает только если
 * провайдер дата-центры не закрыл. Если все сессии идут через tcp, обход
 * фактически не нужен; если через ws — он и делает работу.
 */
export interface TgProxyStats {
  /** Сколько соединений принято за время работы. */
  total: number;
  /** Сколько живёт прямо сейчас. */
  active: number;
  /** Отвергнуто: неверный секрет или чужой протокол. */
  bad: number;
  ws: number;
  /** Через запасной узел за Cloudflare. */
  cf: number;
  tcp: number;
  /** Не удалось довести ни одним путём. */
  failed: number;
  bytesUp: number;
  bytesDown: number;
}

/** Состояние моста, приходит из нативной части каждые две секунды. */
export interface TgProxyState {
  running: boolean;
  /** На каком адресе висит слушатель: 127.0.0.1 или 0.0.0.0. */
  host: string;
  port: number;
  /** Что писать в ссылку: при доступе из сети это адрес машины в ней. */
  linkHost: string;
  error: string;
  stats: TgProxyStats;
}

/** Настройки прокси, которые задаёт пользователь. */
export interface TgProxySettings {
  port: number;
  /** Секрет в hex, 32 символа. Он же уходит в ссылку. */
  secret: string;
  /** Слушать 0.0.0.0 вместо localhost — чтобы подключить телефон в той же сети. */
  lanAccess: boolean;
  /** Поднимать мост вместе с программой. */
  autoStart: boolean;
  /** Разрешить прямое соединение с дата-центром, если веб-транспорт не прошёл. */
  allowDirectTcp: boolean;
  /** Пробовать чужое имя в TLS, если прямое рукопожатие не прошло. */
  allowFronting: boolean;
  /** Разрешить обход через запасные узлы за Cloudflare. */
  allowCloudflare: boolean;
}
