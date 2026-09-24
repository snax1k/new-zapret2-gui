import React, { useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  MonitorCheck,
  Headphones,
  Youtube,
  Send,
  PartyPopper,
  ShieldCheck,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Loader2,
  ArrowRight,
  ArrowLeft,
  X,
  Info,
  Lightbulb,
  Clock,
  RefreshCw,
  Power,
  Wand2,
  Settings,
  Terminal,
  Activity,
  Globe,
  Square,
  Play,
  Circle,
  Copy,
  Check,
  LifeBuoy,
  ChevronDown
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { summarizeAutotune, plainStrategy, AutotuneVerdictKind } from '../lib/autotune';
import { AutotuneRow, PreflightItem, StrategyGroup } from '../types';

/**
 * Мастер первого запуска.
 *
 * Новичок, открыв программу, видит кнопку питания, пресеты, стратегии с
 * названиями вроде «seqovl 681» и не понимает, что из этого нужно ему.
 * Мастер проводит по делу за несколько минут: проверяет компьютер,
 * подбирает обход для Discord и YouTube, включает мост для Telegram и
 * объясняет каждый шаг человеческими словами.
 *
 * Своей логики проверок у мастера нет — он пользуется теми же механизмами,
 * что и остальная программа: проверкой окружения, автоподбором, мостом.
 * Вывод по итогам подбора общий с окном подбора (lib/autotune.ts), чтобы
 * они никогда не противоречили друг другу.
 */

type StepId = 'welcome' | 'env' | 'discord' | 'youtube' | 'telegram' | 'finish';

const STEPS: { id: StepId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'welcome', label: 'Начало', icon: Sparkles },
  { id: 'env', label: 'Компьютер', icon: MonitorCheck },
  { id: 'discord', label: 'Discord', icon: Headphones },
  { id: 'youtube', label: 'YouTube', icon: Youtube },
  { id: 'telegram', label: 'Telegram', icon: Send },
  { id: 'finish', label: 'Готово', icon: PartyPopper }
];

/** Чем закончился подбор для одной группы. */
interface TuneOutcome {
  kind: AutotuneVerdictKind | 'skipped';
  best?: AutotuneRow;
  /** Найденный способ применён. */
  applied: boolean;
  /** Для «через раз» человек решает сам — пока не решил, кнопки видны. */
  decided: boolean;
  /** Снимок строк: общие строки подбора перепишет следующая проверка. */
  rows: AutotuneRow[];
}

// ---------------------------------------------------------------------------
// Мелкие строительные блоки
// ---------------------------------------------------------------------------

type Tone = 'info' | 'ok' | 'warn' | 'error';

const TONE: Record<Tone, { box: string; icon: string; Icon: React.ComponentType<{ className?: string }> }> = {
  info: { box: 'border-indigo-500/25 bg-indigo-500/5', icon: 'text-indigo-500', Icon: Info },
  ok: { box: 'border-emerald-500/30 bg-emerald-500/5', icon: 'text-emerald-500', Icon: CheckCircle2 },
  warn: { box: 'border-amber-500/30 bg-amber-500/5', icon: 'text-amber-500', Icon: AlertTriangle },
  error: { box: 'border-rose-500/30 bg-rose-500/5', icon: 'text-rose-500', Icon: XCircle }
};

const Callout: React.FC<{ tone: Tone; title?: React.ReactNode; icon?: React.ComponentType<{ className?: string }>; children?: React.ReactNode }> =
  ({ tone, title, icon, children }) => {
    const t = TONE[tone];
    const Icon = icon || t.Icon;
    return (
      <div className={`flex gap-3 p-3.5 rounded-xl border ${t.box}`}>
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${t.icon}`} />
        <div className="min-w-0 space-y-1 text-[12px] leading-relaxed text-slate-600 dark:text-slate-300">
          {title && <div className="font-bold text-slate-900 dark:text-slate-100">{title}</div>}
          {children}
        </div>
      </div>
    );
  };

const StepTitle: React.FC<{ icon: React.ComponentType<{ className?: string }>; title: string; lead: React.ReactNode; accent?: string }> =
  ({ icon: Icon, title, lead, accent = 'from-indigo-500 to-violet-500' }) => (
    <div className="flex items-start gap-4">
      <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${accent} text-white flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/20`}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="min-w-0">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50">{title}</h2>
        <p className="text-[13px] leading-relaxed text-slate-500 dark:text-slate-400 mt-1">{lead}</p>
      </div>
    </div>
  );

const btnPrimary =
  'inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] font-bold ' +
  'shadow-lg shadow-indigo-600/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
const btnSecondary =
  'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-colors ' +
  'bg-black/5 hover:bg-black/10 text-slate-700 dark:bg-white/5 dark:hover:bg-white/10 dark:text-slate-200 ' +
  'disabled:opacity-40 disabled:cursor-not-allowed';
const btnGhost =
  'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold transition-colors ' +
  'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 disabled:opacity-40';

const hasHost = (): boolean => !!window.chrome?.webview;

/** Проверки работают только внутри программы — в браузере разработчика их нет. */
const NoHostNote: React.FC = () => hasHost() ? null : (
  <Callout tone="warn" title="Проверки доступны только в самой программе">
    Эта страница открыта в браузере, без нативной части. Внешний вид мастера
    можно посмотреть, но проверки и подбор здесь не запустятся.
  </Callout>
);

// ---------------------------------------------------------------------------
// Шаг 1. Знакомство
// ---------------------------------------------------------------------------

const WelcomeStep: React.FC = () => {
  const { isReturningUser, isWizardRerun, activePreset, presets } = useApp();
  // Три разных человека: впервые здесь, обновился с прежней версии, сам
  // открыл мастер из «Настроек». Говорить с ними одними словами — врать
  // двоим из трёх.
  const mode = isWizardRerun ? 'rerun' : isReturningUser ? 'updated' : 'first';
  const heading = {
    first: {
      title: 'Добро пожаловать в Zapret2',
      lead: 'Настроим всё за несколько минут. Разбираться в настройках не придётся: программа сама проверит, что работает у вашего провайдера, и применит лучшее.'
    },
    updated: {
      title: 'Программа обновилась — настроим заново?',
      lead: 'В этой версии появился мастер настройки, а проверка способов обхода стала точнее. Пройдите его один раз — займёт несколько минут.'
    },
    rerun: {
      title: 'Настроим заново',
      lead: 'Мастер снова проверит компьютер и подберёт обход. Найденные способы заменят текущие, а пропущенные шаги ничего не изменят.'
    }
  }[mode];
  const recommended = presets.find(p => p.recommended);
  const customPreset = !!recommended && activePreset.id !== recommended.id;

  const cards = [
    { icon: Headphones, color: 'text-indigo-500 bg-indigo-500/10', title: 'Discord', text: 'Подберём способ обхода, при котором открываются вход, чаты и обновления.' },
    { icon: Youtube, color: 'text-rose-500 bg-rose-500/10', title: 'YouTube', text: 'Проверим и сайт, и серверы, с которых грузится само видео.' },
    { icon: Send, color: 'text-sky-500 bg-sky-500/10', title: 'Telegram', text: 'Включим встроенный мост и добавим его в Telegram одной кнопкой.' }
  ];

  return (
    <div className="space-y-5">
      <StepTitle icon={Sparkles} title={heading.title} lead={heading.lead} />

      <div className="grid grid-cols-3 gap-3">
        {cards.map(c => {
          const Icon = c.icon;
          return (
            <div key={c.title} className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white/60 dark:bg-white/[0.03] space-y-2">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${c.color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="text-[13px] font-bold text-slate-900 dark:text-slate-100">{c.title}</div>
              <p className="text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">{c.text}</p>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-white/10 p-4 space-y-2.5">
        <div className="text-[12px] font-bold text-slate-900 dark:text-slate-100">Как это будет</div>
        {[
          { icon: Clock, text: 'Около 4–5 минут. Почти всё время — ожидание, пока программа проверяет варианты.' },
          { icon: Globe, text: 'Во время проверки интернет может пропадать на секунду-другую — это нормально.' },
          { icon: ShieldCheck, text: 'В Windows ничего не устанавливается. Любой шаг можно пропустить, а мастер — открыть снова в «Настройках».' }
        ].map((r, i) => {
          const Icon = r.icon;
          return (
            <div key={i} className="flex items-start gap-2.5 text-[12px] leading-relaxed text-slate-600 dark:text-slate-300">
              <Icon className="w-4 h-4 mt-0.5 shrink-0 text-indigo-500" />
              <span>{r.text}</span>
            </div>
          );
        })}
      </div>

      {mode === 'updated' && (
        <Callout tone="info" title="Почему стоит пройти, даже если всё работает">
          Прежняя проверка для Discord ошибалась и почти всегда отвечала «ничего не подошло».
          Если Discord у вас работал нестабильно или вы подбирали настройки вручную —
          мастер найдёт рабочий вариант. Если всё и так отлично — смело пропускайте.
        </Callout>
      )}

      {customPreset && recommended && (
        <Callout tone="warn" title={`Сейчас выбран ваш пресет «${activePreset.name}»`}>
          Мастер настраивает встроенный пресет «{recommended.name}» и переключит на него.
          Ваш пресет никуда не денется — он останется в разделе «Пресеты».
        </Callout>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Шаг 2. Проверка компьютера
// ---------------------------------------------------------------------------

/** Что сказать человеку о каждой помехе — проще, чем говорит нативная часть. */
const explain = (item: PreflightItem): { title: string; text: string; action?: 'kill' | 'recheck' } => {
  switch (item.id) {
    case 'proxy':
      return {
        title: 'Включён системный прокси',
        text: 'Браузер и программы сейчас выходят в интернет через прокси — часто это VPN-клиент. ' +
          'Пока он включён, трафик идёт через него, и обход его не касается. На проверку в мастере ' +
          'это не влияет: она идёт напрямую. Когда захотите пользоваться обходом — выключите прокси ' +
          'или настройте в VPN-клиенте, чтобы YouTube и Discord шли напрямую.'
      };
    case 'vpn':
      return item.title.startsWith('Не удалось')
        ? { title: 'Не удалось определить сетевую карту', text: 'Обход будет работать на всех адаптерах сразу. Обычно это не мешает.' }
        : {
          title: 'Трафик уходит через VPN',
          text: 'Сейчас весь интернет идёт через VPN — провайдер его не видит, и обходить нечего. ' +
            'Проверка в мастере идёт мимо VPN, поэтому ей это не мешает. Обход заработает, когда VPN ' +
            'выключен или настроен так, чтобы YouTube и Discord шли напрямую.'
        };
    case 'winws':
      return {
        title: 'Запущены лишние копии ядра',
        text: 'Остались процессы winws.exe от другой программы или прошлого запуска. Две копии ' +
          'мешают друг другу. Их можно закрыть одной кнопкой.',
        action: 'kill'
      };
    case 'rivals':
      return {
        title: 'Работает другая программа обхода',
        text: `${item.title.replace(/^.*?:\s*/, '')} — закройте её (обычно она сидит в трее у часов) ` +
          'и нажмите «Проверить снова». Две такие программы одновременно рвут соединения.',
        action: 'recheck'
      };
    default:
      return { title: item.title, text: item.detail };
  }
};

const EnvStep: React.FC = () => {
  const { preflight, runPreflight, killZombieWinDivert } = useApp();
  const [checking, setChecking] = useState(false);
  const [showDetails, setShowDetails] = useState<string | null>(null);

  const recheck = () => {
    setChecking(true);
    runPreflight();
    setTimeout(() => setChecking(false), 1200);
  };

  // Проверяем при входе на шаг: с момента запуска программы всё могло
  // поменяться — человек мог выключить VPN, пока читал первый экран.
  useEffect(() => { recheck(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const problems = preflight.filter(p => p.level !== 'ok');
  const passed = preflight.filter(p => p.level === 'ok');
  const hasError = problems.some(p => p.level === 'error');

  return (
    <div className="space-y-5">
      <StepTitle
        icon={MonitorCheck}
        title="Проверим компьютер"
        lead="Некоторые программы мешают обходу: VPN, прокси, другие обходчики. Сначала убедимся, что им ничего не помешает."
        accent="from-sky-500 to-indigo-500"
      />

      <NoHostNote />

      {hasHost() && (
        checking && preflight.length === 0 ? (
          <div className="flex items-center gap-2 text-[13px] text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Проверяем…</div>
        ) : problems.length === 0 ? (
          <Callout tone="ok" icon={ShieldCheck} title="Компьютер готов">
            Ничего не мешает: прокси и VPN не перехватывают трафик, других программ обхода нет.
          </Callout>
        ) : (
          <div className="space-y-3">
            {problems.map(item => {
              const e = explain(item);
              const tone: Tone = item.level === 'error' ? 'error' : 'warn';
              return (
                <Callout key={item.id} tone={tone} title={e.title}>
                  <p>{e.text}</p>
                  <div className="flex items-center gap-2 pt-1.5 flex-wrap">
                    {e.action === 'kill' && (
                      <button onClick={killZombieWinDivert} className={btnSecondary + ' !py-1.5 !text-[12px]'}>
                        <Square className="w-3.5 h-3.5" /> Закрыть лишние копии
                      </button>
                    )}
                    <button
                      onClick={() => setShowDetails(showDetails === item.id ? null : item.id)}
                      className={btnGhost + ' !px-0'}
                    >
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showDetails === item.id ? 'rotate-180' : ''}`} />
                      {showDetails === item.id ? 'Скрыть подробности' : 'Подробнее'}
                    </button>
                  </div>
                  {showDetails === item.id && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono break-words">
                      {item.title}. {item.detail}
                    </p>
                  )}
                </Callout>
              );
            })}
          </div>
        )
      )}

      {hasHost() && passed.length > 0 && problems.length > 0 && (
        <div className="text-[12px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          В порядке: {passed.map(p => p.title.toLowerCase()).join('; ')}
        </div>
      )}

      {hasHost() && (
        <div className="flex items-center gap-3">
          <button onClick={recheck} disabled={checking} className={btnSecondary}>
            <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} /> Проверить снова
          </button>
          {problems.length > 0 && !hasError && (
            <span className="text-[12px] text-slate-500 dark:text-slate-400">
              Предупреждения не мешают идти дальше.
            </span>
          )}
          {hasError && (
            <span className="text-[12px] text-rose-500">
              Лучше устранить помеху до подбора — иначе результаты будут неточными.
            </span>
          )}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Шаги 3 и 4. Подбор для Discord и YouTube
// ---------------------------------------------------------------------------

const TUNE_TEXT: Record<StrategyGroup, {
  title: string; icon: React.ComponentType<{ className?: string }>; accent: string; lead: string;
  targets: { host: string; what: string }[]; note: string; afterFound?: string;
}> = {
  sites: {
    title: 'Настроим Discord',
    icon: Headphones,
    accent: 'from-indigo-500 to-blue-500',
    lead: 'Программа по очереди попробует несколько способов обхода и найдёт тот, при котором Discord открывается у вашего провайдера.',
    targets: [
      { host: 'discord.com', what: 'сайт и вход в аккаунт' },
      { host: 'gateway.discord.gg', what: 'подключение приложения к серверу' },
      { host: 'updates.discord.com', what: 'обновления — с них начинается запуск' }
    ],
    note: 'Сам Discord открывать не нужно. Голосовые звонки обрабатываются отдельно и уже включены.',
    afterFound: 'Если Discord был открыт — перезапустите его: он запоминает неудачные подключения. ' +
      'Если после этого он всё равно висит на загрузке, помогает «Настройки → Кэш Discord».'
  },
  youtube: {
    title: 'Настроим YouTube',
    icon: Youtube,
    accent: 'from-rose-500 to-orange-500',
    lead: 'Теперь то же самое для YouTube. Видео грузится не с сайта, а с отдельных серверов, поэтому проверим и то и другое.',
    targets: [
      { host: 'www.youtube.com', what: 'сам сайт' },
      { host: 'googlevideo.com', what: 'серверы, с которых идёт видео' }
    ],
    note: 'Браузер открывать не нужно — программа проверит всё сама.',
    afterFound: 'Если YouTube был открыт — обновите страницу.'
  }
};

const TIPS = [
  'Найденный способ применится сам — нажимать ничего не придётся.',
  'Проверка идёт напрямую, мимо VPN и прокси: иначе она измеряла бы их, а не вашего провайдера.',
  'Каждый способ проверяется по нескольку раз — одна удачная попытка ещё ничего не значит.',
  'Интернет может пропадать на секунду-другую: ядро перезапускается с каждым способом.',
  'Подробный отчёт проверки сохраняется в папку логов — он пригодится, если что-то пойдёт не так.'
];

/** Средняя цена одного варианта, по замерам: нерабочий ~13 с, рабочий ~4 с. */
const SECONDS_PER_VARIANT = 13;

const formatLeft = (sec: number): string =>
  sec < 60 ? `меньше минуты` : `около ${Math.round(sec / 60)} мин`;

const TuneStep: React.FC<{
  group: StrategyGroup;
  outcome?: TuneOutcome;
  onOutcome: (o: TuneOutcome) => void;
  /**
   * Счётчик нажатий «Начать проверку» в подвале. Главное действие шага
   * живёт там же, где у всех остальных шагов, — справа внизу: кнопка в
   * конце содержимого оказывалась под прокруткой, и её не находили.
   */
  startNonce: number;
}> = ({ group, outcome, onOutcome, startNonce }) => {
  const {
    autotuneRows, isAutotuneRunning, startAutotune, cancelAutotune,
    setYoutubeStrategy, setSitesStrategy
  } = useApp();
  const text = TUNE_TEXT[group];

  const [phase, setPhase] = useState<'intro' | 'running' | 'done'>(outcome ? 'done' : 'intro');
  const [startError, setStartError] = useState('');
  const [tip, setTip] = useState(0);
  const [showRows, setShowRows] = useState(false);
  const sawRunning = useRef(false);

  const apply = (id: AutotuneRow['id']) => {
    if (group === 'youtube') setYoutubeStrategy(id);
    else setSitesStrategy(id);
  };

  const start = () => {
    setStartError('');
    sawRunning.current = false;
    setPhase('running');
    setTip(0);
    startAutotune(group);
  };

  // Начальное значение запоминаем, чтобы возврат на шаг кнопкой «Назад»
  // не запускал проверку сам по себе.
  const lastNonce = useRef(startNonce);
  useEffect(() => {
    if (startNonce === lastNonce.current) return;
    lastNonce.current = startNonce;
    start();
  }, [startNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // Конец проверки узнаём по тому, что подбор сначала пошёл, а потом
  // остановился. Сам по себе isAutotuneRunning === false ничего не значит:
  // в первый момент после нажатия он ещё не успел стать true.
  useEffect(() => {
    if (phase !== 'running') return;
    if (isAutotuneRunning) { sawRunning.current = true; return; }
    if (!sawRunning.current) return;

    const s = summarizeAutotune(autotuneRows);
    let applied = false;
    // Полностью надёжный способ применяем сразу — ради этого мастер и
    // запускали. Способ «через раз» — только с согласия человека.
    if (s.kind === 'found' && s.best) {
      apply(s.best.id);
      applied = true;
    }
    onOutcome({
      kind: s.kind,
      best: s.best,
      applied,
      decided: s.kind !== 'partial',
      rows: autotuneRows
    });
    setPhase('done');
  }, [isAutotuneRunning, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Подбор не стартовал — например, нативная часть не ответила. Без этой
  // страховки мастер навсегда остался бы на «Проверяем…».
  useEffect(() => {
    if (phase !== 'running') return;
    const t = setTimeout(() => {
      if (!sawRunning.current) {
        setPhase('intro');
        setStartError('Проверка не запустилась. Попробуйте ещё раз; если повторится — загляните в «Консоль логов».');
      }
    }, 5000);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'running') return;
    const t = setInterval(() => setTip(i => (i + 1) % TIPS.length), 7000);
    return () => clearInterval(t);
  }, [phase]);

  // ---- Вступление --------------------------------------------------------
  if (phase === 'intro') {
    return (
      <div className="space-y-5">
        <StepTitle icon={text.icon} title={text.title} lead={text.lead} accent={text.accent} />
        <NoHostNote />

        <div className="rounded-2xl border border-slate-200 dark:border-white/10 p-4 space-y-3">
          <div className="text-[12px] font-bold text-slate-900 dark:text-slate-100">Что будет проверяться</div>
          <div className="space-y-1.5">
            {text.targets.map(t => (
              <div key={t.host} className="flex items-center gap-2 text-[12px]">
                <Globe className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span className="font-mono text-slate-800 dark:text-slate-200">{t.host}</span>
                <span className="text-slate-500 dark:text-slate-400">— {t.what}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { n: '1', t: 'Есть ли блокировка', d: 'Сначала проверим без обхода. Если всё открывается — менять ничего не нужно.' },
            { n: '2', t: 'Пробуем способы', d: 'По очереди до семи способов, каждый — настоящими соединениями.' },
            { n: '3', t: 'Применяем лучший', d: 'Подошедший способ включится сам. Займёт 1–2 минуты.' }
          ].map(s => (
            <div key={s.n} className="p-3.5 rounded-2xl bg-black/[0.03] dark:bg-white/[0.03] space-y-1.5">
              <div className="w-6 h-6 rounded-full bg-indigo-500/15 text-indigo-500 text-[11px] font-bold flex items-center justify-center">{s.n}</div>
              <div className="text-[12px] font-bold text-slate-900 dark:text-slate-100">{s.t}</div>
              <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{s.d}</p>
            </div>
          ))}
        </div>

        <Callout tone="info" icon={Lightbulb}>{text.note}</Callout>

        {startError && <Callout tone="error">{startError}</Callout>}
      </div>
    );
  }

  // ---- Идёт проверка -----------------------------------------------------
  if (phase === 'running') {
    const rows = autotuneRows;
    const done = rows.filter(r => r.phase === 'done').length;
    const current = rows.find(r => r.phase === 'starting' || r.phase === 'testing');
    const strategies = rows.filter(r => r.id !== 'off');
    const currentIndex = current ? strategies.findIndex(r => r.id === current.id) + 1 : 0;
    const pct = rows.length ? Math.max(4, Math.round((done / rows.length) * 100)) : 4;
    const left = (rows.length - done) * SECONDS_PER_VARIANT;

    return (
      <div className="space-y-5">
        <StepTitle icon={text.icon} title={text.title} lead="Идёт проверка. Можно просто подождать — всё произойдёт само." accent={text.accent} />

        <div className="rounded-2xl border border-indigo-500/25 bg-indigo-500/5 p-5 space-y-4">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-indigo-500 animate-spin shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-bold text-slate-900 dark:text-slate-100 truncate">
                {!current ? 'Готовимся…'
                  : current.id === 'off' ? 'Проверяем, есть ли блокировка…'
                  : `Способ ${currentIndex} из ${strategies.length}: ${current.label}`}
              </div>
              <div className="text-[12px] text-slate-500 dark:text-slate-400">
                {current && current.id !== 'off'
                  ? plainStrategy(current.id)
                  : 'Сначала — без обхода, как есть у провайдера.'}
              </div>
            </div>
            <div className="text-[12px] text-slate-500 dark:text-slate-400 shrink-0">
              осталось {formatLeft(left)}
            </div>
          </div>

          <div className="h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {rows.map(r => (
              <span
                key={r.id}
                title={r.label}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium ${
                  r.phase === 'done'
                    ? r.ok ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-black/5 dark:bg-white/5 text-slate-400'
                    : r.phase === 'idle' ? 'bg-black/[0.03] dark:bg-white/[0.03] text-slate-400'
                    : 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300'
                }`}
              >
                {r.phase === 'done' ? (r.ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />)
                  : r.phase === 'idle' ? <Circle className="w-3 h-3" />
                  : <Loader2 className="w-3 h-3 animate-spin" />}
                {r.id === 'off' ? 'без обхода' : r.label}
              </span>
            ))}
          </div>
        </div>

        <div key={tip} className="wizard-step">
          <Callout tone="info" icon={Lightbulb} title="Пока ждём">{TIPS[tip]}</Callout>
        </div>

        <button onClick={cancelAutotune} className={btnGhost}>
          <Square className="w-3.5 h-3.5" /> Остановить проверку
        </button>
      </div>
    );
  }

  // ---- Итог --------------------------------------------------------------
  const o = outcome;
  const name = group === 'youtube' ? 'YouTube' : 'Discord';

  return (
    <div className="space-y-5">
      <StepTitle icon={text.icon} title={text.title} lead="Проверка закончена." accent={text.accent} />

      {o && o.kind === 'found' && o.best && (
        <Callout tone="ok" title={`Готово! Подошёл способ «${o.best.label}»`}>
          <p>{plainStrategy(o.best.id)}</p>
          <p>Прошёл все проверки: {o.best.passed} из {o.best.total}. Способ уже применён — нажимать ничего не нужно.</p>
        </Callout>
      )}

      {o && o.kind === 'not-needed' && (
        <Callout tone="ok" title={`${name} открывается и без обхода`}>
          Блокировки у вашего провайдера нет — программа ничего не меняла. Если {name} всё же
          не работает, дело не в провайдере: проверьте VPN и прокси (шаг «Компьютер»).
        </Callout>
      )}

      {o && o.kind === 'partial' && o.best && (
        <Callout tone="warn" title="Полностью надёжного способа нет">
          <p>
            Лучший — «{o.best.label}»: прошёл {o.best.passed} из {o.best.total} проверок. Такой способ
            работает через раз — {name} может то открываться, то нет.
          </p>
          {!o.decided ? (
            <div className="flex items-center gap-2 pt-1.5">
              <button
                onClick={() => { apply(o.best!.id); onOutcome({ ...o, applied: true, decided: true }); }}
                className={btnSecondary + ' !py-1.5 !text-[12px]'}
              >
                Применить всё равно
              </button>
              <button onClick={() => onOutcome({ ...o, decided: true })} className={btnGhost}>
                Оставить как было
              </button>
            </div>
          ) : (
            <p className="font-semibold">{o.applied ? 'Способ применён.' : 'Настройки оставлены прежними.'}</p>
          )}
        </Callout>
      )}

      {o && o.kind === 'none' && (
        <Callout tone="error" title="Ни один способ не помог">
          <p>
            Такое бывает при необычной блокировке или если проверке что-то мешало. Настройки
            оставлены прежними. Что можно сделать:
          </p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>вернуться на шаг «Компьютер» и убедиться, что ничего не мешает;</li>
            <li>попробовать ещё раз через несколько минут;</li>
            <li>написать разработчику в Telegram <b>@snax1k</b> — и приложить отчёт проверки из папки логов.</li>
          </ul>
        </Callout>
      )}

      {o && o.kind === 'empty' && (
        <Callout tone="warn" title="Проверка остановлена">
          Способы обхода проверить не успели. Запустите проверку заново или пропустите этот шаг.
        </Callout>
      )}

      {o && (o.kind === 'found' || (o.kind === 'partial' && o.applied)) && text.afterFound && (
        <Callout tone="info" icon={Lightbulb}>{text.afterFound}</Callout>
      )}

      {o && o.rows.some(r => r.phase === 'done') && (
        <div>
          <button onClick={() => setShowRows(v => !v)} className={btnGhost + ' !px-0'}>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showRows ? 'rotate-180' : ''}`} />
            {showRows ? 'Скрыть подробности' : 'Подробности проверки'}
          </button>
          {showRows && (
            <div className="mt-2 space-y-1">
              {o.rows.map(r => (
                <div key={r.id} className="flex items-center gap-2 text-[12px] px-3 py-1.5 rounded-lg bg-black/[0.03] dark:bg-white/[0.03]">
                  {r.phase !== 'done' ? <Circle className="w-3.5 h-3.5 text-slate-400" />
                    : r.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    : <XCircle className="w-3.5 h-3.5 text-slate-400" />}
                  <span className="flex-1 text-slate-700 dark:text-slate-300">{r.id === 'off' ? 'Без обхода' : r.label}</span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {r.phase === 'done' ? `${r.passed} из ${r.total}` : 'не проверялся'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <button onClick={start} disabled={!hasHost()} className={btnSecondary}>
        <RefreshCw className="w-4 h-4" /> Проверить заново
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Шаг 5. Telegram
// ---------------------------------------------------------------------------

const TelegramStep: React.FC<{ enabled: boolean; onEnable: () => void }> = ({ enabled, onEnable }) => {
  const { tgProxy, tgSettings, setTgSettings, startTgProxy, tgLink, openTgLink } = useApp();
  const [copied, setCopied] = useState(false);
  const [opened, setOpened] = useState(false);
  const waiting = enabled && !tgProxy.running && !tgProxy.error;

  const enable = () => {
    // Сначала автозапуск, потом старт: пока мост не поднят, смена настроек
    // его не перезапускает.
    if (!tgSettings.autoStart) setTgSettings({ autoStart: true });
    if (!tgProxy.running) startTgProxy();
    onEnable();
  };

  const copy = () => {
    if (!tgLink) return;
    navigator.clipboard.writeText(tgLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-5">
      <StepTitle
        icon={Send}
        title="Настроим Telegram"
        lead="Telegram блокируют иначе, чем YouTube и Discord: закрыт сам путь к его серверам. Поэтому для него в программе есть отдельный мост — он передаёт трафик Telegram обходным путём."
        accent="from-sky-500 to-cyan-500"
      />
      <NoHostNote />

      {!enabled && !tgProxy.running ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 space-y-1.5">
              <div className="text-[13px] font-bold text-slate-900 dark:text-slate-100">Telegram не работает или тормозит</div>
              <p className="text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
                Включим мост и добавим его в Telegram на этом компьютере. Два клика.
              </p>
            </div>
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 space-y-1.5">
              <div className="text-[13px] font-bold text-slate-900 dark:text-slate-100">Telegram работает нормально</div>
              <p className="text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
                Мост не нужен — пропустите шаг. Включить его можно в любой момент в разделе «Телеграм — Прокси».
              </p>
            </div>
          </div>
          <button onClick={enable} disabled={!hasHost()} className={btnPrimary}>
            <Power className="w-4 h-4" /> Включить мост
          </button>
        </>
      ) : (
        <div className="space-y-3">
          {/* 1. Мост */}
          <div className="flex items-start gap-3 p-4 rounded-2xl border border-slate-200 dark:border-white/10">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[12px] font-bold ${
              tgProxy.running ? 'bg-emerald-500 text-white' : 'bg-indigo-500/15 text-indigo-500'
            }`}>
              {tgProxy.running ? <Check className="w-4 h-4" /> : '1'}
            </div>
            <div className="min-w-0 space-y-1">
              <div className="text-[13px] font-bold text-slate-900 dark:text-slate-100">
                {tgProxy.running ? 'Мост работает' : waiting ? 'Запускаем мост…' : 'Мост не запустился'}
              </div>
              {tgProxy.error && <p className="text-[12px] text-rose-500">{tgProxy.error}</p>}
              {tgProxy.running && (
                <p className="text-[12px] text-slate-500 dark:text-slate-400">
                  Он будет включаться сам при каждом запуске программы.
                </p>
              )}
              {tgProxy.error && (
                <button onClick={enable} className={btnSecondary + ' !py-1.5 !text-[12px]'}>
                  <RefreshCw className="w-3.5 h-3.5" /> Попробовать ещё раз
                </button>
              )}
            </div>
          </div>

          {/* 2. Добавить в Telegram */}
          <div className={`flex items-start gap-3 p-4 rounded-2xl border border-slate-200 dark:border-white/10 ${tgProxy.running ? '' : 'opacity-50'}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[12px] font-bold ${
              opened ? 'bg-emerald-500 text-white' : 'bg-indigo-500/15 text-indigo-500'
            }`}>
              {opened ? <Check className="w-4 h-4" /> : '2'}
            </div>
            <div className="min-w-0 space-y-2">
              <div className="text-[13px] font-bold text-slate-900 dark:text-slate-100">Добавьте мост в Telegram</div>
              <p className="text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
                Нажмите кнопку — откроется Telegram и спросит <b>«Подключить прокси?»</b>. Нажмите
                <b> «Подключить»</b>. Это нужно сделать только один раз.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => { openTgLink(); setOpened(true); }}
                  disabled={!tgProxy.running}
                  className={btnPrimary + ' !py-2'}
                >
                  <Send className="w-4 h-4" /> Открыть в Telegram
                </button>
                <button onClick={copy} disabled={!tgProxy.running} className={btnGhost}>
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Скопировано' : 'Скопировать ссылку'}
                </button>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                Telegram не открылся? Скопируйте ссылку, отправьте её себе в «Избранное» и нажмите на неё там.
              </p>
            </div>
          </div>

          <Callout tone="info" icon={Info}>
            Мост работает, пока программа открыта — можно свёрнутой в трей. Если закрыть её
            полностью, Telegram не подключится, пока вы её снова не запустите. Трафик идёт через
            сторонний узел, но переписку он не видит: она зашифрована самим Telegram.
          </Callout>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Шаг 6. Готово
// ---------------------------------------------------------------------------

const tuneSummary = (o: TuneOutcome | undefined): { tone: 'ok' | 'warn' | 'skip' | 'error'; text: string } => {
  if (!o || o.kind === 'skipped') return { tone: 'skip', text: 'Пропущено — настройки прежние' };
  switch (o.kind) {
    case 'found': return { tone: 'ok', text: `Настроено: «${o.best?.label}»` };
    case 'not-needed': return { tone: 'ok', text: 'Блокировки нет — обход не понадобился' };
    case 'partial': return o.applied
      ? { tone: 'warn', text: `Настроено, но работает через раз: «${o.best?.label}»` }
      : { tone: 'warn', text: 'Надёжного способа нет — настройки прежние' };
    case 'none': return { tone: 'error', text: 'Способ не найден — настройки прежние' };
    default: return { tone: 'skip', text: 'Проверка не закончена — настройки прежние' };
  }
};

const FinishStep: React.FC<{
  discord?: TuneOutcome; youtube?: TuneOutcome; telegramOn: boolean;
  startNow: boolean; setStartNow: (v: boolean) => void;
}> = ({ discord, youtube, telegramOn, startNow, setStartNow }) => {
  const { status } = useApp();
  const rows = [
    { icon: Headphones, name: 'Discord', ...tuneSummary(discord) },
    { icon: Youtube, name: 'YouTube', ...tuneSummary(youtube) },
    {
      icon: Send, name: 'Telegram',
      tone: (telegramOn ? 'ok' : 'skip') as 'ok' | 'skip',
      text: telegramOn ? 'Мост включён и будет запускаться сам' : 'Пропущено — мост выключен'
    }
  ];
  const toneClass = { ok: 'text-emerald-500', warn: 'text-amber-500', error: 'text-rose-500', skip: 'text-slate-400' };
  const ToneIcon = { ok: CheckCircle2, warn: AlertTriangle, error: XCircle, skip: Circle };

  const openSupport = () => {
    if (window.chrome?.webview) window.chrome.webview.postMessage('open_url:https://t.me/snax1k');
    else window.open('https://t.me/snax1k', '_blank');
  };

  return (
    <div className="space-y-5">
      <StepTitle
        icon={PartyPopper}
        title="Всё готово!"
        lead="Настройка закончена. Вот что получилось:"
        accent="from-emerald-500 to-teal-500"
      />

      <div className="rounded-2xl border border-slate-200 dark:border-white/10 divide-y divide-slate-200 dark:divide-white/10">
        {rows.map(r => {
          const Icon = r.icon;
          const TI = ToneIcon[r.tone];
          return (
            <div key={r.name} className="flex items-center gap-3 px-4 py-3">
              <Icon className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="w-20 text-[13px] font-bold text-slate-900 dark:text-slate-100">{r.name}</span>
              <TI className={`w-4 h-4 shrink-0 ${toneClass[r.tone]}`} />
              <span className="text-[12px] text-slate-600 dark:text-slate-300">{r.text}</span>
            </div>
          );
        })}
      </div>

      {status === 'connected' ? (
        <Callout tone="ok" icon={Power}>Обход уже работает — с новыми настройками.</Callout>
      ) : (
        <label className="flex items-start gap-3 p-4 rounded-2xl border border-indigo-500/25 bg-indigo-500/5 cursor-pointer">
          <input
            type="checkbox"
            checked={startNow}
            onChange={e => setStartNow(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-indigo-600"
          />
          <div>
            <div className="text-[13px] font-bold text-slate-900 dark:text-slate-100">Включить обход сразу</div>
            <p className="text-[12px] text-slate-500 dark:text-slate-400">
              Дальше включать и выключать его можно большой кнопкой на главном экране.
            </p>
          </div>
        </label>
      )}

      <div>
        <div className="text-[12px] font-bold text-slate-900 dark:text-slate-100 mb-2">Где что найти</div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: Power, t: 'Главная', d: 'большая кнопка — включить и выключить обход' },
            { icon: Wand2, t: 'Главная → «Подобрать стратегию»', d: 'если что-то перестало открываться' },
            { icon: Activity, t: 'Диагностика', d: 'проверить, что открывается прямо сейчас' },
            { icon: Terminal, t: 'Консоль логов', d: 'журнал для разработчика, если что-то сломалось' },
            { icon: Send, t: 'Телеграм — Прокси', d: 'мост, ссылка для телефона, счётчики' },
            { icon: Settings, t: 'Настройки', d: 'тема, кэш Discord и этот мастер снова' }
          ].map(x => {
            const Icon = x.icon;
            return (
              <div key={x.t} className="flex items-start gap-2.5 p-3 rounded-xl bg-black/[0.03] dark:bg-white/[0.03]">
                <Icon className="w-4 h-4 mt-0.5 text-indigo-500 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold text-slate-900 dark:text-slate-100">{x.t}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{x.d}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <button onClick={openSupport} className={btnGhost + ' !px-0'}>
        <LifeBuoy className="w-3.5 h-3.5" /> Что-то не работает? Напишите разработчику в Telegram — @snax1k
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Сам мастер
// ---------------------------------------------------------------------------

export const SetupWizard: React.FC = () => {
  const {
    isWizardOpen, closeWizard, isAutotuneRunning,
    presets, activePreset, setActivePresetId, addLog,
    tgProxy, status, toggleStatus, setActiveTab, preflight
  } = useApp();

  const [step, setStep] = useState(0);
  const [visited, setVisited] = useState(0);
  const [discord, setDiscord] = useState<TuneOutcome | undefined>();
  const [youtube, setYoutube] = useState<TuneOutcome | undefined>();
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [startNow, setStartNow] = useState(true);
  const [tuneNonce, setTuneNonce] = useState(0);

  // Каждое открытие — с чистого листа. Компонент живёт, пока живёт окно, и
  // без сброса мастер, открытый повторно из «Настроек», продолжил бы с
  // последнего шага со старыми итогами.
  useEffect(() => {
    if (!isWizardOpen) return;
    setStep(0);
    setVisited(0);
    setDiscord(undefined);
    setYoutube(undefined);
    setTelegramEnabled(false);
    setStartNow(true);
  }, [isWizardOpen]);

  if (!isWizardOpen) return null;

  const id = STEPS[step].id;
  const busy = isAutotuneRunning;

  const go = (i: number) => {
    if (busy) return;
    const next = Math.max(0, Math.min(STEPS.length - 1, i));
    setStep(next);
    setVisited(v => Math.max(v, next));
  };

  const begin = () => {
    // Мастер настраивает встроенный пресет: стратегии подбора меняют именно
    // его профили. Пользовательский остаётся в списке нетронутым.
    const recommended = presets.find(p => p.recommended);
    if (recommended && activePreset.id !== recommended.id) {
      setActivePresetId(recommended.id);
      addLog('info', `Мастер: выбран встроенный пресет «${recommended.name}».`, 'Wizard');
    }
    go(1);
  };

  const skipTune = (group: StrategyGroup) => {
    const skipped: TuneOutcome = { kind: 'skipped', applied: false, decided: true, rows: [] };
    if (group === 'sites') setDiscord(prev => prev || skipped);
    else setYoutube(prev => prev || skipped);
    go(step + 1);
  };

  const finish = () => {
    closeWizard('done');
    setActiveTab('dashboard');
    if (startNow && status !== 'connected' && status !== 'connecting') toggleStatus();
  };

  const close = () => {
    if (busy) return;
    closeWizard('skipped');
  };

  // Нижняя панель — своя для каждого шага: главное действие всегда справа.
  const renderFooter = () => {
    const back = step > 0 && (
      <button onClick={() => go(step - 1)} disabled={busy} className={btnGhost}>
        <ArrowLeft className="w-4 h-4" /> Назад
      </button>
    );

    switch (id) {
      case 'welcome':
        return (
          <>
            <button onClick={close} className={btnGhost}>Пропустить — настрою сам</button>
            <button onClick={begin} className={btnPrimary}>Начать настройку <ArrowRight className="w-4 h-4" /></button>
          </>
        );
      case 'discord':
      case 'youtube': {
        const outcome = id === 'discord' ? discord : youtube;
        const group: StrategyGroup = id === 'discord' ? 'sites' : 'youtube';
        const pendingChoice = !!outcome && outcome.kind === 'partial' && !outcome.decided;
        return (
          <>
            {back}
            <div className="flex items-center gap-2">
              {!outcome && !busy && <button onClick={() => skipTune(group)} className={btnGhost}>Пропустить шаг</button>}
              {busy ? (
                <button disabled className={btnPrimary}>
                  <Loader2 className="w-4 h-4 animate-spin" /> Идёт проверка…
                </button>
              ) : !outcome ? (
                <button onClick={() => setTuneNonce(n => n + 1)} disabled={!hasHost()} className={btnPrimary}>
                  <Play className="w-4 h-4" /> Начать проверку
                </button>
              ) : (
                <button onClick={() => go(step + 1)} disabled={pendingChoice} className={btnPrimary}
                  title={pendingChoice ? 'Сначала решите, применять ли найденный способ' : undefined}>
                  Далее <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </>
        );
      }
      case 'telegram':
        return (
          <>
            {back}
            <button onClick={() => go(step + 1)} className={tgProxy.running ? btnPrimary : btnSecondary}>
              {tgProxy.running ? 'Далее' : 'Пропустить'} <ArrowRight className="w-4 h-4" />
            </button>
          </>
        );
      case 'finish':
        return (
          <>
            {back}
            <button onClick={finish} className={btnPrimary}>
              <Check className="w-4 h-4" /> Готово — начать пользоваться
            </button>
          </>
        );
      default: {
        // Шаг «Компьютер»: при серьёзной помехе идти дальше можно, но кнопка
        // говорит об этом прямо, а не делает вид, что всё в порядке.
        const blocked = preflight.some(p => p.level === 'error');
        return (
          <>
            {back}
            <button onClick={() => go(step + 1)} className={blocked ? btnSecondary : btnPrimary}>
              {blocked ? 'Продолжить всё равно' : 'Далее'} <ArrowRight className="w-4 h-4" />
            </button>
          </>
        );
      }
    }
  };

  return (
    // Под заголовком окна, а не поверх него: мастер открыт несколько минут,
    // и программу должно быть можно свернуть или передвинуть.
    <div className="fixed inset-x-0 bottom-0 top-10 z-40 flex items-center justify-center p-5 bg-slate-950/60 backdrop-blur-md wizard-backdrop select-none">
      <div className="wizard-in relative w-full max-w-3xl max-h-full flex flex-col rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-2xl shadow-black/40 overflow-hidden">
        {/* Декоративное свечение сверху */}
        <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[520px] h-48 rounded-full bg-indigo-500/15 blur-3xl" />

        {/* Шапка со степпером */}
        <div className="relative px-6 pt-5 pb-4 border-b border-slate-200 dark:border-white/10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-[12px] font-semibold text-slate-500 dark:text-slate-400">
              <Wand2 className="w-4 h-4 text-indigo-500" />
              Мастер настройки · шаг {step + 1} из {STEPS.length}
            </div>
            <button
              onClick={close}
              disabled={busy}
              title={busy ? 'Дождитесь конца проверки или остановите её' : 'Закрыть мастер. Открыть снова можно в «Настройках»'}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-black/5 dark:hover:text-slate-100 dark:hover:bg-white/10 disabled:opacity-30 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const doneStep = i < step;
              const current = i === step;
              const reachable = i <= visited && !busy && i !== step;
              return (
                <React.Fragment key={s.id}>
                  <button
                    onClick={() => reachable && go(i)}
                    disabled={!reachable}
                    className="flex flex-col items-center gap-1.5 min-w-0 disabled:cursor-default group"
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                      current ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 scale-110'
                        : doneStep ? 'bg-emerald-500 text-white'
                        : 'bg-black/5 dark:bg-white/10 text-slate-400'
                    } ${reachable ? 'group-hover:ring-2 group-hover:ring-indigo-500/40' : ''}`}>
                      {doneStep ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                    </div>
                    <span className={`text-[10px] font-semibold whitespace-nowrap ${
                      current ? 'text-indigo-600 dark:text-indigo-300' : doneStep ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400'
                    }`}>{s.label}</span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-2 mb-5 rounded-full transition-colors ${
                      i < step ? 'bg-emerald-500' : 'bg-black/10 dark:bg-white/10'
                    }`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Содержимое шага */}
        <div className="relative flex-1 overflow-y-auto px-6 py-5">
          <div key={id} className="wizard-step">
            {id === 'welcome' && <WelcomeStep />}
            {id === 'env' && <EnvStep />}
            {id === 'discord' && <TuneStep group="sites" outcome={discord} onOutcome={setDiscord} startNonce={tuneNonce} />}
            {id === 'youtube' && <TuneStep group="youtube" outcome={youtube} onOutcome={setYoutube} startNonce={tuneNonce} />}
            {id === 'telegram' && (
              <TelegramStep enabled={telegramEnabled} onEnable={() => setTelegramEnabled(true)} />
            )}
            {id === 'finish' && (
              <FinishStep
                discord={discord}
                youtube={youtube}
                telegramOn={tgProxy.running}
                startNow={startNow}
                setStartNow={setStartNow}
              />
            )}
          </div>
        </div>

        {/* Нижняя панель */}
        <div className="relative px-6 py-4 border-t border-slate-200 dark:border-white/10 flex items-center justify-between bg-slate-50/80 dark:bg-white/[0.02]">
          {renderFooter()}
        </div>
      </div>
    </div>
  );
};
