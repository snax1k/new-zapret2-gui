import React, { useState } from 'react';
import { Play, Loader2, ChevronDown, ChevronUp, Info, Check, ArrowRight } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { DiagnosticStep } from '../types';
import { Button, Card, PageHeader, StatusDot } from '../components/ui';

/** Короткие подписи шагов для цепочки DNS → TCP → TLS. */
const SHORT = ['DNS', 'TCP', 'TLS · контроль', 'TLS'];

const chipTone = (s: DiagnosticStep['status']) =>
  s === 'success' ? 'bg-green-500/[0.12] text-green-300 border-green-500/[0.28]'
    : s === 'blocked' || s === 'error' ? 'bg-red-500/[0.12] text-red-300 border-red-500/[0.28]'
    : s === 'testing' ? 'bg-amber-500/[0.12] text-amber-300 border-amber-500/[0.28]'
    : 'bg-s2 text-t3 border-line';

/**
 * Диагностика: пошаговая проверка цепочки DNS → TCP → TLS по целям.
 * Контрольный шаг — рукопожатие с посторонним именем: если оно проходит, а
 * с настоящим нет, рвут именно по имени сайта.
 */
export const DiagnosticsView: React.FC = () => {
  const { diagnostics, runDiagnostics, isDiagnosticsRunning, setActiveTab, status, preflight } = useApp();
  const [expandedId, setExpandedId] = useState<string>('');

  // Итог считаем по реальным статусам: раньше здесь висела зашитая надпись
  // «100% УСПЕХ», показывавшаяся всегда.
  const okCount = diagnostics.filter(d => d.status === 'success').length;
  const failCount = diagnostics.filter(d => d.status === 'blocked' || d.status === 'error').length;
  const neverRun = okCount + failCount === 0 && !isDiagnosticsRunning;

  // Системный прокси объясняет самый сбивающий с толку случай: сайты в
  // браузере открываются, а проверка не проходит. Браузер идёт через прокси,
  // проверка — напрямую.
  const bypassOn = status === 'connected';
  const proxyOn = preflight.some(p => p.id === 'proxy' && p.level !== 'ok');

  const summary = isDiagnosticsRunning
    ? 'Идёт проверка целей — результат появится ниже.'
    : neverRun
      ? 'Проверка ещё не запускалась. Она пройдёт по каждой цели пошагово и покажет, на каком шаге рвётся соединение.'
      : failCount === 0
        ? 'Отвечают все проверенные цели — обход справляется.'
        : okCount === 0
          ? proxyOn
            ? `Не ответила ни одна цель, но судить по этому об обходе нельзя${bypassOn ? ' (он включён)' : ''}: включён системный прокси. Браузер ходит через него, а проверка — напрямую. Чтобы результат что-то значил, прокси нужно временно выключить.`
            : bypassOn
              ? 'Обход включён, но не ответила ни одна цель. Разверните любую: если рукопожатие с посторонним именем проходит, а с настоящим нет — рвут по имени сайта, и стоит запустить подбор.'
              : 'Обход выключен, и цели не отвечают. Включите его на главной и повторите проверку — иначе сравнивать не с чем.'
          : 'Разверните цель, которая не ответила, — видно, на каком шаге обрыв.';

  return (
    <div className="h-full overflow-y-auto p-5 flex flex-col gap-3.5 select-none">
      <PageHeader
        title="Диагностика доступности"
        subtitle="Пошаговая проверка цепочки соединения DNS → TCP → TLS"
        actions={
          <Button icon={isDiagnosticsRunning ? Loader2 : Play} spin={isDiagnosticsRunning} onClick={runDiagnostics} disabled={isDiagnosticsRunning}>
            {isDiagnosticsRunning ? 'Проверка…' : 'Запустить проверку'}
          </Button>
        }
      />

      <div className="space-y-2.5">
        {diagnostics.map(item => {
          const isExpanded = expandedId === item.id;
          const failed = item.status === 'blocked' || item.status === 'error';
          return (
            <Card key={item.id} tone={failed ? 'bad' : 'default'} className="overflow-hidden">
              <div
                onClick={() => setExpandedId(isExpanded ? '' : item.id)}
                className="p-3.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-white/[0.02]"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {item.status === 'testing'
                    ? <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin shrink-0" />
                    : <StatusDot status={item.status === 'success' ? 'ok' : failed ? 'bad' : 'neutral'} size={8} />}
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-t1 truncate">{item.name}</div>
                    <div className="text-[11px] font-mono text-t3 truncate">{item.target}{item.ipAddress ? ` · ${item.ipAddress}` : ''}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {item.steps.map((s, idx) => (
                    <React.Fragment key={idx}>
                      <span className={`px-2 py-1 rounded-[7px] font-mono text-[11px] border ${chipTone(s.status)}`} title={`${s.title}: ${s.detail}`}>
                        {SHORT[idx] || `Шаг ${idx + 1}`}
                        {s.status === 'success' && s.latencyMs ? ` · ${s.latencyMs} мс` : ''}
                        {s.status === 'blocked' || s.status === 'error' ? ' · ✗' : ''}
                      </span>
                      {idx < item.steps.length - 1 && <span className="text-t3 text-[11px]">→</span>}
                    </React.Fragment>
                  ))}
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-t3 ml-1" /> : <ChevronDown className="w-4 h-4 text-t3 ml-1" />}
                </div>
              </div>

              {isExpanded && (
                <div className="px-3.5 pb-3.5 pt-1 space-y-1.5 border-t border-line">
                  {item.steps.map((step, idx) => (
                    <div key={idx} className={`px-3 py-2 rounded-[8px] border ${
                      step.status === 'success' ? 'bg-green-500/[0.05] border-green-500/20'
                        : step.status === 'blocked' || step.status === 'error' ? 'bg-red-500/[0.06] border-red-500/20'
                        : step.status === 'testing' ? 'bg-amber-500/10 border-amber-500/25'
                        : 'bg-s2 border-line'
                    }`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {step.status === 'success'
                            ? <span className="w-4 h-4 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center shrink-0"><Check className="w-2.5 h-2.5" /></span>
                            : step.status === 'testing'
                              ? <Loader2 className="w-4 h-4 text-amber-500 animate-spin shrink-0" />
                              : <span className="w-4 h-4 rounded-full bg-white/[0.06] text-t3 flex items-center justify-center shrink-0 text-[10px]">{idx + 1}</span>}
                          <span className="text-[12px] font-medium text-t1 truncate">{step.title}</span>
                        </div>
                        {step.latencyMs ? <span className="text-[11px] font-mono text-t2 shrink-0">{step.latencyMs} мс</span> : null}
                      </div>
                      <div className="pl-6 mt-0.5 text-[11px] font-mono text-t2 break-all">{step.detail}</div>
                      {step.isControlStep && step.controlExplanation && (
                        <div className="mt-1.5 ml-6 px-2 py-1.5 rounded-[7px] bg-ac/10 border border-ac/25 flex items-start gap-2 text-[11px] text-t1">
                          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-ac-300" />
                          <span>{step.controlExplanation}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="p-3.5 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-t1">
            {neverRun ? 'Результатов пока нет' : isDiagnosticsRunning ? 'Идёт проверка…' : `Итог: отвечают ${okCount} из ${okCount + failCount} целей`}
          </div>
          <div className="text-[12px] text-t2 leading-relaxed">{summary}</div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setActiveTab('autotune')}>
          К подбору <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </Card>
    </div>
  );
};
