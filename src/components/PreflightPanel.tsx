import React, { useState } from 'react';
import { ShieldCheck, AlertTriangle, XCircle, ChevronDown, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';

/**
 * Предполётная проверка окружения.
 *
 * Отвечает на вопрос «почему обход может ничего не сделать» ДО того, как
 * пользователь потратит день на перебор стратегий. Каждая проверка взята из
 * реального случая: системный прокси уводит HTTP(S) в loopback мимо winws,
 * VPN-адаптер уводит трафик мимо DPI провайдера, посторонний winws.exe или
 * другой обходчик дерётся за драйвер WinDivert.
 *
 * Когда всё в порядке — это одна строка, а не список из галочек.
 */
/** Свёрнута ли панель. Выбор переживает перезапуск: он про привычку. */
const COLLAPSED_KEY = 'zapret2_preflight_collapsed_v1';

export const PreflightPanel: React.FC = () => {
  const { preflight, runPreflight, theme } = useApp();
  const [collapsed, setCollapsedState] = useState<boolean>(
    () => localStorage.getItem(COLLAPSED_KEY) === '1'
  );
  const [showAll, setShowAll] = useState(false);

  const setCollapsed = (v: boolean) => {
    localStorage.setItem(COLLAPSED_KEY, v ? '1' : '0');
    setCollapsedState(v);
  };

  if (preflight.length === 0) return null;

  const problems = preflight.filter(p => p.level !== 'ok');
  const hasError = problems.some(p => p.level === 'error');
  const allGood = problems.length === 0;

  const tone = allGood
    ? { border: 'border-emerald-500/30', bg: 'bg-emerald-500/5', text: 'text-emerald-600 dark:text-emerald-400' }
    : hasError
      ? { border: 'border-rose-500/30', bg: 'bg-rose-500/5', text: 'text-rose-600 dark:text-rose-400' }
      : { border: 'border-amber-500/30', bg: 'bg-amber-500/5', text: 'text-amber-600 dark:text-amber-400' };

  const HeadIcon = allGood ? ShieldCheck : hasError ? XCircle : AlertTriangle;

  const summary = allGood
    ? 'Окружение в порядке — обходу ничто не мешает'
    : hasError
      ? `Помех: ${problems.length} — одна из них блокирует работу`
      : `Помех: ${problems.length} — обход может не сработать`;

  // Три состояния, а не два. Раньше стрелка переключала «проблемы» и «всё»,
  // то есть при любом положении предупреждения оставались на экране и кнопка
  // выглядела сломанной. Теперь она именно сворачивает — до одной строки.
  const visible = collapsed ? [] : showAll ? preflight : problems;
  const okCount = preflight.length - problems.length;

  return (
    <div className={`rounded-xl border ${tone.border} ${tone.bg} select-none`}>
      <div className="flex items-center gap-2 px-3 py-2">
        <HeadIcon className={`w-4 h-4 shrink-0 ${tone.text}`} />
        <span className={`text-[11px] font-bold flex-1 truncate ${tone.text}`}>{summary}</span>

        <button
          onClick={runPreflight}
          title="Проверить заново"
          className="p-1 rounded-md text-slate-400 hover:text-slate-200 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Развернуть' : 'Свернуть до одной строки'}
          className="p-1 rounded-md text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${collapsed ? '' : 'rotate-180'}`} />
        </button>
      </div>

      {visible.length > 0 && (
        <div className="px-3 pb-2.5 space-y-1.5">
          {visible.map(item => {
            const Icon = item.level === 'ok' ? ShieldCheck : item.level === 'error' ? XCircle : AlertTriangle;
            const color = item.level === 'ok'
              ? 'text-emerald-500'
              : item.level === 'error' ? 'text-rose-500' : 'text-amber-500';

            return (
              <div
                key={item.id}
                className={`flex items-start gap-2 p-2 rounded-lg border ${
                  theme === 'dark' ? 'bg-slate-900/40 border-white/5' : 'bg-white/70 border-slate-200/70'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${color}`} />
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">{item.title}</div>
                  <div className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">{item.detail}</div>
                </div>
              </div>
            );
          })}

          {okCount > 0 && (
            <button
              onClick={() => setShowAll(v => !v)}
              className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors pt-0.5"
            >
              {showAll
                ? 'Скрыть пройденные проверки'
                : `Показать пройденные проверки (${okCount})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
