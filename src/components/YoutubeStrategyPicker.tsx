import React from 'react';
import { Wand2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { strategiesFor, findYoutubeStrategy } from '../lib/zapretCommand';
import { StrategyGroup } from '../types';

interface Props {
  /** Какой профиль настраивается. По умолчанию YouTube/Google. */
  group?: StrategyGroup;
}

/**
 * Выбор техники обхода для одного профиля.
 *
 * Групп две, и это важно: профиль YouTube/Google (TCP 443, list-google.txt) и
 * профиль обычных сайтов (TCP 80/443, list-general.txt), через который идут
 * discord.com, gateway.discord.gg и updates.discord.com. У одного и того же
 * провайдера они могут требовать разных техник, поэтому подбираются отдельно.
 *
 * Живёт во вкладке «Пресеты», потому что по смыслу это настройка пресета,
 * а не быстрый переключатель: она меняет аргументы одного профиля в командной
 * строке winws. На главной остаётся только кнопка автоподбора.
 */
export const YoutubeStrategyPicker: React.FC<Props> = ({ group = 'youtube' }) => {
  const {
    quickToggles, setYoutubeStrategy, setSitesStrategy,
    setIsAutotuneModalOpen, setAutotuneGroup, isAutotuneRunning, theme, tuneVerdicts
  } = useApp();
  const verdicts = tuneVerdicts[group] || {};
  const anyVerdicts = Object.keys(verdicts).length > 0;

  const isYoutube = group === 'youtube';
  const active = findYoutubeStrategy(
    isYoutube ? quickToggles.youtubeStrategy : quickToggles.sitesStrategy
  );
  const setStrategy = isYoutube ? setYoutubeStrategy : setSitesStrategy;
  const title = isYoutube ? 'Стратегия YouTube и Google' : 'Стратегия сайтов и Discord';
  const subtitle = isYoutube
    ? 'Профиль TCP 443 со списком list-google.txt'
    : 'Профиль сайтов и медиасерверов Discord — через него идут discord.com, шлюз и картинки';

  return (
    <div className="space-y-2.5 select-none">
      <div className="flex items-center justify-between px-0.5">
        <div>
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            {title}
          </span>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">
            {subtitle}
          </p>
        </div>

        <button
          onClick={() => { setAutotuneGroup(group); setIsAutotuneModalOpen(true); }}
          className={`flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${
            isAutotuneRunning
              ? 'border-indigo-500/50 bg-indigo-500/20 text-indigo-400'
              : theme === 'dark'
                ? 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Wand2 className="w-3 h-3 text-indigo-500" />
          {isAutotuneRunning ? 'Идёт подбор...' : 'Подобрать автоматически'}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {strategiesFor(group).map(s => {
          const isActive = s.id === active.id;
          const verdict = verdicts[s.id];
          return (
            <button
              key={s.id}
              onClick={() => setStrategy(s.id)}
              title={s.hint + (verdict === 'ok' ? ' — последний подбор: работает.' : verdict === 'fail' ? ' — последний подбор: не прошёл.' : '')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all duration-200 ${
                isActive
                  ? theme === 'dark'
                    ? 'bg-indigo-950/40 border-indigo-500/50 text-indigo-200'
                    : 'bg-indigo-50 border-indigo-300 text-indigo-900'
                  : theme === 'dark'
                    ? 'bg-slate-900/40 border-white/5 text-slate-400 hover:border-white/10 hover:bg-slate-900/60'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {verdict && (
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${verdict === 'ok' ? 'bg-emerald-500' : 'bg-rose-500/70'}`} />
              )}
              {s.label}
            </button>
          );
        })}
      </div>

      {active.id !== 'off' && verdicts[active.id] === 'fail' && (
        <p className="text-[10px] leading-relaxed text-rose-500 px-0.5">
          Последний подбор этот способ отбраковал: у вашего провайдера он не прошёл проверку.
        </p>
      )}
      {active.id !== 'off' && anyVerdicts && !verdicts[active.id] && (
        <p className="text-[10px] leading-relaxed text-amber-600 dark:text-amber-400 px-0.5">
          Этот способ подбор не проверял — до него не дошла очередь. Надёжнее выбрать отмеченный зелёным.
        </p>
      )}
      <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400 px-0.5">
        {active.hint} Перебирать варианты вручную не нужно: «Подобрать автоматически»
        проверит их на настоящем рукопожатии и в браузере. Зелёная точка — прошёл
        последний подбор, красная — не прошёл.
      </p>
    </div>
  );
};
