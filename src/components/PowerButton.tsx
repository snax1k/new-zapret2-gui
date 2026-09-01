import React from 'react';
import { Power, ShieldCheck, ShieldAlert, Loader2, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';

export const PowerButton: React.FC = () => {
  const { status, toggleStatus, stats, theme } = useApp();

  const formatUptime = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${hrs > 0 ? `${hrs}:` : ''}${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';

  return (
    <div className="flex flex-col items-center justify-center select-none">
      {/* Outer Pulse Container */}
      <div className="relative flex items-center justify-center">
        {/* Animated Background Rings when Connected */}
        {isConnected && (
          <>
            <motion.div
              initial={{ scale: 0.8, opacity: 0.8 }}
              animate={{ scale: [1, 1.35, 1], opacity: [0.35, 0, 0.35] }}
              transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute w-48 h-48 rounded-full bg-emerald-500/20 blur-xl pointer-events-none"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0.5 }}
              animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.1, 0.5] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
              className="absolute w-44 h-44 rounded-full border-2 border-emerald-500/30 pointer-events-none"
            />
          </>
        )}

        {/* Loading Spinner Ring when Connecting */}
        {isConnecting && (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            className="absolute w-44 h-44 rounded-full border-2 border-dashed border-amber-400/60 pointer-events-none"
          />
        )}

        {/* The Main Power Button */}
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={toggleStatus}
          disabled={isConnecting}
          className={`relative z-10 w-36 h-36 rounded-full flex flex-col items-center justify-center transition-all duration-500 shadow-2xl group ${
            isConnected
              ? 'bg-gradient-to-b from-emerald-500 to-emerald-700 text-white shadow-emerald-500/40 border-2 border-emerald-300/40'
              : isConnecting
              ? 'bg-gradient-to-b from-amber-500 to-amber-700 text-white shadow-amber-500/30 border-2 border-amber-300/30'
              : theme === 'dark'
              ? 'bg-gradient-to-b from-slate-800 to-slate-900 text-slate-400 hover:text-white shadow-black/60 border-2 border-white/10 hover:border-indigo-500/40 hover:shadow-indigo-500/20'
              : 'bg-gradient-to-b from-slate-100 to-slate-200 text-slate-500 hover:text-slate-900 shadow-slate-300/60 border-2 border-slate-300 hover:border-indigo-400 hover:shadow-indigo-200'
          }`}
        >
          {/* Inner Gloss */}
          <div className="absolute inset-1 rounded-full bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />

          {/* Icon */}
          <div className="relative">
            {isConnecting ? (
              <Loader2 className="w-12 h-12 animate-spin text-white" />
            ) : isConnected ? (
              <Power className="w-12 h-12 drop-shadow-[0_0_12px_rgba(255,255,255,0.7)] text-white" />
            ) : (
              <Power className="w-12 h-12 transition-transform duration-300 group-hover:scale-110" />
            )}
          </div>

          <span className="mt-1 text-[11px] font-bold tracking-wider uppercase">
            {isConnecting ? 'Запуск' : isConnected ? 'ВКЛ' : 'ВКЛЮЧИТЬ'}
          </span>
        </motion.button>
      </div>

      {/* Status Details under the button */}
      <div className="mt-5 text-center space-y-1">
        <div className="flex items-center justify-center gap-2">
          {isConnected ? (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>ЗАЩИТА И ОБХОД АКТИВНЫ</span>
            </div>
          ) : isConnecting ? (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>ПОДКЛЮЧЕНИЕ К ДРАЙВЕРУ...</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-slate-500 dark:text-slate-400 text-xs font-medium">
              <ShieldAlert className="w-4 h-4 text-slate-400" />
              <span>ОТКЛЮЧЕНО (ОБЫЧНЫЙ ТРАФИК)</span>
            </div>
          )}
        </div>

        {isConnected ? (
          <div className="flex items-center justify-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-mono pt-1">
            <span>Время: <strong className="text-emerald-600 dark:text-emerald-300">{formatUptime(stats.uptimeSeconds)}</strong></span>
            <span>•</span>
            <span>winws: <strong className="text-slate-800 dark:text-slate-200">PID {stats.pid || '—'}</strong></span>
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1 pt-1">
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            Нажмите кнопку для активации десинхронизации DPI
          </p>
        )}
      </div>
    </div>
  );
};
