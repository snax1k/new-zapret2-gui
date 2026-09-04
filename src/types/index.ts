export type AppStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type TabType = 'dashboard' | 'presets' | 'hostlists' | 'diagnostics' | 'logs' | 'settings';

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
  /** Обрабатывать Telegram (профиль по подсетям DC, MTProto без имени хоста). */
  telegramFix: boolean;
  /** Игнорировать хостлисты — применять обход ко всему трафику на портах. */
  allTrafficMode: boolean;
  /** Добавлять --dpi-desync-autottl к профилям с fake. */
  autoTtl: boolean;
  /** Запускать winws с --debug (подробный лог в окно логов). */
  verboseLog: boolean;
  /**
   * Стратегия обхода для профиля YouTube/Google (TCP 443, list-google.txt).
   * Какая техника пробивает DPI, зависит от провайдера, поэтому вариант
   * выбирается пользователем. Профили Discord и Telegram при этом не меняются.
   */
  youtubeStrategy: YoutubeStrategyId;
}

/** Идентификаторы стратегий профиля YouTube/Google. */
export type YoutubeStrategyId =
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
  /** SHA-256 сборки из SHA256SUMS.txt. Без неё установка не выполняется. */
  assetSha256: string;
  /** Текст ошибки последней попытки обновления. */
  error: string;
}
