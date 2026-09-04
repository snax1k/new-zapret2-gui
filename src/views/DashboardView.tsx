import React from 'react';
import { PowerButton } from '../components/PowerButton';
import { PresetSelector } from '../components/PresetSelector';
import { QuickToggles } from '../components/QuickToggles';
import { StatusCards } from '../components/StatusCards';
import { PreflightPanel } from '../components/PreflightPanel';
import { Activity, Terminal, Wand2 } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const DashboardView: React.FC = () => {
  const { setActiveTab, setIsAutotuneModalOpen, isAutotuneRunning, theme } = useApp();
  // Кнопки футера делят одно оформление — держим его в одном месте.
  const btn = theme === 'dark'
    ? 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/5'
    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-xs';

  return (
    <div className="h-full flex flex-col justify-between p-6 space-y-6 overflow-y-auto">
      {/* Top Banner / Stats */}
      <StatusCards />

      {/* Что помешает обходу сработать — до того, как жать «Включить». */}
      <PreflightPanel />

      {/* Center Power Section */}
      <div className="py-2 flex items-center justify-center">
        <PowerButton />
      </div>

      {/* Lower Section: Preset Selector & Quick Toggles */}
      <div className="space-y-4">
        <PresetSelector />
        <QuickToggles />
      </div>

      {/* Fast Action Buttons Footer */}
      <div className="pt-2 border-t border-black/5 dark:border-white/5 flex items-center justify-between text-xs">
        <button
          onClick={() => setActiveTab('diagnostics')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${btn}`}
        >
          <Activity className="w-3.5 h-3.5 text-indigo-500" />
          <span>Запустить тест DPI</span>
        </button>

        {/* Сами чипы стратегии живут в «Пресетах» — это настройка пресета.
            Здесь остаётся только подбор: он нужен под рукой. */}
        <button
          onClick={() => setIsAutotuneModalOpen(true)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
            isAutotuneRunning ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40' : btn
          }`}
        >
          <Wand2 className="w-3.5 h-3.5 text-indigo-500" />
          <span>{isAutotuneRunning ? 'Идёт подбор...' : 'Подобрать стратегию'}</span>
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${btn}`}
        >
          <Terminal className="w-3.5 h-3.5 text-indigo-500" />
          <span>Консоль логов</span>
        </button>
      </div>
    </div>
  );
};
