import React, { useEffect, useState } from 'react';
import { Wand2, X, Loader2, CheckCircle2, XCircle, Circle, Play, Square, Layers, Undo2, MinusCircle } from 'lucide-react';
import { useApp, AutoPresetPick } from '../context/AppContext';
import { findYoutubeStrategy, STRATEGY_ORDER } from '../lib/zapretCommand';
import { summarizeAutotune } from '../lib/autotune';
import { AutotuneRow, StrategyGroup, YoutubeStrategyId } from '../types';

type Tab = StrategyGroup | 'preset';

/** Сколько стратегий перебирается в группе, без эталона. */
const strategyCount = (g: StrategyGroup) => STRATEGY_ORDER[g].filter(id => id !== 'off').length;
const STRATEGY_COUNT = new Set([...STRATEGY_ORDER.sites, ...STRATEGY_ORDER.youtube].filter(id => id !== 'off')).size;

/**
 * Автоподбор стратегии.
 *
 * Раньше подбор выглядел так: переключить чип, дождаться перезапуска ядра,
 * очистить кэш DNS, открыть новую вкладку, посмотреть, повторить. Здесь то
 * же самое делает нативная сторона: поднимает ядро с каждым вариантом и
 * проверяет TCP+TLS с настоящим SNI.
 *
 * Проверка идёт мимо системного прокси (TcpClient/SslStream его не
 * используют) И мимо туннелей: сокет привязывается к адресу физической
 * сетевой карты. Без привязки поднятый VPN уводил проверку в туннель, где
 * работает всё, и подбор сообщал, что прошли все варианты сразу.
 *
 * Имена резолвятся один раз до перебора — иначе DNS стал бы ещё одной
 * переменной и варианты нельзя было бы сравнивать между собой.
 *
 * Вкладка «Весь пресет» запускает подбор обеих групп подряд и проверяет
 * собранную команду целиком — см. startAutoPreset в AppContext.
 */
export const AutotuneModal: React.FC = () => {
  const {
    autotuneRows, isAutotuneRunning, startAutotune, cancelAutotune,
    autotuneGroup, setAutotuneGroup,
    setYoutubeStrategy, setSitesStrategy, quickToggles,
    autoPreset, startAutoPreset, applyAutoPreset, undoAutoPreset,
    isAutotuneModalOpen, setIsAutotuneModalOpen, theme
  } = useApp();

  const presetRunning = autoPreset.stage === 'sites' || autoPreset.stage === 'youtube' || autoPreset.stage === 'verify';
  const [tab, setTab] = useState<Tab>(autotuneGroup);

  // Окно открывают кнопкой конкретной группы — показываем её. Идущая сборка
  // пресета важнее: её нельзя потерять из виду.
  useEffect(() => {
    if (isAutotuneModalOpen) setTab(presetRunning ? 'preset' : autotuneGroup);
  }, [isAutotuneModalOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isAutotuneModalOpen) return null;

  const onClose = () => setIsAutotuneModalOpen(false);

  // Вывод общий с мастером первого запуска — см. lib/autotune.ts.
  const summary = summarizeAutotune(autotuneRows);
  const best = summary.best;
  const bestIsFull = summary.kind === 'found';
  const baselineClean = summary.kind === 'not-needed';

  // Перебор может закончиться раньше списка: если эталон прошёл, остальные
  // варианты не гоняются. Поэтому итог показываем по факту остановки.
  const allDone = summary.done > 0 && !isAutotuneRunning;

  // Группы подбираются раздельно, потому что провайдеры ведут себя с
  // YouTube и с Discord по-разному: у одного и того же человека для YouTube
  // может проходить seqovl, а для Discord — только multidisorder.
  const groups: { id: Tab; label: string; targets: string }[] = [
    { id: 'youtube', label: 'YouTube', targets: 'www.youtube.com, googlevideo.com' },
    { id: 'sites', label: 'Сайты и Discord', targets: 'discord.com, gateway.discord.gg, cdn.discordapp.com, updates.discord.com, latency.discord.media:2053' },
    { id: 'preset', label: 'Весь пресет', targets: '' }
  ];
  const currentGroup = groups.find(g => g.id === tab) || groups[0];

  // Таблица группы показывает только её собственный перебор: строки сборки
  // пресета к одиночной группе отношения не имеют.
  const rowsFromPreset = presetRunning || autotuneRows.some(r => r.id === 'combo');
  const groupRows = tab !== 'preset' && !rowsFromPreset && autotuneGroup === tab ? autotuneRows : [];

  const apply = (id: AutotuneRow['id']) => {
    if (id === 'combo') return;
    if (tab === 'youtube') setYoutubeStrategy(id);
    else setSitesStrategy(id);
    onClose();
  };

  const selectTab = (t: Tab) => {
    setTab(t);
    if (t !== 'preset') setAutotuneGroup(t);
  };

  const renderRows = (rows: AutotuneRow[], allowApply: boolean) => (
    <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
      {rows.map(row => {
        const isBest = allowApply && allDone && !baselineClean && !!best && best.id === row.id;
        const active = row.phase === 'starting' || row.phase === 'testing' || row.phase === 'browser';

        return (
          <div
            key={row.id}
            className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs transition-colors ${
              isBest
                ? 'border-emerald-500/40 bg-emerald-500/10'
                : active
                  ? 'border-indigo-500/40 bg-indigo-500/10'
                  : row.phase === 'finalist'
                    ? 'border-amber-500/30 bg-amber-500/5'
                    : theme === 'dark'
                      ? 'bg-slate-900/40 border-white/5'
                      : 'bg-white border-slate-200/80'
            } ${row.phase === 'skipped' ? 'opacity-50' : ''}`}
          >
            <div className="w-4 shrink-0">
              {active && <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />}
              {row.phase === 'done' && row.ok && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
              {row.phase === 'done' && !row.ok && <XCircle className="w-4 h-4 text-rose-500" />}
              {row.phase === 'finalist' && <CheckCircle2 className="w-4 h-4 text-amber-500" />}
              {row.phase === 'skipped' && <MinusCircle className="w-3.5 h-3.5 text-slate-500" />}
              {row.phase === 'idle' && <Circle className="w-3.5 h-3.5 text-slate-500" />}
            </div>

            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{row.label}</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                {row.phase === 'starting' && 'Поднимается ядро...'}
                {row.phase === 'testing' && 'Проверка соединения...'}
                {row.phase === 'browser' && 'Открываю страницу в браузере (Edge без окна)...'}
                {row.phase === 'idle' && 'В очереди'}
                {row.phase === 'finalist' && 'Прошёл быстрый отсев — ждёт полной проверки'}
                {row.phase === 'skipped' && 'Не понадобился: рабочий вариант нашёлся раньше'}
                {row.phase === 'done' && (
                  row.id === 'off'
                    ? (row.ok
                        ? `Открылось без обхода — ${row.passed} из ${row.total}`
                        : `Без обхода не открывается — ${row.passed} из ${row.total}`)
                    : `Успешных проб: ${row.passed} из ${row.total}` +
                      (row.detail ? ` · ${row.detail}` : '') +
                      ` · ${row.ms} мс`
                )}
              </div>
            </div>

            {isBest && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-500 shrink-0">
                ЛУЧШИЙ
              </span>
            )}

            {allowApply && row.phase === 'done' && row.ok && row.id !== 'off' && !isAutotuneRunning && (
              <button
                onClick={() => apply(row.id)}
                className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-indigo-500/20 text-indigo-500 hover:bg-indigo-500/30 shrink-0"
              >
                Применить
              </button>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn select-none">
      <div className={`w-full max-w-xl rounded-2xl border p-5 shadow-2xl space-y-4 ${
        theme === 'dark' ? 'bg-slate-900 border-indigo-500/40 text-slate-100' : 'bg-white border-indigo-200 text-slate-900'
      }`}>
        {/* Шапка */}
        <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-500 flex items-center justify-center">
              <Wand2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Автоподбор стратегии</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Ядро поднимается с каждым вариантом, затем идёт соединение как у браузера
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isAutotuneRunning}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 disabled:opacity-30"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Что подбираем */}
        <div className="flex items-center gap-1 p-0.5 rounded-xl bg-black/5 dark:bg-white/5">
          {groups.map(g => (
            <button
              key={g.id}
              onClick={() => selectTab(g.id)}
              disabled={isAutotuneRunning}
              className={`flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors disabled:opacity-40 ${
                tab === g.id
                  ? 'bg-white dark:bg-white/15 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {g.id === 'preset' && <Layers className="w-3 h-3" />}
              {g.label}
            </button>
          ))}
        </div>

        {tab === 'preset' ? (
          <PresetTab renderRows={renderRows} />
        ) : (
          <>
            {/* Пояснение до запуска */}
            {groupRows.length === 0 && (
              <div className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400 space-y-2">
                <p>
                  Сначала цели проверяются <b>без обхода</b> — если они открываются и так,
                  перебор на этом и закончится. Если нет, идут {strategyCount(tab as StrategyGroup)} вариантов
                  на целях: <span className="font-mono text-indigo-500">{currentGroup.targets}</span>.
                </p>
                <p>
                  Проверка в три шага: быстрый отсев — по одной попытке на цель; первые
                  прошедшие проверяются полностью, трижды; и наконец страница открывается
                  в настоящем браузере (Edge без окна) — так ловится заморозка соединения,
                  которую одно рукопожатие не видит.
                </p>
                <p>
                  Подбор меняет только профиль «{currentGroup.label}». Обе группы сразу
                  настраивает вкладка «Весь пресет».
                </p>
                <p>
                  На это время обход будет перезапускаться, связь может кратко прерываться.
                  По окончании ядро вернётся в то состояние, в котором было.
                </p>
                <p className="text-amber-600 dark:text-amber-400">
                  Проверка идёт с физического адаптера, мимо системного прокси и мимо
                  туннелей VPN — иначе она измеряла бы их, а не вашего провайдера.
                </p>
              </div>
            )}

            {groupRows.length > 0 && renderRows(groupRows, true)}

            {/* Итог одной фразой — отвечает на единственный вопрос, ради
                которого подбор и запускают. */}
            {allDone && groupRows.length > 0 && (
              <div className={`p-2.5 rounded-xl text-[11px] leading-relaxed border ${
                baselineClean || bestIsFull
                  ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
                  : 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300'
              }`}>
                {baselineClean ? (
                  <>
                    <b>Обход здесь не нужен.</b> Цели открылись без него — блокировки не
                    видно, поэтому перебор остановлен. Если приложение всё равно не
                    работает, дело не в DPI: посмотрите плашку окружения на главной
                    (прокси, VPN) и перезапустите сам Discord — у него свой кэш.
                  </>
                ) : bestIsFull && best ? (
                  <>
                    <b>Подошло: «{best.label}».</b> Успешных проб {best.passed} из {best.total},
                    без единого срыва. Нажмите «Применить» в его строке.
                  </>
                ) : summary.kind === 'empty' ? (
                  <>
                    <b>Проверка остановлена раньше, чем что-то выяснилось.</b> Варианты
                    обхода не проверялись — запустите подбор заново и дождитесь конца.
                  </>
                ) : best ? (
                  <>
                    <b>Полностью не прошёл ни один вариант.</b> Лучший — «{best.label}»,
                    {' '}{best.passed} из {best.total}. Такой вариант работает через раз:
                    соединение может устанавливаться и тут же обрываться. Применить его
                    можно, но стоит прислать журнал.
                  </>
                ) : (
                  <>
                    <b>Ни один вариант не помог.</b> Цели не открываются ни с обходом, ни
                    без него. Проверьте плашку окружения на главной: включённый системный
                    прокси или VPN забирают трафик до того, как его увидит ядро. Если там
                    чисто — пришлите журнал, блокировка нестандартная.
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* Кнопки */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] text-slate-500 dark:text-slate-400">
            {tab === 'preset'
              ? `Сейчас: сайты — ${findYoutubeStrategy(quickToggles.sitesStrategy).label}, YouTube — ${findYoutubeStrategy(quickToggles.youtubeStrategy).label}`
              : `${currentGroup.label} — сейчас: ${findYoutubeStrategy(tab === 'youtube' ? quickToggles.youtubeStrategy : quickToggles.sitesStrategy).label}`}
          </span>

          {isAutotuneRunning ? (
            <button
              onClick={cancelAutotune}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-500 hover:bg-rose-500/30 shrink-0"
            >
              <Square className="w-3.5 h-3.5" />
              Остановить
            </button>
          ) : tab === 'preset' ? (
            <button
              onClick={startAutoPreset}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 shrink-0"
            >
              <Play className="w-3.5 h-3.5" />
              {autoPreset.stage === 'idle' ? 'Собрать пресет' : 'Собрать заново'}
            </button>
          ) : (
            <button
              onClick={() => startAutotune(tab)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 shrink-0"
            >
              <Play className="w-3.5 h-3.5" />
              {groupRows.length > 0 ? 'Запустить заново' : 'Начать подбор'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

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

const PresetTab: React.FC<{ renderRows: (rows: AutotuneRow[], allowApply: boolean) => React.ReactNode }> = ({ renderRows }) => {
  const { autoPreset, autotuneRows, applyAutoPreset, undoAutoPreset, quickToggles } = useApp();
  const { stage, sites, youtube, verify } = autoPreset;

  const steps: { id: 'sites' | 'youtube' | 'verify'; label: string; result?: string }[] = [
    { id: 'sites', label: 'Сайты и Discord', result: sites ? pickText(sites) : undefined },
    { id: 'youtube', label: 'YouTube', result: youtube ? pickText(youtube) : undefined },
    {
      id: 'verify', label: 'Проверка пресета целиком',
      result: verify ? (verify.ok ? `все цели · ${verify.passed} из ${verify.total}` : `${verify.passed} из ${verify.total}`) : undefined
    }
  ];
  const order = ['sites', 'youtube', 'verify'];
  const stageAt = order.indexOf(stage);

  if (stage === 'idle') {
    return (
      <div className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400 space-y-2">
        <p>
          Программа сама соберёт команду обхода из библиотеки в {STRATEGY_COUNT} вариантов.
          Это три подбора подряд, около 4–8 минут:
        </p>
        <ol className="list-decimal pl-5 space-y-1">
          <li><b>Сайты и Discord</b> — discord.com, шлюз, картинки, обновления и медиасерверы; страница входа Discord в браузере.</li>
          <li><b>YouTube</b> — www.youtube.com и сервер видео googlevideo.com; главная YouTube в браузере.</li>
          <li>
            <b>Проверка целиком</b> — оба найденных варианта вместе, на всех целях
            сразу и обеих страницах в браузере. По отдельности варианты могут работать,
            а вместе — мешать друг другу.
          </li>
        </ol>
        <p>
          Само ничего не применится: в конце будет сводка и кнопка «Применить». Её
          можно будет отменить одной кнопкой.
        </p>
        <p className="text-amber-600 dark:text-amber-400">
          QUIC и голос Discord подбором не проверяются — честной пробы для них нет.
          Эти профили остаются как есть.
        </p>
      </div>
    );
  }

  const finished = stage === 'done';
  const changed = !!sites && !!youtube &&
    (sites.id !== quickToggles.sitesStrategy || youtube.id !== quickToggles.youtubeStrategy);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {steps.map((s, i) => {
          const isCurrent = s.id === stage;
          const isDone = s.result !== undefined;
          return (
            <div key={s.id} className={`flex items-center gap-2.5 p-2 rounded-xl border text-xs ${
              isCurrent ? 'border-indigo-500/40 bg-indigo-500/10' : 'border-black/5 dark:border-white/5'
            }`}>
              <div className="w-4 shrink-0">
                {isCurrent ? <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
                  : isDone ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  : <Circle className="w-3.5 h-3.5 text-slate-500" />}
              </div>
              <span className="font-semibold w-44 shrink-0">{i + 1}. {s.label}</span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                {s.result ?? (stage === 'cancelled' && stageAt === -1 ? 'не выполнено' : isCurrent ? 'идёт...' : 'ждёт')}
              </span>
            </div>
          );
        })}
      </div>

      {!finished && stage !== 'cancelled' && autotuneRows.length > 0 && renderRows(autotuneRows, false)}

      {stage === 'cancelled' && (
        <div className="p-2.5 rounded-xl text-[11px] border border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300">
          <b>Сборка остановлена.</b> Ничего не изменено — запустите заново, когда будет удобно.
        </div>
      )}

      {finished && sites && youtube && (
        <div className={`p-3 rounded-xl text-[11px] leading-relaxed border space-y-2 ${
          verify?.ok
            ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
            : 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300'
        }`}>
          {verify?.ok ? (
            <p><b>Пресет собран и проверен целиком.</b> Все цели открылись без единого срыва.</p>
          ) : (
            <p>
              <b>Собранный пресет прошёл не все пробы.</b>{' '}
              {verify?.detail ? `(${verify.detail}) ` : ''}
              Применить можно, но стоит прислать журнал подбора.
            </p>
          )}
          {!changed && !autoPreset.applied && (
            <p>Найденное совпадает с тем, что уже стоит, — менять нечего.</p>
          )}
          <div className="flex items-center gap-2">
            {!autoPreset.applied && changed && (
              <button
                onClick={applyAutoPreset}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Применить пресет
              </button>
            )}
            {autoPreset.applied && (
              <>
                <span className="font-semibold">Применено.</span>
                <button
                  onClick={undoAutoPreset}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  Вернуть как было
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
