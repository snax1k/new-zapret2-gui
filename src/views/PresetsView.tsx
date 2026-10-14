import React, { useState } from 'react';
import {
  ArrowLeft, Check, Copy, Plus, Info, HelpCircle, Trash2, Download, Upload,
  ChevronDown, ChevronUp, Terminal
} from 'lucide-react';
import { useApp, BUILTIN_PRESET_IDS } from '../context/AppContext';
import { YoutubeStrategyPicker } from '../components/YoutubeStrategyPicker';
import { Preset, PresetArgs } from '../types';
import { buildPresetCommand, describeProfiles, describeGlobalFlags } from '../lib/zapretCommand';
import { Badge, Button, Card, PageHeader } from '../components/ui';

/** Справка по параметрам ручного пресета. */
const PARAM_DOCS: Record<string, { title: string; hint: string; examples: string[]; purpose: string }> = {
  desyncMode: {
    title: 'Метод десинхронизации (--dpi-desync)',
    hint: 'Основной алгоритм модификации пакетов.',
    examples: ['fake,multidisorder', 'fake,multisplit', 'multisplit', 'multidisorder', 'fake', 'syndata'],
    purpose: 'fake подмешивает поддельный пакет с ложным SNI; multisplit разрезает ClientHello; multidisorder ещё и меняет очерёдность доставки сегментов.'
  },
  desyncFooling: {
    title: 'Способ обмана ТСПУ (--dpi-desync-fooling)',
    hint: 'Метод отбраковки поддельного пакета сервером.',
    examples: ['badseq', 'badsum', 'md5sig', 'ts', 'none', 'datanoack'],
    purpose: 'badseq портит порядковый номер TCP; md5sig добавляет опцию TCP MD5; ts портит метку времени — сервер отбрасывает фейк, а ТСПУ застревает на нём.'
  },
  splitPos: {
    title: 'Позиция разделения (--dpi-desync-split-pos)',
    hint: 'Байт заголовка, где разрезается пакет.',
    examples: ['1,midsld', 'method+2', '2', 'sniext+1', 'host+1'],
    purpose: 'Разрез внутри имени сайта не даёт сигнатурному сканеру распознать домен целиком.'
  },
  splitSeqovl: {
    title: 'Наложение сегментов (--dpi-desync-split-seqovl)',
    hint: 'Байты перекрытия между соседними сегментами.',
    examples: ['1', '2', '568', '681'],
    purpose: 'Перекрытие, которое парсер ТСПУ не способен корректно склеить.'
  },
  desyncCutoff: {
    title: 'Ограничение пакетов (--dpi-desync-cutoff)',
    hint: 'К скольким пакетам в начале соединения применять десинхронизацию.',
    examples: ['d3', 'd4', 'n2', 's2'],
    purpose: 'd3 отключает вмешательство после 3 пакетов данных — дальше видео идёт на полной скорости.'
  },
  repeats: {
    title: 'Количество повторов фейка (--dpi-desync-repeats)',
    hint: 'Сколько раз подряд слать фейковый пакет.',
    examples: ['6', '1', '2', '11'],
    purpose: 'Помогает, когда DPI пропускает одиночные фейки.'
  },
  desyncTtl: {
    title: 'TTL фейка (--dpi-desync-autottl)',
    hint: 'Время жизни фейкового пакета. Синтаксис ядра: [+|-]<delta>[:<min>[-<max>]].',
    examples: ['2:3-12', '+2', '4', '1:2-8'],
    purpose: 'Фейк доходит до ТСПУ, но умирает раньше, чем долетит до настоящего сервера.'
  },
  filterTcp: {
    title: 'Порты фильтрации (--filter-tcp / --filter-udp)',
    hint: 'Порты, трафик которых перехватывается.',
    examples: ['80,443', '443', '50000-50100'],
    purpose: '443 — HTTPS; 50000-50100 и 19294-19344 — голос Discord; UDP 443 — QUIC.'
  }
};

/** Редактируемые поля ручного пресета и их значения по умолчанию. */
const FIELDS: { id: keyof PresetArgs; flag: string; fallback: string; examples: string }[] = [
  { id: 'desyncMode', flag: '--dpi-desync', fallback: '', examples: 'fake,multidisorder, multisplit' },
  { id: 'desyncFooling', flag: '--dpi-desync-fooling', fallback: 'none', examples: 'badseq, md5sig, ts' },
  { id: 'splitPos', flag: '--dpi-desync-split-pos', fallback: '2', examples: '1, 2, midsld' },
  { id: 'splitSeqovl', flag: '--dpi-desync-split-seqovl', fallback: '1', examples: '1, 2, 0 (байт перекрытия)' },
  { id: 'desyncCutoff', flag: '--dpi-desync-cutoff', fallback: 'd3', examples: 'd3, d4, n2' },
  { id: 'repeats', flag: '--dpi-desync-repeats', fallback: '6', examples: '1, 2, 6, 11' },
  { id: 'desyncTtl', flag: '--dpi-desync-autottl', fallback: '', examples: '2:3-12, +2 (пусто — не использовать)' },
];

/**
 * Стратегии — раздел для опытных, продолжение «Подбора».
 *
 * Здесь выбираются способы обхода вручную, живёт список пресетов и видно,
 * из чего собрана команда ядра.
 */
export const PresetsView: React.FC = () => {
  const {
    presets, activePresetId, setActivePresetId, updatePresetArgs, deletePreset,
    setIsCreatePresetModalOpen, addLog, quickToggles, exportPresets, importPresets, setActiveTab
  } = useApp();
  const [selectedPresetId, setSelectedPresetId] = useState<string>(activePresetId);
  const [copied, setCopied] = useState(false);
  const [cliOpen, setCliOpen] = useState(true);
  const [activeTooltip, setActiveTooltip] = useState<string | null>('desyncMode');

  const currentPreset = presets.find(p => p.id === selectedPresetId) || presets[0];

  const handleApply = (id: string) => {
    setActivePresetId(id);
    const p = presets.find(item => item.id === id);
    if (p) addLog('success', `Пресет [${p.name}] успешно активирован!`, 'Presets');
  };

  const generateCommandLine = (preset: Preset) => buildPresetCommand(preset, quickToggles);

  // У пресета со стратегией (rawArgs) нет «одного режима» и «одной позиции
  // разреза»: параметры свои у каждого профиля. Поля-редакторы для него
  // показывать нельзя — они и не отражают конфигурацию, и ни на что не влияют.
  const isStrategyPreset = !!currentPreset.args.rawArgs;
  const profiles = isStrategyPreset ? describeProfiles(currentPreset, quickToggles) : [];
  const globalFlags = isStrategyPreset ? describeGlobalFlags(currentPreset, quickToggles) : [];

  const copyCommand = () => {
    navigator.clipboard.writeText(generateCommandLine(currentPreset));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-full overflow-y-auto p-5 space-y-3 select-none">
      <PageHeader
        title="Стратегии (для опытных)"
        back={() => setActiveTab('autotune')}
        backIcon={ArrowLeft}
        actions={
          <>
            <Button variant="secondary" size="sm" icon={Plus} onClick={() => setIsCreatePresetModalOpen(true)}>Создать пресет</Button>
            <Button variant="secondary" size="sm" icon={Upload} onClick={importPresets} title="Загрузить пресеты из файла .json (существующие не удаляются)">Импорт</Button>
            <Button variant="secondary" size="sm" icon={Download} onClick={exportPresets} title="Сохранить все пресеты в файл .json">Экспорт</Button>
          </>
        }
      />

      <YoutubeStrategyPicker group="sites" />
      <YoutubeStrategyPicker group="youtube" />

      <div className="grid grid-cols-12 gap-3">
        {/* Список пресетов */}
        <div className="col-span-5 space-y-2">
          <div className="text-[12px] font-semibold text-t2 px-0.5">Пресеты ({presets.length})</div>
          {presets.map(preset => {
            const isActive = preset.id === activePresetId;
            const isSelected = preset.id === selectedPresetId;
            const isCustom = !BUILTIN_PRESET_IDS.has(preset.id);
            return (
              <div
                key={preset.id}
                onClick={() => setSelectedPresetId(preset.id)}
                className={`group p-3 rounded-[12px] cursor-pointer border transition-colors ${
                  isSelected ? 'bg-ac/10 border-ac/40' : 'bg-s1 border-line hover:border-line-strong'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[12px] font-semibold text-t1 truncate">{preset.name}</span>
                    {preset.badge && <Badge tone="accent">{preset.badge}</Badge>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isActive && <Badge tone="ok"><Check className="w-3 h-3" />Активен</Badge>}
                    {isCustom && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); deletePreset(preset.id); }}
                        title="Удалить пресет"
                        className="p-1 text-t3 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-t2 line-clamp-2 mb-2">{preset.description}</p>
                <div className="flex flex-wrap gap-1">
                  {preset.tags.map((tag, idx) => (
                    <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded bg-s2 text-t2 border border-line">{tag}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Подробности выбранного пресета */}
        <div className="col-span-7 space-y-3">
          <Card className="p-3.5 space-y-3">
            <div className="flex items-start justify-between gap-3 pb-2.5 border-b border-line">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-t1">{currentPreset.name}</div>
                <div className="text-[11px] text-t2">{currentPreset.description}</div>
              </div>
              {currentPreset.id === activePresetId
                ? <Button variant="success" size="sm" icon={Check}>Уже применён</Button>
                : <Button size="sm" onClick={() => handleApply(currentPreset.id)}>Применить пресет</Button>}
            </div>

            {isStrategyPreset ? (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-semibold text-t1">Как устроена команда ({profiles.length} профилей)</span>
                  <span className="text-[11px] text-t3">срабатывает первый подходящий</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-t3 mr-0.5">Захват WinDivert:</span>
                  {globalFlags.map(f => <Badge key={f} tone="accent" mono>{f}</Badge>)}
                </div>
                <div className="space-y-1.5">
                  {profiles.map((prof, i) => (
                    <div key={i} className="px-2.5 py-2 rounded-[8px] bg-s2 border border-line">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[12px] font-medium text-t1">{prof.title}</span>
                        <span className="text-[11px] font-mono text-t2 shrink-0">{prof.ports}</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {prof.flags.map((f, k) => (
                          <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] text-t2 border border-line font-mono break-all">{f}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-t3 leading-relaxed">
                  Состав профилей меняется переключателями на главной (QUIC, голос Discord, «Весь трафик»),
                  а способы обхода — выбором выше. Для ручной настройки создайте свой пресет.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-t1">Параметры пресета</span>
                  <span className="text-[11px] text-t3">щёлкните поле для подсказки</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {FIELDS.map(f => (
                    <div
                      key={f.id}
                      onClick={() => setActiveTooltip(activeTooltip === f.id ? null : f.id)}
                      className={`p-2.5 rounded-[8px] border cursor-pointer transition-colors ${
                        activeTooltip === f.id ? 'border-ac/60 bg-ac/10' : 'bg-s2 border-line hover:border-line-strong'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-mono text-t3">{f.flag}</span>
                        <HelpCircle className="w-3.5 h-3.5 text-ac-400" />
                      </div>
                      <input
                        type="text"
                        value={(currentPreset.args[f.id] as string) || f.fallback}
                        onChange={(e) => updatePresetArgs(currentPreset.id, { [f.id]: e.target.value } as Partial<PresetArgs>)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full bg-transparent font-mono text-[12px] font-semibold text-t1 focus:outline-none"
                      />
                      <div className="text-[10px] text-t3 mt-1">Примеры: {f.examples}</div>
                    </div>
                  ))}
                  <div
                    onClick={() => setActiveTooltip(activeTooltip === 'filterTcp' ? null : 'filterTcp')}
                    className={`p-2.5 rounded-[8px] border cursor-pointer transition-colors ${
                      activeTooltip === 'filterTcp' ? 'border-ac/60 bg-ac/10' : 'bg-s2 border-line hover:border-line-strong'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-mono text-t3">--filter-tcp / udp</span>
                      <HelpCircle className="w-3.5 h-3.5 text-ac-400" />
                    </div>
                    <div className="font-mono text-[12px] font-semibold text-t1">
                      TCP: {currentPreset.args.filterTcp || '443'} | UDP: {currentPreset.args.filterUdp || '443'}
                    </div>
                    <div className="text-[10px] text-t3 mt-1">Задаются при создании пресета</div>
                  </div>
                </div>

                {activeTooltip && PARAM_DOCS[activeTooltip] && (
                  <div className="p-3 rounded-[10px] bg-ac/10 border border-ac/30 space-y-1 animate-fadeIn">
                    <div className="flex items-center gap-1.5 text-[12px] font-semibold text-ac-300">
                      <Info className="w-4 h-4" />
                      <span>{PARAM_DOCS[activeTooltip].title}</span>
                    </div>
                    <p className="text-[11px] text-t1">{PARAM_DOCS[activeTooltip].hint}</p>
                    <div className="text-[11px] text-t2 font-mono">Что вводить: {PARAM_DOCS[activeTooltip].examples.join(', ')}</div>
                    <div className="text-[11px] text-green-400">{PARAM_DOCS[activeTooltip].purpose}</div>
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card className="p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={() => setCliOpen(!cliOpen)} className="text-[12px] font-semibold flex items-center gap-1.5 text-t1">
                <Terminal className="w-3.5 h-3.5 text-ac" />
                <span>Строка запуска winws.exe</span>
                {cliOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              <Button variant="secondary" size="sm" icon={copied ? Check : Copy} onClick={copyCommand}>
                {copied ? 'Скопировано' : 'Копировать'}
              </Button>
            </div>
            {cliOpen && (
              <div className="p-2.5 rounded-[8px] font-mono text-[11px] leading-snug select-text break-all bg-s2 text-t2 border border-line">
                {generateCommandLine(currentPreset)}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};
