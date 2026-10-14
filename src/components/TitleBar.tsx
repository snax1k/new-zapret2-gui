import React, { useState } from 'react';
import { Shield, Minus, Square, Copy, X } from 'lucide-react';
import { useApp, APP_VERSION } from '../context/AppContext';
import { flushSettings } from '../lib/settings';

/**
 * Полоса заголовка окна без системной рамки.
 *
 * Перетаскивание — по пустому месту: нативная часть получает «drag» и
 * отдаёт окно системе. Двойной щелчок разворачивает. Крестик по умолчанию
 * прячет окно в трей — обход при этом продолжает работать.
 */
export const TitleBar: React.FC = () => {
  const { status, engineMode, closeBehavior, setShowTrayToast, addLog } = useApp();
  const [isMaximized, setIsMaximized] = useState(false);

  const engineLabel = engineMode === 'windivert' ? 'WinDivert 64-bit'
    : engineMode === 'nfqws' ? 'NFQWS (Linux)' : 'TPWS (macOS)';

  const handleTitleBarMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('a') || target.closest('select')) {
      return;
    }
    if (e.button === 0 && e.detail === 1 && window.chrome?.webview) {
      window.chrome.webview.postMessage('drag');
    }
  };

  const handleMaximize = () => {
    setIsMaximized(prev => !prev);
    if (window.chrome?.webview) window.chrome.webview.postMessage('maximize');
  };

  const handleMinimize = () => {
    if (window.chrome?.webview) window.chrome.webview.postMessage('minimize');
  };

  const handleClose = () => {
    if (closeBehavior === 'minimize_to_tray') {
      setShowTrayToast(true);
      addLog('info', 'Окно свернуто в системный трей. Приложение продолжает фильтрацию в фоне.', 'Tray');
      if (window.chrome?.webview) window.chrome.webview.postMessage('minimize_to_tray');
      setTimeout(() => setShowTrayToast(false), 3500);
    } else {
      addLog('warn', 'Закрытие приложения. Выгрузка процессов WinDivert...', 'Core');
      if (window.chrome?.webview) {
        // Отправка настроек отложена на 150 мс, а закрытие — мгновенное:
        // без этого последнее изменение перед выходом не успевало уйти.
        flushSettings();
        window.chrome.webview.postMessage('close');
      } else {
        window.close();
      }
    }
  };

  const ctl = 'h-7 w-8 rounded-[6px] flex items-center justify-center text-t2 transition-colors';

  return (
    <div
      onMouseDown={handleTitleBarMouseDown}
      onDoubleClick={handleMaximize}
      onContextMenu={(e) => {
        const target = e.target as HTMLElement;
        if (!target.closest('input') && !target.closest('textarea')) e.preventDefault();
      }}
      className="h-10 w-full px-3.5 flex items-center justify-between select-none shrink-0 z-50 bg-s1 border-b border-line cursor-default"
    >
      <div className="flex items-center gap-2 pointer-events-none min-w-0">
        <div className="flex items-center gap-2 pr-1">
          <div className="w-5 h-5 rounded-[6px] flex items-center justify-center bg-ac/[0.18] border border-ac/40">
            <Shield className="w-3 h-3 text-ac" />
          </div>
          <span className="font-semibold tracking-wider text-[12px] text-t1">ZAPRET 2</span>
        </div>

        <span className="px-1.5 py-0.5 rounded-[5px] text-[11px] font-mono bg-s2 text-t2 border border-line">
          v{APP_VERSION}
        </span>

        <span
          className="px-1.5 py-0.5 rounded-[5px] text-[11px] font-medium bg-green-500/[0.12] text-green-400 border border-green-500/[0.28]"
          title="Программа запущена с правами администратора — без них драйвер WinDivert не загрузить"
        >
          ADMIN
        </span>

        <span className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-[5px] text-[11px] bg-s2 text-t2 border border-line">
          <span className={`w-1.5 h-1.5 rounded-full ${
            status === 'connected' ? 'bg-green-500'
              : status === 'connecting' ? 'bg-amber-500 animate-pulse'
              : status === 'error' ? 'bg-red-500' : 'bg-t3'
          }`} />
          <span>{engineLabel}</span>
        </span>
      </div>

      <div className="flex items-center gap-0.5">
        <button onClick={handleMinimize} title="Свернуть" className={`${ctl} hover:bg-white/[0.06] hover:text-t1`}>
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button onClick={handleMaximize} title={isMaximized ? 'Восстановить' : 'Развернуть'} className={`${ctl} hover:bg-white/[0.06] hover:text-t1`}>
          {isMaximized ? <Copy className="w-3 h-3 rotate-180" /> : <Square className="w-3 h-3" />}
        </button>
        <button
          onClick={handleClose}
          title={closeBehavior === 'minimize_to_tray' ? 'Свернуть в трей — обход продолжит работать' : 'Закрыть программу'}
          className={`${ctl} hover:bg-red-500/20 hover:text-red-400`}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
