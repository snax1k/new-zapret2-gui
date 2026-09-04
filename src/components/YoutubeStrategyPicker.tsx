import React from 'react';
import { Wand2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { YOUTUBE_STRATEGIES, findYoutubeStrategy } from '../lib/zapretCommand';

/**
 * Выбор техники обхода для профиля YouTube/Google (TCP 443, list-google.txt).
 *
 * Живёт во вкладке «Пресеты», потому что по смыслу это настройка пресета,
 * а не быстрый переключатель: она меняет аргументы одного профиля в командной
 * строке winws. На главной остаётся только кнопка автоподбора.
 *
 * Какая техника пробивает DPI, зависит от провайдера и меняется со временем,
 * поэтому вариант подбирается перебором, а не задаётся раз и навсегда.
 */
export const YoutubeStrategyPicker: React.FC = () => {
  const { quickToggles, setYoutubeStrategy, setIsAutotuneModalOpen, isAutotuneRunning, theme } = useApp();
  const active = findYoutubeStrategy(quickToggles.youtubeStrategy);

  return (
    <div className="space-y-2.5 select-none">
      <div className="flex items-center justify-between px-0.5">
        <div>
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Стратегия YouTube и Google
          </span>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">
            Меняет только профиль TCP 443 — Discord и Telegram не затрагиваются
          </p>
        </div>

        <button
          onClick={() => setIsAutotuneModalOpen(true)}
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
        {YOUTUBE_STRATEGIES.map(s => {
          const isActive = s.id === active.id;
          return (
            <button
              key={s.id}
              onClick={() => setYoutubeStrategy(s.id)}
              title={s.hint}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all duration-200 ${
                isActive
                  ? theme === 'dark'
                    ? 'bg-indigo-950/40 border-indigo-500/50 text-indigo-200'
                    : 'bg-indigo-50 border-indigo-300 text-indigo-900'
                  : theme === 'dark'
                    ? 'bg-slate-900/40 border-white/5 text-slate-400 hover:border-white/10 hover:bg-slate-900/60'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400 px-0.5">
        {active.hint} Перебирать варианты вручную не нужно: «Подобрать автоматически»
        проверит их все на настоящем TLS-рукопожатии и покажет, что сработало.
      </p>
    </div>
  );
};
