import React from 'react';
import {
  Sparkles, Sliders, Globe, Play, ShieldCheck, Clock, CheckCircle2, AlertTriangle,
  RefreshCw, Square, Cpu, Zap, XCircle, Minimize2, Check, RotateCcw
} from 'lucide-react';
import { useApp, AutoPresetPick, AutotuneTab } from '../context/AppContext';
import { findYoutubeStrategy, STRATEGY_ORDER } from '../lib/zapretCommand';
import { summarizeAutotune } from '../lib/autotune';
import { AutotuneRow, StrategyGroup, YoutubeStrategyId } from '../types';
import { Button, Card, Note, PageHeader, Progress, Segmented, plural } from '../components/ui';

/** Сколько стратегий перебирается в группе, без эталона. */
const strategyCount = (g: StrategyGroup) => STRATEGY_ORDER[g].filter(id => id !== 'off').length;
const STRATEGY_COUNT = new Set([...STRATEGY_ORDER.sites, ...STRATEGY_ORDER.youtube].filter(id => id !== 'off')).size;

/** Средняя цена варианта с быстрым отсевом, с — для оценки «осталось». */
const SECONDS_PER_VARIANT = 7;

const fmtLeft = (sec: number) =>
  sec < 60 ? 'меньше минуты' : `около ${Math.ceil(sec / 60)} мин`;

const TARGETS: Record<StrategyGroup, string> = {
  sites: 'discord.com, gateway.discord.gg, cdn.discordapp.com, updates.discord.com, latency.discord.media:2053',
  youtube: 'www.youtube.com, googlevideo.com'
};

const GROUP_LABEL: Record<StrategyGroup, string> = {
  sites: 'Discord и сайты',
  youtube: 'YouTube'
};

/**
 * Подбор способа обхода — экран, а не окно, как до 0.4.3.
 *
 * Нативная сторона поднимает ядро с каждым вариантом и проверяет его в три
 * шага: быстрый отсев, полная проверка первых прошедших и загрузка страницы
 * в настоящем браузере. Проверка идёт с физического адаптера, мимо
 * системного прокси и туннелей VPN — иначе она измеряла бы их.
 *
 * Вкладка «Весь пресет» подбирает обе группы подряд и проверяет собранную
 * команду целиком — см. startAutoPreset в AppContext. Ничего не применяется
 * само: в конце кнопка «Применить» и «Вернуть как было».
 */
export const AutotuneView: React.FC = () => {
  const {
    autotuneRows, isAutotuneRunning, startAutotune, cancelAutotune,
    autotuneGroup, setAutotuneGroup, autotuneTab, setAutotuneTab,
    setYoutubeStrategy, setSitesStrategy, quickToggles,
    autoPreset, startAutoPreset, setActiveTab
  } = useApp();

  const presetRunning = autoPreset.stage === 'sites' || autoPreset.stage === 'youtube' || autoPreset.stage === 'verify';
  // Идущая сборка пресета важнее выбранной вкладки: её нельзя потерять из виду.
  const tab: AutotuneTab = presetRunning ? 'preset' : autotuneTab;

  const selectTab = (t: AutotuneTab) => {
    setAutotuneTab(t);
    if (t !== 'preset') setAutotuneGroup(t);
  };

  // Таблица группы показывает только её собственный перебор: строки сборки
  // пресета к одиночной группе отношения не имеют.
  const rowsFromPreset = presetRunning || autotuneRows.some(r => r.id === 'combo');
  const groupRows = tab !== 'preset' && !rowsFromPreset && autotuneGroup === tab ? autotuneRows : [];

  const apply = (id: AutotuneRow['id']) => {
    if (id === 'combo') return;
    if (tab === 'youtube') setYoutubeStrategy(id);
    else setSitesStrategy(id);
  };

  const current = `Сейчас: Discord — ${findYoutubeStrategy(quickToggles.sitesStrategy).label} · YouTube — ${findYoutubeStrategy(quickToggles.youtubeStrategy).label}`;

  return (
    <div className="h-full overflow-y-auto p-5 flex flex-col gap-3.5">
      <PageHeader
        title="Подбор способа обхода"
        subtitle="Автоматический поиск стратегии, которая открывает Discord и YouTube у вашего провайдера"
        actions={
          <Button variant="secondary" size="sm" icon={Sliders} onClick={() => setActiveTab('presets')}>
            Стратегии (для опытных)
          </Button>
        }
      />

      <div>
        <Segmented<AutotuneTab>
          value={tab}
          onChange={selectTab}
          disabled={isAutotuneRunning}
          items={[
            { id: 'preset', label: 'Весь пресет', extra: <span className="px-1.5 rounded text-[11px] bg-ac/15 text-ac-300">Рекомендуется</span> },
            { id: 'sites', label: 'Discord и сайты' },
            { id: 'youtube', label: 'YouTube' }
          ]}
        />
      </div>

      {tab === 'preset'
        ? <PresetFlow />
        : <GroupFlow group={tab} rows={groupRows} onApply={apply} onStart={() => startAutotune(tab)} />}

      <div className="mt-auto pt-1 text-[11px] text-t3 truncate">{current}</div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Строка перебора
// ---------------------------------------------------------------------------

/** Стиль строки по её состоянию — девять состояний из дизайн-системы. */
const rowLook = (row: AutotuneRow) => {
  const freeze = row.phase === 'done' && !row.ok && /заморозк/i.test(row.detail);
  if (row.phase === 'idle') return { icon: Clock, box: 'border-white/[0.04] opacity-70', ic: 'text-t3', text: 'В очереди', tone: 'text-t2' };
  if (row.phase === 'starting') return { icon: Cpu, box: 'bg-blue-500/[0.08] border-blue-500/20', ic: 'text-blue-400', text: 'Поднимается ядро…', tone: 'text-t2' };
  if (row.phase === 'testing') return { icon: RefreshCw, spin: true, box: 'bg-ac/[0.08] border-ac/[0.22]', ic: 'text-ac-400', text: 'Проверка соединения…', tone: 'text-t2' };
  if (row.phase === 'finalist') return { icon: Zap, box: 'bg-amber-500/[0.12] border-amber-500/[0.28]', ic: 'text-amber-500', text: 'Прошёл быстрый отсев — ждёт полной проверки', tone: 'text-amber-400' };
  if (row.phase === 'browser') return { icon: Globe, box: 'bg-sky-400/10 border-sky-400/25', ic: 'text-sky-400', text: 'Открываю страницу в браузере…', tone: 'text-t2' };
  if (row.phase === 'skipped') return { icon: Minimize2, box: 'border-white/[0.03] opacity-45', ic: 'text-t3', text: 'Не понадобился: рабочий способ нашёлся раньше', tone: 'text-t2' };

  // done
  if (row.id === 'off') {
    return row.ok
      ? { icon: CheckCircle2, box: 'bg-green-500/[0.12] border-green-500/[0.28]', ic: 'text-green-500', text: `Открылось без обхода — ${row.passed} из ${row.total}`, tone: 'text-green-400' }
      : { icon: XCircle, box: 'bg-s2 border-line', ic: 'text-t3', text: `Без обхода не открывается — ${row.passed} из ${row.total}`, tone: 'text-t2' };
  }
  if (row.ok) {
    return { icon: CheckCircle2, box: 'bg-green-500/[0.12] border-green-500/[0.28]', ic: 'text-green-500',
      text: `Работает · ${row.passed} из ${row.total}${row.detail ? ' · ' + row.detail : ''}`, tone: 'text-green-400' };
  }
  if (freeze) {
    return { icon: AlertTriangle, box: 'bg-red-500/[0.12] border-red-500/[0.28]', ic: 'text-red-500', text: row.detail.replace(/^.*браузер:\s*/i, ''), tone: 'text-red-300' };
  }
  return { icon: XCircle, box: 'bg-red-500/[0.05] border-red-500/15 opacity-[0.72]', ic: 'text-red-500/80',
    text: `Не прошёл · ${row.detail || `${row.passed} из ${row.total}`}`, tone: 'text-t2' };
};

const RowItem: React.FC<{ row: AutotuneRow; best?: boolean; onApply?: () => void }> = ({ row, best, onApply }) => {
  const look = rowLook(row);
  const Icon = look.icon;
  return (
    <div className={`flex items-center justify-between gap-3 px-3 py-2 rounded-[8px] text-[12px] border ${look.box}`} title={look.text}>
      <div className="flex items-center gap-2.5 min-w-0">
        <Icon className={`w-3.5 h-3.5 shrink-0 ${look.ic} ${look.spin ? 'animate-spin' : ''}`} />
        <span className="font-medium truncate text-t1">{row.id === 'off' ? 'Без обхода (эталон)' : row.label}</span>
        {best && <span className="px-1.5 rounded text-[10px] font-semibold bg-green-500/20 text-green-400 shrink-0">ЛУЧШИЙ</span>}
      </div>
      <div className="flex items-center gap-2 min-w-0 max-w-[62%]">
        <span className={`text-[11px] text-right truncate ${look.tone}`}>{look.text}</span>
        {onApply && <Button variant="secondary" size="sm" onClick={onApply}>Применить</Button>}
      </div>
    </div>
  );
};

const RowList: React.FC<{ rows: AutotuneRow[]; bestId?: string; onApply?: (id: AutotuneRow['id']) => void; canApply?: boolean }> = ({ rows, bestId, onApply, canApply }) => (
  <div className="flex-1 min-h-[120px] max-h-[290px] rounded-[12px] p-2.5 overflow-y-auto space-y-1.5 bg-s1 border border-line">
    {rows.map(r => (
      <RowItem
        key={r.id}
        row={r}
        best={!!bestId && bestId === r.id}
        onApply={canApply && onApply && r.phase === 'done' && r.ok && r.id !== 'off' && r.id !== 'combo' ? () => onApply(r.id) : undefined}
      />
    ))}
  </div>
);

/** Доля пройденных строк — «готово» и «не понадобился». */
const doneShare = (rows: AutotuneRow[]) => {
  if (rows.length === 0) return 0;
  return rows.filter(r => r.phase === 'done' || r.phase === 'skipped').length / rows.length;
};

const ProgressCard: React.FC<{ pct: number; left: number; label?: string; onStop: () => void }> = ({ pct, left, label, onStop }) => (
  <Card className="p-3 flex items-center justify-between gap-4">
    <div className="flex-1 space-y-1 min-w-0">
      <div className="flex items-center justify-between text-[12px] gap-2">
        <span className="font-medium text-t1 truncate">{label || `Прогресс подбора: ${Math.round(pct)}%`}</span>
        <span className="text-t2 shrink-0">Осталось {fmtLeft(left)}</span>
      </div>
      <Progress value={pct} />
    </div>
    <Button variant="danger" icon={Square} onClick={onStop}>Остановить</Button>
  </Card>
);

// ---------------------------------------------------------------------------
// Одна группа
// ---------------------------------------------------------------------------

const GroupFlow: React.FC<{
  group: StrategyGroup;
  rows: AutotuneRow[];
  onApply: (id: AutotuneRow['id']) => void;
  onStart: () => void;
}> = ({ group, rows, onApply, onStart }) => {
  const { isAutotuneRunning, cancelAutotune, quickToggles } = useApp();

  // Вывод общий с мастером первого запуска — см. lib/autotune.ts.
  const summary = summarizeAutotune(rows);
  const best = summary.best;
  const allDone = summary.done > 0 && !isAutotuneRunning;
  const running = isAutotuneRunning && rows.length > 0;
  const currentId = group === 'youtube' ? quickToggles.youtubeStrategy : quickToggles.sitesStrategy;

  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-3.5">
        <Card className="p-4 space-y-2.5">
          <div className="text-[13px] font-semibold text-t1">{GROUP_LABEL[group]}: что будет проверено</div>
          <p className="text-[12px] leading-relaxed text-t2">
            Сначала цели проверяются <b className="text-t1">без обхода</b> — если они открываются и так,
            перебор на этом закончится. Если нет, идут {strategyCount(group)} {plural(strategyCount(group), ['способ', 'способа', 'способов'])} на целях:{' '}
            <span className="font-mono text-ac-300">{TARGETS[group]}</span>.
          </p>
          <p className="text-[12px] leading-relaxed text-t2">
            Три шага: быстрый отсев — по одной попытке на цель; первые прошедшие проверяются полностью,
            трижды; и наконец страница открывается в настоящем браузере (Edge без окна) — так ловится
            заморозка соединения, которую одно рукопожатие не видит.
          </p>
          <p className="text-[12px] leading-relaxed text-t2">
            Меняется только профиль «{GROUP_LABEL[group]}». Обе группы сразу настраивает вкладка «Весь пресет».
          </p>
        </Card>
        <Card className="p-4 space-y-2">
          <div className="flex items-center gap-2 text-[12px] text-t1">
            <Clock className="w-4 h-4 text-t2" />
            <span>Займёт 1–3 минуты, интернет может прерываться на секунду; потом ядро вернётся как было</span>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-t1">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <span>Ничего не применится само — у рабочего способа будет кнопка «Применить»</span>
          </div>
          <Note tone="warn" icon={AlertTriangle}>
            Проверка идёт с физического адаптера, мимо системного прокси и туннелей VPN — иначе она измеряла бы их, а не вашего провайдера.
          </Note>
        </Card>
        <div className="flex justify-end">
          <Button size="lg" icon={Sparkles} onClick={onStart} disabled={isAutotuneRunning}>Начать подбор</Button>
        </div>
      </div>
    );
  }

  const pct = doneShare(rows) * 100;
  const left = (rows.length - rows.filter(r => r.phase === 'done' || r.phase === 'skipped').length) * SECONDS_PER_VARIANT;

  return (
    <div className="flex flex-col gap-3 min-h-0">
      <RowList rows={rows} bestId={allDone && summary.kind !== 'not-needed' ? best?.id : undefined} onApply={onApply} canApply={!isAutotuneRunning} />

      {running && <ProgressCard pct={pct} left={left} onStop={cancelAutotune} />}

      {allDone && (
        <Card tone={summary.kind === 'found' || summary.kind === 'not-needed' ? 'ok' : 'warn'} className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            {summary.kind === 'found' || summary.kind === 'not-needed'
              ? <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
              : <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />}
            <div className="text-[12px] leading-relaxed text-t2">
              {summary.kind === 'not-needed' ? (
                <><b className="text-t1">Обход здесь не нужен.</b> Цели открылись без него — и рукопожатие, и страница в
                браузере, поэтому перебор остановлен. Если приложение всё равно не работает, дело не в DPI: посмотрите
                «Проверку компьютера» на главной (прокси, VPN) и перезапустите сам Discord — у него свой кэш.</>
              ) : summary.kind === 'found' && best ? (
                <><b className="text-t1">Подошло: «{best.label}».</b> Успешных проб {best.passed} из {best.total}, без единого
                срыва. {best.id === currentId ? 'Он уже стоит.' : 'Нажмите «Применить» в его строке.'}</>
              ) : summary.kind === 'empty' ? (
                <><b className="text-t1">Проверка остановлена раньше, чем что-то выяснилось.</b> Способы обхода не
                проверялись — запустите подбор заново и дождитесь конца.</>
              ) : best ? (
                <><b className="text-t1">Полностью не прошёл ни один способ.</b> Лучший — «{best.label}», {best.passed} из {best.total}:
                работает через раз — соединение может устанавливаться и тут же обрываться. Применить можно, но стоит прислать журнал.</>
              ) : (
                <><b className="text-t1">Ни один способ не помог.</b> Цели не открываются ни с обходом, ни без него. Проверьте
                «Проверку компьютера» на главной: включённый системный прокси или VPN забирают трафик до того, как его увидит
                ядро. Если там чисто — пришлите журнал, блокировка нестандартная.</>
              )}
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            {summary.kind === 'partial' && best && best.id !== currentId && (
              <Button variant="secondary" onClick={() => onApply(best.id)}>Применить лучший способ</Button>
            )}
            <Button variant="secondary" icon={RefreshCw} onClick={onStart}>Запустить заново</Button>
          </div>
        </Card>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Весь пресет
// ---------------------------------------------------------------------------

/** Что найдено для группы — одной строкой. */
const pickText = (p: AutoPresetPick | undefined): string => {
  if (!p) return '—';
  const label = findYoutubeStrategy(p.id as YoutubeStrategyId).label;
  switch (p.kind) {
    case 'found': return `${label} · ${p.passed} из ${p.total}`;
    case 'partial': return `${label} · через раз, ${p.passed} из ${p.total}`;
    case 'not-needed': return `обход не нужен — остаётся ${label}`;
    default: return `ничего не помогло — остаётся ${label}`;
  }
};

const PresetFlow: React.FC = () => {
  const {
    autoPreset, autotuneRows, applyAutoPreset, undoAutoPreset, quickToggles,
    startAutoPreset, cancelAutotune, isAutotuneRunning
  } = useApp();
  const { stage, sites, youtube, verify } = autoPreset;

  // --- До запуска -------------------------------------------------------
  if (stage === 'idle') {
    return (
      <div className="flex flex-col gap-3.5">
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: Globe, title: '1. Discord и сайты', text: 'Проверяются discord.com, шлюз, картинки, обновления, медиасерверы и страница входа в браузере.' },
            { icon: Play, title: '2. YouTube', text: 'Проверяются сайт, серверы видео и открытие главной страницы в браузере.' },
            { icon: ShieldCheck, title: '3. Проверка целиком', text: 'Оба найденных способа запускаются вместе и проверяются на всех целях: по отдельности могут работать, а вместе — мешать.' }
          ].map(step => {
            const Icon = step.icon;
            return (
              <Card key={step.title} className="p-4 space-y-2">
                <div className="w-8 h-8 rounded-[8px] flex items-center justify-center bg-ac/15">
                  <Icon className="w-4 h-4 text-ac" />
                </div>
                <div className="text-[13px] font-semibold text-t1">{step.title}</div>
                <p className="text-[12px] leading-relaxed text-t2">{step.text}</p>
              </Card>
            );
          })}
        </div>

        <Card className="p-4 space-y-2">
          <div className="flex items-center gap-2 text-[12px] text-t1">
            <Clock className="w-4 h-4 text-t2" />
            <span>Займёт 2–5 минут, интернет может прерываться на секунду. Библиотека — {STRATEGY_COUNT} {plural(STRATEGY_COUNT, ['способ', 'способа', 'способов'])}</span>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-t1">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <span>Ничего не применится само — в конце будет кнопка, и её можно отменить</span>
          </div>
          <Note tone="warn" icon={AlertTriangle}>Голос Discord и QUIC подбором не проверяются — честной пробы для них нет. Эти профили остаются как есть.</Note>
        </Card>

        <div className="flex justify-end">
          <Button size="lg" icon={Sparkles} onClick={startAutoPreset} disabled={isAutotuneRunning}>Собрать пресет</Button>
        </div>
      </div>
    );
  }

  // --- Шаги -------------------------------------------------------------
  const order: ('sites' | 'youtube' | 'verify')[] = ['sites', 'youtube', 'verify'];
  const stageAt = order.indexOf(stage as 'sites' | 'youtube' | 'verify');
  const running = stageAt >= 0;
  const results: Record<'sites' | 'youtube' | 'verify', string | undefined> = {
    sites: sites ? pickText(sites) : undefined,
    youtube: youtube ? pickText(youtube) : undefined,
    verify: verify ? (verify.ok ? `все цели · ${verify.passed} из ${verify.total}` : `${verify.passed} из ${verify.total}`) : undefined
  };
  const labels = { sites: 'Discord и сайты', youtube: 'YouTube', verify: 'Проверка целиком' };

  const rowsDone = autotuneRows.filter(r => r.phase === 'done' || r.phase === 'skipped').length;
  const share = doneShare(autotuneRows);
  // Доли шагов: две группы — основное время, проверка целиком — короткая.
  const base = { sites: 0, youtube: 45, verify: 90 }[stage as 'sites'] ?? 100;
  const span = { sites: 45, youtube: 45, verify: 10 }[stage as 'sites'] ?? 0;
  const pct = running ? base + span * share : 100;
  const left = running
    ? (autotuneRows.length - rowsDone) * SECONDS_PER_VARIANT
      + (stage === 'sites' ? strategyCount('youtube') * SECONDS_PER_VARIANT * 0.6 : 0)
      + (stage !== 'verify' ? 20 : 0)
    : 0;

  const finished = stage === 'done';
  const changed = !!sites && !!youtube &&
    (sites.id !== quickToggles.sitesStrategy || youtube.id !== quickToggles.youtubeStrategy);

  return (
    <div className="flex flex-col gap-3 min-h-0">
      <div className="grid grid-cols-3 gap-2.5">
        {order.map((id, i) => {
          const isCurrent = id === stage;
          const result = results[id];
          const isDone = result !== undefined;
          const box = isCurrent ? 'bg-ac/15 border-ac/40'
            : isDone ? 'bg-green-500/[0.12] border-green-500/[0.28]'
            : 'bg-s1 border-line opacity-60';
          return (
            <div key={id} className={`px-3 py-2 rounded-[10px] border flex items-center justify-between gap-2 ${box}`}>
              <div className="min-w-0">
                <div className={`text-[11px] ${isCurrent ? 'text-ac-300' : isDone ? 'text-green-300' : 'text-t3'}`}>
                  Шаг {i + 1} · {isCurrent ? 'Идёт' : isDone ? 'Готово' : stage === 'cancelled' ? 'Не выполнен' : 'Ждёт'}
                </div>
                <div className="text-[12px] font-semibold text-t1">{labels[id]}</div>
                <div className={`text-[11px] truncate ${isDone ? 'text-green-400' : 'text-t2'}`}>
                  {result ?? (isCurrent ? `Способ ${Math.min(rowsDone + 1, autotuneRows.length)} из ${autotuneRows.length}` : '—')}
                </div>
              </div>
              {isCurrent ? <RefreshCw className="w-4 h-4 animate-spin text-ac shrink-0" />
                : isDone ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                : <Clock className="w-4 h-4 text-t3 shrink-0" />}
            </div>
          );
        })}
      </div>

      {running && autotuneRows.length > 0 && <RowList rows={autotuneRows} />}
      {running && <ProgressCard pct={pct} left={left} label={`Прогресс сборки: ${Math.round(pct)}%`} onStop={cancelAutotune} />}

      {stage === 'cancelled' && (
        <Card tone="warn" className="p-4 flex items-center justify-between gap-3">
          <div className="text-[12px] text-t2"><b className="text-t1">Сборка остановлена.</b> Ничего не изменено — запустите заново, когда будет удобно.</div>
          <Button variant="secondary" icon={RefreshCw} onClick={startAutoPreset}>Собрать заново</Button>
        </Card>
      )}

      {finished && sites && youtube && (
        <Card tone={verify?.ok ? 'ok' : 'warn'} className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            {verify?.ok
              ? <CheckCircle2 className="w-6 h-6 text-green-500 shrink-0 mt-0.5" />
              : <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />}
            <div>
              <h2 className="text-[15px] font-semibold text-t1">
                {verify?.ok
                  ? 'Пресет собран и проверен целиком — все цели открылись без единого срыва'
                  : 'Собранный пресет прошёл не все пробы'}
              </h2>
              <p className="text-[12px] mt-0.5 text-t2">
                {verify?.ok
                  ? 'Оба способа протестированы вместе на всех серверах Discord и YouTube.'
                  : `${verify?.detail ? verify.detail + '. ' : ''}Применить можно, но стоит прислать журнал подбора.`}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {([['Discord и сайты', sites], ['YouTube', youtube]] as [string, AutoPresetPick][]).map(([label, p]) => (
              <div key={label} className="p-3.5 rounded-[10px] bg-s2 border border-line">
                <div className="text-[11px] text-t2">{label}</div>
                <div className="text-[14px] font-semibold mt-0.5 text-t1">{findYoutubeStrategy(p.id).label}</div>
                <div className={`text-[12px] mt-0.5 ${p.kind === 'found' ? 'text-green-400' : p.kind === 'partial' ? 'text-amber-400' : 'text-t2'}`}>
                  {p.kind === 'found' ? `Работает · ${p.passed} из ${p.total}` : pickText(p)}
                </div>
              </div>
            ))}
          </div>

          {!changed && !autoPreset.applied && (
            <p className="text-[12px] text-t2">Найденное совпадает с тем, что уже стоит, — менять нечего.</p>
          )}

          <div className="flex items-center justify-between gap-2.5 pt-1">
            <Button variant="ghost" icon={RefreshCw} onClick={startAutoPreset}>Собрать заново</Button>
            <div className="flex items-center gap-2.5">
              {autoPreset.applied ? (
                <>
                  <Button variant="secondary" icon={RotateCcw} onClick={undoAutoPreset}>Вернуть как было</Button>
                  <Button variant="success" icon={Check}>Применено</Button>
                </>
              ) : changed ? (
                <Button size="lg" icon={Check} onClick={applyAutoPreset}>Применить пресет</Button>
              ) : null}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
