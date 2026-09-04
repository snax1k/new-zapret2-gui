import React from 'react';
import { Youtube, Mic, ShieldCheck, Globe, Wifi, Cpu } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { QuickToggleBooleanKey } from '../types';

export const QuickToggles: React.FC = () => {
  const { quickToggles, toggleQuickSetting, theme } = useApp();

  const toggleItems: {
    key: QuickToggleBooleanKey;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    {
      key: 'quicDesync',
      label: 'QUIC / UDP 443',
      description: 'HTTP/3 для YouTube и сайтов',
      icon: Wifi
    },
    {
      key: 'discordVoice',
      label: 'Discord RTC Voice',
      description: 'Голос UDP + медиа TCP',
      icon: Mic
    },
    {
      key: 'telegramFix',
      label: 'Telegram',
      description: 'Профиль по подсетям Telegram',
      icon: Globe
    },
    {
      key: 'allTrafficMode',
      label: 'Весь трафик (All)',
      description: 'Игнорировать списки доменов',
      icon: Youtube
    },
    {
      key: 'autoTtl',
      label: 'Авто-TTL',
      description: '--dpi-desync-autottl=2:3-12',
      icon: Cpu
    },
    {
      key: 'verboseLog',
      label: 'Подробный лог',
      description: 'Пакетный лог winws (--debug)',
      icon: ShieldCheck
    }
  ];

  return (
    <div className="space-y-2 select-none">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Быстрые переключатели сервисов</span>
        <span className="text-[10px] text-slate-500">Меняют строку запуска winws</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {toggleItems.map(item => {
          const Icon = item.icon;
          const isEnabled = quickToggles[item.key];

          return (
            <button
              key={item.key}
              onClick={() => toggleQuickSetting(item.key)}
              className={`p-2.5 rounded-xl text-left border transition-all duration-200 relative overflow-hidden group flex flex-col justify-between h-20 ${
                isEnabled
                  ? theme === 'dark'
                    ? 'bg-indigo-950/30 border-indigo-500/40 text-slate-100 shadow-sm shadow-indigo-950'
                    : 'bg-indigo-50 border-indigo-300 text-indigo-950 shadow-xs'
                  : theme === 'dark'
                    ? 'bg-slate-900/40 border-white/5 text-slate-400 hover:border-white/10 hover:bg-slate-900/60'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {/* Header inside card */}
              <div className="flex items-center justify-between w-full">
                <div className={`p-1.5 rounded-lg transition-colors ${
                  isEnabled
                    ? 'bg-indigo-500/20 text-indigo-500'
                    : 'bg-black/5 dark:bg-white/5 text-slate-400'
                }`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>

                {/* Switch indicator pill */}
                <div className={`w-7 h-4 rounded-full p-0.5 transition-colors duration-200 flex items-center ${
                  isEnabled ? 'bg-indigo-500 justify-end' : 'bg-slate-300 dark:bg-slate-700 justify-start'
                }`}>
                  <div className="w-3 h-3 rounded-full bg-white shadow-xs" />
                </div>
              </div>

              {/* Text labels */}
              <div className="space-y-0.5">
                <div className={`text-[11px] font-bold truncate ${isEnabled ? 'text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'}`}>
                  {item.label}
                </div>
                <div className="text-[9px] text-slate-500 dark:text-slate-400 truncate">
                  {item.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
