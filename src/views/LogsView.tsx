import React, { useState, useMemo, useRef } from 'react';
import { Trash2, Copy, Pause, Play, FolderOpen, Search, X, Check } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { LogEntry } from '../types';
import { Button } from '../components/ui';

/** Человеческие имена источников. Фильтр работает по исходным. */
const SOURCE_LABEL: Record<string, string> = {
  WinWS: 'Ядро',
  Core: 'Программа',
  Runner: 'Запуск',
  Autotune: 'Подбор',
  TgProxy: 'Telegram',
  Proxy: 'Прокси',
  Preflight: 'Проверка',
  Presets: 'Пресеты',
  Settings: 'Настройки',
  Theme: 'Оформление',
  Tray: 'Трей',
  Diagnostics: 'Диагностика',
  Updater: 'Обновления',
  Setup: 'Установка',
  Logger: 'Журнал',
  Hostlist: 'Списки'
};
const srcLabel = (s: string) => SOURCE_LABEL[s] || s;

const LEVEL: Record<LogEntry['level'], { label: string; badge: string; text: string }> = {
  info: { label: 'инфо', badge: 'bg-blue-500/[0.12] text-blue-300', text: 'text-t1' },
  success: { label: 'успех', badge: 'bg-green-500/[0.12] text-green-300', text: 'text-green-300' },
  warn: { label: 'предупр', badge: 'bg-amber-500/[0.12] text-amber-300', text: 'text-amber-200' },
  error: { label: 'ошибка', badge: 'bg-red-500/[0.12] text-red-300', text: 'text-red-300' },
  packet: { label: 'пакет', badge: 'bg-cyan-500/[0.12] text-cyan-300', text: 'text-cyan-200' }
};

export const LogsView: React.FC = () => {
  const { logs, clearLogs, openLogsFolder } = useApp();
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [filterSource, setFilterSource] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [copied, setCopied] = useState(false);

  // На паузе список замораживается на том, что было в момент нажатия.
  const frozen = useRef<LogEntry[] | null>(null);
  if (isPaused && frozen.current === null) frozen.current = logs;
  if (!isPaused && frozen.current !== null) frozen.current = null;
  const source = isPaused && frozen.current ? frozen.current : logs;

  // Источники берём из самого журнала: набор зависит от того, что происходило.
  const sources = useMemo(() => {
    const set = new Set<string>();
    logs.forEach(l => set.add(l.source || 'Core'));
    return Array.from(set).sort();
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return source.filter(log => {
      if (filterLevel !== 'all' && log.level !== filterLevel) return false;
      if (filterSource !== 'all' && (log.source || 'Core') !== filterSource) return false;
      if (q && log.message.toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }, [source, filterLevel, filterSource, query]);

  const copyAll = () => {
    // Копируется то, что видно: обычно нужен именно отфильтрованный кусок.
    const text = filteredLogs
      .map(l => `[${l.timestamp}] [${l.source || 'Core'}] [${l.level.toUpperCase()}]: ${l.message}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-full flex flex-col p-5 gap-3 overflow-hidden select-none">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)} className="ui-input px-2.5 py-1.5 text-[12px]">
            <option value="all">Все уровни</option>
            <option value="info">Инфо</option>
            <option value="success">Успех</option>
            <option value="warn">Предупреждение</option>
            <option value="error">Ошибка</option>
          </select>
          <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className="ui-input px-2.5 py-1.5 text-[12px]">
            <option value="all">Все источники</option>
            {sources.map(s => <option key={s} value={s}>{srcLabel(s)}</option>)}
          </select>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-t3" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Поиск: хост, IP, опция…"
              className="ui-input pl-8 pr-7 py-1.5 text-[12px] w-52"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-t3 hover:text-t1">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button variant={isPaused ? 'success' : 'secondary'} size="sm" icon={isPaused ? Play : Pause} onClick={() => setIsPaused(!isPaused)}>
            {isPaused ? 'Продолжить' : 'Пауза'}
          </Button>
          <Button variant="secondary" size="sm" icon={copied ? Check : Copy} onClick={copyAll}>{copied ? 'Скопировано' : 'Копировать'}</Button>
          <Button variant="secondary" size="sm" icon={Trash2} onClick={clearLogs}>Очистить</Button>
          <Button variant="secondary" size="sm" icon={FolderOpen} onClick={openLogsFolder} title="zapret2.log — события программы и сводка работы ядра раз в 10 минут, хранится долго. winws-trace.log — подробный поток ядра за последние часы.">
            Папка журналов
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 rounded-[12px] p-2.5 font-mono text-[11px] overflow-y-auto space-y-0.5 bg-s1 border border-line select-text">
        {filteredLogs.length === 0 ? (
          <div className="text-t3 text-center py-12 font-sans text-[12px]">
            {source.length === 0 ? 'Журнал пуст' : 'Под фильтры ничего не подошло — ослабьте условия'}
          </div>
        ) : (
          filteredLogs.map(log => {
            const lv = LEVEL[log.level] || LEVEL.info;
            return (
              <div key={log.id} className="flex items-start gap-2 py-1 px-2 rounded hover:bg-white/[0.02] leading-relaxed">
                <span className="text-t3 shrink-0 select-none">{log.timestamp}</span>
                <span className={`px-1.5 rounded text-[10px] shrink-0 select-none ${lv.badge}`}>{lv.label}</span>
                <span className="px-1.5 rounded text-[10px] shrink-0 select-none bg-s2 text-t2">{srcLabel(log.source || 'Core')}</span>
                <span className={`break-all ${lv.text}`}>{log.message}</span>
              </div>
            );
          })
        )}
      </div>

      <div className="text-[11px] text-t3 font-mono">
        {filteredLogs.length} из {source.length}{isPaused && <span className="text-amber-400"> · пауза</span>}
      </div>
    </div>
  );
};
