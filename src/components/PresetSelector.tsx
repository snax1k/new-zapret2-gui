import React, { useState } from 'react';
import { ChevronDown, Check, SlidersHorizontal, Sparkles, Zap, ArrowRight } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const PresetSelector: React.FC = () => {
  const { presets, activePresetId, setActivePresetId, activePreset, setActiveTab, addLog, theme } = useApp();
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (id: string) => {
    setActivePresetId(id);
    setIsOpen(false);
    const sel = presets.find(p => p.id === id);
    if (sel) {
      addLog('info', `Выбран пресет обхода: "${sel.name}"`, 'Presets');
    }
  };

  return (
    <div className="relative select-none">
      <div className="flex items-center justify-between mb-1.5 px-0.5">
        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-indigo-500" />
          Активный пресет (Стратегия обхода)
        </label>
        <button
          onClick={() => setActiveTab('presets')}
          className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium transition-colors"
        >
          <span>Настроить</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {/* Main trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full text-left p-3 rounded-xl border transition-all duration-200 shadow-xs group flex items-center justify-between ${
          theme === 'dark'
            ? 'bg-slate-900/80 hover:bg-slate-900 border-white/10 hover:border-indigo-500/40'
            : 'bg-white hover:bg-slate-50 border-slate-200 hover:border-indigo-400'
        }`}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500 shrink-0 group-hover:scale-105 transition-transform">
            <SlidersHorizontal className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{activePreset.name}</span>
              {activePreset.badge && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30 font-medium shrink-0">
                  {activePreset.badge}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                {activePreset.args.desyncMode} • {activePreset.tags.slice(0, 2).join(', ')}
              </span>
            </div>
          </div>
        </div>

        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ml-2 ${
          isOpen ? 'rotate-180 text-indigo-500' : ''
        }`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          {/* Backdrop to close */}
          <div className="fixed inset-0 z-30" onClick={() => setIsOpen(false)} />

          <div className={`absolute left-0 right-0 top-full mt-2 z-40 p-1.5 rounded-2xl border shadow-2xl space-y-1 max-h-72 overflow-y-auto backdrop-blur-xl ${
            theme === 'dark'
              ? 'bg-[#0F172A] border-indigo-500/30 shadow-black/80'
              : 'bg-white border-indigo-200 shadow-slate-400/30'
          }`}>
            <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-1.5 mb-1">
              <span>Доступные пресеты</span>
              <Sparkles className="w-3 h-3 text-indigo-500" />
            </div>

            {presets.map((preset) => {
              const isSelected = preset.id === activePresetId;

              return (
                <div
                  key={preset.id}
                  onClick={() => handleSelect(preset.id)}
                  className={`p-2.5 rounded-xl cursor-pointer transition-all duration-150 flex items-center justify-between ${
                    isSelected
                      ? theme === 'dark'
                        ? 'bg-indigo-600/20 border border-indigo-500/40 text-indigo-200'
                        : 'bg-indigo-50 border border-indigo-300 text-indigo-900'
                      : theme === 'dark'
                        ? 'hover:bg-white/5 border border-transparent text-slate-300'
                        : 'hover:bg-slate-100 border border-transparent text-slate-700'
                  }`}
                >
                  <div className="space-y-1 min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold ${isSelected ? 'font-bold text-indigo-600 dark:text-white' : ''}`}>
                        {preset.name}
                      </span>
                      {preset.badge && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-black/5 dark:bg-white/10 text-slate-600 dark:text-slate-300 border border-black/10 dark:border-white/10">
                          {preset.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1">
                      {preset.description}
                    </p>
                  </div>

                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
