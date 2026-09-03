import React from 'react';
import { ShieldCheck, HardDrive, Network, Gauge, Zap } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const StatusCards: React.FC = () => {
  const { status, stats, quickToggles, theme } = useApp();
  // Счётчик активности наполняется разбором вывода winws, а он есть
  // только при --debug. Без него метрика недоступна, а не равна нулю.
  const canCount = quickToggles.verboseLog;

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
    },
    {
      // Единственная карточка, отвечающая на вопрос «обход что-то делает?».
      // Остальные четыре говорят лишь о том, что процесс жив. Ноль при
      // работающем ядре — это сигнал: трафик до winws не доходит.
      label: 'Обработано',
      // Счётчик берётся из вывода ядра, а без --debug ядро молчит. Показывать
      // в этом случае ноль нельзя: это выглядело бы как «обход не работает».
      value: !isConnected ? '—' : canCount ? `${stats.desyncCount}` : 'н/д',
      sub: !isConnected
        ? 'обход выключен'
        : !canCount
          ? 'нужен подробный лог'
          : stats.desyncCount === 0
            ? 'трафик не идёт через обход'
            : `хостов: ${stats.hostCount}`,
      icon: Zap,
      color: !isConnected || !canCount
        ? 'text-slate-400'
        : stats.desyncCount === 0 ? 'text-amber-500' : 'text-emerald-500'
    }
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 select-none">
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
