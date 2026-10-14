import React from 'react';
import {
  Power,
  Sparkles,
  Send,
  Globe,
  Activity,
  Terminal,
  Settings,
  ArrowUpRight,
  X
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { TabType } from '../types';
import { StatusDot } from './ui';

/** «1 ч 12 мин», «5 мин», «меньше минуты» (в тесном месте — «< 1 мин»). */
export const formatUptimeShort = (sec: number, tight = false): string => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h} ч ${m} мин`;
  if (m > 0) return `${m} мин`;
  return tight ? '< 1 мин' : 'меньше минуты';
};

/**
 * Боковое меню.
 *
 * На узком окне (меньше 900 px) сворачивается до иконок — окно бывает и
 * 840×580, и тогда подписи съедают место у содержимого. Внизу всегда видно
 * главное: работает ли обход и сколько.
 */
export const Sidebar: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const {
    activeTab, setActiveTab, status, stats, updateInfo, dismissUpdate,
    setIsUpdateModalOpen, hostlists, tgProxy, isAutotuneRunning
  } = useApp();

  const items: { id: TabType; label: string; icon: React.ComponentType<{ className?: string }>; badge?: { text: string; tone: 'ok' | 'accent' | 'neutral' } }[] = [
    { id: 'dashboard', label: 'Главная', icon: Power },
    { id: 'autotune', label: 'Подбор', icon: Sparkles, badge: isAutotuneRunning ? { text: 'идёт', tone: 'accent' } : undefined },
    // Мост Telegram живёт отдельно от ядра: его состояние по статусу обхода
    // не видно, поэтому — свой значок.
    { id: 'tgproxy', label: 'Telegram', icon: Send, badge: tgProxy.running ? { text: 'вкл', tone: 'ok' } : undefined },
    { id: 'hostlists', label: 'Списки сайтов', icon: Globe, badge: hostlists.length ? { text: String(hostlists.length), tone: 'neutral' } : undefined },
    { id: 'diagnostics', label: 'Диагностика', icon: Activity },
    { id: 'logs', label: 'Журнал', icon: Terminal },
    { id: 'settings', label: 'Настройки', icon: Settings },
  ];

  const isOn = status === 'connected';
  const isConnecting = status === 'connecting';
  const isError = status === 'error';
  const showUpdate = updateInfo.hasUpdate && !updateInfo.isInstalled;

  const badgeClass = (tone: 'ok' | 'accent' | 'neutral') =>
    tone === 'ok' ? 'bg-green-500/[0.12] text-green-400 border-green-500/[0.28]'
      : tone === 'accent' ? 'bg-ac/15 text-ac-300 border-ac/40'
      : 'bg-s2 text-t2 border-line';

  return (
    <aside className={`flex flex-col justify-between shrink-0 select-none transition-all bg-s1 border-r border-line ${
      compact ? 'w-[58px] p-2' : 'w-[212px] p-3'
    }`}>
      <nav className="space-y-1">
        {items.map(item => {
          const Icon = item.icon;
          // «Стратегии» — продолжение «Подбора», меню подсвечивает его.
          const active = activeTab === item.id || (item.id === 'autotune' && activeTab === 'presets');
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              title={compact ? item.label : undefined}
              className={`relative w-full flex items-center ${compact ? 'justify-center py-2.5' : 'justify-between px-3 py-2'} rounded-[8px] text-[13px] font-medium transition-all border ${
                active ? 'bg-ac/15 border-ac/40 text-white' : 'border-transparent text-t2 hover:text-t1 hover:bg-white/[0.04]'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-ac' : ''}`} />
                {!compact && <span>{item.label}</span>}
              </span>
              {!compact && item.badge && (
                <span className={`px-1.5 py-0.5 text-[11px] rounded-[5px] font-medium border ${badgeClass(item.badge.tone)}`}>
                  {item.badge.text}
                </span>
              )}
              {compact && item.badge && (
                <span className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full ${item.badge.tone === 'ok' ? 'bg-green-500' : 'bg-ac'}`} />
              )}
            </button>
          );
        })}
      </nav>

      <div className="space-y-2">
        {showUpdate && !compact && (
          <div
            onClick={() => setIsUpdateModalOpen(true)}
            className="relative p-2.5 rounded-[10px] bg-ac/10 border border-ac/40 cursor-pointer hover:bg-ac/15 transition-colors"
          >
            <button
              onClick={(e) => { e.stopPropagation(); dismissUpdate(); }}
              title="Скрыть уведомление"
              className="absolute top-1.5 right-1.5 p-0.5 text-t3 hover:text-t1"
            >
              <X className="w-3 h-3" />
            </button>
            <div className="text-[12px] font-semibold text-t1 pr-4">Доступна версия {updateInfo.latestVersion}</div>
            <div className="text-[11px] text-t2 line-clamp-2">{updateInfo.releaseTitle}</div>
            <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-ac-300">
              <span>Подробнее</span>
              <ArrowUpRight className="w-3 h-3" />
            </div>
          </div>
        )}
        {showUpdate && compact && (
          <button
            onClick={() => setIsUpdateModalOpen(true)}
            title={`Доступна версия ${updateInfo.latestVersion}`}
            className="w-full flex justify-center py-2 rounded-[8px] bg-ac/10 border border-ac/40 text-ac"
          >
            <ArrowUpRight className="w-4 h-4" />
          </button>
        )}

        <div className={`rounded-[10px] bg-s2 border border-line ${compact ? 'p-2 flex justify-center' : 'p-2.5'}`}
          title={compact ? (isOn ? 'Обход включён' : isConnecting ? 'Подключение…' : isError ? 'Ошибка запуска' : 'Обход выключен') : undefined}
        >
          {compact ? (
            <StatusDot status={isOn ? 'ok' : isConnecting ? 'warn' : isError ? 'bad' : 'neutral'} pulse={isOn || isConnecting} size={9} />
          ) : (
            <div className="flex items-center gap-2">
              <StatusDot status={isOn ? 'ok' : isConnecting ? 'warn' : isError ? 'bad' : 'neutral'} pulse={isOn || isConnecting} size={8} />
              <span className={`text-[12px] font-medium truncate ${isOn ? 'text-t1' : isError ? 'text-red-300' : 'text-t2'}`}>
                {isOn ? `Обход включён · ${formatUptimeShort(stats.uptimeSeconds, true)}`
                  : isConnecting ? 'Подключение…'
                  : isError ? 'Ошибка запуска ядра'
                  : 'Обход выключен'}
              </span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
