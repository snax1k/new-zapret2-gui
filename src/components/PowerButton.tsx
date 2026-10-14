import React from 'react';
import { Power, RefreshCw, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatUptimeShort } from './Sidebar';

/**
 * Через сколько секунд работы отсутствие вмешательств считается подозрительным.
 * Сразу после запуска счётчик закономерно нулевой: браузер ещё не открыл ни
 * одного нового соединения, а старые ядро не трогает.
 */
const IDLE_ALERT_AFTER_SEC = 60;

/**
 * Главный блок: кнопка питания, состояние словами и, когда обход работает,
 * три показателя. Отвечает на вопрос «работает ли сейчас» за секунду —
 * цветом, иконкой и текстом одновременно.
 */
export const PowerButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { status, toggleStatus, stats, quickToggles } = useApp();

  const isOn = status === 'connected';
  const isConnecting = status === 'connecting';
  const isError = status === 'error';
  const isOff = !isOn && !isConnecting && !isError;

  // Счётчики берутся из вывода ядра, а он есть только с --debug. Без него
  // метрика недоступна, а не равна нулю.
  const canCount = quickToggles.verboseLog;

  // Ядро живо, но за минуту не вмешалось ни разу. Почти всегда это значит,
  // что трафик до winws не доходит: системный прокси уводит HTTP(S) в
  // loopback, поднят VPN, или списки не покрывают то, что открывают.
  const idle = isOn && canCount && stats.desyncCount === 0 && stats.uptimeSeconds >= IDLE_ALERT_AFTER_SEC;

  const size = compact ? 'w-[86px] h-[86px]' : 'w-[112px] h-[112px]';
  const iconSize = compact ? 'w-6 h-6' : 'w-7 h-7';

  return (
    <div
      className={`rounded-[14px] ${compact ? 'p-3.5' : 'p-5'} flex flex-col items-center text-center bg-s1 border ${
        isOn ? (idle ? 'border-amber-500/[0.28]' : 'border-green-500/[0.28]')
          : isError ? 'border-red-500/[0.28]' : 'border-line'
      }`}
      style={{
        backgroundImage: isOn
          ? `radial-gradient(circle at 50% 0%, ${idle ? 'rgba(245,158,11,0.09)' : 'rgba(34,197,94,0.11)'}, transparent 70%)`
          : isConnecting
            ? 'radial-gradient(circle at 50% 0%, rgba(245,158,11,0.09), transparent 70%)'
            : isError
              ? 'radial-gradient(circle at 50% 0%, rgba(239,68,68,0.08), transparent 70%)'
              : 'none'
      }}
    >
      <button
        type="button"
        onClick={toggleStatus}
        disabled={isConnecting}
        title={isOn ? 'Выключить обход' : 'Включить обход'}
        className={`${size} rounded-full flex flex-col items-center justify-center transition-all duration-300 select-none border-2 hover:brightness-110 active:scale-[0.98] ${
          isOn
            ? 'bg-green-500/[0.14] border-green-500 shadow-[0_0_36px_rgba(34,197,94,0.26),inset_0_0_16px_rgba(34,197,94,0.14)]'
            : isConnecting
              ? 'bg-amber-500/[0.12] border-amber-500'
              : isError
                ? 'bg-red-500/[0.10] border-red-500/70'
                : 'bg-s2 border-line-strong shadow-[0_8px_24px_rgba(0,0,0,0.35)] hover:border-ac/60'
        }`}
      >
        {isConnecting
          ? <RefreshCw className={`${iconSize} text-amber-500 animate-spin mb-1`} />
          : <Power className={`${iconSize} mb-1 ${isOn ? 'text-green-500' : isError ? 'text-red-400' : 'text-t1'}`} />}
        <span className={`text-[12px] font-semibold ${isOn ? 'text-green-400' : isConnecting ? 'text-amber-400' : isError ? 'text-red-300' : 'text-t1'}`}>
          {isOn ? 'Включено' : isConnecting ? 'Подключение…' : isError ? 'Повторить' : 'Включить'}
        </span>
      </button>

      <div className="mt-3 flex items-center gap-2">
        {isOn && !idle && <CheckCircle2 className="w-4 h-4 text-green-500" />}
        {idle && <AlertTriangle className="w-4 h-4 text-amber-500" />}
        {isConnecting && <RefreshCw className="w-4 h-4 text-amber-500 animate-spin" />}
        {isError && <XCircle className="w-4 h-4 text-red-500" />}
        {isOff && <span className="w-2.5 h-2.5 rounded-full bg-t3" />}
        <h2 className="text-[15px] font-semibold text-t1">
          {idle ? 'Ядро работает, но трафик через него не идёт'
            : isOn ? 'Обход работает'
            : isConnecting ? 'Подключение…'
            : isError ? 'Ядро не запустилось'
            : 'Обход выключен — трафик идёт как обычно'}
        </h2>
      </div>

      <p className="text-[12px] mt-0.5 text-t2">
        {idle
          ? `За ${Math.floor(stats.uptimeSeconds / 60)} мин ни одного вмешательства — смотрите «Проверку компьютера» ниже`
          : isOn ? formatUptimeShort(stats.uptimeSeconds)
          : isConnecting ? 'Запускается фильтр трафика от имени администратора…'
          : isError ? (stats.driverStatus || 'Причина — в «Журнале». Нажмите кнопку, чтобы попробовать ещё раз.')
          : 'Нажмите кнопку, чтобы Discord и YouTube открывались без ограничений'}
      </p>

      {isOn && (
        <div className="grid grid-cols-3 gap-2.5 w-full mt-3.5 pt-3 border-t border-line">
          <div className="rounded-[9px] px-3 py-1.5 text-left bg-s2">
            <div className="text-[11px] text-t2">Обработано соединений</div>
            <div className={`text-[13px] font-semibold font-mono ${idle ? 'text-amber-400' : 'text-t1'}`}>
              {canCount ? stats.desyncCount.toLocaleString('ru-RU') : 'н/д'}
            </div>
            {!canCount && <div className="text-[10px] text-t3">нужен подробный журнал</div>}
          </div>
          <div className="rounded-[9px] px-3 py-1.5 text-left bg-s2">
            <div className="text-[11px] text-t2">Сайтов распознано</div>
            <div className="text-[13px] font-semibold font-mono text-t1">
              {canCount ? stats.hostCount.toLocaleString('ru-RU') : 'н/д'}
            </div>
          </div>
          <div className="rounded-[9px] px-3 py-1.5 text-left bg-s2 min-w-0">
            <div className="text-[11px] text-t2">Ядро</div>
            <div className="text-[12px] font-medium text-green-400 truncate">
              работает · PID {stats.pid || '—'} · профилей {stats.activeRulesCount}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
