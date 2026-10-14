import React, { useState } from 'react';
import { ShieldCheck, AlertTriangle, XCircle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { loadSetting, saveSetting } from '../lib/settings';
import { Button } from './ui';

/**
 * Предполётная проверка окружения — карточка «Проверка компьютера».
 *
 * Отвечает на вопрос «почему обход может ничего не сделать» ДО того, как
 * человек потратит день на перебор стратегий. Каждая проверка взята из
 * реального случая: системный прокси уводит HTTP(S) в loopback мимо winws,
 * VPN-адаптер уводит трафик мимо DPI провайдера, посторонний winws.exe или
 * другой обходчик дерётся за драйвер WinDivert, Discord ходит через прокси.
 *
 * Когда всё в порядке — это одна строка, а не список из галочек.
 */
/** Свёрнута ли карточка. Выбор переживает перезапуск: он про привычку. */
const COLLAPSED_KEY = 'zapret2_preflight_collapsed_v1';

export const PreflightPanel: React.FC = () => {
  const { preflight, runPreflight, runPreflightAction } = useApp();
  const [collapsed, setCollapsedState] = useState<boolean>(() => loadSetting(COLLAPSED_KEY) === '1');
  const [showAll, setShowAll] = useState(false);

  const setCollapsed = (v: boolean) => {
    saveSetting(COLLAPSED_KEY, v ? '1' : '0');
    setCollapsedState(v);
  };

  const problems = preflight.filter(p => p.level !== 'ok');
  const passed = preflight.filter(p => p.level === 'ok');
  const errors = problems.filter(p => p.level === 'error').length;
  const hasError = errors > 0;
  const allGood = preflight.length > 0 && problems.length === 0;

  const HeadIcon = preflight.length === 0 ? RefreshCw : allGood ? ShieldCheck : hasError ? XCircle : AlertTriangle;
  const headColor = preflight.length === 0 ? 'text-t3' : allGood ? 'text-green-500' : hasError ? 'text-red-500' : 'text-amber-500';
  const title = preflight.length === 0 || allGood
    ? 'Проверка компьютера'
    : hasError
      ? `Помехи: ${problems.length} — ${errors === 1 ? 'одна из них блокирует' : 'некоторые блокируют'} работу`
      : `Помехи: ${problems.length} — обход может не сработать`;

  const visible = collapsed ? [] : showAll ? [...problems, ...passed] : problems;

  return (
    <div className={`rounded-[12px] p-3.5 flex flex-col gap-2.5 bg-s1 border ${
      hasError ? 'border-red-500/[0.28]' : problems.length > 0 ? 'border-amber-500/[0.28]' : 'border-line'
    }`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <HeadIcon className={`w-4 h-4 shrink-0 ${headColor}`} />
          <span className="text-[13px] font-semibold text-t1 truncate">{title}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={runPreflight}>Проверить снова</Button>
          {problems.length > 0 && (
            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              title={collapsed ? 'Развернуть' : 'Свернуть до одной строки'}
              className="p-1.5 rounded-[7px] text-t2 hover:text-t1 hover:bg-white/[0.05]"
            >
              {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {preflight.length === 0 && (
        <div className="px-2.5 py-2 rounded-[8px] bg-s2 border border-line text-[12px] text-t2">
          Проверяю окружение…
        </div>
      )}

      {allGood && !showAll && (
        <div className="px-2.5 py-2 rounded-[8px] bg-s2 border border-line text-[12px] leading-relaxed text-t2">
          <span className="text-green-400 font-medium">Помех нет:</span>{' '}
          {passed.map(p => p.title.replace(/\.$/, '')).join(' · ')}.
        </div>
      )}

      {visible.map(item => {
        const tone = item.level === 'error'
          ? { box: 'bg-red-500/[0.12] border-red-500/[0.28]', dot: 'bg-red-500', title: 'text-red-300' }
          : item.level === 'warn'
            ? { box: 'bg-amber-500/[0.12] border-amber-500/[0.28]', dot: 'bg-amber-500', title: 'text-amber-300' }
            : { box: 'bg-s2 border-line', dot: 'bg-green-500', title: 'text-t1' };
        return (
          <div key={item.id} className={`px-2.5 py-2 rounded-[8px] border flex items-start gap-2.5 ${tone.box}`}>
            <span className={`w-2 h-2 rounded-full shrink-0 mt-[5px] ${tone.dot}`} />
            <div className="min-w-0 flex-1">
              <div className={`text-[12px] font-semibold ${tone.title}`}>{item.title}</div>
              <div className="text-[11px] leading-snug text-t1/85 mt-0.5">{item.detail}</div>
            </div>
            {item.action && item.actionLabel && (
              <Button variant="secondary" size="sm" onClick={() => runPreflightAction(item.action!)} className="self-center">
                {item.actionLabel}
              </Button>
            )}
          </div>
        );
      })}

      {preflight.length > 0 && (
        <div className="flex items-center justify-between gap-2 text-[11px] text-t3 pt-1.5 border-t border-line">
          <span className="truncate">
            {collapsed && problems.length > 0
              ? 'Свёрнуто — разверните, чтобы увидеть подробности'
              : `Пройдено проверок: ${passed.length} из ${preflight.length}`}
          </span>
          {passed.length > 0 && !collapsed && (
            <button type="button" onClick={() => setShowAll(v => !v)} className="text-t2 hover:text-t1 hover:underline shrink-0">
              {showAll ? 'Скрыть пройденные' : 'Показать все проверки'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
