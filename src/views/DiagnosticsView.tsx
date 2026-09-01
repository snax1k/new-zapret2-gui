import React, { useState } from 'react';
import {
  Activity,
  Play,
  CheckCircle,
  XCircle,
  Loader2,
  Sparkles,
  Server,
  ArrowRight,
  ShieldAlert,
  ChevronDown,
  Info,
  Check,
  Globe2,
  Lock
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const DiagnosticsView: React.FC = () => {
  const { diagnostics, runDiagnostics, isDiagnosticsRunning, setActiveTab, theme } = useApp();
  const [expandedId, setExpandedId] = useState<string>('yt-web');

  return (
    <div className="h-full flex flex-col p-6 space-y-5 overflow-y-auto select-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-500" />
            Инспектор DPI и Диагностика блокировок
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Детальная пошаговая проверка (GoodCheck DPI Test) с контрольным шагом рукопожатия TLS
          </p>
        </div>

        <button
          onClick={runDiagnostics}
          disabled={isDiagnosticsRunning}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md ${
            isDiagnosticsRunning
              ? 'bg-indigo-900/50 text-indigo-300 border border-indigo-500/30 cursor-not-allowed'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-950/30 hover:scale-105'
          }`}
        >
          {isDiagnosticsRunning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Тестирование пакетов...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              <span>Запустить полный тест</span>
            </>
          )}
        </button>
      </div>

      {/* Recommended Strategy Box */}
      <div className={`p-4 rounded-xl border flex items-center justify-between transition-colors ${
        theme === 'dark'
          ? 'bg-gradient-to-r from-indigo-950/60 to-purple-950/40 border-indigo-500/30'
          : 'bg-indigo-50/80 border-indigo-200 shadow-xs'
      }`}>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-500 shrink-0 mt-0.5">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold flex items-center gap-2">
              <span className="text-slate-900 dark:text-slate-100">Автоподбор стратегии для вашего провайдера</span>
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30 font-bold">
                100% УСПЕХ
              </span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
              Лучший результат: <strong className="text-indigo-600 dark:text-indigo-300">YouTube 4K + Discord Voice (Split2 + badseq)</strong>
            </p>
          </div>
        </div>

        <button
          onClick={() => setActiveTab('presets')}
          className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold transition-colors shrink-0 ml-4"
        >
          <span>К пресетам</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Target Items Accordion List */}
      <div className="space-y-3">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          Результаты ступенчатого тестирования (GoodCheck Inspector)
        </span>

        <div className="space-y-3">
          {diagnostics.map((item) => {
            const isExpanded = expandedId === item.id;

            return (
              <div
                key={item.id}
                className={`rounded-2xl border transition-all overflow-hidden ${
                  theme === 'dark'
                    ? 'bg-slate-900/60 border-white/10'
                    : 'bg-white border-slate-200 shadow-xs'
                }`}
              >
                {/* Accordion Header */}
                <div
                  onClick={() => setExpandedId(isExpanded ? '' : item.id)}
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-black/5 dark:hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500 shrink-0">
                      <Server className="w-4 h-4" />
                    </div>

                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <span>{item.name}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/5 dark:bg-white/5 font-mono text-slate-500 dark:text-slate-400">
                          {item.target}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                        IP: {item.ipAddress || 'Определяется...'} • 4 контрольных этапа проверки
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Status badge */}
                    {item.status === 'testing' && (
                      <span className="flex items-center gap-1 text-[11px] text-amber-500 font-medium">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Тест...
                      </span>
                    )}

                    {item.status === 'success' && (
                      <div className="text-right">
                        <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-bold justify-end">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Все тесты пройдены
                        </span>
                        {item.latencyMs && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            {item.latencyMs} мс
                          </span>
                        )}
                      </div>
                    )}

                    {item.status === 'idle' && (
                      <span className="text-[10px] text-slate-500 px-2 py-1 rounded bg-black/5 dark:bg-white/5">
                        Нажмите для просмотра
                      </span>
                    )}

                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                      isExpanded ? 'rotate-180 text-indigo-500' : ''
                    }`} />
                  </div>
                </div>

                {/* Expanded Step-by-Step Breakdown (The Exact GoodCheck Format) */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-black/5 dark:border-white/5 space-y-3 bg-black/[0.02] dark:bg-black/20">
                    <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Что проверялось:
                    </div>

                    <div className="space-y-2.5">
                      {item.steps.map((step, idx) => (
                        <div
                          key={idx}
                          className={`p-3 rounded-xl border transition-colors ${
                            step.status === 'success'
                              ? theme === 'dark' ? 'bg-slate-900/80 border-emerald-500/30' : 'bg-emerald-50/50 border-emerald-200'
                              : step.status === 'testing'
                              ? 'bg-amber-500/10 border-amber-500/30'
                              : theme === 'dark' ? 'bg-black/40 border-white/5' : 'bg-white border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {step.status === 'success' ? (
                                <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center shrink-0">
                                  <Check className="w-3 h-3 stroke-[3]" />
                                </div>
                              ) : step.status === 'testing' ? (
                                <Loader2 className="w-4 h-4 text-amber-500 animate-spin shrink-0" />
                              ) : (
                                <div className="w-5 h-5 rounded-full bg-black/5 dark:bg-white/10 text-slate-400 flex items-center justify-center shrink-0 text-[10px]">
                                  {idx + 1}
                                </div>
                              )}

                              <div className="font-semibold text-xs text-slate-900 dark:text-slate-100">
                                {step.title}
                              </div>
                            </div>

                            {step.latencyMs && (
                              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                                {step.latencyMs} мс
                              </span>
                            )}
                          </div>

                          <div className="pl-7 mt-1 text-[11px] font-mono text-slate-600 dark:text-slate-300">
                            {step.detail}
                          </div>

                          {/* Control Step Explanation Callout */}
                          {step.isControlStep && step.controlExplanation && (
                            <div className="mt-2.5 ml-7 p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-start gap-2 text-[10px] text-indigo-700 dark:text-indigo-300">
                              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              <span>{step.controlExplanation}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
