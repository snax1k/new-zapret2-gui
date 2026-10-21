import React from 'react';
import { useApp } from '../context/AppContext';
import { QuickToggleBooleanKey } from '../types';
import { Toggle } from './ui';

/**
 * Быстрые переключатели. Каждый меняет строку запуска ядра; при включённом
 * обходе ядро перезапускается сразу.
 */
export const QuickToggles: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { quickToggles, toggleQuickSetting } = useApp();

  const items: { key: QuickToggleBooleanKey; label: string; hint: string; expert?: boolean; title: string }[] = [
    { key: 'discordVoice', label: 'Голос Discord', hint: 'голос и медиа', title: 'Профили голоса (UDP) и медиасерверов (TCP 2053–8443) Discord' },
    { key: 'quicDesync', label: 'Ускорение QUIC', hint: 'HTTP/3', title: 'Профиль QUIC — UDP 443 для доменов из списков' },
    { key: 'allTrafficMode', label: 'Весь трафик', hint: 'игнорировать списки', expert: true, title: 'Снимает списки доменов: обход применяется ко всему трафику на портах. Ломает подбор стратегии для сайтов.' },
    { key: 'autoTtl', label: 'Авто-TTL', hint: 'TTL у фейков', expert: true, title: '--dpi-desync-autottl=2:3-12 для профилей с fake' },
    { key: 'verboseLog', label: 'Подробный журнал', hint: 'для счётчиков', title: 'Пакетный журнал ядра (--debug). Без него не считаются «Обработано» и «Сайтов распознано». Пишется в отдельный файл winws-trace.log — последние часы работы, общий журнал не засоряет.' },
  ];

  return (
    <div className="rounded-[12px] p-3 bg-s1 border border-line">
      <div className={`grid gap-2 ${compact ? 'grid-cols-3' : 'grid-cols-5'}`}>
        {items.map(item => (
          <div
            key={item.key}
            title={item.title}
            onClick={() => toggleQuickSetting(item.key)}
            className="px-2.5 py-2 rounded-[8px] flex items-start justify-between gap-2 bg-s2 border border-line cursor-pointer hover:bg-white/[0.03] transition-colors"
          >
            <div className="min-w-0">
              <div className="text-[12px] font-medium text-t1 leading-tight">{item.label}</div>
              <div className={`text-[11px] leading-tight mt-0.5 ${item.expert ? 'text-amber-500' : 'text-t3'}`}>
                {item.expert ? 'для опытных' : item.hint}
              </div>
            </div>
            <Toggle checked={quickToggles[item.key]} onChange={() => toggleQuickSetting(item.key)} />
          </div>
        ))}
      </div>
    </div>
  );
};
