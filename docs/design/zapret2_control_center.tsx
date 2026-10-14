import React, { useState } from 'react';
import {
  Power,
  Shield,
  ShieldCheck,
  Sparkles,
  Send,
  Globe,
  Activity,
  Terminal,
  Settings,
  Check,
  AlertTriangle,
  XCircle,
  Clock,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Play,
  Square,
  Plus,
  Trash2,
  Download,
  Upload,
  Search,
  Pause,
  FolderOpen,
  Sliders,
  Minimize2,
  X,
  Info,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Cpu,
  Zap,
  Layers,
  Palette,
  Eye
} from 'lucide-react';

const THEMES = {
  black: {
    id: 'black',
    name: 'Чёрная (OLED)',
    bg: '#000000',
    surface1: '#0B0B0D',
    surface2: '#121214',
    surface3: '#1A1A1D',
    border: 'rgba(255, 255, 255, 0.07)',
    borderStrong: 'rgba(255, 255, 255, 0.13)',
    textPrimary: '#EDEDEF',
    textSecondary: '#A1A1AA',
    textMuted: '#6B6B76',
  },
  dark: {
    id: 'dark',
    name: 'Тёмная (Графит)',
    bg: '#0E0F12',
    surface1: '#15161A',
    surface2: '#1C1D22',
    surface3: '#24252B',
    border: 'rgba(255, 255, 255, 0.08)',
    borderStrong: 'rgba(255, 255, 255, 0.15)',
    textPrimary: '#EDEDEF',
    textSecondary: '#A1A1AA',
    textMuted: '#6B6B76',
  }
};

const ACCENTS = {
  violet: { id: 'violet', name: 'Фиолетово-синий', hex: '#7C6CFF', soft: 'rgba(124, 108, 255, 0.15)', border: 'rgba(124, 108, 255, 0.42)' },
  blue: { id: 'blue', name: 'Синий', hex: '#3B82F6', soft: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.42)' },
  teal: { id: 'teal', name: 'Бирюзовый', hex: '#06B6D4', soft: 'rgba(6, 182, 212, 0.15)', border: 'rgba(6, 182, 212, 0.42)' },
  red: { id: 'red', name: 'Красный', hex: '#F43F5E', soft: 'rgba(244, 63, 94, 0.15)', border: 'rgba(244, 63, 94, 0.42)' },
};

const STATUS = {
  success: { hex: '#22C55E', bg: 'rgba(34, 197, 94, 0.12)', border: 'rgba(34, 197, 94, 0.28)' },
  warning: { hex: '#F59E0B', bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.28)' },
  danger: { hex: '#EF4444', bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.28)' },
  neutral: { hex: '#6B6B76', bg: 'rgba(107, 107, 118, 0.12)', border: 'rgba(107, 107, 118, 0.25)' },
};

const DISCOVERY_ROWS = [
  { id: 1, name: 'multidisorder без фейков', state: 'success', detail: 'Работает · 15 из 15 · браузер: открылось за 1,9 с' },
  { id: 2, name: 'fake vk.com (ts)', state: 'fast_pass', detail: 'Прошёл быстрый отсев — ждёт полной проверки' },
  { id: 3, name: 'seqovl 568, начало от gosuslugi.ru', state: 'browser', detail: 'Открываю страницу в браузере…' },
  { id: 4, name: 'hostfakesplit (подмена имени)', state: 'testing', detail: 'Проверка соединения…' },
  { id: 5, name: 'fakedsplit + disorder (autottl)', state: 'starting', detail: 'Поднимается ядро…' },
  { id: 6, name: 'multisplit 288 (sni +1)', state: 'fail', detail: 'Не прошёл · discord.com: 0 из 1' },
  { id: 7, name: 'fake google.com (md5sig)', state: 'freeze', detail: 'Страница начала грузиться, но не догрузилась за 12 с — похоже на заморозку соединения' },
  { id: 8, name: 'syndata + multidisorder (pos 2)', state: 'skipped', detail: 'Не понадобился: рабочий способ нашёлся раньше' },
  { id: 9, name: 'disorder2 (split-pos 1, sni)', state: 'queued', detail: 'В очереди' },
  { id: 10, name: 'fake max.ru (quic + tls)', state: 'queued', detail: 'В очереди' },
];

const DISCORD_CHIPS = [
  { id: 'd1', name: 'multidisorder без фейков', status: 'pass', desc: 'Запрос отправляется частями в обратном порядке: фильтр не успевает собрать имя сайта, а сервер собирает всё правильно.' },
  { id: 'd2', name: 'seqovl 568, начало от gosuslugi.ru', status: 'pass', desc: 'Начало пакета маскируется под обращение к разрешённому российскому сайту, а настоящий адрес идёт следом с перекрытием.' },
  { id: 'd3', name: 'fake vk.com (ts)', status: 'pass', desc: 'Перед настоящим запросом отправляется ложный пакет к vk.com с меткой времени TCP, который сбивает фильтр с толку.' },
  { id: 'd4', name: 'hostfakesplit (подмена имени)', status: 'fail', desc: 'Имя домена разрезается пополам и окружается ложными частями заголовка.' },
  { id: 'd5', name: 'fakedsplit + autottl', status: 'untested', desc: 'Автоматически вычисляет расстояние до фильтра провайдера, чтобы ложный пакет не дошёл до целевого сервера.' },
  { id: 'd6', name: 'multisplit pos 1, sni', status: 'pass', desc: 'Разбивает установку защищённого соединения на несколько фрагментов прямо на имени сайта.' },
  { id: 'd7', name: 'disorder2 без меток', status: 'fail', desc: 'Упрощённая отправка частей в обратном порядке для систем с выключенными метками времени TCP.' },
  { id: 'd8', name: 'syndata + fake ya.ru', status: 'untested', desc: 'Вкладывает начальные данные в первый пакет установки связи вместе с приманкой ya.ru.' },
];

const YOUTUBE_CHIPS = [
  { id: 'y1', name: 'multidisorder без фейков', status: 'pass', desc: 'Разрезает запрос к серверам googlevideo на части и меняет порядок их следования без потери скорости.' },
  { id: 'y2', name: 'fake google.com (ts)', status: 'pass', desc: 'Отправляет приманку с доменом google.com перед началом буферизации видеоролика.' },
  { id: 'y3', name: 'seqovl 612 + sni split', status: 'pass', desc: 'Перекрытие последовательностей TCP специально для потоковых серверов YouTube.' },
  { id: 'y4', name: 'hostfakesplit youtube', status: 'fail', desc: 'Подмена имени сервера googlevideo.com в заголовке TLS.' },
  { id: 'y5', name: 'fakeddisorder (autottl 2)', status: 'untested', desc: 'Автоматический подбор жизни пакета с отправкой частей в обратном порядке.' },
  { id: 'y6', name: 'multisplit 3 части', status: 'pass', desc: 'Делит обращение к видеопотоку на три отдельных пакета.' },
];

const INITIAL_SITES = [
  { id: 1, domain: 'discord.com', type: 'bypass', added: 'Встроенный список', enabled: true, custom: false },
  { id: 2, domain: 'gateway.discord.gg', type: 'bypass', added: 'Встроенный список', enabled: true, custom: false },
  { id: 3, domain: 'googlevideo.com', type: 'bypass', added: 'Встроенный список', enabled: true, custom: false },
  { id: 4, domain: 'youtube.com', type: 'bypass', added: 'Встроенный список', enabled: true, custom: false },
  { id: 5, domain: 'chatgpt.com', type: 'bypass', added: 'Сегодня, 14:20', enabled: true, custom: true },
  { id: 6, domain: 'patreon.com', type: 'bypass', added: 'Вчера, 19:05', enabled: true, custom: true },
  { id: 7, domain: 'gosuslugi.ru', type: 'ignore', added: '10 окт 2026', enabled: true, custom: true },
  { id: 8, domain: 'sberbank.ru', type: 'ignore', added: '08 окт 2026', enabled: true, custom: true },
];

const LOG_LINES = [
  { id: 1, time: '23:28:04.112', level: 'info', source: 'Ядро', text: 'Запуск winws.exe с правами администратора (WinDivert 2.2 64-bit)' },
  { id: 2, time: '23:28:04.340', level: 'success', source: 'Ядро', text: 'Перехват пакетов активен: 5 профилей трафика подключено' },
  { id: 3, time: '23:28:11.095', level: 'info', source: 'Подбор', text: '[Подбор] старт проверки стратегии «multidisorder без фейков» (целей: 15)' },
  { id: 4, time: '23:28:14.995', level: 'success', source: 'Подбор', text: '[Подбор] multidisorder без фейков: полная проверка — 15 из 15 за 3 900 мс' },
  { id: 5, time: '23:28:16.935', level: 'success', source: 'Подбор', text: '[Подбор] браузер: открылось за 1 940 мс' },
  { id: 6, time: '23:29:02.410', level: 'warning', source: 'Прокси', text: 'Обнаружен локальный прокси 127.0.0.1:10809 — возможен перехват соединений Discord' },
  { id: 7, time: '23:29:45.881', level: 'info', source: 'Telegram', text: 'Мост запущен на 127.0.0.1:1443 (режим: веб-транспорт + запасные узлы)' },
  { id: 8, time: '23:30:12.004', level: 'success', source: 'Telegram', text: 'Установлено соединение #127 через веб-транспорт (задержка 34 мс)' },
  { id: 9, time: '23:30:50.619', level: 'error', source: 'Подбор', text: '[Подбор] hostfakesplit: заморозка соединения на rr3---sn-gvnuxaxjvh.googlevideo.com' },
];

function StatusDot({ status, pulse = false, size = 8 }) {
  if (status === 'untested') return null;
  const map = {
    success: STATUS.success.hex,
    pass: STATUS.success.hex,
    warning: STATUS.warning.hex,
    danger: STATUS.danger.hex,
    fail: STATUS.danger.hex,
    neutral: STATUS.neutral.hex,
  };
  const bg = map[status] || STATUS.neutral.hex;
  return (
    <span className="relative inline-flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
      {pulse && <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ backgroundColor: bg }} />}
      <span className="relative inline-flex rounded-full" style={{ width: size, height: size, backgroundColor: bg }} />
    </span>
  );
}

function Toggle({ checked, onChange, accent, disabled = false }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange && onChange(!checked)}
      disabled={disabled}
      className="relative inline-flex items-center rounded-full transition-colors duration-200 flex-shrink-0"
      style={{
        width: 36,
        height: 20,
        backgroundColor: checked ? accent.hex : 'rgba(255,255,255,0.13)',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <span
        className="inline-block rounded-full bg-white transition-transform duration-200"
        style={{
          width: 14,
          height: 14,
          transform: checked ? 'translateX(19px)' : 'translateX(3px)',
        }}
      />
    </button>
  );
}

function AppButton({
  children,
  variant = 'primary',
  size = 'md',
  accent = ACCENTS.violet,
  icon: Icon,
  onClick,
  disabled = false,
  className = '',
}) {
  const sizes = {
    sm: 'px-2.5 py-1.5 text-[12px] gap-1.5 rounded-[8px]',
    md: 'px-3.5 py-2 text-[13px] gap-2 rounded-[8px]',
    lg: 'px-5 py-2.5 text-[14px] gap-2 rounded-[10px]',
  };
  const styles = {
    primary: { backgroundColor: accent.hex, color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.16)', boxShadow: `0 2px 12px ${accent.soft}` },
    secondary: { backgroundColor: 'rgba(255,255,255,0.05)', color: '#EDEDEF', border: '1px solid rgba(255,255,255,0.09)' },
    danger: { backgroundColor: STATUS.danger.bg, color: '#FCA5A5', border: `1px solid ${STATUS.danger.border}` },
    success: { backgroundColor: STATUS.success.bg, color: '#86EFAC', border: `1px solid ${STATUS.success.border}` },
    ghost: { backgroundColor: 'transparent', color: '#A1A1AA', border: '1px solid transparent' },
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={styles[variant] || styles.primary}
      className={`inline-flex items-center justify-center font-medium transition-all duration-150 hover:brightness-110 active:scale-[0.985] disabled:opacity-40 disabled:pointer-events-none select-none ${sizes[size]} ${className}`}
    >
      {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" />}
      {children}
    </button>
  );
}

function DiscoveryRowItem({ row, theme }) {
  const map = {
    queued: { icon: Clock, color: theme.textMuted, bg: 'transparent', border: 'rgba(255,255,255,0.04)', opacity: 0.7 },
    starting: { icon: Cpu, color: '#60A5FA', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)' },
    testing: { icon: RefreshCw, color: '#A78BFA', bg: 'rgba(124,108,255,0.08)', border: 'rgba(124,108,255,0.22)', spin: true },
    fast_pass: { icon: Zap, color: STATUS.warning.hex, bg: STATUS.warning.bg, border: STATUS.warning.border },
    browser: { icon: Globe, color: '#38BDF8', bg: 'rgba(56,189,248,0.1)', border: 'rgba(56,189,248,0.25)' },
    success: { icon: CheckCircle2, color: STATUS.success.hex, bg: STATUS.success.bg, border: STATUS.success.border },
    fail: { icon: XCircle, color: 'rgba(239,68,68,0.8)', bg: 'rgba(239,68,68,0.05)', border: 'rgba(239,68,68,0.15)', opacity: 0.72 },
    freeze: { icon: AlertTriangle, color: STATUS.danger.hex, bg: STATUS.danger.bg, border: STATUS.danger.border },
    skipped: { icon: Minimize2, color: theme.textMuted, bg: 'transparent', border: 'rgba(255,255,255,0.03)', opacity: 0.45 },
  };
  const cfg = map[row.state] || map.queued;
  const Icon = cfg.icon;
  return (
    <div
      className="flex items-center justify-between px-3 py-2 rounded-[8px] text-[12px]"
      style={{ backgroundColor: cfg.bg, border: `1px solid ${cfg.border}`, opacity: cfg.opacity || 1 }}
    >
      <div className="flex items-center gap-2.5 min-w-0 pr-3">
        <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${cfg.spin ? 'animate-spin' : ''}`} style={{ color: cfg.color }} />
        <span className="font-medium truncate" style={{ color: theme.textPrimary }}>{row.name}</span>
      </div>
      <span
        className="text-[11px] text-right flex-shrink-0 max-w-[58%] truncate"
        style={{ color: ['success', 'fast_pass', 'freeze'].includes(row.state) ? cfg.color : theme.textSecondary }}
      >
        {row.detail}
      </span>
    </div>
  );
}

function CustomTitleBar({ theme, onMinimizeToast }) {
  return (
    <div
      className="h-[40px] px-3.5 flex items-center justify-between select-none flex-shrink-0"
      style={{ backgroundColor: theme.surface1, borderBottom: `1px solid ${theme.border}` }}
    >
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 pr-1">
          <div className="w-5 h-5 rounded-[6px] flex items-center justify-center" style={{ backgroundColor: 'rgba(124,108,255,0.18)', border: '1px solid rgba(124,108,255,0.4)' }}>
            <Shield className="w-3 h-3 text-[#7C6CFF]" />
          </div>
          <span className="font-semibold tracking-wider text-[12px]" style={{ color: theme.textPrimary }}>ZAPRET 2</span>
        </div>
        <span className="px-1.5 py-0.5 rounded-[5px] text-[11px] font-mono" style={{ backgroundColor: theme.surface2, color: theme.textSecondary, border: `1px solid ${theme.border}` }}>
          v0.4.2
        </span>
        <span className="px-1.5 py-0.5 rounded-[5px] text-[11px] font-medium" style={{ backgroundColor: STATUS.success.bg, color: '#4ADE80', border: `1px solid ${STATUS.success.border}` }}>
          ADMIN
        </span>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-[5px] text-[11px]" style={{ backgroundColor: theme.surface2, color: theme.textSecondary, border: `1px solid ${theme.border}` }}>
          <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" />
          <span>WinDivert 64-bit</span>
        </div>
      </div>

      <div className="flex-1 h-full flex items-center justify-center cursor-move opacity-40 hover:opacity-75">
        <div className="w-12 h-1 rounded-full bg-white/15" title="По пустому месту окно перетаскивается" />
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onMinimizeToast}
          className="px-2.5 py-1 rounded-[6px] text-[11px] flex items-center gap-1.5 hover:bg-white/5"
          style={{ color: theme.textSecondary }}
        >
          <Minimize2 className="w-3 h-3" />
          <span>Свернуть в трей</span>
        </button>
        <button
          type="button"
          onClick={onMinimizeToast}
          className="w-7 h-7 rounded-[6px] flex items-center justify-center hover:bg-[#EF4444]/20 hover:text-[#EF4444]"
          style={{ color: theme.textSecondary }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function Sidebar({ activeTab, setActiveTab, bypassState, telegramRunning, compact, theme, accent }) {
  const items = [
    { id: 'home', label: 'Главная', icon: Power },
    { id: 'discovery', label: 'Подбор', icon: Sparkles },
    { id: 'telegram', label: 'Telegram', icon: Send, badge: telegramRunning ? 'вкл' : null },
    { id: 'sites', label: 'Списки сайтов', icon: Globe },
    { id: 'diagnostics', label: 'Диагностика', icon: Activity },
    { id: 'logs', label: 'Журнал', icon: Terminal },
    { id: 'settings', label: 'Настройки', icon: Settings },
  ];
  const isOn = bypassState === 'on';
  const isConnecting = bypassState === 'connecting';

  return (
    <div
      className={`flex flex-col justify-between flex-shrink-0 select-none transition-all ${compact ? 'w-[58px] p-2' : 'w-[212px] p-3'}`}
      style={{ backgroundColor: theme.surface1, borderRight: `1px solid ${theme.border}` }}
    >
      <div className="space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id || (item.id === 'discovery' && activeTab === 'strategies');
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              title={compact ? item.label : undefined}
              className={`w-full flex items-center ${compact ? 'justify-center py-2.5' : 'justify-between px-3 py-2'} rounded-[8px] text-[13px] font-medium transition-all`}
              style={{
                backgroundColor: active ? accent.soft : 'transparent',
                color: active ? '#FFFFFF' : theme.textSecondary,
                border: active ? `1px solid ${accent.border}` : '1px solid transparent',
              }}
            >
              <div className="flex items-center gap-2.5">
                <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? accent.hex : theme.textSecondary }} />
                {!compact && <span>{item.label}</span>}
              </div>
              {!compact && item.badge && (
                <span className="px-1.5 py-0.5 text-[11px] rounded-[5px] font-medium" style={{ backgroundColor: STATUS.success.bg, color: '#4ADE80', border: `1px solid ${STATUS.success.border}` }}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div
        className={`rounded-[10px] ${compact ? 'p-2 flex justify-center' : 'p-2.5'}`}
        style={{ backgroundColor: theme.surface2, border: `1px solid ${theme.border}` }}
      >
        {compact ? (
          <StatusDot status={isOn ? 'success' : isConnecting ? 'warning' : 'neutral'} pulse={isOn || isConnecting} size={9} />
        ) : (
          <div className="flex items-center gap-2">
            <StatusDot status={isOn ? 'success' : isConnecting ? 'warning' : 'neutral'} pulse={isOn || isConnecting} size={8} />
            <span className="text-[12px] font-medium truncate" style={{ color: isOn ? '#EDEDEF' : theme.textSecondary }}>
              {isOn ? 'Обход включён · 1 ч 12 мин' : isConnecting ? 'Подключение…' : 'Обход выключен'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function HomeScreen({
  theme,
  accent,
  bypassState,
  setBypassState,
  interferenceMode,
  setInterferenceMode,
  onNavigate,
  compact = false,
  showToast,
}) {
  const [toggles, setToggles] = useState({ voice: true, quic: true, allTraffic: false, verbose: false });
  const [tcpFixed, setTcpFixed] = useState(false);

  const isOff = bypassState === 'off';
  const isConnecting = bypassState === 'connecting';
  const isOn = bypassState === 'on';

  const cyclePower = () => {
    if (isOff) {
      setBypassState('connecting');
      setTimeout(() => setBypassState('on'), 800);
    } else {
      setBypassState('off');
    }
  };

  return (
    <div className={`flex-1 overflow-y-auto ${compact ? 'p-3.5 space-y-2.5' : 'p-5 space-y-3.5'}`}>
      {/* Hero Power Block */}
      <div
        className={`rounded-[14px] ${compact ? 'p-3.5' : 'p-5'} flex flex-col items-center justify-center text-center relative`}
        style={{
          backgroundColor: theme.surface1,
          border: `1px solid ${isOn ? STATUS.success.border : theme.border}`,
          backgroundImage: isOn
            ? 'radial-gradient(circle at 50% 0%, rgba(34,197,94,0.11), transparent 70%)'
            : isConnecting
            ? 'radial-gradient(circle at 50% 0%, rgba(245,158,11,0.09), transparent 70%)'
            : 'none',
        }}
      >
        <button
          type="button"
          onClick={cyclePower}
          className={`rounded-full flex flex-col items-center justify-center transition-all duration-300 select-none ${
            compact ? 'w-[86px] h-[86px]' : 'w-[112px] h-[112px]'
          }`}
          style={{
            backgroundColor: isOn ? 'rgba(34,197,94,0.14)' : isConnecting ? 'rgba(245,158,11,0.12)' : theme.surface2,
            border: isOn ? '2px solid #22C55E' : isConnecting ? '2px solid #F59E0B' : `2px solid ${theme.borderStrong}`,
            boxShadow: isOn ? '0 0 36px rgba(34,197,94,0.26), inset 0 0 16px rgba(34,197,94,0.14)' : '0 8px 24px rgba(0,0,0,0.35)',
          }}
        >
          {isConnecting ? (
            <RefreshCw className={`${compact ? 'w-6 h-6' : 'w-7 h-7'} text-[#F59E0B] animate-spin mb-1`} />
          ) : (
            <Power className={`${compact ? 'w-6 h-6' : 'w-7 h-7'} mb-1`} style={{ color: isOn ? '#22C55E' : '#EDEDEF' }} />
          )}
          <span className="text-[12px] font-semibold" style={{ color: isOn ? '#4ADE80' : isConnecting ? '#FBBF24' : '#EDEDEF' }}>
            {isOn ? 'Включено' : isConnecting ? 'Подключение…' : 'Включить'}
          </span>
        </button>

        <div className="mt-3 flex items-center gap-2">
          {isOn && <CheckCircle2 className="w-4 h-4 text-[#22C55E]" />}
          {isConnecting && <RefreshCw className="w-4 h-4 text-[#F59E0B] animate-spin" />}
          {isOff && <span className="w-2.5 h-2.5 rounded-full bg-[#6B6B76]" />}
          <h2 className="text-[15px] font-semibold" style={{ color: theme.textPrimary }}>
            {isOn ? 'Обход работает' : isConnecting ? 'Подключение…' : 'Обход выключен — трафик идёт как обычно'}
          </h2>
        </div>

        <p className="text-[12px] mt-0.5" style={{ color: theme.textSecondary }}>
          {isOn ? '1 ч 12 мин' : isConnecting ? 'Запускается фильтр трафика от имени администратора…' : 'Нажмите кнопку, чтобы Discord и YouTube открывались без ограничений'}
        </p>

        {isOn && (
          <div className="grid grid-cols-3 gap-2.5 w-full mt-3.5 pt-3" style={{ borderTop: `1px solid ${theme.border}` }}>
            <div className="rounded-[9px] px-3 py-1.5 text-left" style={{ backgroundColor: theme.surface2 }}>
              <div className="text-[11px]" style={{ color: theme.textSecondary }}>Обработано соединений</div>
              <div className="text-[13px] font-semibold font-mono" style={{ color: theme.textPrimary }}>2 341</div>
            </div>
            <div className="rounded-[9px] px-3 py-1.5 text-left" style={{ backgroundColor: theme.surface2 }}>
              <div className="text-[11px]" style={{ color: theme.textSecondary }}>Сайтов распознано</div>
              <div className="text-[13px] font-semibold font-mono" style={{ color: theme.textPrimary }}>87</div>
            </div>
            <div className="rounded-[9px] px-3 py-1.5 text-left" style={{ backgroundColor: theme.surface2 }}>
              <div className="text-[11px]" style={{ color: theme.textSecondary }}>Ядро</div>
              <div className="text-[12px] font-medium text-[#4ADE80] truncate">работает, от имени администратора</div>
            </div>
          </div>
        )}
      </div>

      {/* Middle 2 Cards */}
      <div className="grid grid-cols-12 gap-3">
        {/* Card: Что сейчас настроено */}
        <div
          className={`${interferenceMode ? 'col-span-5' : 'col-span-6'} rounded-[12px] p-3.5 flex flex-col justify-between`}
          style={{ backgroundColor: theme.surface1, border: `1px solid ${theme.border}` }}
        >
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[13px] font-semibold" style={{ color: theme.textPrimary }}>Что сейчас настроено</span>
              <AppButton variant="secondary" size="sm" icon={Sparkles} onClick={() => onNavigate('discovery')}>
                Подобрать заново
              </AppButton>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-3 py-2 rounded-[8px] text-[12px]" style={{ backgroundColor: theme.surface2, border: `1px solid ${theme.border}` }}>
                <span className="font-medium" style={{ color: theme.textPrimary }}>Discord</span>
                <span className="text-[#4ADE80]">multidisorder · проверено подбором ✓</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2 rounded-[8px] text-[12px]" style={{ backgroundColor: theme.surface2, border: `1px solid ${theme.border}` }}>
                <span className="font-medium" style={{ color: theme.textPrimary }}>YouTube</span>
                <span className="text-[#4ADE80]">multidisorder · проверено подбором ✓</span>
              </div>
            </div>
          </div>
          <div className="mt-2.5 pt-2 flex items-center justify-between text-[11px]" style={{ borderTop: `1px solid ${theme.border}`, color: theme.textMuted }}>
            <span>Пресет проверен целиком</span>
            <button type="button" onClick={() => onNavigate('strategies')} className="hover:underline flex items-center gap-1" style={{ color: theme.textSecondary }}>
              <span>Подробнее</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Card: Проверка компьютера */}
        <div
          className={`${interferenceMode ? 'col-span-7' : 'col-span-6'} rounded-[12px] p-3.5 flex flex-col justify-between`}
          style={{ backgroundColor: theme.surface1, border: `1px solid ${interferenceMode ? STATUS.danger.border : theme.border}` }}
        >
          {!interferenceMode ? (
            <>
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#22C55E]" />
                    <span className="text-[13px] font-semibold" style={{ color: theme.textPrimary }}>Проверка компьютера</span>
                  </div>
                  <AppButton variant="secondary" size="sm" icon={RefreshCw} onClick={() => showToast('Проверка завершена: помех нет')}>
                    Проверить снова
                  </AppButton>
                </div>
                <div className="p-2.5 rounded-[8px] text-[12px] leading-relaxed" style={{ backgroundColor: theme.surface2, color: theme.textSecondary, border: `1px solid ${theme.border}` }}>
                  <span className="text-[#4ADE80] font-medium">Помех нет:</span> прокси выключен, VPN не перехватывает трафик, лишних копий ядра нет.
                </div>
              </div>
              <div className="mt-2.5 pt-2 flex items-center justify-between text-[11px]" style={{ borderTop: `1px solid ${theme.border}`, color: theme.textMuted }}>
                <span>Метки времени TCP: включены</span>
                <button type="button" onClick={() => setInterferenceMode(true)} className="hover:underline" style={{ color: theme.textSecondary }}>
                  Показать экран с помехами →
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-[#EF4444]" />
                  <span className="text-[13px] font-semibold" style={{ color: theme.textPrimary }}>
                    Помехи: 3 — одна из них блокирует работу
                  </span>
                </div>
                <button type="button" onClick={() => setInterferenceMode(false)} className="text-[11px] hover:underline" style={{ color: theme.textSecondary }}>
                  Свернуть
                </button>
              </div>

              <div className="p-2.5 rounded-[8px] space-y-1" style={{ backgroundColor: STATUS.danger.bg, border: `1px solid ${STATUS.danger.border}` }}>
                <div className="flex items-center gap-2 text-[12px] font-semibold text-[#FCA5A5]">
                  <span className="w-2 h-2 rounded-full bg-[#EF4444] flex-shrink-0" />
                  <span>Discord ходит через прокси, а не через обход</span>
                </div>
                <p className="text-[11px] leading-snug pl-4" style={{ color: '#EDEDEF' }}>
                  3 соединения Discord идут в прокси <span className="font-mono">127.0.0.1:10809</span> (VPN-клиент). Загрузка и сообщения проходят мимо обхода — никакая стратегия не поможет. Выключите VPN и перезапустите Discord через значок в трее.
                </p>
              </div>

              <div className="px-2.5 py-1.5 rounded-[8px] flex items-center justify-between" style={{ backgroundColor: STATUS.warning.bg, border: `1px solid ${STATUS.warning.border}` }}>
                <div className="flex items-center gap-2 text-[12px] font-medium text-[#FCD34D]">
                  <span className="w-2 h-2 rounded-full bg-[#F59E0B] flex-shrink-0" />
                  <span>Включён системный прокси: <span className="font-mono">127.0.0.1:10809</span></span>
                </div>
              </div>

              <div className="px-2.5 py-1.5 rounded-[8px] flex items-center justify-between gap-2" style={{ backgroundColor: STATUS.warning.bg, border: `1px solid ${STATUS.warning.border}` }}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[12px] font-medium text-[#FCD34D]">
                    <span className="w-2 h-2 rounded-full bg-[#F59E0B] flex-shrink-0" />
                    <span>{tcpFixed ? 'Метки времени TCP включены ✓' : 'Метки времени TCP выключены'}</span>
                  </div>
                  <div className="text-[11px] pl-4 truncate" style={{ color: theme.textSecondary }}>
                    Часть способов обхода без них не работает
                  </div>
                </div>
                {!tcpFixed && (
                  <AppButton variant="secondary" size="sm" onClick={() => { setTcpFixed(true); showToast('Метки времени TCP включены'); }}>
                    Включить
                  </AppButton>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Toggles */}
      <div className="rounded-[12px] p-3" style={{ backgroundColor: theme.surface1, border: `1px solid ${theme.border}` }}>
        <div className="grid grid-cols-4 gap-2">
          <div className="px-2.5 py-2 rounded-[8px] flex items-center justify-between" style={{ backgroundColor: theme.surface2, border: `1px solid ${theme.border}` }}>
            <span className="text-[12px] font-medium" style={{ color: theme.textPrimary }}>Голос Discord</span>
            <Toggle checked={toggles.voice} onChange={(v) => setToggles({ ...toggles, voice: v })} accent={accent} />
          </div>
          <div className="px-2.5 py-2 rounded-[8px] flex items-center justify-between" style={{ backgroundColor: theme.surface2, border: `1px solid ${theme.border}` }}>
            <span className="text-[12px] font-medium" style={{ color: theme.textPrimary }}>Ускорение QUIC</span>
            <Toggle checked={toggles.quic} onChange={(v) => setToggles({ ...toggles, quic: v })} accent={accent} />
          </div>
          <div className="px-2.5 py-2 rounded-[8px] flex items-center justify-between gap-1" style={{ backgroundColor: theme.surface2, border: `1px solid ${theme.border}` }}>
            <div className="min-w-0">
              <div className="text-[11px] font-medium truncate" style={{ color: theme.textPrimary }}>Весь трафик (игнорировать списки сайтов)</div>
              <div className="text-[11px] text-[#F59E0B]">для опытных</div>
            </div>
            <Toggle checked={toggles.allTraffic} onChange={(v) => setToggles({ ...toggles, allTraffic: v })} accent={accent} />
          </div>
          <div className="px-2.5 py-2 rounded-[8px] flex items-center justify-between" style={{ backgroundColor: theme.surface2, border: `1px solid ${theme.border}` }}>
            <span className="text-[12px] font-medium" style={{ color: theme.textPrimary }}>Подробный журнал</span>
            <Toggle checked={toggles.verbose} onChange={(v) => setToggles({ ...toggles, verbose: v })} accent={accent} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DiscoveryScreen({ theme, accent, discoveryStage, setDiscoveryStage, onOpenStrategies, showToast }) {
  const [scopeTab, setScopeTab] = useState('all');
  const [applied, setApplied] = useState(false);

  return (
    <div className="flex-1 overflow-y-auto p-5 flex flex-col justify-between space-y-3.5">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[16px] font-semibold" style={{ color: theme.textPrimary }}>Подбор способа обхода</h1>
            <p className="text-[12px]" style={{ color: theme.textSecondary }}>
              Автоматический поиск стратегии, которая открывает Discord и YouTube у вашего провайдера
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center p-0.5 rounded-[8px] text-[11px]" style={{ backgroundColor: theme.surface1, border: `1px solid ${theme.border}` }}>
              {[
                { id: 'before', label: 'До запуска' },
                { id: 'running', label: 'Во время работы' },
                { id: 'success', label: 'Итог: успех' },
                { id: 'failed', label: 'Итог: сбой' },
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setDiscoveryStage(s.id)}
                  className="px-2 py-1 rounded-[6px] font-medium"
                  style={{
                    backgroundColor: discoveryStage === s.id ? theme.surface3 : 'transparent',
                    color: discoveryStage === s.id ? '#FFFFFF' : theme.textSecondary,
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <AppButton variant="secondary" size="sm" icon={Sliders} onClick={onOpenStrategies}>
              Стратегии (для опытных)
            </AppButton>
          </div>
        </div>

        {/* 3 Tabs */}
        <div className="inline-flex p-1 rounded-[10px] gap-1" style={{ backgroundColor: theme.surface1, border: `1px solid ${theme.border}` }}>
          {[
            { id: 'all', label: 'Весь пресет', rec: true },
            { id: 'discord', label: 'Discord и сайты' },
            { id: 'youtube', label: 'YouTube' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setScopeTab(t.id)}
              className="px-3 py-1.5 rounded-[7px] text-[12px] font-medium flex items-center gap-1.5"
              style={{
                backgroundColor: scopeTab === t.id ? theme.surface3 : 'transparent',
                color: scopeTab === t.id ? '#FFFFFF' : theme.textSecondary,
              }}
            >
              <span>{t.label}</span>
              {t.rec && (
                <span className="px-1.5 py-0.2 rounded text-[11px]" style={{ backgroundColor: accent.soft, color: accent.hex }}>
                  Рекомендуется
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {discoveryStage === 'before' && (
        <div className="flex-1 flex flex-col justify-between space-y-3.5">
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: Globe, title: '1. Discord и сайты', text: 'Проверяются discord.com, шлюз, картинки, обновления, медиасерверы и страница входа в браузере.' },
              { icon: Play, title: '2. YouTube', text: 'Проверяются сайт, серверы видео и открытие главной страницы в браузере.' },
              { icon: ShieldCheck, title: '3. Проверка целиком', text: 'Оба найденных способа запускаются вместе и проверяются на всех целях.' },
            ].map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="rounded-[12px] p-4 space-y-2" style={{ backgroundColor: theme.surface1, border: `1px solid ${theme.border}` }}>
                  <div className="w-8 h-8 rounded-[8px] flex items-center justify-center" style={{ backgroundColor: accent.soft }}>
                    <Icon className="w-4 h-4" style={{ color: accent.hex }} />
                  </div>
                  <div className="text-[13px] font-semibold" style={{ color: theme.textPrimary }}>{step.title}</div>
                  <p className="text-[12px] leading-relaxed" style={{ color: theme.textSecondary }}>{step.text}</p>
                </div>
              );
            })}
          </div>

          <div className="rounded-[12px] p-4 space-y-2" style={{ backgroundColor: theme.surface1, border: `1px solid ${theme.border}` }}>
            <div className="flex items-center gap-2 text-[12px]" style={{ color: theme.textPrimary }}>
              <Clock className="w-4 h-4 text-[#A1A1AA]" />
              <span>Займёт 2–5 минут, интернет может прерываться на секунду</span>
            </div>
            <div className="flex items-center gap-2 text-[12px]" style={{ color: theme.textPrimary }}>
              <CheckCircle2 className="w-4 h-4 text-[#22C55E]" />
              <span>Ничего не применится само — в конце будет кнопка</span>
            </div>
            <div className="flex items-center gap-2 text-[12px] p-2 rounded-[8px]" style={{ backgroundColor: STATUS.warning.bg, border: `1px solid ${STATUS.warning.border}`, color: '#FDE68A' }}>
              <AlertTriangle className="w-4 h-4 text-[#F59E0B]" />
              <span>Голос Discord и QUIC подбором не проверяются</span>
            </div>
          </div>

          <div className="flex justify-end">
            <AppButton variant="primary" size="lg" accent={accent} icon={Sparkles} onClick={() => setDiscoveryStage('running')}>
              Собрать пресет
            </AppButton>
          </div>
        </div>
      )}

      {discoveryStage === 'running' && (
        <div className="flex-1 flex flex-col justify-between space-y-3 min-h-0">
          <div className="grid grid-cols-3 gap-2.5">
            <div className="px-3 py-2 rounded-[10px] flex items-center justify-between" style={{ backgroundColor: STATUS.success.bg, border: `1px solid ${STATUS.success.border}` }}>
              <div>
                <div className="text-[11px] text-[#86EFAC]">Шаг 1 · Готово</div>
                <div className="text-[12px] font-semibold" style={{ color: theme.textPrimary }}>Discord и сайты</div>
                <div className="text-[11px] text-[#4ADE80]">multidisorder · 15 из 15</div>
              </div>
              <CheckCircle2 className="w-4 h-4 text-[#22C55E]" />
            </div>
            <div className="px-3 py-2 rounded-[10px] flex items-center justify-between" style={{ backgroundColor: accent.soft, border: `1px solid ${accent.border}` }}>
              <div>
                <div className="text-[11px]" style={{ color: accent.hex }}>Шаг 2 · Идёт</div>
                <div className="text-[12px] font-semibold" style={{ color: theme.textPrimary }}>YouTube</div>
                <div className="text-[11px]" style={{ color: theme.textSecondary }}>Способ 9 из 30</div>
              </div>
              <RefreshCw className="w-4 h-4 animate-spin" style={{ color: accent.hex }} />
            </div>
            <div className="px-3 py-2 rounded-[10px] flex items-center justify-between opacity-60" style={{ backgroundColor: theme.surface1, border: `1px solid ${theme.border}` }}>
              <div>
                <div className="text-[11px]" style={{ color: theme.textMuted }}>Шаг 3 · Ждёт</div>
                <div className="text-[12px] font-semibold" style={{ color: theme.textPrimary }}>Проверка целиком</div>
                <div className="text-[11px]" style={{ color: theme.textMuted }}>Ожидание шага 2</div>
              </div>
              <Clock className="w-4 h-4" style={{ color: theme.textMuted }} />
            </div>
          </div>

          <div className="flex-1 rounded-[12px] p-2.5 overflow-y-auto space-y-1.5 max-h-[265px]" style={{ backgroundColor: theme.surface1, border: `1px solid ${theme.border}` }}>
            {DISCOVERY_ROWS.map((r) => (
              <DiscoveryRowItem key={r.id} row={r} theme={theme} />
            ))}
          </div>

          <div className="rounded-[12px] p-3 flex items-center justify-between gap-4" style={{ backgroundColor: theme.surface1, border: `1px solid ${theme.border}` }}>
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between text-[12px]">
                <span className="font-medium" style={{ color: theme.textPrimary }}>Прогресс подбора: 62%</span>
                <span style={{ color: theme.textSecondary }}>Осталось около 1 мин 15 с</span>
              </div>
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: theme.surface3 }}>
                <div className="h-full rounded-full" style={{ width: '62%', backgroundColor: accent.hex }} />
              </div>
            </div>
            <AppButton variant="danger" size="md" icon={Square} onClick={() => setDiscoveryStage('before')}>
              Остановить
            </AppButton>
          </div>
        </div>
      )}

      {discoveryStage === 'success' && (
        <div className="flex-1 flex flex-col justify-between">
          <div className="rounded-[14px] p-5 space-y-4" style={{ backgroundColor: theme.surface1, border: `1px solid ${STATUS.success.border}` }}>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-[#22C55E] flex-shrink-0 mt-0.5" />
              <div>
                <h2 className="text-[15px] font-semibold" style={{ color: theme.textPrimary }}>
                  Пресет собран и проверен целиком — все цели открылись без единого срыва
                </h2>
                <p className="text-[12px] mt-0.5" style={{ color: theme.textSecondary }}>
                  Оба способа протестированы вместе на всех серверах Discord и YouTube.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-[10px]" style={{ backgroundColor: theme.surface2, border: `1px solid ${theme.border}` }}>
                <div className="text-[11px]" style={{ color: theme.textSecondary }}>Discord и сайты</div>
                <div className="text-[14px] font-semibold mt-0.5" style={{ color: theme.textPrimary }}>multidisorder без фейков</div>
                <div className="text-[12px] text-[#4ADE80] mt-0.5">Работает · 15 из 15 · браузер: открылось за 1,9 с</div>
              </div>
              <div className="p-3.5 rounded-[10px]" style={{ backgroundColor: theme.surface2, border: `1px solid ${theme.border}` }}>
                <div className="text-[11px]" style={{ color: theme.textSecondary }}>YouTube</div>
                <div className="text-[14px] font-semibold mt-0.5" style={{ color: theme.textPrimary }}>multidisorder без фейков</div>
                <div className="text-[12px] text-[#4ADE80] mt-0.5">Работает · 10 из 10 · браузер: открылось за 1,4 с</div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              {applied ? (
                <>
                  <AppButton variant="secondary" size="md" icon={RotateCcw} onClick={() => { setApplied(false); showToast('Возвращены прежние настройки'); }}>
                    Вернуть как было
                  </AppButton>
                  <AppButton variant="success" size="md" icon={Check}>
                    Применено
                  </AppButton>
                </>
              ) : (
                <AppButton variant="primary" size="lg" accent={accent} icon={Check} onClick={() => { setApplied(true); showToast('Пресет применён'); }}>
                  Применить пресет
                </AppButton>
              )}
            </div>
          </div>
        </div>
      )}

      {discoveryStage === 'failed' && (
        <div className="flex-1 flex flex-col justify-between">
          <div className="rounded-[14px] p-5 space-y-4" style={{ backgroundColor: theme.surface1, border: `1px solid ${STATUS.warning.border}` }}>
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-[#F59E0B] flex-shrink-0 mt-0.5" />
              <div>
                <h2 className="text-[15px] font-semibold" style={{ color: theme.textPrimary }}>
                  Полностью не прошёл ни один способ. Лучший — fake vk.com, 12 из 15: работает через раз
                </h2>
                <p className="text-[12px] mt-0.5" style={{ color: theme.textSecondary }}>
                  Часть медиасерверов не ответила вовремя. Ниже подсказки, как повысить точность обхода:
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-[10px] space-y-1.5 text-[12px]" style={{ backgroundColor: theme.surface2, color: theme.textSecondary, border: `1px solid ${theme.border}` }}>
              <div>• Выключите сторонний VPN или системный прокси на время подбора и работы.</div>
              <div>• Включите «Метки времени TCP» в карточке проверки компьютера на Главной.</div>
              <div>• Попробуйте применить лучший найденный вариант (fake vk.com) и проверить работу приложения.</div>
            </div>

            <div className="flex items-center justify-between">
              <AppButton variant="secondary" size="md" icon={RefreshCw} onClick={() => setDiscoveryStage('running')}>
                Повторить подбор
              </AppButton>
              <AppButton variant="primary" size="md" accent={accent} onClick={() => showToast('Применён способ fake vk.com (12 из 15)')}>
                Применить лучший способ
              </AppButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StrategiesScreen({ theme, accent, onBack, showToast }) {
  const [selDiscord, setSelDiscord] = useState(DISCORD_CHIPS[0]);
  const [selYoutube, setSelYoutube] = useState(YOUTUBE_CHIPS[0]);
  const [cliOpen, setCliOpen] = useState(true);

  const profiles = [
    { id: 1, name: 'QUIC / HTTP-3', ports: 'UDP 443' },
    { id: 2, name: 'Голос Discord', ports: 'UDP 19294–19344, 50000–50100' },
    { id: 3, name: 'Медиасерверы Discord', ports: 'TCP 2053, 2083, 2087, 2096, 8443' },
    { id: 4, name: 'YouTube и Google', ports: 'TCP 443' },
    { id: 5, name: 'Сайты из списков', ports: 'TCP 80, 443' },
  ];

  const cmd = `winws.exe --wf-tcp=80,443,2053,2083,2087,2096,8443 --wf-udp=443,19294-19344,50000-50100 --dpi-desync=multidisorder --dpi-desync-split-pos=1,midsld`;

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={onBack} className="p-1.5 rounded-[8px] hover:bg-white/5" style={{ color: theme.textSecondary, border: `1px solid ${theme.border}` }}>
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-[15px] font-semibold" style={{ color: theme.textPrimary }}>Стратегии (для опытных)</h1>
        </div>
        <div className="flex items-center gap-2">
          <AppButton variant="secondary" size="sm" icon={Plus} onClick={() => showToast('Создан новый пресет')}>Создать пресет</AppButton>
          <AppButton variant="secondary" size="sm" icon={Upload} onClick={() => showToast('Импорт пресета')}>Импорт</AppButton>
          <AppButton variant="secondary" size="sm" icon={Download} onClick={() => showToast('Экспорт пресета')}>Экспорт</AppButton>
        </div>
      </div>

      {/* Group 1: Discord */}
      <div className="rounded-[12px] p-3.5 space-y-2" style={{ backgroundColor: theme.surface1, border: `1px solid ${theme.border}` }}>
        <div className="flex items-center justify-between text-[12px]">
          <span className="font-semibold" style={{ color: theme.textPrimary }}>Discord и сайты (32 способа)</span>
          <span style={{ color: theme.textMuted }}>● зелёная — прошёл · ● красная — не прошёл · без точки — не проверялся</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DISCORD_CHIPS.map((c) => {
            const active = selDiscord.id === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelDiscord(c)}
                className="px-2.5 py-1 rounded-[8px] text-[12px] font-medium flex items-center gap-1.5"
                style={{
                  backgroundColor: active ? accent.soft : theme.surface2,
                  color: active ? '#FFFFFF' : theme.textSecondary,
                  border: active ? `1px solid ${accent.hex}` : `1px solid ${theme.border}`,
                }}
              >
                <StatusDot status={c.status} size={6} />
                <span>{c.name}</span>
              </button>
            );
          })}
        </div>
        <div className="p-2.5 rounded-[8px] flex items-center justify-between gap-3 text-[12px]" style={{ backgroundColor: theme.surface2, border: `1px solid ${theme.border}` }}>
          <span style={{ color: theme.textPrimary }}>{selDiscord.desc}</span>
          {selDiscord.status === 'fail' && (
            <span className="px-2 py-0.5 rounded text-[11px] flex-shrink-0" style={{ backgroundColor: STATUS.danger.bg, color: '#FCA5A5' }}>
              Последний подбор этот способ отбраковал
            </span>
          )}
          {selDiscord.status === 'untested' && (
            <span className="px-2 py-0.5 rounded text-[11px] flex-shrink-0" style={{ backgroundColor: STATUS.warning.bg, color: '#FCD34D' }}>
              Этот способ подбор не проверял — надёжнее выбрать отмеченный зелёным
            </span>
          )}
        </div>
      </div>

      {/* Group 2: YouTube */}
      <div className="rounded-[12px] p-3.5 space-y-2" style={{ backgroundColor: theme.surface1, border: `1px solid ${theme.border}` }}>
        <div className="text-[12px] font-semibold" style={{ color: theme.textPrimary }}>YouTube (26 способов)</div>
        <div className="flex flex-wrap gap-1.5">
          {YOUTUBE_CHIPS.map((c) => {
            const active = selYoutube.id === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelYoutube(c)}
                className="px-2.5 py-1 rounded-[8px] text-[12px] font-medium flex items-center gap-1.5"
                style={{
                  backgroundColor: active ? accent.soft : theme.surface2,
                  color: active ? '#FFFFFF' : theme.textSecondary,
                  border: active ? `1px solid ${accent.hex}` : `1px solid ${theme.border}`,
                }}
              >
                <StatusDot status={c.status} size={6} />
                <span>{c.name}</span>
              </button>
            );
          })}
        </div>
        <div className="p-2.5 rounded-[8px] flex items-center justify-between gap-3 text-[12px]" style={{ backgroundColor: theme.surface2, border: `1px solid ${theme.border}` }}>
          <span style={{ color: theme.textPrimary }}>{selYoutube.desc}</span>
          {selYoutube.status === 'fail' && (
            <span className="px-2 py-0.5 rounded text-[11px] flex-shrink-0" style={{ backgroundColor: STATUS.danger.bg, color: '#FCA5A5' }}>
              Последний подбор этот способ отбраковал
            </span>
          )}
          {selYoutube.status === 'untested' && (
            <span className="px-2 py-0.5 rounded text-[11px] flex-shrink-0" style={{ backgroundColor: STATUS.warning.bg, color: '#FCD34D' }}>
              Этот способ подбор не проверял — надёжнее выбрать отмеченный зелёным
            </span>
          )}
        </div>
      </div>

      {/* 5 Profiles + Collapsible CLI */}
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-7 rounded-[12px] p-3" style={{ backgroundColor: theme.surface1, border: `1px solid ${theme.border}` }}>
          <div className="text-[12px] font-semibold mb-2" style={{ color: theme.textPrimary }}>Как устроена команда</div>
          <div className="grid grid-cols-2 gap-1.5">
            {profiles.map((p) => (
              <div key={p.id} className="px-2.5 py-1.5 rounded-[7px] flex items-center justify-between text-[11px]" style={{ backgroundColor: theme.surface2 }}>
                <span style={{ color: theme.textPrimary }}>{p.id}. {p.name}</span>
                <span className="font-mono" style={{ color: theme.textSecondary }}>{p.ports}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="col-span-5 rounded-[12px] p-3 flex flex-col justify-between" style={{ backgroundColor: theme.surface1, border: `1px solid ${theme.border}` }}>
          <div className="flex items-center justify-between mb-1.5">
            <button type="button" onClick={() => setCliOpen(!cliOpen)} className="text-[12px] font-semibold flex items-center gap-1" style={{ color: theme.textPrimary }}>
              <span>Строка запуска winws.exe</span>
              {cliOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            <AppButton variant="secondary" size="sm" icon={Copy} onClick={() => showToast('Строка winws.exe скопирована')}>
              Копировать
            </AppButton>
          </div>
          {cliOpen && (
            <div className="p-2 rounded-[7px] font-mono text-[11px] leading-snug select-all" style={{ backgroundColor: theme.surface2, color: theme.textSecondary }}>
              {cmd}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FirstRunWizardOverlay({ theme, accent, wizardStep, setWizardStep, onClose, onEnableBypass }) {
  const steps = ['Начало', 'Компьютер', 'Discord', 'YouTube', 'Telegram', 'Готово'];
  const currentIdx = wizardStep === 'welcome' ? 0 : wizardStep === 'discord' ? 2 : 5;

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-between p-6 select-none" style={{ backgroundColor: theme.bg }}>
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold" style={{ color: theme.textPrimary }}>Мастер первого запуска</span>
          <div className="flex items-center gap-2">
            <div className="flex items-center p-0.5 rounded-[8px] text-[11px]" style={{ backgroundColor: theme.surface1, border: `1px solid ${theme.border}` }}>
              {[
                { id: 'welcome', label: 'Добро пожаловать' },
                { id: 'discord', label: 'Discord — идёт проверка' },
                { id: 'done', label: 'Готово' },
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setWizardStep(s.id)}
                  className="px-2.5 py-1 rounded-[6px] font-medium"
                  style={{
                    backgroundColor: wizardStep === s.id ? theme.surface3 : 'transparent',
                    color: wizardStep === s.id ? '#FFFFFF' : theme.textSecondary,
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={onClose} className="px-2 py-1 text-[12px]" style={{ color: theme.textSecondary }}>
              Закрыть
            </button>
          </div>
        </div>

        <div className="grid grid-cols-6 gap-2">
          {steps.map((label, idx) => {
            const done = idx < currentIdx;
            const active = idx === currentIdx;
            return (
              <div
                key={label}
                className="px-3 py-2 rounded-[8px] flex items-center gap-2 text-[12px] font-medium"
                style={{
                  backgroundColor: active ? accent.soft : done ? STATUS.success.bg : theme.surface1,
                  border: `1px solid ${active ? accent.border : done ? STATUS.success.border : theme.border}`,
                  color: active || done ? '#FFFFFF' : theme.textMuted,
                }}
              >
                <span>{done ? '✓' : idx + 1}.</span>
                <span>{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {wizardStep === 'welcome' && (
        <div className="max-w-[740px] mx-auto w-full space-y-4">
          <div className="text-center">
            <h2 className="text-[20px] font-semibold" style={{ color: theme.textPrimary }}>Добро пожаловать</h2>
            <p className="text-[12px] mt-1" style={{ color: theme.textSecondary }}>Около 4–5 минут, ничего не устанавливается</p>
          </div>
          <div className="grid grid-cols-3 gap-3.5">
            {[
              { title: 'Discord', desc: 'Сообщения, картинки и голосовые каналы открываются с первой попытки.' },
              { title: 'YouTube', desc: 'Видеоролики в браузере загружаются сразу и в высоком качестве.' },
              { title: 'Telegram', desc: 'Встроенный прокси-мост помогает оставаться на связи при блокировках.' },
            ].map((c) => (
              <div key={c.title} className="p-4 rounded-[12px] space-y-1.5" style={{ backgroundColor: theme.surface1, border: `1px solid ${theme.border}` }}>
                <div className="text-[14px] font-semibold" style={{ color: theme.textPrimary }}>{c.title}</div>
                <p className="text-[12px] leading-relaxed" style={{ color: theme.textSecondary }}>{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {wizardStep === 'discord' && (
        <div className="max-w-[680px] mx-auto w-full rounded-[14px] p-6 space-y-4" style={{ backgroundColor: theme.surface1, border: `1px solid ${theme.border}` }}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[12px]" style={{ color: accent.hex }}>Discord — идёт проверка</div>
              <div className="text-[19px] font-semibold mt-0.5" style={{ color: theme.textPrimary }}>Способ 3 из 31: fake vk.com</div>
            </div>
            <span className="text-[12px]" style={{ color: theme.textSecondary }}>осталось около 2 минут</span>
          </div>
          <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: theme.surface3 }}>
            <div className="h-full rounded-full" style={{ width: '36%', backgroundColor: accent.hex }} />
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="px-2.5 py-1 rounded-[7px] text-[11px]" style={{ backgroundColor: STATUS.success.bg, color: '#86EFAC' }}>multidisorder · 15/15 ✓</span>
            <span className="px-2.5 py-1 rounded-[7px] text-[11px]" style={{ backgroundColor: STATUS.danger.bg, color: '#FCA5A5' }}>hostfakesplit · 0/1</span>
            <span className="px-2.5 py-1 rounded-[7px] text-[11px]" style={{ backgroundColor: accent.soft, color: '#FFFFFF' }}>fake vk.com · проверяется…</span>
          </div>
          <div className="px-3 py-2 rounded-[8px] text-[12px]" style={{ backgroundColor: theme.surface2, color: theme.textSecondary }}>
            Проверка идёт напрямую, мимо VPN и прокси
          </div>
        </div>
      )}

      {wizardStep === 'done' && (
        <div className="max-w-[680px] mx-auto w-full rounded-[14px] p-6 space-y-4" style={{ backgroundColor: theme.surface1, border: `1px solid ${STATUS.success.border}` }}>
          <div className="text-center">
            <h2 className="text-[19px] font-semibold" style={{ color: theme.textPrimary }}>Готово</h2>
            <p className="text-[12px]" style={{ color: theme.textSecondary }}>Все проверки успешно завершены</p>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              'Компьютер: помех и лишних прокси нет ✓',
              'Discord: multidisorder (15 из 15) ✓',
              'YouTube: multidisorder (10 из 10) ✓',
              'Telegram: мост готов на 127.0.0.1:1443 ✓',
            ].map((line) => (
              <div key={line} className="p-3 rounded-[9px] flex items-center gap-2 text-[12px]" style={{ backgroundColor: theme.surface2, color: theme.textPrimary }}>
                <CheckCircle2 className="w-4 h-4 text-[#22C55E] flex-shrink-0" />
                <span>{line}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-center pt-1">
            <AppButton variant="primary" size="lg" accent={accent} icon={Power} onClick={() => { onEnableBypass(); onClose(); }}>
              Включить обход
            </AppButton>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-3" style={{ borderTop: `1px solid ${theme.border}` }}>
        <AppButton variant="secondary" size="md" icon={ArrowLeft} onClick={() => setWizardStep(wizardStep === 'done' ? 'discord' : 'welcome')}>
          Назад
        </AppButton>
        <div className="flex items-center gap-2">
          <AppButton variant="ghost" size="md" onClick={() => setWizardStep(wizardStep === 'welcome' ? 'discord' : 'done')}>
            Пропустить шаг
          </AppButton>
          {wizardStep !== 'done' && (
            <AppButton variant="primary" size="md" accent={accent} icon={ArrowRight} onClick={() => setWizardStep(wizardStep === 'welcome' ? 'discord' : 'done')}>
              Далее
            </AppButton>
          )}
        </div>
      </div>
    </div>
  );
}

function TelegramScreen({ theme, accent, telegramRunning, setTelegramRunning, showToast }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [opts, setOpts] = useState({ autostart: true, lan: false, fallback: true, direct: true });
  const link = 'tg://proxy?server=127.0.0.1&port=1443&secret=ee1603010200010001fc030386e24c3a';

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-3.5">
      <div className="rounded-[12px] p-4 flex items-center justify-between" style={{ backgroundColor: theme.surface1, border: `1px solid ${telegramRunning ? STATUS.success.border : theme.border}` }}>
        <div className="flex items-center gap-3">
          <StatusDot status={telegramRunning ? 'success' : 'neutral'} pulse={telegramRunning} size={10} />
          <div>
            <div className="text-[15px] font-semibold" style={{ color: theme.textPrimary }}>
              {telegramRunning ? 'Мост работает · слушает 127.0.0.1:1443' : 'Мост остановлен'}
            </div>
            <div className="text-[12px]" style={{ color: theme.textSecondary }}>
              Встроенный локальный мост для настольного приложения Telegram
            </div>
          </div>
        </div>
        <AppButton
          variant={telegramRunning ? 'danger' : 'primary'}
          size="md"
          accent={accent}
          icon={telegramRunning ? Square : Play}
          onClick={() => setTelegramRunning(!telegramRunning)}
        >
          {telegramRunning ? 'Остановить мост' : 'Запустить мост'}
        </AppButton>
      </div>

      <div className="rounded-[12px] p-4 space-y-2.5" style={{ backgroundColor: theme.surface1, border: `1px solid ${theme.border}` }}>
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold" style={{ color: theme.textPrimary }}>Ссылка для подключения</span>
          <div className="flex items-center gap-2">
            <AppButton variant="secondary" size="sm" icon={Copy} onClick={() => showToast('Ссылка tg://proxy скопирована')}>
              Копировать
            </AppButton>
            <AppButton variant="primary" size="sm" accent={accent} icon={ExternalLink} onClick={() => showToast('Передаём настройки прокси в Telegram…')}>
              Открыть в Telegram
            </AppButton>
          </div>
        </div>
        <div className="px-3 py-2 rounded-[8px] font-mono text-[12px] truncate select-all" style={{ backgroundColor: theme.surface2, color: theme.textSecondary, border: `1px solid ${theme.border}` }}>
          {link}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-3.5">
        <div className="col-span-7 rounded-[12px] p-4 space-y-2.5" style={{ backgroundColor: theme.surface1, border: `1px solid ${theme.border}` }}>
          <div className="flex items-center justify-between text-[12px]">
            <span className="font-semibold" style={{ color: theme.textPrimary }}>Статистика</span>
            <span style={{ color: theme.textSecondary }}>Соединений сейчас: <strong className="font-mono text-white">4</strong> · Всего: <strong className="font-mono text-white">127</strong></span>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="p-2.5 rounded-[8px]" style={{ backgroundColor: theme.surface2 }}>
              <div className="text-[11px]" style={{ color: theme.textSecondary }}>Веб-транспорт</div>
              <div className="text-[14px] font-mono font-semibold text-[#4ADE80]">98</div>
            </div>
            <div className="p-2.5 rounded-[8px]" style={{ backgroundColor: theme.surface2 }}>
              <div className="text-[11px]" style={{ color: theme.textSecondary }}>Запасной узел</div>
              <div className="text-[14px] font-mono font-semibold" style={{ color: theme.textPrimary }}>21</div>
            </div>
            <div className="p-2.5 rounded-[8px]" style={{ backgroundColor: theme.surface2 }}>
              <div className="text-[11px]" style={{ color: theme.textSecondary }}>Напрямую</div>
              <div className="text-[14px] font-mono font-semibold" style={{ color: theme.textPrimary }}>8</div>
            </div>
            <div className="p-2.5 rounded-[8px]" style={{ backgroundColor: theme.surface2 }}>
              <div className="text-[11px]" style={{ color: theme.textSecondary }}>Не прошло</div>
              <div className="text-[14px] font-mono font-semibold text-[#F87171]">2</div>
            </div>
          </div>
        </div>

        <div className="col-span-5 rounded-[12px] p-4 space-y-1.5" style={{ backgroundColor: theme.surface1, border: `1px solid ${theme.border}` }}>
          <div className="text-[13px] font-semibold" style={{ color: theme.textPrimary }}>Почему Telegram лечится отдельно</div>
          <p className="text-[12px] leading-relaxed" style={{ color: theme.textSecondary }}>
            Его блокируют по адресам серверов, а не по содержимому пакетов. Поэтому программа поднимает лёгкий локальный мост и перенаправляет трафик через веб-транспорт.
          </p>
        </div>
      </div>

      {/* Collapsible Settings */}
      <div className="rounded-[12px] p-3.5" style={{ backgroundColor: theme.surface1, border: `1px solid ${theme.border}` }}>
        <button
          type="button"
          onClick={() => setSettingsOpen(!settingsOpen)}
          className="w-full flex items-center justify-between text-[13px] font-semibold"
          style={{ color: theme.textPrimary }}
        >
          <span>Настройки моста (порт 1443, секрет и режимы)</span>
          {settingsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {settingsOpen && (
          <div className="mt-3 pt-3 space-y-3" style={{ borderTop: `1px solid ${theme.border}` }}>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between px-3 py-2 rounded-[8px] text-[12px]" style={{ backgroundColor: theme.surface2 }}>
                <span style={{ color: theme.textSecondary }}>Порт: <strong className="font-mono text-white">1443</strong></span>
                <span className="text-[11px]" style={{ color: theme.textMuted }}>127.0.0.1</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2 rounded-[8px] text-[12px]" style={{ backgroundColor: theme.surface2 }}>
                <span className="font-mono truncate mr-2" style={{ color: theme.textSecondary }}>Секрет: ee160301…4c3a</span>
                <AppButton variant="secondary" size="sm" onClick={() => showToast('Секрет моста обновлён')}>Сменить</AppButton>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { k: 'autostart', label: 'Запускать вместе с программой' },
                { k: 'lan', label: 'Доступ из локальной сети' },
                { k: 'fallback', label: 'Обход через запасные узлы' },
                { k: 'direct', label: 'Прямое соединение как резерв' },
              ].map((item) => (
                <div key={item.k} className="px-3 py-2 rounded-[8px] flex items-center justify-between text-[12px]" style={{ backgroundColor: theme.surface2 }}>
                  <span style={{ color: theme.textPrimary }}>{item.label}</span>
                  <Toggle checked={opts[item.k]} onChange={(v) => setOpts({ ...opts, [item.k]: v })} accent={accent} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SitesScreen({ theme, accent, showToast }) {
  const [tab, setTab] = useState('all'); // 'all' | 'custom' | 'ignore' | 'empty_custom' | 'empty_search'
  const [search, setSearch] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [newType, setNewType] = useState('bypass');
  const [sites, setSites] = useState(INITIAL_SITES);

  const addSite = () => {
    if (!newDomain.trim()) return;
    setSites([{ id: Date.now(), domain: newDomain.trim(), type: newType, added: 'Только что', enabled: true, custom: true }, ...sites]);
    setNewDomain('');
    showToast(`Домен ${newDomain} добавлен`);
  };

  const filtered = sites.filter((s) => {
    if (tab === 'empty_custom' || tab === 'empty_search') return false;
    if (tab === 'custom' && !s.custom) return false;
    if (tab === 'ignore' && s.type !== 'ignore') return false;
    if (search && !s.domain.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex-1 overflow-y-auto p-5 flex flex-col justify-between space-y-3">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="inline-flex p-1 rounded-[9px] gap-1" style={{ backgroundColor: theme.surface1, border: `1px solid ${theme.border}` }}>
            {[
              { id: 'all', label: 'Все' },
              { id: 'custom', label: 'Мои сайты' },
              { id: 'ignore', label: 'Исключения' },
              { id: 'empty_custom', label: 'Пусто: Мои сайты' },
              { id: 'empty_search', label: 'Пусто: Поиск' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className="px-2.5 py-1 rounded-[6px] text-[12px] font-medium"
                style={{
                  backgroundColor: tab === t.id ? theme.surface3 : 'transparent',
                  color: tab === t.id ? '#FFFFFF' : theme.textSecondary,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2" style={{ color: theme.textMuted }} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск домена…"
                className="pl-8 pr-3 py-1 rounded-[8px] text-[12px] focus:outline-none"
                style={{ backgroundColor: theme.surface1, color: theme.textPrimary, border: `1px solid ${theme.border}` }}
              />
            </div>
            <AppButton variant="secondary" size="sm" icon={Upload} onClick={() => showToast('Импорт списка доменов')}>Импорт</AppButton>
            <AppButton variant="secondary" size="sm" icon={Download} onClick={() => showToast('Экспорт списка доменов')}>Экспорт</AppButton>
          </div>
        </div>

        {/* Add row */}
        <div className="flex items-center gap-2 p-2.5 rounded-[10px]" style={{ backgroundColor: theme.surface1, border: `1px solid ${theme.border}` }}>
          <input
            type="text"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder="домен, например example.com"
            className="flex-1 px-3 py-1.5 rounded-[7px] text-[12px] font-mono focus:outline-none"
            style={{ backgroundColor: theme.surface2, color: theme.textPrimary, border: `1px solid ${theme.border}` }}
          />
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            className="px-3 py-1.5 rounded-[7px] text-[12px] focus:outline-none"
            style={{ backgroundColor: theme.surface2, color: theme.textPrimary, border: `1px solid ${theme.border}` }}
          >
            <option value="bypass">Обходить</option>
            <option value="ignore">Не трогать</option>
          </select>
          <AppButton variant="primary" size="md" accent={accent} icon={Plus} onClick={addSite}>
            Добавить
          </AppButton>
        </div>
      </div>

      {/* Table or Empty States */}
      <div className="flex-1 rounded-[12px] overflow-hidden flex flex-col" style={{ backgroundColor: theme.surface1, border: `1px solid ${theme.border}` }}>
        {filtered.length > 0 ? (
          <div className="overflow-y-auto divide-y divide-white/5">
            {filtered.map((item) => (
              <div key={item.id} className="px-4 py-2.5 flex items-center justify-between text-[12px]">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-medium" style={{ color: theme.textPrimary }}>{item.domain}</span>
                  <span
                    className="px-2 py-0.5 rounded text-[11px]"
                    style={{
                      backgroundColor: item.type === 'bypass' ? accent.soft : theme.surface3,
                      color: item.type === 'bypass' ? '#FFFFFF' : theme.textSecondary,
                    }}
                  >
                    {item.type === 'bypass' ? 'Обходить' : 'Не трогать'}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-[11px]" style={{ color: theme.textMuted }}>{item.added}</span>
                  <Toggle
                    checked={item.enabled}
                    onChange={(v) => setSites(sites.map((x) => (x.id === item.id ? { ...x, enabled: v } : x)))}
                    accent={accent}
                  />
                  <button
                    type="button"
                    onClick={() => setSites(sites.filter((x) => x.id !== item.id))}
                    className="p-1 rounded hover:bg-white/5"
                    style={{ color: theme.textMuted }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <Globe className="w-8 h-8 mb-2" style={{ color: theme.textMuted }} />
            <div className="text-[14px] font-semibold" style={{ color: theme.textPrimary }}>
              {tab === 'empty_search' || search
                ? 'Поиск ничего не нашёл'
                : 'Своих сайтов пока нет — основные списки уже встроены'}
            </div>
            <p className="text-[12px] mt-1" style={{ color: theme.textSecondary }}>
              {tab === 'empty_search' || search
                ? 'Попробуйте изменить запрос или сбросить фильтр вкладок'
                : 'Discord, YouTube и основные сервисы уже работают автоматически'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function DiagnosticsScreen({ theme, accent, showToast }) {
  const targets = [
    {
      name: 'YouTube',
      ok: true,
      steps: [
        { label: 'DNS · 142.250.74.110 · 14 мс', status: 'success' },
        { label: 'TCP · 28 мс', status: 'success' },
        { label: 'TLS · 41 мс ✓', status: 'success' },
      ],
    },
    {
      name: 'Видеопоток YouTube (googlevideo)',
      ok: false,
      steps: [
        { label: 'DNS · 172.217.16.138 · 11 мс', status: 'success' },
        { label: 'TCP · 19 мс', status: 'success' },
        { label: 'TLS · заблокировано', status: 'danger' },
      ],
    },
    {
      name: 'Discord — шлюз',
      ok: true,
      steps: [
        { label: 'DNS · 162.159.135.232 · 12 мс', status: 'success' },
        { label: 'TCP · 34 мс', status: 'success' },
        { label: 'TLS · 52 мс ✓', status: 'success' },
      ],
    },
    {
      name: 'Discord — голосовые серверы',
      ok: true,
      steps: [
        { label: 'DNS · 66.22.244.70 · 15 мс', status: 'success' },
        { label: 'TCP · 39 мс', status: 'success' },
        { label: 'TLS · 49 мс ✓', status: 'success' },
      ],
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-5 flex flex-col justify-between space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[16px] font-semibold" style={{ color: theme.textPrimary }}>Диагностика доступности</h1>
          <p className="text-[12px]" style={{ color: theme.textSecondary }}>Пошаговая проверка цепочки соединения DNS → TCP → TLS</p>
        </div>
        <AppButton variant="primary" size="md" accent={accent} icon={Play} onClick={() => showToast('Проверка диагностических целей обновлена')}>
          Запустить проверку
        </AppButton>
      </div>

      <div className="space-y-2.5">
        {targets.map((t) => (
          <div key={t.name} className="p-3.5 rounded-[12px] flex items-center justify-between" style={{ backgroundColor: theme.surface1, border: `1px solid ${t.ok ? theme.border : STATUS.danger.border}` }}>
            <div className="flex items-center gap-2.5">
              <StatusDot status={t.ok ? 'success' : 'danger'} size={8} />
              <span className="text-[13px] font-semibold" style={{ color: theme.textPrimary }}>{t.name}</span>
            </div>
            <div className="flex items-center gap-2">
              {t.steps.map((s, idx) => (
                <React.Fragment key={s.label}>
                  <span
                    className="px-2.5 py-1 rounded-[7px] font-mono text-[11px]"
                    style={{
                      backgroundColor: s.status === 'success' ? STATUS.success.bg : STATUS.danger.bg,
                      color: s.status === 'success' ? '#86EFAC' : '#FCA5A5',
                      border: `1px solid ${s.status === 'success' ? STATUS.success.border : STATUS.danger.border}`,
                    }}
                  >
                    {s.label}
                  </span>
                  {idx < t.steps.length - 1 && <span style={{ color: theme.textMuted }}>→</span>}
                </React.Fragment>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="p-3.5 rounded-[12px] flex items-center justify-between" style={{ backgroundColor: theme.surface1, border: `1px solid ${theme.border}` }}>
        <span className="text-[13px] font-semibold" style={{ color: theme.textPrimary }}>Итог: Отвечают 3 из 4 целей</span>
        <span className="text-[12px]" style={{ color: theme.textSecondary }}>Для видеопотока YouTube требуется включить обход или запустить автоподбор</span>
      </div>
    </div>
  );
}

function LogsScreen({ theme, showToast }) {
  const [levelFilter, setLevelFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [paused, setPaused] = useState(false);

  const filtered = LOG_LINES.filter((l) => {
    if (levelFilter !== 'all' && l.level !== levelFilter) return false;
    if (sourceFilter !== 'all' && l.source !== sourceFilter) return false;
    return true;
  });

  const levelBadge = {
    info: { label: 'инфо', color: '#93C5FD', bg: 'rgba(59,130,246,0.12)' },
    success: { label: 'успех', color: '#86EFAC', bg: STATUS.success.bg },
    warning: { label: 'предупр', color: '#FCD34D', bg: STATUS.warning.bg },
    error: { label: 'ошибка', color: '#FCA5A5', bg: STATUS.danger.bg },
  };

  return (
    <div className="flex-1 overflow-y-auto p-5 flex flex-col justify-between space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-[8px] text-[12px]"
            style={{ backgroundColor: theme.surface1, color: theme.textPrimary, border: `1px solid ${theme.border}` }}
          >
            <option value="all">Все уровни</option>
            <option value="info">Инфо</option>
            <option value="success">Успех</option>
            <option value="warning">Предупреждение</option>
            <option value="error">Ошибка</option>
          </select>

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-[8px] text-[12px]"
            style={{ backgroundColor: theme.surface1, color: theme.textPrimary, border: `1px solid ${theme.border}` }}
          >
            <option value="all">Все источники</option>
            <option value="Ядро">Ядро</option>
            <option value="Подбор">Подбор</option>
            <option value="Прокси">Прокси</option>
            <option value="Telegram">Telegram</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <AppButton variant="secondary" size="sm" icon={Pause} onClick={() => setPaused(!paused)}>
            {paused ? 'Продолжить' : 'Пауза'}
          </AppButton>
          <AppButton variant="secondary" size="sm" icon={Copy} onClick={() => showToast('Журнал скопирован')}>
            Копировать
          </AppButton>
          <AppButton variant="secondary" size="sm" icon={Trash2} onClick={() => showToast('Экран журнала очищен')}>
            Очистить
          </AppButton>
          <AppButton variant="secondary" size="sm" icon={FolderOpen} onClick={() => showToast('Открыта папка logs/')}>
            Открыть папку журналов
          </AppButton>
        </div>
      </div>

      <div className="flex-1 rounded-[12px] p-3 font-mono text-[11px] space-y-1.5 overflow-y-auto" style={{ backgroundColor: theme.surface1, border: `1px solid ${theme.border}` }}>
        {filtered.map((line) => {
          const b = levelBadge[line.level];
          return (
            <div key={line.id} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-white/[0.02]">
              <span style={{ color: theme.textMuted }}>{line.time}</span>
              <span className="px-1.5 py-0.2 rounded text-[11px]" style={{ backgroundColor: b.bg, color: b.color }}>{b.label}</span>
              <span className="px-1.5 py-0.2 rounded text-[11px]" style={{ backgroundColor: theme.surface2, color: theme.textSecondary }}>[{line.source}]</span>
              <span className="truncate" style={{ color: theme.textPrimary }}>{line.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SettingsScreen({
  themeKey,
  setThemeKey,
  accentKey,
  setAccentKey,
  onOpenWizard,
  onOpenUpdateModal,
  showToast,
}) {
  const theme = THEMES[themeKey];
  const accent = ACCENTS[accentKey];
  const [closeMode, setCloseMode] = useState('tray');
  const [autoUpdate, setAutoUpdate] = useState(true);

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {/* 1. Внешний вид */}
        <div className="rounded-[12px] p-3.5 space-y-2.5" style={{ backgroundColor: theme.surface1, border: `1px solid ${theme.border}` }}>
          <div className="text-[13px] font-semibold" style={{ color: theme.textPrimary }}>Внешний вид</div>
          <div className="grid grid-cols-2 gap-2">
            {Object.values(THEMES).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setThemeKey(t.id)}
                className="p-2.5 rounded-[9px] text-left transition-all"
                style={{
                  backgroundColor: t.bg,
                  border: themeKey === t.id ? `1.5px solid ${accent.hex}` : `1px solid ${theme.border}`,
                }}
              >
                <div className="text-[12px] font-semibold" style={{ color: '#EDEDEF' }}>{t.name}</div>
                <div className="text-[11px] font-mono mt-0.5" style={{ color: '#A1A1AA' }}>{t.bg}</div>
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-[12px]" style={{ color: theme.textSecondary }}>Цвет акцента:</span>
            <div className="flex items-center gap-2">
              {Object.values(ACCENTS).map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAccentKey(a.id)}
                  className="w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: a.hex, outline: accentKey === a.id ? '2px solid white' : 'none', outlineOffset: 2 }}
                  title={a.name}
                />
              ))}
            </div>
          </div>
        </div>

        {/* 2. Поведение & 3. Обновления */}
        <div className="rounded-[12px] p-3.5 space-y-2.5" style={{ backgroundColor: theme.surface1, border: `1px solid ${theme.border}` }}>
          <div className="text-[13px] font-semibold" style={{ color: theme.textPrimary }}>Поведение и обновления</div>
          <div className="flex items-center justify-between text-[12px]">
            <span style={{ color: theme.textSecondary }}>При закрытии окна:</span>
            <select
              value={closeMode}
              onChange={(e) => setCloseMode(e.target.value)}
              className="px-2.5 py-1 rounded-[7px] text-[12px]"
              style={{ backgroundColor: theme.surface2, color: theme.textPrimary, border: `1px solid ${theme.border}` }}
            >
              <option value="tray">Сворачивать в трей</option>
              <option value="exit">Закрывать полностью</option>
            </select>
          </div>
          <div className="flex items-center justify-between text-[12px]">
            <div>
              <div style={{ color: theme.textPrimary }}>Текущая версия v0.4.2</div>
              <div className="text-[11px]" style={{ color: theme.textMuted }}>Проверялось: сегодня в 21:10</div>
            </div>
            <AppButton variant="secondary" size="sm" icon={RefreshCw} onClick={onOpenUpdateModal}>
              Проверить обновления
            </AppButton>
          </div>
          <div className="flex items-center justify-between text-[12px]">
            <span style={{ color: theme.textSecondary }}>Автоматическая проверка обновлений</span>
            <Toggle checked={autoUpdate} onChange={setAutoUpdate} accent={accent} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* 4. Discord Cache */}
        <div className="rounded-[12px] p-3.5 space-y-2" style={{ backgroundColor: theme.surface1, border: `1px solid ${theme.border}` }}>
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold" style={{ color: theme.textPrimary }}>Discord — очистка кэша</span>
            <span className="text-[11px] text-[#4ADE80]">вход и настройки не трогаем</span>
          </div>
          <div className="px-3 py-2 rounded-[8px] flex items-center justify-between text-[12px]" style={{ backgroundColor: theme.surface2 }}>
            <span style={{ color: theme.textPrimary }}>Найдена сборка: <strong>Discord — 412 МБ</strong></span>
            <AppButton variant="secondary" size="sm" icon={Trash2} onClick={() => showToast('Discord закрыт, кэш 412 МБ очищен')}>
              Закрыть Discord и очистить
            </AppButton>
          </div>
        </div>

        {/* 5. Настройка заново & 6. Обслуживание */}
        <div className="rounded-[12px] p-3.5 space-y-2" style={{ backgroundColor: theme.surface1, border: `1px solid ${theme.border}` }}>
          <div className="text-[13px] font-semibold" style={{ color: theme.textPrimary }}>Настройка заново и обслуживание</div>
          <div className="flex flex-wrap gap-2">
            <AppButton variant="secondary" size="sm" icon={Sparkles} onClick={onOpenWizard}>
              Открыть мастер настройки
            </AppButton>
            <AppButton variant="secondary" size="sm" icon={Cpu} onClick={() => showToast('Зависшие копии winws.exe выгружены')}>
              Очистить зависшие копии ядра
            </AppButton>
            <AppButton variant="secondary" size="sm" icon={FolderOpen} onClick={() => showToast('Открыта папка программы')}>
              Открыть папку программы
            </AppButton>
          </div>
        </div>
      </div>

      {/* 7. О программе */}
      <div className="rounded-[12px] px-4 py-2.5 flex items-center justify-between text-[12px]" style={{ backgroundColor: theme.surface1, border: `1px solid ${theme.border}` }}>
        <div className="flex items-center gap-4" style={{ color: theme.textSecondary }}>
          <span><strong style={{ color: theme.textPrimary }}>О программе:</strong> ядро zapret v72.13</span>
          <span>Драйвер: WinDivert 2.2</span>
        </div>
        <button type="button" onClick={() => showToast('Открываем репозиторий на GitHub')} className="flex items-center gap-1 hover:underline" style={{ color: accent.hex }}>
          <span>GitHub проекта</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function UpdateModal({ theme, accent, onClose }) {
  const [downloading, setDownloading] = useState(false);
  return (
    <div className="absolute inset-0 z-40 bg-black/75 flex items-center justify-center p-6">
      <div className="w-full max-w-[460px] rounded-[14px] p-5 space-y-4" style={{ backgroundColor: theme.surface1, border: `1px solid ${theme.borderStrong}` }}>
        <div className="flex items-center justify-between">
          <div>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono" style={{ backgroundColor: accent.soft, color: accent.hex }}>Обновление</span>
            <h2 className="text-[16px] font-semibold mt-1" style={{ color: theme.textPrimary }}>Доступна версия 0.4.3</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-white/5" style={{ color: theme.textSecondary }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {!downloading ? (
          <>
            <div className="p-3.5 rounded-[10px] space-y-1.5 text-[12px]" style={{ backgroundColor: theme.surface2, color: theme.textSecondary }}>
              <div className="font-semibold" style={{ color: theme.textPrimary }}>Что нового:</div>
              <div>• Добавлено 4 новых способа обхода для серверов видеопотока YouTube.</div>
              <div>• Ускорена проверка страницы входа Discord в браузере.</div>
              <div>• Автоматическое обнаружение конфликта с локальным прокси.</div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <AppButton variant="secondary" size="md" onClick={onClose}>Позже</AppButton>
              <AppButton variant="primary" size="md" accent={accent} icon={Download} onClick={() => setDownloading(true)}>
                Установить
              </AppButton>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: theme.surface3 }}>
              <div className="h-full rounded-full" style={{ width: '74%', backgroundColor: accent.hex }} />
            </div>
            <div className="space-y-1.5 text-[12px]">
              <div className="flex items-center justify-between px-3 py-1.5 rounded-[7px]" style={{ backgroundColor: STATUS.success.bg, color: '#86EFAC' }}>
                <span>1. Скачивание пакета обновления (14,2 МБ)</span>
                <Check className="w-3.5 h-3.5" />
              </div>
              <div className="flex items-center justify-between px-3 py-1.5 rounded-[7px]" style={{ backgroundColor: accent.soft, color: '#FFFFFF' }}>
                <span>2. Проверка контрольной суммы SHA-256</span>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              </div>
              <div className="flex items-center justify-between px-3 py-1.5 rounded-[7px] opacity-55" style={{ backgroundColor: theme.surface2, color: theme.textMuted }}>
                <span>3. Перезапуск программы</span>
                <Clock className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DesignSystemSheet({ accentKey, setAccentKey }) {
  const accent = ACCENTS[accentKey];
  const black = THEMES.black;
  const dark = THEMES.dark;

  return (
    <div className="max-w-[1080px] mx-auto space-y-6 pb-10">
      {/* 1. Colors of Both Themes & Accents */}
      <div className="rounded-[14px] p-5 space-y-4" style={{ backgroundColor: '#0B0B0D', border: '1px solid rgba(255,255,255,0.08)' }}>
        <h2 className="text-[16px] font-semibold text-white">1. Цветовые токены обеих тем и статусные цвета</h2>
        <div className="grid grid-cols-2 gap-4">
          {[black, dark].map((t) => (
            <div key={t.id} className="p-4 rounded-[12px] space-y-2.5" style={{ backgroundColor: t.bg, border: '1px solid rgba(255,255,255,0.1)' }}>
              <div className="text-[13px] font-semibold text-white">Тема «{t.name}»</div>
              <div className="grid grid-cols-4 gap-2 text-[11px] font-mono">
                <div className="p-2 rounded" style={{ backgroundColor: t.bg, border: '1px solid rgba(255,255,255,0.12)' }}>Фон<br />{t.bg}</div>
                <div className="p-2 rounded" style={{ backgroundColor: t.surface1 }}>Слой 1<br />{t.surface1}</div>
                <div className="p-2 rounded" style={{ backgroundColor: t.surface2 }}>Слой 2<br />{t.surface2}</div>
                <div className="p-2 rounded" style={{ backgroundColor: t.surface3 }}>Слой 3<br />{t.surface3}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-3 text-[12px]">
          <div className="p-3 rounded-[10px]" style={{ backgroundColor: STATUS.success.bg, border: `1px solid ${STATUS.success.border}`, color: '#86EFAC' }}>
            Зелёный #22C55E — работает, проверено
          </div>
          <div className="p-3 rounded-[10px]" style={{ backgroundColor: STATUS.warning.bg, border: `1px solid ${STATUS.warning.border}`, color: '#FCD34D' }}>
            Янтарный #F59E0B — предупреждение, через раз
          </div>
          <div className="p-3 rounded-[10px]" style={{ backgroundColor: STATUS.danger.bg, border: `1px solid ${STATUS.danger.border}`, color: '#FCA5A5' }}>
            Красный #EF4444 — ошибка, мешает работе
          </div>
          <div className="p-3 rounded-[10px]" style={{ backgroundColor: STATUS.neutral.bg, border: `1px solid ${STATUS.neutral.border}`, color: '#A1A1AA' }}>
            Серый #6B6B76 — выключено, не проверялось
          </div>
        </div>
      </div>

      {/* 2. Typography & Buttons in All States */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-5 rounded-[14px] p-5 space-y-3" style={{ backgroundColor: '#0B0B0D', border: '1px solid rgba(255,255,255,0.08)' }}>
          <h2 className="text-[15px] font-semibold text-white">2. Шрифты и размеры</h2>
          <div className="space-y-2 text-[#EDEDEF]">
            <div className="text-[17px] font-semibold">Inter 17px Semibold — Заголовок экрана</div>
            <div className="text-[14px] font-medium">Inter 14px Medium — Важный статус и карточки</div>
            <div className="text-[12px] text-[#A1A1AA]">Inter 12px Regular — Вторичный поясняющий текст</div>
            <div className="text-[11px] text-[#6B6B76]">Inter 11px — Минимальный служебный текст и бейджи</div>
            <div className="text-[12px] font-mono p-2 rounded bg-[#121214] text-[#A1A1AA]">JetBrains Mono 12px — winws.exe / 127.0.0.1:1443</div>
          </div>
        </div>

        <div className="col-span-7 rounded-[14px] p-5 space-y-3" style={{ backgroundColor: '#0B0B0D', border: '1px solid rgba(255,255,255,0.08)' }}>
          <h2 className="text-[15px] font-semibold text-white">3. Кнопки, переключатели, чипы и поля ввода</h2>
          <div className="flex flex-wrap items-center gap-2.5">
            <AppButton variant="primary" accent={accent} icon={Sparkles}>Главная кнопка</AppButton>
            <AppButton variant="secondary" icon={RefreshCw}>Вторичная</AppButton>
            <AppButton variant="danger" icon={Square}>Опасная</AppButton>
            <AppButton variant="ghost">Призрачная</AppButton>
            <AppButton variant="primary" accent={accent} disabled>Неактивна</AppButton>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <span className="px-2.5 py-1 rounded-[8px] text-[12px] flex items-center gap-1.5 bg-[#121214] border border-white/10 text-white">
              <StatusDot status="pass" size={6} /> multidisorder без фейков
            </span>
            <span className="px-2.5 py-1 rounded-[8px] text-[12px] flex items-center gap-1.5 bg-[#121214] border border-white/10 text-[#A1A1AA]">
              <StatusDot status="fail" size={6} /> hostfakesplit
            </span>
            <span className="px-2.5 py-1 rounded-[8px] text-[12px] flex items-center gap-1.5 bg-[#121214] border border-white/10 text-[#A1A1AA]">
              fakedsplit (не проверялся)
            </span>
            <Toggle checked={true} accent={accent} />
            <Toggle checked={false} accent={accent} />
          </div>
        </div>
      </div>

      {/* 3. All 9 States of Discovery Rows */}
      <div className="rounded-[14px] p-5 space-y-2.5" style={{ backgroundColor: '#0B0B0D', border: '1px solid rgba(255,255,255,0.08)' }}>
        <h2 className="text-[15px] font-semibold text-white">4. Строки списка подбора во всех 9 состояниях</h2>
        <div className="grid grid-cols-1 gap-1.5">
          {DISCOVERY_ROWS.slice(0, 9).map((row) => (
            <DiscoveryRowItem key={row.id} row={row} theme={black} />
          ))}
        </div>
      </div>
    </div>
  );
}

function triggerFileDownload(filename, content, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function copyTextSafe(text, onSuccess) {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    if (onSuccess) onSuccess();
  } catch (err) {
    if (onSuccess) onSuccess();
  }
}

function buildStandaloneHtmlBundle(defaultThemeId = 'black', defaultAccentId = 'violet') {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Zapret2 Control Center — Автономный макет</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #000000;
      --surface-1: #0B0B0D;
      --surface-2: #121214;
      --surface-3: #1A1A1D;
      --border: rgba(255, 255, 255, 0.07);
      --border-strong: rgba(255, 255, 255, 0.13);
      --text-primary: #EDEDEF;
      --text-secondary: #A1A1AA;
      --text-muted: #6B6B76;
      --accent: #7C6CFF;
      --accent-soft: rgba(124, 108, 255, 0.15);
      --accent-border: rgba(124, 108, 255, 0.42);
      --success: #22C55E;
      --warning: #F59E0B;
      --danger: #EF4444;
    }
    [data-theme="dark"] {
      --bg: #0E0F12;
      --surface-1: #15161A;
      --surface-2: #1C1D22;
      --surface-3: #24252B;
      --border: rgba(255, 255, 255, 0.08);
      --border-strong: rgba(255, 255, 255, 0.15);
    }
    body {
      background: #070709;
      color: var(--text-primary);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI Variable', sans-serif;
      margin: 0;
      user-select: none;
    }
    .font-mono { font-family: 'JetBrains Mono', monospace; }
    .app-window {
      width: 1040px;
      height: 720px;
      background: var(--bg);
      border: 1px solid var(--border-strong);
      border-radius: 14px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 25px 60px rgba(0,0,0,0.65);
    }
    .surface-1 { background: var(--surface-1); border: 1px solid var(--border); }
    .surface-2 { background: var(--surface-2); border: 1px solid var(--border); }
  </style>
</head>
<body class="min-h-screen flex flex-col items-center justify-center p-4" data-theme="${defaultThemeId}">
  <div class="mb-3 flex items-center gap-2 text-xs">
    <button onclick="document.body.dataset.theme = document.body.dataset.theme === 'black' ? 'dark' : 'black'" class="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white font-medium">
      Переключить тему («Чёрная» / «Тёмная»)
    </button>
    <button onclick="toggleBypass()" class="px-3 py-1.5 rounded-lg bg-[#7C6CFF] text-white font-medium">
      Переключить состояние обхода
    </button>
  </div>

  <div class="app-window">
    <!-- Полоса заголовка 40px -->
    <div class="h-[40px] px-3.5 flex items-center justify-between surface-1 border-b">
      <div class="flex items-center gap-2">
        <span class="font-semibold tracking-wider text-[12px]">ZAPRET 2</span>
        <span class="px-1.5 py-0.5 rounded text-[11px] font-mono surface-2 text-[#A1A1AA]">v0.4.2</span>
        <span class="px-1.5 py-0.5 rounded text-[11px] font-medium bg-[#22C55E]/15 text-[#4ADE80] border border-[#22C55E]/30">ADMIN</span>
        <span class="px-2 py-0.5 rounded text-[11px] surface-2 text-[#A1A1AA] flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-[#22C55E]"></span>WinDivert 64-bit
        </span>
      </div>
      <div class="text-[11px] text-[#A1A1AA]">Свернуть в трей · ✕</div>
    </div>

    <div class="flex-1 flex min-h-0">
      <!-- Боковое меню -->
      <div class="w-[212px] p-3 flex flex-col justify-between surface-1 border-r">
        <div class="space-y-1 text-[13px]">
          <div class="px-3 py-2 rounded-lg bg-[#7C6CFF]/15 border border-[#7C6CFF]/40 text-white font-medium">Главная</div>
          <div class="px-3 py-2 rounded-lg text-[#A1A1AA]">Подбор</div>
          <div class="px-3 py-2 rounded-lg text-[#A1A1AA] flex justify-between"><span>Telegram</span><span class="text-[11px] px-1.5 rounded bg-[#22C55E]/15 text-[#4ADE80]">вкл</span></div>
          <div class="px-3 py-2 rounded-lg text-[#A1A1AA]">Списки сайтов</div>
          <div class="px-3 py-2 rounded-lg text-[#A1A1AA]">Диагностика</div>
          <div class="px-3 py-2 rounded-lg text-[#A1A1AA]">Журнал</div>
          <div class="px-3 py-2 rounded-lg text-[#A1A1AA]">Настройки</div>
        </div>
        <div id="sidebar-status" class="p-2.5 rounded-lg surface-2 text-[12px] text-[#A1A1AA]">● Обход выключен</div>
      </div>

      <!-- Главная область -->
      <div class="flex-1 p-5 space-y-3.5 overflow-y-auto">
        <div id="hero-card" class="rounded-[14px] p-5 surface-1 flex flex-col items-center text-center">
          <button id="power-btn" onclick="toggleBypass()" class="w-[112px] h-[112px] rounded-full surface-2 border-2 border-white/15 flex flex-col items-center justify-center transition-all">
            <span id="power-label" class="text-[13px] font-semibold">Включить</span>
          </button>
          <h2 id="hero-title" class="text-[15px] font-semibold mt-3">Обход выключен — трафик идёт как обычно</h2>
          <p id="hero-sub" class="text-[12px] text-[#A1A1AA] mt-0.5">Нажмите кнопку, чтобы Discord и YouTube открывались без ограничений</p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="rounded-[12px] p-3.5 surface-1 space-y-2">
            <div class="flex justify-between items-center">
              <span class="text-[13px] font-semibold">Что сейчас настроено</span>
              <span class="text-[12px] px-2.5 py-1 rounded surface-2">Подобрать заново</span>
            </div>
            <div class="px-3 py-2 rounded-lg surface-2 flex justify-between text-[12px]"><span>Discord</span><span class="text-[#4ADE80]">multidisorder · проверено подбором ✓</span></div>
            <div class="px-3 py-2 rounded-lg surface-2 flex justify-between text-[12px]"><span>YouTube</span><span class="text-[#4ADE80]">multidisorder · проверено подбором ✓</span></div>
          </div>
          <div class="rounded-[12px] p-3.5 surface-1 space-y-2">
            <div class="flex justify-between items-center">
              <span class="text-[13px] font-semibold">Проверка компьютера</span>
              <span class="text-[12px] px-2.5 py-1 rounded surface-2">Проверить снова</span>
            </div>
            <div class="p-2.5 rounded-lg surface-2 text-[12px] text-[#A1A1AA]">
              <span class="text-[#4ADE80] font-medium">Помех нет:</span> прокси выключен, VPN не перехватывает трафик, лишних копий ядра нет.
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    let isOn = false;
    function toggleBypass() {
      isOn = !isOn;
      const btn = document.getElementById('power-btn');
      const label = document.getElementById('power-label');
      const title = document.getElementById('hero-title');
      const sub = document.getElementById('hero-sub');
      const side = document.getElementById('sidebar-status');
      if (isOn) {
        btn.style.borderColor = '#22C55E';
        btn.style.background = 'rgba(34,197,94,0.14)';
        btn.style.boxShadow = '0 0 36px rgba(34,197,94,0.26)';
        label.textContent = 'Включено';
        label.style.color = '#4ADE80';
        title.textContent = 'Обход работает';
        sub.textContent = '1 ч 12 мин · Обработано соединений: 2 341 · Сайтов распознано: 87';
        side.textContent = '● Обход включён · 1 ч 12 мин';
        side.style.color = '#4ADE80';
      } else {
        btn.style.borderColor = 'rgba(255,255,255,0.15)';
        btn.style.background = 'var(--surface-2)';
        btn.style.boxShadow = 'none';
        label.textContent = 'Включить';
        label.style.color = '#EDEDEF';
        title.textContent = 'Обход выключен — трафик идёт как обычно';
        sub.textContent = 'Нажмите кнопку, чтобы Discord и YouTube открывались без ограничений';
        side.textContent = '● Обход выключен';
        side.style.color = '#A1A1AA';
      }
    }
  </script>
</body>
</html>`;
}

function buildDesignTokensCss() {
  return `/* Zapret2 Control Center — Дизайн-токены (CSS Variables) */
:root, [data-theme="black"] {
  --bg-app: #000000;
  --surface-1: #0B0B0D;
  --surface-2: #121214;
  --surface-3: #1A1A1D;
  --border-subtle: rgba(255, 255, 255, 0.07);
  --border-strong: rgba(255, 255, 255, 0.13);

  --text-primary: #EDEDEF;
  --text-secondary: #A1A1AA;
  --text-muted: #6B6B76;

  /* Акценты */
  --accent-primary: #7C6CFF;
  --accent-soft: rgba(124, 108, 255, 0.15);
  --accent-border: rgba(124, 108, 255, 0.42);

  /* Статусные цвета (никогда не смешиваются с акцентом) */
  --status-success: #22C55E;
  --status-warning: #F59E0B;
  --status-danger: #EF4444;
  --status-neutral: #6B6B76;

  /* Размеры окна */
  --window-default-w: 1040px;
  --window-default-h: 720px;
  --window-min-w: 840px;
  --window-min-h: 580px;
  --titlebar-h: 40px;
}

[data-theme="dark"] {
  --bg-app: #0E0F12;
  --surface-1: #15161A;
  --surface-2: #1C1D22;
  --surface-3: #24252B;
  --border-subtle: rgba(255, 255, 255, 0.08);
  --border-strong: rgba(255, 255, 255, 0.15);
}`;
}

function buildIpcBridgeTemplate() {
  return `// src/bridge/zapretBridge.js
// Универсальный мост для Tauri v2 / Electron / C# WebView2 с безопасным фоллбэком для браузера

const isTauri = typeof window !== 'undefined' && Boolean(window.__TAURI__);
const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI);
const isWebView2 = typeof window !== 'undefined' && Boolean(window.chrome?.webview);

async function invokeBackend(command, payload = {}) {
  if (isTauri) {
    return window.__TAURI__.core.invoke(command, payload);
  }
  if (isElectron) {
    return window.electronAPI.invoke(command, payload);
  }
  if (isWebView2) {
    window.chrome.webview.postMessage({ command, payload });
    return { ok: true };
  }
  console.info('[ZapretBridge Mock]', command, payload);
  return { ok: true, mock: true };
}

export const zapretBridge = {
  // 1. Управление ядром winws.exe + WinDivert
  startBypass: (presetId) => invokeBackend('bypass_start', { presetId }),
  stopBypass: () => invokeBackend('bypass_stop'),
  getBypassStatus: () => invokeBackend('bypass_status'),

  // 2. Автоподбор стратегий
  startDiscovery: (scope = 'all') => invokeBackend('discovery_start', { scope }),
  stopDiscovery: () => invokeBackend('discovery_stop'),
  applyDiscoveredPreset: (preset) => invokeBackend('discovery_apply', { preset }),
  revertPreset: () => invokeBackend('discovery_revert'),

  // 3. Проверка компьютера на помехи (прокси, VPN, TCP Timestamps)
  checkSystemInterference: () => invokeBackend('system_check_interference'),
  enableTcpTimestamps: () => invokeBackend('system_enable_tcp_timestamps'),
  clearDiscordCache: () => invokeBackend('system_clear_discord_cache'),
  killOrphanCoreProcesses: () => invokeBackend('system_kill_orphan_winws'),

  // 4. Встроенный прокси-мост для Telegram (127.0.0.1:1443)
  toggleTelegramBridge: (enable) => invokeBackend('telegram_bridge_toggle', { enable }),
  rotateTelegramSecret: () => invokeBackend('telegram_bridge_rotate_secret'),

  // 5. Управление безрамочным окном (1040x720 / min 840x580)
  minimizeToTray: () => invokeBackend('window_minimize_to_tray'),
  closeWindow: () => invokeBackend('window_close'),
};
`;
}

function DeveloperHandoffSheet({ theme, accent, showToast }) {
  const setupCmd = `npm create vite@latest zapret2-ui -- --template react
cd zapret2-ui
npm install lucide-react framer-motion
npm install -D tailwindcss postcss autoprefixer`;

  const ipcRows = [
    { action: 'Главная кнопка питания (Включить / Выкл)', cmd: 'bypass_start / bypass_stop', detail: 'Запускает или останавливает winws.exe с выбранными аргументами --dpi-desync' },
    { action: 'Карточка «Проверка компьютера»', cmd: 'system_check_interference', detail: 'Проверяет системный прокси 127.0.0.1, активные TUN/VPN-интерфейсы и netsh int tcp show global' },
    { action: 'Кнопка «Включить» метки времени TCP', cmd: 'system_enable_tcp_timestamps', detail: 'Выполняет netsh int tcp set global timestamps=enabled с правами администратора' },
    { action: 'Экран «Подбор» -> Собрать пресет', cmd: 'discovery_start(scope)', detail: 'Прогоняет список стратегий по целям Discord/YouTube и шлёт события прогресса строк' },
    { action: 'Экран «Telegram» -> Запустить мост', cmd: 'telegram_bridge_toggle', detail: 'Поднимает локальный MTProto/WebTransport мост на 127.0.0.1:1443 и формирует ссылку tg://proxy' },
    { action: 'Настройки -> Очистка кэша Discord', cmd: 'system_clear_discord_cache', detail: 'Завершает Discord.exe и очищает %AppData%/discord/Cache, Code Cache, GPUCache' },
  ];

  return (
    <div className="max-w-[1080px] mx-auto space-y-5 pb-10">
      {/* Карточки быстрого скачивания */}
      <div className="rounded-[14px] p-5 space-y-4" style={{ backgroundColor: '#0B0B0D', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[17px] font-semibold text-white">Скачать файлы для реализации</h2>
            <p className="text-[12px] text-[#A1A1AA] mt-0.5">
              Нажмите на нужную кнопку ниже — браузер сразу сохранит готовый файл к вам на компьютер
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-[7px] text-[11px] font-mono" style={{ backgroundColor: accent.soft, color: accent.hex }}>
            Ready for Tauri / Electron / WebView2
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3.5">
          <div className="p-4 rounded-[12px] flex flex-col justify-between space-y-3" style={{ backgroundColor: '#121214', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div>
              <div className="text-[14px] font-semibold text-white">1. Автономный HTML-прототип</div>
              <p className="text-[12px] text-[#A1A1AA] mt-1 leading-relaxed">
                Единый файл <span className="font-mono text-white">zapret2-prototype.html</span>. Открывается двойным кликом в любом браузере без установки Node.js.
              </p>
            </div>
            <AppButton
              variant="primary"
              accent={accent}
              icon={Download}
              onClick={() => {
                triggerFileDownload('zapret2-prototype.html', buildStandaloneHtmlBundle(theme.id, accent.id), 'text/html;charset=utf-8');
                showToast('Файл zapret2-prototype.html скачан');
              }}
            >
              Скачать .HTML
            </AppButton>
          </div>

          <div className="p-4 rounded-[12px] flex flex-col justify-between space-y-3" style={{ backgroundColor: '#121214', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div>
              <div className="text-[14px] font-semibold text-white">2. Дизайн-токены (CSS)</div>
              <p className="text-[12px] text-[#A1A1AA] mt-1 leading-relaxed">
                Файл <span className="font-mono text-white">zapret2-tokens.css</span> с цветами обеих тем («Чёрная» OLED и «Тёмная» Графит), статусными цветами и размерами окна.
              </p>
            </div>
            <AppButton
              variant="secondary"
              icon={Download}
              onClick={() => {
                triggerFileDownload('zapret2-tokens.css', buildDesignTokensCss(), 'text/css;charset=utf-8');
                showToast('Файл zapret2-tokens.css скачан');
              }}
            >
              Скачать tokens.css
            </AppButton>
          </div>

          <div className="p-4 rounded-[12px] flex flex-col justify-between space-y-3" style={{ backgroundColor: '#121214', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div>
              <div className="text-[14px] font-semibold text-white">3. Мост к ядру (IPC Bridge)</div>
              <p className="text-[12px] text-[#A1A1AA] mt-1 leading-relaxed">
                Готовый модуль <span className="font-mono text-white">zapretBridge.js</span> для связи React-интерфейса с <span className="font-mono">winws.exe</span> через Tauri, Electron или WebView2.
              </p>
            </div>
            <AppButton
              variant="secondary"
              icon={Download}
              onClick={() => {
                triggerFileDownload('zapretBridge.js', buildIpcBridgeTemplate(), 'text/javascript;charset=utf-8');
                showToast('Файл zapretBridge.js скачан');
              }}
            >
              Скачать zapretBridge.js
            </AppButton>
          </div>
        </div>
      </div>

      {/* Быстрый старт React-проекта и структура файлов */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-6 rounded-[14px] p-5 space-y-3" style={{ backgroundColor: '#0B0B0D', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-white">Быстрый запуск в React (Vite / Tauri / Electron)</h3>
            <AppButton
              variant="secondary"
              size="sm"
              icon={Copy}
              onClick={() => copyTextSafe(setupCmd, () => showToast('Команды установки скопированы'))}
            >
              Копировать команды
            </AppButton>
          </div>
          <pre className="p-3.5 rounded-[10px] bg-[#121214] border border-white/5 text-[12px] font-mono text-[#EDEDEF] overflow-x-auto leading-relaxed">
            {setupCmd}
          </pre>
          <p className="text-[12px] text-[#A1A1AA] leading-relaxed">
            После создания проекта откройте вкладку <strong>Code</strong> в правом верхнем углу этого окна, скопируйте весь код и вставьте его в <span className="font-mono text-white">src/App.jsx</span> — все 12 экранов и переключение тем заработают сразу.
          </p>
        </div>

        <div className="col-span-6 rounded-[14px] p-5 space-y-3" style={{ backgroundColor: '#0B0B0D', border: '1px solid rgba(255,255,255,0.08)' }}>
          <h3 className="text-[15px] font-semibold text-white">Рекомендуемая структура для одного .exe</h3>
          <pre className="p-3.5 rounded-[10px] bg-[#121214] border border-white/5 text-[11px] font-mono text-[#A1A1AA] overflow-x-auto leading-relaxed">
{`zapret2-control-center/
├── bin/
│   ├── winws.exe              # Ядро zapret v72.13
│   ├── WinDivert.dll          # Библиотека перехвата
│   └── WinDivert64.sys        # Драйвер 64-bit
├── lists/
│   ├── list-general.txt       # Встроенные домены
│   ├── list-user.txt          # «Мои сайты»
│   └── list-exclude.txt       # «Исключения»
└── src/
    ├── bridge/zapretBridge.js # Вызовы ядра и трея
    ├── theme/tokens.css       # Темы «Чёрная» и «Тёмная»
    └── App.jsx                # Весь интерфейс (этот файл)`}
          </pre>
        </div>
      </div>

      {/* Таблица привязки кнопок интерфейса к командам ядра */}
      <div className="rounded-[14px] p-5 space-y-3" style={{ backgroundColor: '#0B0B0D', border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 className="text-[15px] font-semibold text-white">Карта привязки экрана к системным вызовам (IPC контракт)</h3>
        <div className="divide-y divide-white/5 rounded-[10px] overflow-hidden border border-white/10">
          {ipcRows.map((r) => (
            <div key={r.cmd} className="px-4 py-2.5 bg-[#121214] flex items-center justify-between gap-4 text-[12px]">
              <span className="font-medium text-white w-[28%]">{r.action}</span>
              <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-white/5 text-[#A78BFA] w-[25%] truncate">{r.cmd}</span>
              <span className="text-[#A1A1AA] flex-1">{r.detail}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [viewMode, setViewMode] = useState('app'); // 'app' | 'min_840' | 'dual_theme' | 'design_system' | 'export_guide'
  const [themeKey, setThemeKey] = useState('black');
  const [accentKey, setAccentKey] = useState('violet');
  const [activeTab, setActiveTab] = useState('home');
  const [bypassState, setBypassState] = useState('off'); // 'off' | 'connecting' | 'on'
  const [interferenceMode, setInterferenceMode] = useState(false);
  const [discoveryStage, setDiscoveryStage] = useState('before');
  const [telegramRunning, setTelegramRunning] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState('welcome');
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const theme = THEMES[themeKey];
  const accent = ACCENTS[accentKey];

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  const quickPresets = [
    { label: '1. Главная (выкл)', run: () => { setViewMode('app'); setActiveTab('home'); setBypassState('off'); setInterferenceMode(false); setWizardOpen(false); setUpdateModalOpen(false); } },
    { label: '2. Главная (вкл)', run: () => { setViewMode('app'); setActiveTab('home'); setBypassState('on'); setInterferenceMode(false); setWizardOpen(false); setUpdateModalOpen(false); } },
    { label: '3. Главная (помехи)', run: () => { setViewMode('app'); setActiveTab('home'); setBypassState('off'); setInterferenceMode(true); setWizardOpen(false); setUpdateModalOpen(false); } },
    { label: '4. Подбор', run: () => { setViewMode('app'); setActiveTab('discovery'); setWizardOpen(false); setUpdateModalOpen(false); } },
    { label: '5. Стратегии', run: () => { setViewMode('app'); setActiveTab('strategies'); setWizardOpen(false); setUpdateModalOpen(false); } },
    { label: '6. Мастер запуска', run: () => { setViewMode('app'); setWizardOpen(true); setUpdateModalOpen(false); } },
    { label: '7. Telegram', run: () => { setViewMode('app'); setActiveTab('telegram'); setWizardOpen(false); setUpdateModalOpen(false); } },
    { label: '8. Списки сайтов', run: () => { setViewMode('app'); setActiveTab('sites'); setWizardOpen(false); setUpdateModalOpen(false); } },
    { label: '9. Диагностика', run: () => { setViewMode('app'); setActiveTab('diagnostics'); setWizardOpen(false); setUpdateModalOpen(false); } },
    { label: '10. Журнал', run: () => { setViewMode('app'); setActiveTab('logs'); setWizardOpen(false); setUpdateModalOpen(false); } },
    { label: '11. Настройки', run: () => { setViewMode('app'); setActiveTab('settings'); setWizardOpen(false); setUpdateModalOpen(false); } },
    { label: '12. Окно обновления', run: () => { setViewMode('app'); setUpdateModalOpen(true); setWizardOpen(false); } },
  ];

  return (
    <div className="min-h-screen bg-[#070709] text-[#EDEDEF] p-4 font-sans select-none">
      {/* Top Reviewer Bar */}
      <div className="max-w-[1080px] mx-auto mb-3 p-2.5 rounded-[12px] bg-[#111115] border border-white/10 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'app', label: 'Окно 1040×720' },
              { id: 'min_840', label: 'Мин. окно 840×580' },
              { id: 'dual_theme', label: 'Сравнение тем' },
              { id: 'design_system', label: 'Дизайн-система' },
              { id: 'export_guide', label: '⬇ Скачать и интеграция' },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setViewMode(m.id)}
                className="px-3 py-1.5 rounded-[8px] text-[12px] font-medium transition-all"
                style={{
                  backgroundColor: viewMode === m.id ? accent.hex : 'rgba(255,255,255,0.05)',
                  color: '#FFFFFF',
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                triggerFileDownload('zapret2-prototype.html', buildStandaloneHtmlBundle(theme.id, accent.id), 'text/html;charset=utf-8');
                showToast('Файл zapret2-prototype.html сохранён');
              }}
              className="px-2.5 py-1 rounded-[7px] text-[12px] font-medium flex items-center gap-1.5 bg-[#22C55E]/15 text-[#86EFAC] border border-[#22C55E]/30 hover:bg-[#22C55E]/25"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Скачать .HTML</span>
            </button>
            <button
              type="button"
              onClick={() => setThemeKey(themeKey === 'black' ? 'dark' : 'black')}
              className="px-2.5 py-1 rounded-[7px] text-[12px] bg-white/5 border border-white/10"
            >
              Тема: {theme.name}
            </button>
          </div>
        </div>

        {/* Direct Jump to All 12 Screens */}
        <div className="flex flex-wrap gap-1 pt-1 border-t border-white/5">
          {quickPresets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={p.run}
              className="px-2 py-1 rounded-[6px] text-[11px] bg-white/[0.04] hover:bg-white/10 text-[#A1A1AA] hover:text-white transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* DELIVERABLE 1: Design System Sheet */}
      {viewMode === 'design_system' && (
        <DesignSystemSheet accentKey={accentKey} setAccentKey={setAccentKey} />
      )}

      {/* DELIVERABLE 5: Developer Handoff & 1-Click File Downloads */}
      {viewMode === 'export_guide' && (
        <DeveloperHandoffSheet theme={theme} accent={accent} showToast={showToast} />
      )}

      {/* DELIVERABLE 4: Main Screen in Both Themes Side-by-Side */}
      {viewMode === 'dual_theme' && (
        <div className="max-w-[1080px] mx-auto grid grid-cols-2 gap-4">
          {['black', 'dark'].map((tKey) => {
            const t = THEMES[tKey];
            return (
              <div
                key={tKey}
                className="rounded-[14px] overflow-hidden flex flex-col h-[640px]"
                style={{ backgroundColor: t.bg, border: `1px solid ${t.borderStrong}` }}
              >
                <CustomTitleBar theme={t} onMinimizeToast={() => showToast('Окно свёрнуто в трей')} />
                <div className="px-4 py-2 text-[12px] font-semibold flex items-center justify-between" style={{ backgroundColor: t.surface2 }}>
                  <span>Тема: {t.name} ({t.bg})</span>
                  <span className="font-mono text-[11px]" style={{ color: t.textSecondary }}>Поверхности: {t.surface1} / {t.surface2}</span>
                </div>
                <div className="flex-1 flex min-h-0">
                  <Sidebar activeTab="home" setActiveTab={() => {}} bypassState={bypassState} telegramRunning={telegramRunning} compact={ true } theme={t} accent={accent} />
                  <HomeScreen
                    theme={t}
                    accent={accent}
                    bypassState={bypassState}
                    setBypassState={setBypassState}
                    interferenceMode={interferenceMode}
                    setInterferenceMode={setInterferenceMode}
                    onNavigate={setActiveTab}
                    compact={true}
                    showToast={showToast}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DELIVERABLE 2 & 3: Interactive Frameless Window (1040×720 or Min 840×580) */}
      {(viewMode === 'app' || viewMode === 'min_840') && (
        <div className="flex justify-center">
          <div
            className="rounded-[14px] overflow-hidden flex flex-col relative shadow-2xl transition-all duration-200"
            style={{
              width: viewMode === 'min_840' ? 840 : 1040,
              height: viewMode === 'min_840' ? 580 : 720,
              backgroundColor: theme.bg,
              border: `1px solid ${theme.borderStrong}`,
            }}
          >
            <CustomTitleBar theme={theme} onMinimizeToast={() => showToast('Окно свёрнуто в системный трей')} />

            <div className="flex-1 flex min-h-0 relative">
              <Sidebar
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                bypassState={bypassState}
                telegramRunning={telegramRunning}
                compact={viewMode === 'min_840'}
                theme={theme}
                accent={accent}
              />

              {activeTab === 'home' && (
                <HomeScreen
                  theme={theme}
                  accent={accent}
                  bypassState={bypassState}
                  setBypassState={setBypassState}
                  interferenceMode={interferenceMode}
                  setInterferenceMode={setInterferenceMode}
                  onNavigate={setActiveTab}
                  compact={viewMode === 'min_840'}
                  showToast={showToast}
                />
              )}

              {activeTab === 'discovery' && (
                <DiscoveryScreen
                  theme={theme}
                  accent={accent}
                  discoveryStage={discoveryStage}
                  setDiscoveryStage={setDiscoveryStage}
                  onOpenStrategies={() => setActiveTab('strategies')}
                  showToast={showToast}
                />
              )}

              {activeTab === 'strategies' && (
                <StrategiesScreen
                  theme={theme}
                  accent={accent}
                  onBack={() => setActiveTab('discovery')}
                  showToast={showToast}
                />
              )}

              {activeTab === 'telegram' && (
                <TelegramScreen
                  theme={theme}
                  accent={accent}
                  telegramRunning={telegramRunning}
                  setTelegramRunning={setTelegramRunning}
                  showToast={showToast}
                />
              )}

              {activeTab === 'sites' && <SitesScreen theme={theme} accent={accent} showToast={showToast} />}
              {activeTab === 'diagnostics' && <DiagnosticsScreen theme={theme} accent={accent} showToast={showToast} />}
              {activeTab === 'logs' && <LogsScreen theme={theme} showToast={showToast} />}
              {activeTab === 'settings' && (
                <SettingsScreen
                  themeKey={themeKey}
                  setThemeKey={setThemeKey}
                  accentKey={accentKey}
                  setAccentKey={setAccentKey}
                  onOpenWizard={() => setWizardOpen(true)}
                  onOpenUpdateModal={() => setUpdateModalOpen(true)}
                  showToast={showToast}
                />
              )}

              {/* Screen 6: First Run Wizard Overlay */}
              {wizardOpen && (
                <FirstRunWizardOverlay
                  theme={theme}
                  accent={accent}
                  wizardStep={wizardStep}
                  setWizardStep={setWizardStep}
                  onClose={() => setWizardOpen(false)}
                  onEnableBypass={() => setBypassState('on')}
                />
              )}

              {/* Screen 12: Update Modal Overlay */}
              {updateModalOpen && <UpdateModal theme={theme} accent={accent} onClose={() => setUpdateModalOpen(false)} />}

              {/* Non-blocking Toast */}
              {toast && (
                <div
                  className="absolute bottom-4 right-4 z-50 px-3.5 py-2 rounded-[9px] text-[12px] font-medium flex items-center gap-2 shadow-lg"
                  style={{ backgroundColor: theme.surface3, color: '#FFFFFF', border: `1px solid ${accent.border}` }}
                >
                  <CheckCircle2 className="w-4 h-4 text-[#22C55E]" />
                  <span>{toast}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}