import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import {
  AppStatus,
  TabType,
  Preset,
  PresetArgs,
  QuickToggleState,
  LogEntry,
  DiagnosticsItem,
  HostlistItem,
  EngineMode,
  ThemeMode,
  CloseBehavior,
  UpdateInfo,
  QuickToggleBooleanKey,
  YoutubeStrategyId,
  PreflightItem,
  AutotuneRow
} from '../types';
import {
  buildPresetArgs,
  buildPresetCommand,
  DEFAULT_TOGGLES,
  findYoutubeStrategy,
  YOUTUBE_STRATEGIES
} from '../lib/zapretCommand';
import { applyTheme, getBackground, shrinkImage, averageHueOfImage, nearestAccent } from '../lib/theme';

// Домены, к которым применяется обход. Хостлист-файл list-general.txt лежит
// рядом с winws.exe (рабочий каталог процесса), поэтому путь указывается
// относительный.
/** Версия ядра zapret, вшитая в сборку (bin/winws.exe). */
export const BUNDLED_CORE_VERSION = 'v72.13';

/** Версия приложения. Должна совпадать с AppVersion в NativeApp.cs. */
export const APP_VERSION = '0.1.4';

const THEME_ACCENT_KEY = 'zapret2_theme_accent_v1';
const THEME_BG_KEY = 'zapret2_theme_bg_v1';
const THEME_IMAGE_KEY = 'zapret2_theme_image_v1';
const THEME_TINT_KEY = 'zapret2_theme_tint_v1';

/** Когда в последний раз ходили на GitHub за релизом. ISO-строка. */
const UPDATE_CHECK_KEY = 'zapret2_update_checked_v1';
/** Разрешена ли автопроверка при запуске. */
const UPDATE_AUTO_KEY = 'zapret2_update_auto_v1';
/**
 * Чаще раза в шесть часов дёргать GitHub незачем: у неавторизованных
 * запросов лимит 60 в час на адрес, а релизы выходят не ежечасно.
 */
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Репозиторий, откуда берутся релизы приложения. */
export const APP_REPO = 'snax1k/new-zapret2-gui';

/**
 * Сравнивает версии вида 0.1.2 и v0.1.10.
 * Возвращает >0, если a новее b. Части сравниваются как числа, иначе
 * «0.1.10» оказалась бы старше «0.1.9».
 */
export function compareVersions(a: string, b: string): number {
  const norm = (v: string) => v.trim().replace(/^v/i, '').split(/[.\-+]/);
  const pa = norm(a), pb = norm(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = parseInt(pa[i] || '0', 10) || 0;
    const nb = parseInt(pb[i] || '0', 10) || 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

// Маркер каталога списков. Нативный хост подставляет вместо него абсолютный
// путь к host-list\ перед запуском ядра.
//
// Относительный путь "../host-list/" использовать нельзя: winws завершается на
// разборе --ipset с ошибкой "cannot access ipset file", хотя файл существует и
// сам Cygwin такие пути резолвит (проверено на mdig из той же сборки).
// Рабочие конфигурации zapret для Windows тоже передают списки абсолютным путём.
const LISTS = '{LISTS}/';
const L_GENERAL = LISTS + 'list-general.txt';
const L_USER = LISTS + 'list-user.txt';
const L_GOOGLE = LISTS + 'list-google.txt';
const L_EXCLUDE = LISTS + 'list-exclude.txt';
const L_EXCLUDE_USER = LISTS + 'list-exclude-user.txt';
const IPSET_TELEGRAM = LISTS + 'ipset-telegram.txt';

const FAKE_QUIC = 'quic_initial_www_google_com.bin';
const FAKE_TLS = 'tls_clienthello_www_google_com.bin';

const HOSTLISTS = `--hostlist=${L_GENERAL} --hostlist=${L_USER}`;
const EXCLUDES = `--hostlist-exclude=${L_EXCLUDE} --hostlist-exclude=${L_EXCLUDE_USER}`;

/**
 * Единственный пресет приложения.
 *
 * Порядок профилей важен: ядро выбирает ПЕРВЫЙ подходящий (dp_find в desync.c).
 * Профиль со списком доменов не может выиграть, пока имя хоста неизвестно
 * (dp_match: "profile cannot win if regular hostlists are present ... and
 * hostname is unknown"), поэтому профиль Telegram по подсетям стоит последним
 * и подхватывает MTProto-соединения, у которых имени хоста нет вообще.
 */
const INITIAL_PRESETS: Preset[] = [
  {
    id: 'general-v72',
    name: 'Универсальный (YouTube + Discord + Сайты)',
    badge: 'Основной',
    recommended: true,
    description: 'Рабочая конфигурация zapret v72 для Windows: QUIC, голос и медиасерверы Discord, YouTube/Google, обычные сайты и Telegram (по подсетям дата-центров).',
    tags: ['YouTube', 'Discord RTC', 'Telegram', 'multisplit+seqovl'],
    args: {
      wfTcp: '80,443,2053,2083,2087,2096,8443',
      wfUdp: '443,19294-19344,50000-65535',
      desyncMode: 'multisplit',
      rawArgs: [
        // 1. QUIC (HTTP/3) для доменов из списков.
        `--filter-udp=443 ${HOSTLISTS} --hostlist=${L_GOOGLE} ${EXCLUDES} --dpi-desync=fake --dpi-desync-repeats=6 --dpi-desync-fake-quic=${FAKE_QUIC}`,

        // 2. Голосовые серверы Discord. Диапазон 19294-19344 обязателен:
        // часть голосовых комнат выдаётся именно на этих портах, и без них
        // соединение молча остаётся без звука.
        //
        // Фейковый пейлоад НЕ задаётся намеренно: ядро подставит свой стандартный
        // (64 нулевых байта, params.c). Фильтр l7 discord/stun срабатывает только
        // на пакете Voice IP Discovery (ровно 74 байта) и на STUN-запросах, то есть
        // на установке соединения. Так как TTL у фейка не ограничен, он доходит до
        // голосового сервера — и чем он безобиднее, тем лучше. Подстановка сюда
        // QUIC-пакета на 1200 байт ломала подключение к части комнат.
        '--filter-udp=19294-19344,50000-65535 --filter-l7=discord,stun --dpi-desync=fake --dpi-desync-repeats=6',

        // 3. Медиасерверы Discord на альтернативных TCP-портах Cloudflare.
        `--filter-tcp=2053,2083,2087,2096,8443 --hostlist-domains=discord.media --dpi-desync=multisplit --dpi-desync-split-pos=1 --dpi-desync-split-seqovl=681 --dpi-desync-split-seqovl-pattern=${FAKE_TLS}`,

        // 4. YouTube / Google.
        `--filter-tcp=443 --hostlist=${L_GOOGLE} ${EXCLUDES} --ip-id=zero --dpi-desync=multisplit --dpi-desync-split-pos=1 --dpi-desync-split-seqovl=681 --dpi-desync-split-seqovl-pattern=${FAKE_TLS}`,

        // 5. Остальные сайты из списков.
        `--filter-tcp=80,443 ${HOSTLISTS} ${EXCLUDES} --dpi-desync=multisplit --dpi-desync-split-pos=1 --dpi-desync-split-seqovl=568 --dpi-desync-split-seqovl-pattern=${FAKE_TLS}`,

        // 6. Telegram. MTProto не передаёт имя хоста, поэтому отбор только по
        // подсетям и с --dpi-desync-any-protocol; cutoff ограничивает
        // вмешательство первыми пакетами, иначе рвётся загрузка медиа.
        `--filter-tcp=80,443 --ipset=${IPSET_TELEGRAM} --dpi-desync=multisplit --dpi-desync-any-protocol=1 --dpi-desync-cutoff=n3 --dpi-desync-split-pos=1 --dpi-desync-split-seqovl=568 --dpi-desync-split-seqovl-pattern=${FAKE_TLS}`
      ].join(' --new ')
    }
  }
];

// Вкладка «Хостлисты» хранит ДОПОЛНЕНИЯ пользователя. Основные списки
// (list-general.txt, list-google.txt, list-exclude.txt) поставляются со сборкой
// и применяются всегда; добавленное здесь пишется в list-user.txt и
// list-exclude-user.txt перед запуском ядра.
/** Пресеты из поставки: их нельзя удалять, и они возвращаются при сбросе. */
export const BUILTIN_PRESET_IDS = new Set(INITIAL_PRESETS.map(p => p.id));

const INITIAL_HOSTLISTS: HostlistItem[] = [];

const INITIAL_DIAGNOSTICS: DiagnosticsItem[] = [
  {
    id: 'yt-web',
    name: 'YouTube Web Portal',
    target: 'youtube.com',
    category: 'youtube',
    status: 'idle',
    steps: [
      { title: 'Определение адреса (DNS)', detail: 'Ожидание проверки', latencyMs: 0, status: 'idle' },
      { title: 'Соединение с сервером (TCP 443)', detail: 'Ожидание проверки', latencyMs: 0, status: 'idle' },
      {
        title: 'Рукопожатие TLS с посторонним именем',
        detail: 'Ожидание проверки',
        latencyMs: 0,
        status: 'idle',
        isControlStep: true,
        controlExplanation: '«Рукопожатие с посторонним именем» — контрольный шаг: если оно проходит, а с настоящим именем нет, значит рвут именно по имени сайта.'
      },
      { title: 'Рукопожатие TLS с именем youtube.com', detail: 'Ожидание проверки', latencyMs: 0, status: 'idle' }
    ]
  },
  {
    id: 'yt-video',
    name: 'GoogleVideo CDN (Видеопоток 4K)',
    target: 'rr1---sn-4g5ednss.googlevideo.com',
    category: 'youtube',
    status: 'idle',
    steps: [
      { title: 'Определение адреса (DNS)', detail: 'Ожидание проверки', latencyMs: 0, status: 'idle' },
      { title: 'Соединение с сервером (TCP 443)', detail: 'Ожидание проверки', latencyMs: 0, status: 'idle' },
      {
        title: 'Рукопожатие TLS с посторонним именем',
        detail: 'Ожидание проверки',
        latencyMs: 0,
        status: 'idle',
        isControlStep: true,
        controlExplanation: 'Контрольный шаг проверки фильтрации CDN-потоков провайдером.'
      },
      { title: 'Рукопожатие TLS с именем googlevideo.com', detail: 'Ожидание проверки', latencyMs: 0, status: 'idle' }
    ]
  },
  {
    id: 'dc-gateway',
    name: 'Discord Gateway API',
    target: 'gateway.discord.gg',
    category: 'discord',
    status: 'idle',
    steps: [
      { title: 'Определение адреса (DNS)', detail: 'Ожидание проверки', latencyMs: 0, status: 'idle' },
      { title: 'Соединение с сервером (TCP 443)', detail: 'Ожидание проверки', latencyMs: 0, status: 'idle' },
      {
        title: 'Рукопожатие TLS с посторонним именем',
        detail: 'Ожидание проверки',
        latencyMs: 0,
        status: 'idle',
        isControlStep: true,
        controlExplanation: 'Проверка блокировки Cloudflare IP пула ТСПУ.'
      },
      { title: 'Рукопожатие TLS с именем gateway.discord.gg', detail: 'Ожидание проверки', latencyMs: 0, status: 'idle' }
    ]
  },
  {
    id: 'dc-voice',
    name: 'Discord Voice (сервер RTC)',
    target: 'rotterdam.discord.media',
    category: 'discord',
    status: 'idle',
    steps: [
      { title: 'Определение адреса (DNS)', detail: 'Ожидание проверки', latencyMs: 0, status: 'idle' },
      { title: 'Соединение с сервером (TCP 443)', detail: 'Ожидание проверки', latencyMs: 0, status: 'idle' },
      {
        title: 'Рукопожатие TLS с посторонним именем',
        detail: 'Ожидание проверки',
        latencyMs: 0,
        status: 'idle',
        isControlStep: true,
        controlExplanation: 'Контрольный шаг. Если рукопожатие с посторонним именем проходит, а с настоящим нет — соединение рвут по имени сервера.'
      },
      { title: 'Рукопожатие TLS с именем discord.media', detail: 'Ожидание проверки', latencyMs: 0, status: 'idle' }
    ]
  }
];

interface AppContextType {
  status: AppStatus;
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  toggleStatus: () => void;
  theme: ThemeMode;
  toggleTheme: () => void;
  setTheme: (m: ThemeMode) => void;
  accent: string;
  setAccent: (id: string) => void;
  background: string;
  setBackground: (id: string) => void;
  /** Своя картинка фоном (data-URL) либо пустая строка. */
  customBackground: string;
  /** Ставит картинку фоном; тон интерфейса подстраивается под неё. */
  setCustomBackground: (file: File) => Promise<void>;
  clearCustomBackground: () => void;
  closeBehavior: CloseBehavior;
  setCloseBehavior: (b: CloseBehavior) => void;
  showTrayToast: boolean;
  setShowTrayToast: (show: boolean) => void;
  activePresetId: string;
  setActivePresetId: (id: string) => void;
  presets: Preset[];
  activePreset: Preset;
  createPreset: (preset: Omit<Preset, 'id'>) => void;
  deletePreset: (id: string) => void;
  exportPresets: () => void;
  importPresets: () => void;
  updatePresetArgs: (id: string, newArgs: Partial<PresetArgs>) => void;
  isCreatePresetModalOpen: boolean;
  setIsCreatePresetModalOpen: (open: boolean) => void;
  quickToggles: QuickToggleState;
  toggleQuickSetting: (key: QuickToggleBooleanKey) => void;
  setYoutubeStrategy: (id: YoutubeStrategyId) => void;

  /** Предполётная проверка окружения: что помешает обходу сработать. */
  preflight: PreflightItem[];
  runPreflight: () => void;

  /** Автоподбор стратегии YouTube. */
  autotuneRows: AutotuneRow[];
  isAutotuneRunning: boolean;
  startAutotune: () => void;
  cancelAutotune: () => void;
  /** Модалка автоподбора открывается и с главной, и из «Пресетов». */
  isAutotuneModalOpen: boolean;
  setIsAutotuneModalOpen: (open: boolean) => void;
  logs: LogEntry[];
  addLog: (level: LogEntry['level'], message: string, source?: string) => void;
  clearLogs: () => void;
  engineMode: EngineMode;
  setEngineMode: (mode: EngineMode) => void;
  hostlists: HostlistItem[];
  addHostlistDomain: (domain: string, category: HostlistItem['category']) => void;
  removeHostlistDomain: (id: string) => void;
  toggleHostlistDomain: (id: string) => void;
  exportHostlists: () => void;
  importHostlists: () => void;
  openLogsFolder: () => void;
  diagnostics: DiagnosticsItem[];
  runDiagnostics: () => void;
  isDiagnosticsRunning: boolean;
  updateInfo: UpdateInfo;
  /** silent — автопроверка при запуске: без модалки и без лишних записей в лог. */
  checkForUpdates: (silent?: boolean) => void;
  autoCheckUpdates: boolean;
  setAutoCheckUpdates: (v: boolean) => void;
  dismissUpdate: () => void;
  startAutoUpdate: () => void;
  openReleasePage: () => void;
  isUpdateModalOpen: boolean;
  setIsUpdateModalOpen: (open: boolean) => void;
  killZombieWinDivert: () => void;
  openAppFolder: () => void;
  isWatchdogClean: boolean;
  stats: {
    pid: number;
    uptimeSeconds: number;
    activeRulesCount: number;
    driverStatus: string;
    /** Сколько раз ядро вмешалось в трафик (строки «dpi desync src=»). */
    desyncCount: number;
    /** Сколько разных имён хостов ядро распознало. */
    hostCount: number;
  };
  activeCommand: string;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<AppStatus>('disconnected');
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [theme, setTheme] = useState<ThemeMode>(
    () => (localStorage.getItem('zapret2_theme_v5') as ThemeMode) || 'dark'
  );
  const [accent, setAccentState] = useState<string>(
    () => localStorage.getItem(THEME_ACCENT_KEY) || 'indigo'
  );
  const [background, setBackgroundState] = useState<string>(
    () => localStorage.getItem(THEME_BG_KEY) || 'slate'
  );
  const [customBackground, setCustomBackgroundState] = useState<string>(
    () => localStorage.getItem(THEME_IMAGE_KEY) || ''
  );
  const [customTint, setCustomTint] = useState<{ hue: number; sat: number }>(() => {
    try {
      const raw = localStorage.getItem(THEME_TINT_KEY);
      if (raw) return JSON.parse(raw);
    } catch { }
    return { hue: 217, sat: 1 };
  });
  const [closeBehavior, setCloseBehaviorState] = useState<CloseBehavior>(
    () => (localStorage.getItem('zapret2_close_v5') as CloseBehavior) || 'minimize_to_tray'
  );
  const setCloseBehavior = (b: CloseBehavior) => {
    localStorage.setItem('zapret2_close_v5', b);
    setCloseBehaviorState(b);
  };
  // По умолчанию включено, но выключить можно: запрос к GitHub при каждом
  // запуске — не то, что стоит навязывать без спроса.
  const [autoCheckUpdates, setAutoCheckUpdatesState] = useState<boolean>(
    () => localStorage.getItem(UPDATE_AUTO_KEY) !== 'off'
  );
  const setAutoCheckUpdates = (v: boolean) => {
    localStorage.setItem(UPDATE_AUTO_KEY, v ? 'on' : 'off');
    setAutoCheckUpdatesState(v);
  };
  const [showTrayToast, setShowTrayToast] = useState(false);
  const [activePresetId, setActivePresetId] = useState<string>(
    () => localStorage.getItem('zapret2_active_preset_v5') || 'general-v72'
  );

  const [presets, setPresets] = useState<Preset[]>(() => {
    const saved = localStorage.getItem('zapret2_presets_v6');
    if (saved) {
      try {
        const stored: Preset[] = JSON.parse(saved);
        // Встроенные пресеты всегда берутся из сборки: иначе исправления
        // стратегии не доходили бы до тех, у кого уже есть сохранённая копия,
        // а единственным способом их доставить был сброс всего хранилища.
        // Пользовательские пресеты при этом сохраняются.
        const builtinIds = new Set(INITIAL_PRESETS.map(p => p.id));
        const custom = stored.filter(p => !builtinIds.has(p.id));
        return [...INITIAL_PRESETS, ...custom];
      } catch { }
    }
    return INITIAL_PRESETS;
  });

  const [isCreatePresetModalOpen, setIsCreatePresetModalOpen] = useState(false);
  const [quickToggles, setQuickToggles] = useState<QuickToggleState>(() => {
    const saved = localStorage.getItem('zapret2_toggles_v5');
    if (saved) {
      try { return { ...DEFAULT_TOGGLES, ...JSON.parse(saved) }; } catch { }
    }
    return { ...DEFAULT_TOGGLES };
  });

  const [engineMode, setEngineMode] = useState<EngineMode>('windivert');
  const [hostlists, setHostlists] = useState<HostlistItem[]>(() => {
    const saved = localStorage.getItem('zapret2_hostlists_v5');
    if (saved) {
      try { return JSON.parse(saved); } catch { }
    }
    return INITIAL_HOSTLISTS;
  });
  const [diagnostics, setDiagnostics] = useState<DiagnosticsItem[]>(INITIAL_DIAGNOSTICS);
  const [isDiagnosticsRunning, setIsDiagnosticsRunning] = useState(false);
  const [isWatchdogClean, setIsWatchdogClean] = useState(true);

  // GitHub Release update info & modal with persistent state
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo>({
    isChecking: false,
    isDownloading: false,
    downloadProgress: 0,
    downloadStep: '',
    hasUpdate: false,
    currentVersion: APP_VERSION,
    latestVersion: APP_VERSION,
    releaseDate: '',
    releaseUrl: `https://github.com/${APP_REPO}/releases/latest`,
    releaseTitle: 'Zapret2 Control Center',
    highlights: [],
    isInstalled: false,
    assetUrl: '',
    assetSha256: '',
    error: '',
    lastCheckedAt: localStorage.getItem(UPDATE_CHECK_KEY) || ''
  });


  const [logs, setLogs] = useState<LogEntry[]>(() => {
    const t = new Date().toTimeString().split(' ')[0];
    return [
      { id: '1', timestamp: t, level: 'info', message: `Zapret2 Control Center v${APP_VERSION} запущен`, source: 'Core' },
      { id: '2', timestamp: t, level: 'info', message: `Ядро zapret ${BUNDLED_CORE_VERSION} (winws.exe, WinDivert 64-bit) готово`, source: 'WinWS' }
    ];
  });

  const [stats, setStats] = useState({
    pid: 0,
    uptimeSeconds: 0,
    activeRulesCount: 0,
    driverStatus: 'Выключен',
    // Сколько раз ядро реально вмешалось в трафик и сколько имён хостов
    // распознало. Ноль при работающем ядре означает, что до winws трафик
    // не доходит — это единственная метрика, которая это показывает.
    desyncCount: 0,
    hostCount: 0
  });

  const [preflight, setPreflight] = useState<PreflightItem[]>([]);
  const [autotuneRows, setAutotuneRows] = useState<AutotuneRow[]>([]);
  const [isAutotuneRunning, setIsAutotuneRunning] = useState(false);
  const [isAutotuneModalOpen, setIsAutotuneModalOpen] = useState(false);

  // Handle IPC Messages from Native C# Host
  useEffect(() => {
    if (window.chrome?.webview) {
      const handleWebMessage = (event: any) => {
        try {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;

          if (data.type === 'log') {
            setLogs(prev => [
              {
                id: Math.random().toString(36).substring(2, 9),
                timestamp: data.timestamp || new Date().toTimeString().split(' ')[0],
                level: data.level || 'info',
                message: data.message || '',
                source: data.source || 'WinWS'
              },
              ...prev.slice(0, 400)
            ]);
          } else if (data.type === 'status_change') {
            setStatus(data.status);
            setStats(prev => ({
              ...prev,
              pid: data.status === 'connected' ? (data.pid || 0) : 0,
              uptimeSeconds: data.status === 'connected' ? prev.uptimeSeconds : 0,
              driverStatus:
                data.status === 'connected' ? 'Активен (фильтрация)'
                  : data.status === 'error' ? 'Ошибка запуска'
                  : 'Остановлен'
            }));
          } else if (data.type === 'update_progress') {
            setUpdateInfo(prev => ({
              ...prev,
              isDownloading: data.percent < 100,
              downloadProgress: data.percent || 0,
              downloadStep: data.step || '',
              error: ''
            }));
          } else if (data.type === 'update_error') {
            setUpdateInfo(prev => ({
              ...prev,
              isDownloading: false,
              downloadProgress: 0,
              downloadStep: '',
              error: data.message || 'Неизвестная ошибка'
            }));
          } else if (data.type === 'activity') {
            setStats(prev => ({ ...prev, desyncCount: data.desync || 0, hostCount: data.hosts || 0 }));
          } else if (data.type === 'preflight') {
            setPreflight(Array.isArray(data.items) ? data.items : []);
          } else if (data.type === 'autotune_step') {
            setAutotuneRows(prev => prev.map((r, i) =>
              i === data.index ? { ...r, phase: data.phase } : r));
          } else if (data.type === 'autotune_result') {
            setAutotuneRows(prev => prev.map((r, i) =>
              i === data.index
                ? { ...r, phase: 'done', ok: !!data.ok, passed: data.passed || 0,
                    total: data.total || 0, ms: data.ms || 0, detail: data.detail || '' }
                : r));
          } else if (data.type === 'autotune_done') {
            setIsAutotuneRunning(false);
          } else if (data.type === 'diag_step') {
            setDiagnostics(prev => prev.map(item => {
              if (item.id === data.targetId) {
                const updatedSteps = [...item.steps];
                if (updatedSteps[data.stepIndex]) {
                  updatedSteps[data.stepIndex] = {
                    ...updatedSteps[data.stepIndex],
                    status: data.status,
                    detail: data.detail,
                    latencyMs: data.latencyMs
                  };
                }
                const allDone = updatedSteps.every(s => s.status === 'success' || s.status === 'blocked' || s.status === 'error');
                const hasBlock = updatedSteps.some(s => s.status === 'blocked' || s.status === 'error');
                return {
                  ...item,
                  status: allDone ? (hasBlock ? 'blocked' : 'success') : 'testing',
                  latencyMs: data.latencyMs,
                  // Реальный IP приходит вместе с результатом DNS-шага.
                  ipAddress: data.stepIndex === 0 && data.status === 'success' ? data.detail : item.ipAddress,
                  steps: updatedSteps
                };
              }
              return item;
            }));
          } else if (data.type === 'presets_import') {
            try {
              const bin = atob(data.b64 || '');
              const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
              const parsed = JSON.parse(new TextDecoder().decode(bytes));
              const incoming: any[] = Array.isArray(parsed) ? parsed : parsed?.presets;

              if (!Array.isArray(incoming)) throw new Error('в файле нет списка пресетов');
              const good = incoming.filter(isValidPreset);
              if (good.length === 0) throw new Error('не найдено ни одного корректного пресета');

              setPresets(prev => {
                const known = new Set(prev.map(x => x.id));
                // Конфликт идентификаторов не должен молча затирать существующий
                // пресет — импортированному выдаётся новый id.
                const added: Preset[] = good.map(x => ({
                  ...x,
                  id: (!x.id || known.has(x.id))
                    ? 'imported-' + Math.random().toString(36).substring(2, 9)
                    : x.id,
                  recommended: false
                }));
                return [...added, ...prev];
              });

              const skipped = incoming.length - good.length;
              addLog('success',
                `Импортировано пресетов: ${good.length}` + (skipped > 0 ? `, пропущено некорректных: ${skipped}` : ''),
                'Presets');
            } catch (e: any) {
              addLog('error', 'Не удалось разобрать файл пресетов: ' + (e?.message || e), 'Presets');
            }
          } else if (data.type === 'hostlist_import') {
            const incoming: string[] = Array.isArray(data.domains) ? data.domains : [];
            setHostlists(prev => {
              const known = new Set(prev.map(h => h.domain));
              const added = incoming
                .map(d => String(d).trim().toLowerCase())
                .filter(d => d && !known.has(d))
                .map(d => ({
                  id: Math.random().toString(36).substring(2, 9),
                  domain: d,
                  category: 'custom' as const,
                  addedAt: 'Импорт',
                  enabled: true
                }));
              return [...added, ...prev];
            });
          } else if (data.type === 'diagnostics_completed') {
            setIsDiagnosticsRunning(false);
          }
        } catch { }
      };

      window.chrome.webview.addEventListener('message', handleWebMessage);
      return () => {
        if (window.chrome && window.chrome.webview) {
          window.chrome.webview.removeEventListener('message', handleWebMessage);
        }
      };
    }
  }, []);

  // Save presets to localStorage
  useEffect(() => {
    localStorage.setItem('zapret2_presets_v6', JSON.stringify(presets));
  }, [presets]);

  const activePreset = presets.find(p => p.id === activePresetId) || presets[0];

  useEffect(() => {
    localStorage.setItem('zapret2_active_preset_v5', activePresetId);
  }, [activePresetId]);

  const activeCommand = buildPresetCommand(activePreset, quickToggles);

  useEffect(() => {
    // «Правила десинхронизации» = количество профилей winws в текущей команде.
    const profiles = activeCommand.split(' --new ').length;
    setStats(prev => ({ ...prev, activeRulesCount: profiles }));
  }, [activeCommand]);

  const createPreset = (newPresetData: Omit<Preset, 'id'>) => {
    const id = 'custom-' + Math.random().toString(36).substring(2, 9);
    const newPreset: Preset = {
      id,
      ...newPresetData
    };
    setPresets(prev => [newPreset, ...prev]);
    setActivePresetId(id);
    addLog('success', `Создан новый пользовательский пресет: [${newPreset.name}]`, 'Presets');
  };

  /** Проверяет, что объект из файла действительно похож на пресет. */
  const isValidPreset = (x: any): boolean =>
    !!x && typeof x === 'object' &&
    typeof x.name === 'string' && x.name.trim().length > 0 &&
    !!x.args && typeof x.args === 'object' &&
    (typeof x.args.rawArgs === 'string' || typeof x.args.desyncMode === 'string');

  const exportPresets = () => {
    const payload = JSON.stringify({ app: 'zapret2', kind: 'presets', version: 1, presets }, null, 2);
    // Кириллица в названиях не помещается в btoa напрямую, поэтому сначала UTF-8.
    const bytes = new TextEncoder().encode(payload);
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });

    addLog('info', `Экспорт пресетов: ${presets.length} шт.`, 'Presets');
    if (window.chrome?.webview) {
      window.chrome.webview.postMessage('export_presets:' + btoa(bin));
    } else {
      addLog('error', 'Экспорт доступен только внутри приложения.', 'Presets');
    }
  };

  const importPresets = () => {
    if (window.chrome?.webview) {
      window.chrome.webview.postMessage('import_presets');
    } else {
      addLog('error', 'Импорт доступен только внутри приложения.', 'Presets');
    }
  };

  const deletePreset = (id: string) => {
    setPresets(prev => prev.filter(p => p.id !== id));
    if (activePresetId === id) {
      setActivePresetId(INITIAL_PRESETS[0].id);
      addLog('info', `Активирован пресет по умолчанию: ${INITIAL_PRESETS[0].name}`, 'Presets');
    }
    addLog('warn', `Пресет удален`, 'Presets');
  };

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const setAccent = (id: string) => {
    localStorage.setItem(THEME_ACCENT_KEY, id);
    setAccentState(id);
  };

  // Смена фона тянет за собой акцент: у каждого фона есть тот, что к нему
  // подходит. Иначе «Багрянец» с индиговыми кнопками выглядит случайностью.
  const setBackground = (id: string) => {
    localStorage.setItem(THEME_BG_KEY, id);
    setBackgroundState(id);
    const def = getBackground(id);
    localStorage.setItem(THEME_ACCENT_KEY, def.accent);
    setAccentState(def.accent);
    // Пресет и картинка — взаимоисключающие: выбрали пресет, картинка уходит.
    if (customBackground) {
      localStorage.removeItem(THEME_IMAGE_KEY);
      setCustomBackgroundState('');
    }
  };

  const setCustomBackground = async (file: File) => {
    try {
      const dataUrl = await shrinkImage(file);
      const tint = await averageHueOfImage(dataUrl);
      try {
        localStorage.setItem(THEME_IMAGE_KEY, dataUrl);
        localStorage.setItem(THEME_TINT_KEY, JSON.stringify(tint));
      } catch {
        // Картинка может не влезть в localStorage — она там не одна.
        addLog('warn', 'Фон применён, но не сохранится до следующего запуска: не хватило места в хранилище.', 'Theme');
      }
      setCustomBackgroundState(dataUrl);
      setCustomTint(tint);

      // Акцент подтягиваем к тону картинки — иначе оранжевый фон с изумрудными
      // кнопками выглядит так, будто фон подставили случайно.
      const suggested = nearestAccent(tint.hue);
      localStorage.setItem(THEME_ACCENT_KEY, suggested);
      setAccentState(suggested);

      addLog('success', `Фон заменён на изображение, тон интерфейса подобран по нему (${tint.hue}°).`, 'Theme');
    } catch (e: any) {
      addLog('error', 'Не удалось поставить фон: ' + (e?.message || e), 'Theme');
    }
  };

  const clearCustomBackground = () => {
    localStorage.removeItem(THEME_IMAGE_KEY);
    localStorage.removeItem(THEME_TINT_KEY);
    setCustomBackgroundState('');
  };

  // Одно место, где тема превращается в CSS-переменные. Класс на <html> и
  // сохранённый выбор держим здесь же, иначе тема сбрасывалась при
  // перезапуске и рассинхронизировалась с разметкой.
  useEffect(() => {
    applyTheme({
      mode: theme,
      accent,
      background,
      customImage: customBackground,
      customHue: customTint.hue,
      customSat: customTint.sat
    });
    localStorage.setItem('zapret2_theme_v5', theme);
  }, [theme, accent, background, customBackground, customTint]);

  const addLog = (level: LogEntry['level'], message: string, source: string = 'Core') => {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    setLogs(prev => [
      { id: Math.random().toString(36).substring(2, 9), timestamp: timeStr, level, message, source },
      ...prev.slice(0, 400)
    ]);
  };

  const clearLogs = () => setLogs([]);

  const updatePresetArgs = (id: string, newArgs: Partial<PresetArgs>) => {
    setPresets(prev => prev.map(p => {
      if (p.id === id) {
        return {
          ...p,
          args: { ...p.args, ...newArgs }
        };
      }
      return p;
    }));
    addLog('info', `Настройки пресета обновлены`, 'Presets');
  };

  const toggleStatus = () => {
    if (status === 'connecting') return;

    if (status === 'connected') {
      setStatus('connecting');
      addLog('warn', 'Остановка winws и выгрузка WinDivert...', 'Runner');
      if (window.chrome?.webview) {
        window.chrome.webview.postMessage('stop_engine');
      } else {
        setTimeout(() => setStatus('disconnected'), 400);
      }
      return;
    }

    // disconnected / error -> запуск
    setStatus('connecting');
    const args = buildPresetArgs(activePreset, quickToggles);
    addLog('info', `Запуск ядра Zapret: [${activePreset.name}]`, 'Runner');
    addLog('info', `winws.exe ${args}`, 'Runner');

    if (window.chrome?.webview) {
      // Списки пишутся на диск до запуска: winws читает их один раз при старте.
      window.chrome.webview.postMessage('save_lists:' + serializeLists());
      window.chrome.webview.postMessage('start_engine:' + args);
    } else {
      // Запуск в обычном браузере (режим разработки) — ядро недоступно.
      setTimeout(() => {
        setStatus('error');
        addLog('error', 'Нативный хост недоступен: страница открыта вне приложения Zapret2.', 'Runner');
      }, 400);
    }
  };

  // Страховка от зависания в состоянии «Подключение»: если нативный хост
  // не ответил за 12 секунд, возвращаем интерфейс в рабочее состояние.
  useEffect(() => {
    if (status !== 'connecting') return;
    const t = setTimeout(() => {
      setStatus(prev => {
        if (prev !== 'connecting') return prev;
        addLog('error', 'Ядро не ответило за 12 секунд. Проверьте вкладку «Логи».', 'Runner');
        return 'error';
      });
    }, 12000);
    return () => clearTimeout(t);
  }, [status]);

  // Live packet counter while connected
  useEffect(() => {
    if (status !== 'connected') return;

    const timer = setInterval(() => {
      setStats(prev => ({ ...prev, uptimeSeconds: prev.uptimeSeconds + 1 }));
    }, 1000);

    return () => clearInterval(timer);
  }, [status]);

  /** Сохраняет переключатели и, если ядро запущено, перезапускает его. */
  const applyToggles = (next: QuickToggleState, message: string) => {
    localStorage.setItem('zapret2_toggles_v5', JSON.stringify(next));
    addLog('info', message, 'Settings');
    if (status === 'connected' && window.chrome?.webview) {
      addLog('info', 'Перезапуск ядра с новыми параметрами...', 'Runner');
      window.chrome.webview.postMessage('save_lists:' + serializeLists());
      window.chrome.webview.postMessage('start_engine:' + buildPresetArgs(activePreset, next));
    }
  };

  const toggleQuickSetting = (key: QuickToggleBooleanKey) => {
    setQuickToggles(prev => {
      const next = { ...prev, [key]: !prev[key] };
      applyToggles(next, `Параметр ${key}: ${next[key] ? 'ВКЛ' : 'ВЫКЛ'}`);
      return next;
    });
  };

  const runPreflight = () => {
    if (window.chrome?.webview) window.chrome.webview.postMessage('run_preflight');
  };

  // Проверка окружения выполняется один раз при запуске: её результат нужен
  // ещё до того, как пользователь нажмёт «Включить».
  useEffect(() => {
    if (window.chrome?.webview) {
      const t = setTimeout(() => window.chrome!.webview!.postMessage('run_preflight'), 800);
      return () => clearTimeout(t);
    }
  }, []);

  /**
   * Автоподбор стратегии YouTube.
   *
   * Нативная сторона поднимает ядро с каждым вариантом и делает настоящую
   * проверку TCP+TLS. Вариант «off» в переборе не участвует: он не стратегия,
   * а эталон для сравнения, и проверять его отдельно смысла нет — если он
   * пройдёт, значит обход для YouTube вообще не нужен.
   */
  const startAutotune = () => {
    if (isAutotuneRunning) return;
    if (!window.chrome?.webview) {
      addLog('error', 'Автоподбор доступен только внутри приложения.', 'Autotune');
      return;
    }

    const variants = YOUTUBE_STRATEGIES.filter(s => s.id !== 'off');
    setAutotuneRows(variants.map(s => ({
      id: s.id, label: s.label, phase: 'idle' as const,
      ok: false, passed: 0, total: 0, ms: 0, detail: ''
    })));
    setIsAutotuneRunning(true);

    // Куда вернуть ядро после перебора: если обход был включён — к текущей
    // стратегии, если выключен — оставить выключенным.
    const restore = status === 'connected'
      ? buildPresetArgs(activePreset, quickToggles)
      : '';

    const hosts = 'www.youtube.com,rr1---sn-4g5ednss.googlevideo.com';
    const body = variants
      .map(s => [s.id, s.label, buildPresetArgs(activePreset, { ...quickToggles, youtubeStrategy: s.id })].join('|'))
      .join('\x1e');

    addLog('info', `Автоподбор: ${variants.length} вариантов, цели ${hosts}`, 'Autotune');
    window.chrome.webview.postMessage('save_lists:' + serializeLists());
    window.chrome.webview.postMessage('autotune:' + [restore, hosts, body].join('\x1f'));
  };

  const cancelAutotune = () => {
    if (!isAutotuneRunning) return;
    addLog('warn', 'Отмена автоподбора...', 'Autotune');
    if (window.chrome?.webview) window.chrome.webview.postMessage('autotune_cancel');
  };

  const setYoutubeStrategy = (id: YoutubeStrategyId) => {
    setQuickToggles(prev => {
      if (prev.youtubeStrategy === id) return prev;
      const next = { ...prev, youtubeStrategy: id };
      applyToggles(next, `Стратегия YouTube: ${findYoutubeStrategy(id).label}`);
      return next;
    });
  };

  const addHostlistDomain = (domain: string, category: HostlistItem['category']) => {
    const cleanDomain = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!cleanDomain) return;
    const newItem: HostlistItem = {
      id: Math.random().toString(36).substring(2, 9),
      domain: cleanDomain,
      category,
      hits: 0,
      addedAt: 'Пользователь',
      enabled: true
    };
    setHostlists(prev => [newItem, ...prev]);
    addLog('success', `Домен ${cleanDomain} добавлен в категорию [${category}]`, 'Hostlist');
  };

  const removeHostlistDomain = (id: string) => {
    setHostlists(prev => prev.filter(item => item.id !== id));
    addLog('warn', `Домен удален из списка`, 'Hostlist');
  };

  const toggleHostlistDomain = (id: string) => {
    setHostlists(prev => prev.map(item => item.id === id ? { ...item, enabled: !item.enabled } : item));
  };

  useEffect(() => {
    localStorage.setItem('zapret2_hostlists_v5', JSON.stringify(hostlists));
  }, [hostlists]);

  /** Сериализует списки в формат, который понимает нативный хост. */
  const serializeLists = () => {
    const include = hostlists
      .filter(h => h.enabled && h.category !== 'exclude')
      .map(h => h.domain);
    const exclude = hostlists
      .filter(h => h.enabled && h.category === 'exclude')
      .map(h => h.domain);
    return include.join('\n') + '#EXCLUDE#' + exclude.join('\n');
  };

  // Живая перезагрузка списков.
  //
  // Ядро zapret перечитывает хостлисты само, по времени изменения файла
  // (LoadHostList в hostlist.c). Раньше приложение писало list-user.txt
  // только перед запуском ядра, и в интерфейсе честно висело «изменения
  // вступят в силу при следующем включении» — ограничение было наше, не ядра.
  // Теперь файл переписывается при каждом изменении списка, и ядро
  // подхватывает правки на лету, без перезапуска.
  const listsWritten = useRef(false);
  useEffect(() => {
    // Первый проход пропускаем: при старте ядра списки пишутся и так,
    // а на монтировании писать нечего.
    if (!listsWritten.current) {
      listsWritten.current = true;
      return;
    }
    if (status !== 'connected' || !window.chrome?.webview) return;

    const t = setTimeout(() => {
      window.chrome!.webview!.postMessage('save_lists:' + serializeLists());
      addLog('info', 'Списки записаны, ядро перечитает их само.', 'Hostlist');
    }, 400);
    return () => clearTimeout(t);
  }, [hostlists, status]);

  const exportHostlists = () => {
    const body = hostlists.map(h => (h.category === 'exclude' ? '# исключение: ' : '') + h.domain).join('\n');
    if (!body) {
      addLog('warn', 'Список пуст — экспортировать нечего.', 'Hostlist');
      return;
    }
    if (window.chrome?.webview) {
      window.chrome.webview.postMessage('export_hostlist:' + body);
    } else {
      addLog('error', 'Экспорт доступен только внутри приложения.', 'Hostlist');
    }
  };

  const importHostlists = () => {
    if (window.chrome?.webview) {
      window.chrome.webview.postMessage('import_hostlist');
    } else {
      addLog('error', 'Импорт доступен только внутри приложения.', 'Hostlist');
    }
  };

  const openLogsFolder = () => {
    if (window.chrome?.webview) {
      window.chrome.webview.postMessage('open_logs_folder');
    }
  };

  const runDiagnostics = () => {
    setIsDiagnosticsRunning(true);
    addLog('info', 'Запуск реальной сетевой диагностики через активный драйвер WinDivert...', 'Diagnostics');

    setDiagnostics(prev => prev.map(d => ({
      ...d,
      status: 'testing',
      steps: d.steps.map(s => ({ ...s, status: 'testing', detail: 'Проверка сокета...' }))
    })));

    if (window.chrome?.webview) {
      window.chrome.webview.postMessage('run_diagnostics');
    } else {
      // Browser fallback
      setTimeout(() => setIsDiagnosticsRunning(false), 3000);
    }
  };

  /**
   * Проверка обновлений самого приложения.
   *
   * Сравниваются AppVersion сборки и tag_name последнего релиза в репозитории
   * пользователя. Заодно, отдельной строкой в лог, проверяется версия ядра
   * bol-van/zapret — но обновлять ядро приложение не умеет: winws.exe и
   * WinDivert вшиты в exe ресурсами и приезжают только с новой сборкой.
   *
   * Из ассетов релиза берутся два файла: сборка *-portable.exe и
   * SHA256SUMS.txt. Без контрольной суммы установка не выполняется — иначе
   * мы запускали бы непроверенный exe с правами администратора.
   */
  const checkForUpdates = async (silent: boolean = false) => {
    setUpdateInfo(prev => ({ ...prev, isChecking: true, error: '' }));
    if (!silent) addLog('info', `Запрос последнего релиза ${APP_REPO} на GitHub...`, 'UpdateChecker');

    try {
      const resp = await fetch(`https://api.github.com/repos/${APP_REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json' }
      });

      if (resp.status === 404) {
        setUpdateInfo(prev => ({ ...prev, isChecking: false, hasUpdate: false, isInstalled: true }));
        if (!silent) addLog('info', 'В репозитории пока нет ни одного релиза.', 'UpdateChecker');
        return;
      }
      if (!resp.ok) throw new Error('HTTP ' + resp.status);

      const data = await resp.json();
      // Время удачного ответа: по нему считается, пора ли спрашивать снова.
      const checkedAt = new Date().toISOString();
      localStorage.setItem(UPDATE_CHECK_KEY, checkedAt);
      const latest: string = String(data.tag_name || '').replace(/^v/i, '');
      const hasUpdate = !!latest && compareVersions(latest, APP_VERSION) > 0;

      const assets: any[] = Array.isArray(data.assets) ? data.assets : [];
      const exe = assets.find(a => /-portable\.exe$/i.test(a.name || ''));
      const sums = assets.find(a => /^SHA256SUMS\.txt$/i.test(a.name || ''));

      // Контрольную сумму тянем сразу: если её нет, кнопку установки
      // показывать нельзя, и пользователь должен узнать об этом заранее.
      let sha = '';
      if (hasUpdate && exe && sums) {
        try {
          const t = await (await fetch(sums.browser_download_url)).text();
          const line = t.split(/\r?\n/).find(l => l.toLowerCase().includes(String(exe.name).toLowerCase()));
          const m = line && line.match(/\b([a-f0-9]{64})\b/i);
          if (m) sha = m[1].toLowerCase();
        } catch { /* сумма не обязательна для показа, но обязательна для установки */ }
      }

      setUpdateInfo(prev => ({
        ...prev,
        isChecking: false,
        hasUpdate,
        isInstalled: !hasUpdate,
        currentVersion: APP_VERSION,
        latestVersion: latest || APP_VERSION,
        releaseDate: (data.published_at || '').slice(0, 10),
        releaseUrl: data.html_url || prev.releaseUrl,
        releaseTitle: data.name || `Zapret2 Control Center v${latest}`,
        assetUrl: exe ? exe.browser_download_url : '',
        assetSha256: sha,
        error: '',
        lastCheckedAt: checkedAt,
        highlights: String(data.body || '')
          .split(/\r?\n/)
          .map((l: string) => l.replace(/^[-*+#\s]+/, '').trim())
          .filter(Boolean)
          .slice(0, 5)
      }));

      if (hasUpdate) {
        addLog('warn', `Доступна версия ${latest}, установлена ${APP_VERSION}.`, 'UpdateChecker');
        if (!exe) addLog('warn', 'В релизе нет файла *-portable.exe — установить нечего.', 'UpdateChecker');
        else if (!sha) addLog('warn', 'В релизе нет SHA256SUMS.txt — установка недоступна, только ручная загрузка.', 'UpdateChecker');
        // При автопроверке окно не открываем: человек запустил программу
        // ради обхода, а не ради диалога. Плашка в боковом меню уже видна.
        if (!silent) setIsUpdateModalOpen(true);
      } else if (!silent) {
        addLog('success', `Установлена актуальная версия ${APP_VERSION}.`, 'UpdateChecker');
      }
    } catch (e: any) {
      setUpdateInfo(prev => ({ ...prev, isChecking: false }));
      // Нет сети при запуске — обычное дело, пугать красной строкой не за что.
      addLog(
        silent ? 'info' : 'error',
        (silent ? 'Автопроверка обновлений не удалась: ' : 'Не удалось проверить обновления: ') + (e?.message || e),
        'UpdateChecker'
      );
    }

    // Версия ядра — отдельная справка. Обновить его отсюда нельзя.
    // При автопроверке пропускаем: это второй запрос к GitHub на каждый
    // запуск ради строчки, которую никто не просил.
    if (silent) return;
    try {
      const r = await fetch('https://api.github.com/repos/bol-van/zapret/releases/latest', {
        headers: { Accept: 'application/vnd.github+json' }
      });
      if (r.ok) {
        const d = await r.json();
        const core = d.tag_name || BUNDLED_CORE_VERSION;
        addLog(
          core === BUNDLED_CORE_VERSION ? 'info' : 'warn',
          core === BUNDLED_CORE_VERSION
            ? `Ядро в сборке актуально: ${BUNDLED_CORE_VERSION}`
            : `У ядра вышла версия ${core}, в сборке ${BUNDLED_CORE_VERSION} — приедет со следующей сборкой приложения.`,
          'UpdateChecker'
        );
      }
    } catch { /* справочная информация, молчим */ }
  };

  const dismissUpdate = () => {
    setUpdateInfo(prev => ({ ...prev, hasUpdate: false }));
  };

  /**
   * Автопроверка при запуске. Один раз за сеанс, с задержкой, не чаще
   * чем раз в шесть часов.
   *
   * Задержка нужна не для красоты: сразу после старта приложение
   * распаковывает ресурсы и поднимает ядро, и лезть в сеть в этот момент
   * значит соревноваться с ним за внимание. Найденное обновление молча
   * зажигает плашку в боковом меню — окно не открывается.
   */
  useEffect(() => {
    if (!autoCheckUpdates) return;

    const last = localStorage.getItem(UPDATE_CHECK_KEY);
    if (last) {
      const age = Date.now() - new Date(last).getTime();
      // NaN даёт false и проверку не блокирует — это верное поведение
      // при испорченном значении в хранилище.
      if (age < UPDATE_CHECK_INTERVAL_MS) return;
    }

    const t = setTimeout(() => { checkForUpdates(true); }, 8000);
    return () => clearTimeout(t);
    // Намеренно только при монтировании: это проверка «при запуске»,
    // а не при каждом изменении настройки.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Скачивает новую сборку и заменяет ею текущий exe.
   *
   * Установка выполняется только при наличии контрольной суммы: без неё мы
   * запускали бы непроверенный файл с правами администратора. Нативная
   * сторона сверяет SHA-256 сама и отказывается ставить при расхождении.
   */
  const startAutoUpdate = () => {
    if (!window.chrome?.webview) {
      addLog('error', 'Установка доступна только внутри приложения.', 'Updater');
      return;
    }
    if (!updateInfo.assetUrl || !updateInfo.assetSha256) {
      addLog('warn', 'Нет проверенной сборки — открываю страницу релиза.', 'Updater');
      openReleasePage();
      return;
    }

    addLog('info', `Загрузка версии ${updateInfo.latestVersion}...`, 'Updater');
    setUpdateInfo(prev => ({ ...prev, isDownloading: true, downloadProgress: 0, downloadStep: 'Подготовка...', error: '' }));
    window.chrome.webview.postMessage(
      'download_update:' + [updateInfo.assetUrl, updateInfo.assetSha256, updateInfo.latestVersion].join('|')
    );
  };

  /** Запасной путь: показать релиз в браузере и скачать вручную. */
  const openReleasePage = () => {
    const url = updateInfo.releaseUrl || `https://github.com/${APP_REPO}/releases/latest`;
    addLog('info', 'Открываю страницу релиза: ' + url, 'Updater');
    if (window.chrome?.webview) {
      window.chrome.webview.postMessage('open_url:' + url);
    } else {
      window.open(url, '_blank');
    }
  };

  const killZombieWinDivert = () => {
    addLog('warn', 'Watchdog: Поиск и принудительное завершение зависших процессов winws.exe...', 'Watchdog');
    setIsWatchdogClean(false);
    if (window.chrome?.webview) {
      window.chrome.webview.postMessage('stop_engine');
    }
    setTimeout(() => {
      setIsWatchdogClean(true);
      addLog('success', 'Watchdog: Все зависшие процессы очищены (taskkill /F /IM winws.exe выполнено)', 'Watchdog');
    }, 800);
  };

  const openAppFolder = () => {
    if (window.chrome?.webview) {
      window.chrome.webview.postMessage('open_app_folder');
    }
  };

  return (
    <AppContext.Provider
      value={{
        status,
        activeTab,
        setActiveTab,
        toggleStatus,
        theme,
        toggleTheme,
        setTheme,
        accent,
        setAccent,
        background,
        setBackground,
        customBackground,
        setCustomBackground,
        clearCustomBackground,
        closeBehavior,
        setCloseBehavior,
        showTrayToast,
        setShowTrayToast,
        activePresetId,
        setActivePresetId,
        presets,
        activePreset,
        createPreset,
        deletePreset,
        exportPresets,
        importPresets,
        updatePresetArgs,
        isCreatePresetModalOpen,
        setIsCreatePresetModalOpen,
        quickToggles,
        toggleQuickSetting,
        setYoutubeStrategy,
        preflight,
        runPreflight,
        autotuneRows,
        isAutotuneRunning,
        startAutotune,
        cancelAutotune,
        isAutotuneModalOpen,
        setIsAutotuneModalOpen,
        logs,
        addLog,
        clearLogs,
        engineMode,
        setEngineMode,
        hostlists,
        addHostlistDomain,
        removeHostlistDomain,
        toggleHostlistDomain,
        exportHostlists,
        importHostlists,
        openLogsFolder,
        diagnostics,
        runDiagnostics,
        isDiagnosticsRunning,
        updateInfo,
        checkForUpdates,
        autoCheckUpdates,
        setAutoCheckUpdates,
        dismissUpdate,
        startAutoUpdate,
        openReleasePage,
        isUpdateModalOpen,
        setIsUpdateModalOpen,
        killZombieWinDivert,
        openAppFolder,
        isWatchdogClean,
        stats,
        activeCommand
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
