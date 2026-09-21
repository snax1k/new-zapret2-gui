import React from 'react';
import { Wand2, X, Loader2, CheckCircle2, XCircle, Circle, Play, Square } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { findYoutubeStrategy } from '../lib/zapretCommand';
import { StrategyGroup } from '../types';



/**
 * Автоподбор стратегии.
 *
 * Раньше подбор выглядел так: переключить чип, дождаться перезапуска ядра,
 * очистить кэш DNS, открыть новую вкладку, посмотреть, повторить. Семь раз.
 * Здесь то же самое делает нативная сторона: поднимает ядро с каждым
 * вариантом и проверяет TCP+TLS с настоящим SNI.
 *
 * Проверка идёт мимо системного прокси (TcpClient/SslStream его не
 * используют) И мимо туннелей: сокет привязывается к адресу физической
 * сетевой карты. Без привязки поднятый VPN уводил проверку в туннель, где
 * работает всё, и подбор сообщал, что прошли все варианты сразу.
 *
 * Имена резолвятся один раз до перебора — иначе DNS стал бы ещё одной
 * переменной и варианты нельзя было бы сравнивать между собой.
 */
export const AutotuneModal: React.FC = () => {
  const {
    autotuneRows, isAutotuneRunning, startAutotune, cancelAutotune,
    autotuneGroup, setAutotuneGroup,
    setYoutubeStrategy, setSitesStrategy, quickToggles,
    isAutotuneModalOpen, setIsAutotuneModalOpen, theme
  } = useApp();

  if (!isAutotuneModalOpen) return null;

  const onClose = () => setIsAutotuneModalOpen(false);

  const finished = autotuneRows.filter(r => r.phase === 'done');
  // Эталон — не стратегия, применять его нельзя: это ответ на вопрос
  // «а блокируют ли вообще».
  const baseline = autotuneRows.find(r => r.id === 'off');
  const strategies = finished.filter(r => r.id !== 'off');

  // Ранжирование по числу успешных проб, а НЕ по времени.
  //
  // Раньше здесь стояло sort((a, b) => a.ms - b.ms), и побеждал самый
  // быстрый. Это неверно в корне: быстрый ответ часто означает быстрый
  // отказ. На живом замере блокировка по имени сайта отвечала за 38 мс
  // сбросом, а успешное соединение занимало 300 мс. Время оставлено только
  // как разделитель при равном счёте.
  const winners = strategies
    .filter(r => r.passed > 0)
    .sort((a, b) => (b.passed - a.passed) || (a.ms - b.ms));

  const best = winners[0];
  const bestIsFull = !!best && best.ok;

  // Перебор может закончиться раньше списка: если эталон прошёл, остальные
  // варианты не гоняются. Поэтому итог показываем по факту остановки.
  const allDone = finished.length > 0 && !isAutotuneRunning;
  const baselineClean = !!baseline && baseline.phase === 'done' && baseline.ok;

  // Группы подбираются раздельно, потому что провайдеры ведут себя с
  // YouTube и с Discord по-разному: у одного и того же человека для YouTube
  // может проходить seqovl, а для Discord — только multidisorder.
  const groups: { id: StrategyGroup; label: string; targets: string }[] = [
    { id: 'youtube', label: 'YouTube', targets: 'www.youtube.com, googlevideo.com' },
    { id: 'sites', label: 'Сайты и Discord', targets: 'discord.com, gateway.discord.gg, updates.discord.com' }
  ];
  const currentGroup = groups.find(g => g.id === autotuneGroup) || groups[0];
  const currentStrategyId = autotuneGroup === 'youtube'
    ? quickToggles.youtubeStrategy
    : quickToggles.sitesStrategy;

  const apply = (id: typeof autotuneRows[number]['id']) => {
    if (autotuneGroup === 'youtube') setYoutubeStrategy(id);
    else setSitesStrategy(id);
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
              <h3 className="text-sm font-bold">Автоподбор стратегии</h3>
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

        {/* Что подбираем */}
        <div className="flex items-center gap-1 p-0.5 rounded-xl bg-black/5 dark:bg-white/5">
          {groups.map(g => (
            <button
              key={g.id}
              onClick={() => setAutotuneGroup(g.id)}
              disabled={isAutotuneRunning}
              className={`flex-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors disabled:opacity-40 ${
                autotuneGroup === g.id
                  ? 'bg-white dark:bg-white/15 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>

        {/* Пояснение до запуска */}
        {autotuneRows.length === 0 && (
          <div className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400 space-y-2">
            <p>
              Сначала цели проверяются <b>без обхода</b> — если они открываются и так,
              перебор на этом и закончится. Если нет, проверяются семь вариантов на целях:
              <span className="font-mono text-indigo-500"> {currentGroup.targets}</span>.
              Каждая цель проверяется трижды: одна удачная попытка ещё ничего не значит.
            </p>
            <p>
              Подбор меняет только профиль «{currentGroup.label}». Вторая группа
              настраивается отдельно — у провайдеров эти случаи ведут себя
              по-разному, и один результат не переносится на другой.
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

        {/* Таблица результатов */}
        {autotuneRows.length > 0 && (
          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {autotuneRows.map(row => {
              const isBest = allDone && !baselineClean && !!best && best.id === row.id;
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

                  {row.phase === 'done' && row.ok && row.id !== 'off' && !isAutotuneRunning && (
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

        {/* Итог одной фразой.

            Раньше здесь было «сработавших вариантов: N, быстрее всех — X».
            Человеку это не помогало: он и так видел таблицу, а «быстрее
            всех» вдобавок подсказывало неверный выбор. Теперь итог отвечает
            на единственный вопрос, ради которого подбор и запускают. */}
        {allDone && (
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
            ) : bestIsFull ? (
              <>
                <b>Подошло: «{best.label}».</b> Успешных проб {best.passed} из {best.total},
                без единого срыва. Нажмите «Применить» в его строке.
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

        {/* Кнопки */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] text-slate-500 dark:text-slate-400">
            {currentGroup.label} — сейчас: {findYoutubeStrategy(currentStrategyId).label}
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
              onClick={() => startAutotune(autotuneGroup)}
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
