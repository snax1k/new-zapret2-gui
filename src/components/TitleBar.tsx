import React, { useState } from 'react';
import { Shield, Minus, Square, Copy, X, Cpu, Sun, Moon, Lock } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const TitleBar: React.FC = () => {
  const { status, engineMode, theme, toggleTheme, closeBehavior, setShowTrayToast, addLog } = useApp();
  const [isMaximized, setIsMaximized] = useState(false);

  const getEngineLabel = () => {
    switch (engineMode) {
      case 'windivert': return 'WinDivert 64-bit';
      case 'nfqws': return 'NFQWS (Linux)';
      case 'tpws': return 'TPWS (macOS)';
    }
  };

  const handleTitleBarMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('a') || target.closest('select')) {
      return;
    }

    if (e.button === 0 && e.detail === 1) {
      if (window.chrome?.webview) {
        window.chrome.webview.postMessage('drag');
      }
    }
  };

  const handleMaximize = () => {
    setIsMaximized(prev => !prev);
    if (window.chrome?.webview) {
      window.chrome.webview.postMessage('maximize');
    }
  };

  const handleMinimize = () => {
    if (window.chrome?.webview) {
      window.chrome.webview.postMessage('minimize');
    }
  };

  const handleClose = () => {
    if (closeBehavior === 'minimize_to_tray') {
      setShowTrayToast(true);
      addLog('info', 'Окно свернуто в системный трей. Приложение продолжает фильтрацию в фоне.', 'Tray');
      if (window.chrome?.webview) {
        window.chrome.webview.postMessage('minimize_to_tray');
      }
      setTimeout(() => setShowTrayToast(false), 3500);
    } else {
      addLog('warn', 'Закрытие приложения. Выгрузка процессов WinDivert...', 'Core');
      if (window.chrome?.webview) {
        window.chrome.webview.postMessage('close');
      } else {
        window.close();
      }
    }
  };

  return (
    <div
      onMouseDown={handleTitleBarMouseDown}
      onDoubleClick={handleMaximize}
      onContextMenu={(e) => {
        const target = e.target as HTMLElement;
        if (!target.closest('input') && !target.closest('textarea')) {
          e.preventDefault();
        }
      }}
      className={`h-10 w-full flex items-center justify-between px-3 border-b select-none z-50 transition-colors duration-200 cursor-default ${
        theme === 'dark'
          ? 'bg-[#090D16]/95 border-white/5 text-slate-200'
          : 'bg-slate-100/95 border-slate-300/80 text-slate-800'
      }`}
    >
      {/* App Branding & Admin badge */}
      <div className="flex items-center gap-2.5 pointer-events-none">
        <div className="relative flex items-center justify-center">
          <Shield className={`w-4 h-4 transition-colors duration-300 ${
            status === 'connected' ? 'text-emerald-500' : status === 'connecting' ? 'text-amber-500 animate-pulse' : 'text-indigo-500'
          }`} />
          {status === 'connected' && (
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
          )}
        </div>

        <span className="text-xs font-bold tracking-wider uppercase">
          Zapret<span className="text-indigo-500 font-extrabold ml-0.5">2</span>
        </span>

        {/* Administrator UAC Badge */}
        <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-300 border border-amber-500/20 font-semibold" title="Приложение запущено с повышенными правами Администратора для управления пакетами WinDivert">
          <Lock className="w-2.5 h-2.5" />
          <span>ADMIN</span>
        </span>

        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/5 dark:bg-white/5 text-slate-500 dark:text-slate-400 border border-black/10 dark:border-white/10 font-medium">
          v0.1.0-portable
        </span>
      </div>

      {/* Center Engine Badge */}
      <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-[11px] text-slate-600 dark:text-slate-300 pointer-events-none">
        <Cpu className="w-3 h-3 text-indigo-500" />
        <span>Движок:</span>
        <span className="font-semibold text-slate-900 dark:text-slate-100">{getEngineLabel()}</span>
      </div>

      {/* Right Controls: Theme switch + Window Control Buttons */}
      <div className="flex items-center gap-1">
        {/* Light / Dark Mode Toggle */}
        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
          className="p-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors mr-1"
        >
          {theme === 'dark' ? (
            <Sun className="w-3.5 h-3.5 text-amber-400" />
          ) : (
            <Moon className="w-3.5 h-3.5 text-indigo-600" />
          )}
        </button>

        {/* Windows Window Controls */}
        <div className="flex items-center">
          <button
            onClick={handleMinimize}
            title="Свернуть"
            className="h-8 w-9 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors rounded-sm"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleMaximize}
            title={isMaximized ? "Восстановить" : "Развернуть"}
            className="h-8 w-9 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors rounded-sm"
          >
            {isMaximized ? <Copy className="w-3 h-3 rotate-180" /> : <Square className="w-3 h-3" />}
          </button>
          <button
            onClick={handleClose}
            title={closeBehavior === 'minimize_to_tray' ? 'Свернуть в системный трей' : 'Закрыть приложение'}
            className="h-8 w-9 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-white hover:bg-rose-600 transition-colors rounded-sm"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
