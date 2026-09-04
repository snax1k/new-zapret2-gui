import React from 'react';
import {
  Zap,
  Sliders,
  Globe,
  Activity,
  Terminal,
  Settings,
  Power,
  Layers,
  Sparkles,
  ArrowUpRight,
  X
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { TabType } from '../types';

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab, status, stats, theme, updateInfo, dismissUpdate, setIsUpdateModalOpen, presets, hostlists } = useApp();

  const navItems: { id: TabType; label: string; icon: React.ComponentType<{ className?: string }>; badge?: string }[] = [
    { id: 'dashboard', label: 'Главная', icon: Zap },
    { id: 'presets', label: 'Пресеты', icon: Sliders, badge: String(presets.length) },
    { id: 'hostlists', label: 'Хостлисты', icon: Globe, badge: hostlists.length ? String(hostlists.length) : undefined },
    { id: 'diagnostics', label: 'Диагностика', icon: Activity },
    { id: 'logs', label: 'Консоль логов', icon: Terminal },
    { id: 'settings', label: 'Настройки', icon: Settings },
  ];

  const showUpdateToast = updateInfo.hasUpdate && !updateInfo.isInstalled;

  return (
    <aside className={`w-64 border-r flex flex-col justify-between p-3 select-none transition-colors duration-200 ${
      theme === 'dark'
        ? 'bg-slate-900/85 border-white/5 text-slate-200'
        : 'bg-slate-50/85 border-slate-200 text-slate-800'
    }`}>
      {/* Upper Navigation */}
      <div className="space-y-5">
        {/* Brand / Mode banner */}
        <div className={`px-3 py-2.5 rounded-xl border flex items-center justify-between transition-colors ${
          theme === 'dark'
            ? 'bg-gradient-to-br from-indigo-950/40 to-slate-900/60 border-indigo-500/20'
            : 'bg-indigo-50/80 border-indigo-200/80'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-500">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold">ZAPRET 2 CORE</div>
              <div className="text-[10px] text-slate-400">DPI Desync Engine</div>
            </div>
          </div>
          <span className={`w-2 h-2 rounded-full ${
            status === 'connected' ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' :
            status === 'connecting' ? 'bg-amber-400 animate-ping' : 'bg-slate-400 dark:bg-slate-600'
          }`} />
        </div>

        {/* Navigation list */}
        <nav className="space-y-1">
          <div className="px-3 text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase mb-2">
            Навигация
          </div>

          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all duration-150 group ${
                  isActive
                    ? theme === 'dark'
                      ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 shadow-sm shadow-indigo-950'
                      : 'bg-indigo-100 text-indigo-700 border border-indigo-300/80 shadow-xs'
                    : theme === 'dark'
                      ? 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 transition-transform duration-150 ${
                    isActive
                      ? 'text-indigo-500 scale-110'
                      : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200'
                  }`} />
                  <span>{item.label}</span>
                </div>

                {item.badge && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full border ${
                    isActive
                      ? 'bg-indigo-500/20 text-indigo-500 border-indigo-400/30'
                      : 'bg-black/5 dark:bg-white/5 text-slate-500 dark:text-slate-400 border-black/10 dark:border-white/10'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Area: Update Pill & Status */}
      <div className="space-y-2">
        {/* GitHub Release Update Notification Pill (Bottom-Left) */}
        {showUpdateToast && (
          <div
            onClick={() => setIsUpdateModalOpen(true)}
            className="p-3 rounded-xl bg-gradient-to-r from-indigo-900/40 to-purple-900/30 dark:from-indigo-950/60 dark:to-purple-950/40 border border-indigo-500/40 relative shadow-lg cursor-pointer hover:border-indigo-400 transition-colors"
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                dismissUpdate();
              }}
              title="Закрыть уведомление"
              className="absolute top-2 right-2 text-slate-400 hover:text-slate-200 p-0.5"
            >
              <X className="w-3 h-3" />
            </button>

            <div className="flex items-start gap-2">
              <div className="p-1 rounded-md bg-indigo-500/20 text-indigo-400 shrink-0 mt-0.5">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div className="space-y-1 pr-3">
                <div className="text-[11px] font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1">
                  <span>Обновление ядра</span>
                  <span className="text-[9px] px-1 rounded bg-indigo-500/20 text-indigo-300 font-mono">
                    {updateInfo.latestVersion}
                  </span>
                </div>
                <p className="text-[10px] text-slate-600 dark:text-slate-300 line-clamp-2">
                  {updateInfo.releaseTitle}
                </p>
                <div className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-500 hover:text-indigo-400 pt-0.5">
                  <span>Открыть страницу релиза</span>
                  <ArrowUpRight className="w-3 h-3" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Status Card */}
        <div className={`p-3 rounded-xl border space-y-2 ${
          theme === 'dark' ? 'bg-white/[0.03] border-white/5' : 'bg-white border-slate-200 shadow-xs'
        }`}>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Power className={`w-3 h-3 ${status === 'connected' ? 'text-emerald-500' : 'text-slate-400'}`} />
              Статус драйвера:
            </span>
            <span className={`font-semibold ${
              status === 'connected' ? 'text-emerald-500' :
              status === 'connecting' ? 'text-amber-500' :
              status === 'error' ? 'text-rose-500' : 'text-slate-400'
            }`}>
              {status === 'connected' ? 'Активен'
                : status === 'connecting' ? 'Запуск...'
                : status === 'error' ? 'Ошибка' : 'Выключен'}
            </span>
          </div>

          {status === 'connected' && (
            <div className="pt-2 border-t border-black/5 dark:border-white/5 text-[10px] space-y-1 text-slate-500 dark:text-slate-400">
              <div className="flex justify-between">
                <span>Процесс:</span>
                <span className="font-mono text-slate-900 dark:text-slate-200">PID {stats.pid || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span>Профилей:</span>
                <span className="font-mono text-slate-900 dark:text-slate-200">{stats.activeRulesCount}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
