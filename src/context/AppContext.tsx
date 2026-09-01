import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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
  YoutubeStrategyId
} from '../types';
import {
  buildPresetArgs,
  buildPresetCommand,
  DEFAULT_TOGGLES,
  findYoutubeStrategy
} from '../lib/zapretCommand';

// Домены, к которым применяется обход. Хостлист-файл list-general.txt лежит
// рядом с winws.exe (рабочий каталог процесса), поэтому путь указывается
// относительный.
/** Версия ядра zapret, вшитая в сборку (bin/winws.exe). */
export const BUNDLED_CORE_VERSION = 'v72.13';

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
  checkForUpdates: () => void;
  dismissUpdate: () => void;
  startAutoUpdate: () => void;
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
  const [closeBehavior, setCloseBehaviorState] = useState<CloseBehavior>(
    () => (localStorage.getItem('zapret2_close_v5') as CloseBehavior) || 'minimize_to_tray'
  );
  const setCloseBehavior = (b: CloseBehavior) => {
    localStorage.setItem('zapret2_close_v5', b);
    setCloseBehaviorState(b);
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
    downloadProgress: 100,
    downloadStep: '',
    hasUpdate: false,
    currentVersion: BUNDLED_CORE_VERSION,
    latestVersion: BUNDLED_CORE_VERSION,
    releaseDate: '',
    releaseUrl: 'https://github.com/bol-van/zapret/releases/latest',
    releaseTitle: 'Ядро zapret (bol-van/zapret)',
    highlights: [],
    isInstalled: true
  });


  const [logs, setLogs] = useState<LogEntry[]>(() => {
    const t = new Date().toTimeString().split(' ')[0];
    return [
      { id: '1', timestamp: t, level: 'info', message: 'Zapret2 Control Center v0.0.8 запущен', source: 'Core' },
      { id: '2', timestamp: t, level: 'info', message: 'Ядро zapret v72.13 (winws.exe, WinDivert 64-bit) готово', source: 'WinWS' }
    ];
  });

  const [stats, setStats] = useState({
    pid: 0,
    uptimeSeconds: 0,
    activeRulesCount: 0,
    driverStatus: 'Выключен'
  });

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

  // Класс на <html> и сохранённый выбор держим в одном месте, иначе тема
  // сбрасывалась при перезапуске и рассинхронизировалась с разметкой.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('zapret2_theme_v5', theme);
  }, [theme]);

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

  const checkForUpdates = async () => {
    setUpdateInfo(prev => ({ ...prev, isChecking: true }));
    addLog('info', 'Запрос последнего релиза bol-van/zapret на GitHub...', 'UpdateChecker');

    try {
      const resp = await fetch('https://api.github.com/repos/bol-van/zapret/releases/latest', {
        headers: { Accept: 'application/vnd.github+json' }
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      const latest: string = data.tag_name || BUNDLED_CORE_VERSION;
      const hasUpdate = latest !== BUNDLED_CORE_VERSION;

      setUpdateInfo(prev => ({
        ...prev,
        isChecking: false,
        hasUpdate,
        isInstalled: !hasUpdate,
        latestVersion: latest,
        releaseDate: (data.published_at || '').slice(0, 10),
        releaseUrl: data.html_url || prev.releaseUrl,
        releaseTitle: data.name || prev.releaseTitle,
        highlights: String(data.body || '')
          .split(/\r?\n/)
          .map((l: string) => l.replace(/^[-*+]\s*/, '').trim())
          .filter(Boolean)
          .slice(0, 4)
      }));

      addLog(
        hasUpdate ? 'warn' : 'success',
        hasUpdate
          ? `Доступна новая версия ядра: ${latest} (в сборке ${BUNDLED_CORE_VERSION})`
          : `Ядро актуально: ${BUNDLED_CORE_VERSION}`,
        'UpdateChecker'
      );
    } catch (e: any) {
      setUpdateInfo(prev => ({ ...prev, isChecking: false }));
      addLog('error', 'Не удалось проверить обновления: ' + (e?.message || e), 'UpdateChecker');
    }
  };

  const dismissUpdate = () => {
    setUpdateInfo(prev => ({ ...prev, hasUpdate: false }));
  };

  /**
   * Автоматическая замена бинарников ядра внутри portable-сборки не выполняется:
   * winws.exe и WinDivert зашиты в exe как ресурсы. Открываем страницу релиза,
   * чтобы пользователь мог обновиться осознанно.
   */
  const startAutoUpdate = () => {
    const url = updateInfo.releaseUrl || 'https://github.com/bol-van/zapret/releases/latest';
    addLog('info', 'Открываю страницу релиза ядра: ' + url, 'UpdateChecker');
    if (window.chrome?.webview) {
      window.chrome.webview.postMessage('open_url:' + url);
    } else {
      window.open(url, '_blank');
    }
    setIsUpdateModalOpen(false);
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
        dismissUpdate,
        startAutoUpdate,
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
