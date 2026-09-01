import React, { useState } from 'react';
import { Terminal, Trash2, Copy, Pause, Play, Filter, FolderOpen } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { LogEntry } from '../types';

export const LogsView: React.FC = () => {
  const { logs, clearLogs, openLogsFolder, theme } = useApp();
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [isPaused, setIsPaused] = useState(false);
  const [copied, setCopied] = useState(false);

  const filteredLogs = logs.filter(log => {
    if (filterLevel === 'all') return true;
    return log.level === filterLevel;
  });

  const copyAll = () => {
    const text = logs.map(l => `[${l.timestamp}] [${l.source || 'Core'}] [${l.level.toUpperCase()}]: ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'success': return 'text-emerald-400';
      case 'error': return 'text-rose-400 font-bold';
      case 'warn': return 'text-amber-400';
      case 'packet': return 'text-cyan-400';
      default: return 'text-slate-300';
    }
  };

  return (
    <div className="h-full flex flex-col p-6 space-y-4 overflow-hidden select-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Terminal className="w-5 h-5 text-indigo-500" />
            Консоль логов ядра (Live Console)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Вывод событий десинхронизации, WinDivert и системных сообщений
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              isPaused
                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border-amber-500/30'
                : 'bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 border-black/5 dark:border-white/5'
            }`}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            <span>{isPaused ? 'Возобновить' : 'Пауза'}</span>
          </button>

          <button
            onClick={copyAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 text-xs font-medium border border-black/5 dark:border-white/5 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>{copied ? 'Скопировано' : 'Копировать'}</span>
          </button>

          <button
            onClick={openLogsFolder}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 text-xs font-medium border border-black/5 dark:border-white/5 transition-colors whitespace-nowrap"
            title="Полный лог пишется в файл с ротацией и упаковкой в zip"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Папка логов</span>
          </button>

          <button
            onClick={clearLogs}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-rose-500/20 text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-300 text-xs font-medium border border-black/5 dark:border-white/5 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Очистить</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 text-xs">
        <Filter className="w-3.5 h-3.5 text-slate-400" />
        {['all', 'info', 'success', 'warn', 'error'].map((lvl) => (
          <button
            key={lvl}
            onClick={() => setFilterLevel(lvl)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
              filterLevel === lvl
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-black/5 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {lvl.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Terminal Output Area */}
      <div className="flex-1 rounded-xl bg-black/90 dark:bg-black/80 border border-slate-700 dark:border-white/10 p-4 font-mono text-[11px] overflow-y-auto space-y-1.5 shadow-inner">
        {filteredLogs.length === 0 ? (
          <div className="text-slate-600 text-center py-12">Журнал логов пуст</div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className="flex items-start gap-2.5 leading-relaxed hover:bg-white/[0.04] px-1 rounded">
              <span className="text-slate-500 shrink-0 select-none">[{log.timestamp}]</span>
              <span className="text-indigo-400 shrink-0 font-semibold select-none">[{log.source || 'Zapret'}]</span>
              <span className={`shrink-0 text-[10px] px-1 py-0.2 rounded bg-white/10 font-bold uppercase select-none ${getLevelColor(log.level)}`}>
                {log.level}
              </span>
              <span className={`break-all ${getLevelColor(log.level)}`}>
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
