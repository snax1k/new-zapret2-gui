import React from 'react';
import { PowerButton } from '../components/PowerButton';
import { PresetSelector } from '../components/PresetSelector';
import { QuickToggles } from '../components/QuickToggles';
import { StatusCards } from '../components/StatusCards';
import { Activity, Terminal } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const DashboardView: React.FC = () => {
  const { setActiveTab, theme } = useApp();

  return (
    <div className="h-full flex flex-col justify-between p-6 space-y-6 overflow-y-auto">
      {/* Top Banner / Stats */}
      <StatusCards />

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
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
            theme === 'dark'
              ? 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/5'
              : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-xs'
          }`}
        >
          <Activity className="w-3.5 h-3.5 text-indigo-500" />
          <span>Запустить тест DPI</span>
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
            theme === 'dark'
              ? 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/5'
              : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-xs'
          }`}
        >
          <Terminal className="w-3.5 h-3.5 text-indigo-500" />
          <span>Консоль логов</span>
        </button>
      </div>
    </div>
  );
};
