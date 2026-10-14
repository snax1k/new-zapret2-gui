import React from 'react';
import { Sparkles, ChevronRight } from 'lucide-react';
import { PowerButton } from '../components/PowerButton';
import { QuickToggles } from '../components/QuickToggles';
import { PreflightPanel } from '../components/PreflightPanel';
import { Button } from '../components/ui';
import { useApp } from '../context/AppContext';
import { findYoutubeStrategy } from '../lib/zapretCommand';
import { StrategyGroup, YoutubeStrategyId } from '../types';

/**
 * Главная. За секунду отвечает на «работает ли сейчас», показывает, что
 * настроено и проверено, и что может помешать.
 */
export const DashboardView: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { setActiveTab, quickToggles, tuneVerdicts, activePreset, isAutotuneRunning, preflight } = useApp();

  /** Одна строка «Discord — multidisorder · проверено подбором ✓». */
  const line = (group: StrategyGroup, label: string, id: YoutubeStrategyId) => {
    const strategy = findYoutubeStrategy(id);
    const verdicts = tuneVerdicts[group] || {};
    const verdict = verdicts[id];
    const anyVerdicts = Object.keys(verdicts).length > 0;
    const state = id === 'off'
      ? { text: 'обход выключен', cls: 'text-t3' }
      : verdict === 'ok'
        ? { text: 'проверено ✓', cls: 'text-green-400' }
        : verdict === 'fail'
          ? { text: 'отбракован подбором', cls: 'text-red-300' }
          : { text: anyVerdicts ? 'не проверялся' : 'подбор не запускали', cls: 'text-amber-400' };

    return (
      <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-[8px] text-[12px] bg-s2 border border-line">
        <span className="font-medium text-t1 shrink-0">{label}</span>
        <span className="min-w-0 truncate text-right">
          {id !== 'off' && <span className="text-t1">{strategy.label}</span>}
          {id !== 'off' && <span className="text-t3"> · </span>}
          <span className={state.cls}>{state.text}</span>
        </span>
      </div>
    );
  };

  const hasProblems = preflight.some(p => p.level !== 'ok');

  return (
    <div className={`h-full overflow-y-auto ${compact ? 'p-3.5 space-y-2.5' : 'p-5 space-y-3.5'}`}>
      <PowerButton compact={compact} />

      <div className="grid grid-cols-12 gap-3">
        <div className={`${compact ? 'col-span-12' : hasProblems ? 'col-span-5' : 'col-span-6'} rounded-[12px] p-3.5 flex flex-col justify-between bg-s1 border border-line`}>
          <div>
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <span className="text-[13px] font-semibold text-t1 truncate">Что сейчас настроено</span>
              <Button variant="secondary" size="sm" icon={Sparkles} onClick={() => setActiveTab('autotune')}>
                {isAutotuneRunning ? 'Идёт подбор…' : 'Подобрать заново'}
              </Button>
            </div>
            <div className="space-y-1.5">
              {line('sites', 'Discord', quickToggles.sitesStrategy)}
              {line('youtube', 'YouTube', quickToggles.youtubeStrategy)}
            </div>
          </div>
          <div className="mt-2.5 pt-2 flex items-center justify-between gap-2 text-[11px] border-t border-line text-t3">
            <span className="truncate">Пресет: {activePreset.name}</span>
            <button type="button" onClick={() => setActiveTab('presets')} className="flex items-center gap-1 text-t2 hover:text-t1 hover:underline shrink-0">
              <span>Подробнее</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        <div className={compact ? 'col-span-12' : hasProblems ? 'col-span-7' : 'col-span-6'}>
          <PreflightPanel />
        </div>
      </div>

      <QuickToggles compact={compact} />
    </div>
  );
};
