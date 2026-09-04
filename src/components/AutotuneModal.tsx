import React from 'react';
import { Wand2, X, Loader2, CheckCircle2, XCircle, Circle, Play, Square } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { findYoutubeStrategy } from '../lib/zapretCommand';



/**
 * Автоподбор стратегии YouTube.
 *
 * Раньше подбор выглядел так: переключить чип, дождаться перезапуска ядра,
 * очистить кэш DNS, открыть новую вкладку, посмотреть, повторить. Семь раз.
 * Здесь то же самое делает нативная сторона: поднимает ядро с каждым
 * вариантом и проверяет TCP+TLS с настоящим SNI.
 *
 * Проверка идёт мимо системного прокси (TcpClient/SslStream его не
 * используют), а имена резолвятся один раз до перебора — иначе DNS стал бы
 * ещё одной переменной и варианты нельзя было бы сравнивать между собой.
 */
export const AutotuneModal: React.FC = () => {
  const {
    autotuneRows, isAutotuneRunning, startAutotune, cancelAutotune,
    setYoutubeStrategy, quickToggles,
    isAutotuneModalOpen, setIsAutotuneModalOpen, theme
  } = useApp();

  if (!isAutotuneModalOpen) return null;

  const onClose = () => setIsAutotuneModalOpen(false);

  const finished = autotuneRows.filter(r => r.phase === 'done');
  const winners = finished.filter(r => r.ok).sort((a, b) => a.ms - b.ms);
  const allDone = autotuneRows.length > 0 && finished.length === autotuneRows.length;

  const apply = (id: typeof autotuneRows[number]['id']) => {
    setYoutubeStrategy(id);
    onClose();
  };

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
              <h3 className="text-sm font-bold">Автоподбор стратегии YouTube</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Ядро поднимается с каждым вариантом, затем идёт проверка TCP + TLS
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

        {/* Пояснение до запуска */}
        {autotuneRows.length === 0 && (
          <div className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400 space-y-2">
            <p>
              Будут проверены шесть вариантов обхода на двух целях:
              <span className="font-mono text-indigo-500"> www.youtube.com</span> и
              <span className="font-mono text-indigo-500"> googlevideo.com</span>.
              Займёт примерно полторы минуты.
            </p>
            <p>
              На это время обход будет перезапускаться, связь может кратко прерываться.
              По окончании ядро вернётся в то состояние, в котором было.
            </p>
            <p className="text-amber-600 dark:text-amber-400">
              Проверка идёт напрямую, мимо системного прокси — иначе она проверяла бы
              прокси, а не обход.
            </p>
          </div>
        )}

        {/* Таблица результатов */}
        {autotuneRows.length > 0 && (
          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {autotuneRows.map(row => {
              const isBest = allDone && winners.length > 0 && winners[0].id === row.id;
              const active = row.phase === 'starting' || row.phase === 'testing';

              return (
                <div
                  key={row.id}
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs transition-colors ${
                    isBest
                      ? 'border-emerald-500/40 bg-emerald-500/10'
                      : active
                        ? 'border-indigo-500/40 bg-indigo-500/10'
                        : theme === 'dark'
                          ? 'bg-slate-900/40 border-white/5'
                          : 'bg-white border-slate-200/80'
                  }`}
                >
                  <div className="w-4 shrink-0">
                    {active && <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />}
                    {row.phase === 'done' && row.ok && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                    {row.phase === 'done' && !row.ok && <XCircle className="w-4 h-4 text-rose-500" />}
                    {row.phase === 'idle' && <Circle className="w-3.5 h-3.5 text-slate-500" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{row.label}</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                      {row.phase === 'starting' && 'Поднимается ядро...'}
                      {row.phase === 'testing' && 'Проверка соединения...'}
                      {row.phase === 'idle' && 'В очереди'}
                      {row.phase === 'done' && (row.detail
                        ? row.detail
                        : `Пройдено ${row.passed} из ${row.total} · ${row.ms} мс`)}
                    </div>
                  </div>

                  {isBest && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-500 shrink-0">
                      ЛУЧШИЙ
                    </span>
                  )}

                  {row.phase === 'done' && row.ok && !isAutotuneRunning && (
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
        )}

        {/* Итог */}
        {allDone && (
          <div className={`p-2.5 rounded-xl text-[11px] leading-relaxed border ${
            winners.length > 0
              ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
              : 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300'
          }`}>
            {winners.length > 0 ? (
              <>Сработавших вариантов: {winners.length}. Быстрее всех — «{winners[0].label}».</>
            ) : (
              <>
                Ни один вариант не пробил блокировку. Это не обязательно вина обхода:
                если включён системный прокси, трафик YouTube может вообще не доходить
                до ядра. Проверьте плашку окружения на главной.
              </>
            )}
          </div>
        )}

        {/* Кнопки */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] text-slate-500 dark:text-slate-400">
            Текущая стратегия: {findYoutubeStrategy(quickToggles.youtubeStrategy).label}
          </span>

          {isAutotuneRunning ? (
            <button
              onClick={cancelAutotune}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-500 hover:bg-rose-500/30"
            >
              <Square className="w-3.5 h-3.5" />
              Остановить
            </button>
          ) : (
            <button
              onClick={startAutotune}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600"
            >
              <Play className="w-3.5 h-3.5" />
              {autotuneRows.length > 0 ? 'Запустить заново' : 'Начать подбор'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
