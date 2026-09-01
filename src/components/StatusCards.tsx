import React from 'react';
import { ShieldCheck, HardDrive, Network, Gauge } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const StatusCards: React.FC = () => {
  const { status, stats, theme } = useApp();

  const isConnected = status === 'connected';

  const fmtUptime = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const ss = sec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
  };

  const cards = [
    {
      label: 'Драйвер пакетов',
      value: isConnected ? 'WinDivert 64-bit' : status === 'error' ? 'Ошибка' : 'Ожидание',
      sub: stats.driverStatus,
      icon: ShieldCheck,
      color: isConnected ? 'text-emerald-500' : status === 'error' ? 'text-rose-500' : 'text-slate-400'
    },
    {
      label: 'Профилей winws',
      value: `${stats.activeRulesCount}`,
      sub: isConnected ? 'Применены к трафику' : 'Будут применены при запуске',
      icon: HardDrive,
      color: isConnected ? 'text-indigo-500' : 'text-slate-400'
    },
    {
      label: 'Процесс winws.exe',
      value: stats.pid ? `PID ${stats.pid}` : '—',
      sub: stats.pid ? 'Запущен от Администратора' : 'Не запущен',
      icon: Network,
      color: stats.pid ? 'text-cyan-500' : 'text-slate-400'
    },
    {
      label: 'Время работы',
      value: fmtUptime(stats.uptimeSeconds),
      sub: isConnected ? 'Обход активен' : 'Таймер остановлен',
      icon: Gauge,
      color: isConnected ? 'text-emerald-500' : 'text-slate-400'
    }
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 select-none">
      {cards.map((card, i) => {
        const Icon = card.icon;

        return (
          <div
            key={i}
            className={`p-3 rounded-xl border flex flex-col justify-between space-y-1.5 transition-colors ${
              theme === 'dark'
                ? 'bg-slate-900/50 border-white/5'
                : 'bg-white border-slate-200/80 shadow-xs'
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 dark:text-slate-400">
              <span className="text-[10px] font-medium">{card.label}</span>
              <Icon className={`w-3.5 h-3.5 ${card.color}`} />
            </div>

            <div>
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100 font-mono">{card.value}</div>
              <div className="text-[9px] text-slate-500 dark:text-slate-400">{card.sub}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
