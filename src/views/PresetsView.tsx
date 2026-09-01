import React, { useState } from 'react';
import {
  Sliders,
  Check,
  Copy,
  Terminal,
  Plus,
  Info,
  HelpCircle,
  Edit3,
  Trash2,
  Globe,
  Shield,
  Cpu,
  Clock,
  Download,
  Upload
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Preset, PresetArgs } from '../types';
import { buildPresetCommand, describeProfiles, describeGlobalFlags } from '../lib/zapretCommand';
import { BUILTIN_PRESET_IDS } from '../context/AppContext';

export const PresetsView: React.FC = () => {
  const { presets, activePresetId, setActivePresetId, updatePresetArgs, deletePreset, setIsCreatePresetModalOpen, addLog, theme, quickToggles, exportPresets, importPresets } = useApp();
  const [selectedPresetId, setSelectedPresetId] = useState<string>(activePresetId);
  const [copied, setCopied] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState<string | null>('desyncMode');

  const currentPreset = presets.find(p => p.id === selectedPresetId) || presets[0];

  const handleApply = (id: string) => {
    setActivePresetId(id);
    const p = presets.find(item => item.id === id);
    if (p) {
      addLog('success', `Пресет [${p.name}] успешно активирован!`, 'Presets');
    }
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

  const paramDocs: Record<string, { title: string; hint: string; examples: string[]; purpose: string }> = {
    desyncMode: {
      title: 'Метод десинхронизации (--dpi-desync)',
      hint: 'Основной алгоритм модификации пакетов.',
      examples: ['fake,multidisorder', 'fake,multisplit', 'multisplit', 'multidisorder', 'fake', 'syndata'],
      purpose: 'fake подмешивает поддельный пакет с ложным SNI; split2 разрезает ClientHello пополам; disorder2 меняет очередность доставки сегментов.'
    },
    desyncFooling: {
      title: 'Способ обмана ТСПУ (--dpi-desync-fooling)',
      hint: 'Метод отбраковки поддельного пакета сервером.',
      examples: ['badseq', 'badsum', 'md5sig', 'none', 'datanoack', 'hopbyhop'],
      purpose: 'badseq портит порядковый номер TCP Sequence; badsum портит контрольную сумму TCP — сервер отбрасывает фейк, а цензор ТСПУ застревает на нем.'
    },
    splitPos: {
      title: 'Позиция разделения (--dpi-desync-split-pos)',
      hint: 'Байт заголовка SNI, где разрезается пакет.',
      examples: ['1,midsld', 'method+2', '2', 'sniext', 'host'],
      purpose: '2 или 3 разрезают доменное имя (например: you + tube.com). Сигнатурный сканер РКН не может распознать домен в разделенных пакетах.'
    },
    splitSeqovl: {
      title: 'Наложение сегментов (--dpi-desync-split-seqovl)',
      hint: 'Байты перекрытия между соседними сегментами.',
      examples: ['1', '2', '0'],
      purpose: 'Создает перекрытие в 1-2 байта, которое парсер ТСПУ не способен корректно склеить.'
    },
    desyncCutoff: {
      title: 'Ограничение пакетов (--dpi-desync-cutoff)',
      hint: 'К скольким пакетам в начале соединения применять десинхронизацию.',
      examples: ['d3', 'd4', 'n2', 's2'],
      purpose: 'd3 отключает вмешательство после 3 пакетов данных (после завершения TLS Handshake), давая 100% скорость скачивания видеопотока 4K.'
    },
    repeats: {
      title: 'Количество повторов фейка (--dpi-desync-repeats)',
      hint: 'Сколько раз подряд слать фейковый пакет.',
      examples: ['6', '1', '2', '11', '20'],
      purpose: 'Помогает переполнить буфер DPI очередей на узлах Ростелекома, Билайна и Дом.ру.'
    },
    desyncTtl: {
      title: 'Управление TTL пакетов (--dpi-desync-ttl / --dpi-desync-autottl)',
      hint: 'Время жизни фейкового пакета. Синтаксис ядра: [+|-]<delta>[:<min>[-<max>]].',
      examples: ['2:3-12', '+2', '4', '1:2-8'],
      purpose: 'Позволяет фейку дойти до ТСПУ цензора, но умереть до того, как он долетит до настоящего сервера YouTube или Discord.'
    },
    desyncFakeTls: {
      title: 'Пейлоад фейка TLS (--dpi-desync-fake-tls)',
      hint: 'Файл или HEX поддельного ClientHello.',
      examples: ['tls_clienthello_iana_org.bin', '0x16030100...'],
      purpose: 'Подменяет домен при проверке цензором на нейтральный iana.org.'
    },
    filterTcp: {
      title: 'TCP Порты фильтрации (--filter-tcp)',
      hint: 'Номера TCP портов для перехвата веб-трафика.',
      examples: ['80,443', '443', '1-65535'],
      purpose: '443 — стандартный HTTPS порт веб-трафика YouTube, браузеров и веб-версий сервисов.'
    },
    filterUdp: {
      title: 'UDP Порты фильтрации (--filter-udp)',
      hint: 'Номера портов для голосового и QUIC трафика.',
      examples: ['443,50000-65535', '50000-65535', '443'],
      purpose: '50000-65535 используются голосовыми шлюзами Discord Voice RTC; 443 — протокол HTTP/3 QUIC.'
    },
    filterL7: {
      title: 'L7 Протоколы фильтрации (--filter-l7)',
      hint: 'Протоколы уровня приложений.',
      examples: ['http,tls,quic', 'tls', 'wireguard,dht'],
      purpose: 'Применяет стратегию только к указанным протоколам для оптимизации нагрузки CPU.'
    },
    hostlist: {
      title: 'Список доменов (--hostlist)',
      hint: 'Файл списков хостов.',
      examples: ['{LISTS}/list-general.txt', '{LISTS}/list-user.txt'],
      purpose: 'Позволяет точечно фильтровать только целевые сайты без замедления остального интернета.'
    }
  };

  return (
    <div className="h-full flex flex-col p-6 space-y-5 overflow-y-auto select-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Sliders className="w-5 h-5 text-indigo-500" />
            Каталог пресетов и параметров десинхронизации
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Детальный просмотр, редактирование и создание собственных стратегий обхода
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={exportPresets}
            title="Сохранить все пресеты в файл .json"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 text-xs font-medium border border-black/5 dark:border-white/5 transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Экспорт</span>
          </button>

          <button
            onClick={importPresets}
            title="Загрузить пресеты из файла .json (существующие не удаляются)"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 text-xs font-medium border border-black/5 dark:border-white/5 transition-colors whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Импорт</span>
          </button>

          <button
            onClick={() => setIsCreatePresetModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-950/30 transition-all whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Создать пресет</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1">
        {/* Left Column: Preset List */}
        <div className="lg:col-span-5 space-y-2.5">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Доступные пресеты ({presets.length})
          </span>

          <div className="space-y-2">
            {presets.map((preset) => {
              const isActive = preset.id === activePresetId;
              const isSelected = preset.id === selectedPresetId;
              const isCustom = !BUILTIN_PRESET_IDS.has(preset.id);

              return (
                <div
                  key={preset.id}
                  onClick={() => setSelectedPresetId(preset.id)}
                  className={`p-3.5 rounded-xl cursor-pointer border transition-all duration-150 relative group ${
                    isSelected
                      ? theme === 'dark'
                        ? 'bg-slate-900 border-indigo-500/60 shadow-md shadow-indigo-950/40'
                        : 'bg-indigo-50/70 border-indigo-300 shadow-xs'
                      : theme === 'dark'
                        ? 'bg-slate-900/40 border-white/5 hover:border-white/10 hover:bg-slate-900/60'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-xs font-bold truncate ${isSelected ? 'text-indigo-600 dark:text-white' : ''}`}>
                        {preset.name}
                      </span>
                      {preset.badge && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30 shrink-0">
                          {preset.badge}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isActive && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          <Check className="w-3 h-3" />
                          Активен
                        </span>
                      )}

                      {isCustom && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deletePreset(preset.id);
                          }}
                          title="Удалить пресет"
                          className="p-1 text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2.5 line-clamp-2">
                    {preset.description}
                  </p>

                  <div className="flex flex-wrap gap-1">
                    {preset.tags.map((tag, idx) => (
                      <span key={idx} className="text-[9px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 text-slate-600 dark:text-slate-300 border border-black/5 dark:border-white/5 font-medium">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Detailed Parameter Viewer with Explanations & Examples */}
        <div className="lg:col-span-7 space-y-4">
          <div className={`p-4 rounded-xl border space-y-4 ${
            theme === 'dark' ? 'bg-slate-900/70 border-white/10' : 'bg-white border-slate-200 shadow-xs'
          }`}>
            {/* Header info */}
            <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{currentPreset.name}</h3>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">{currentPreset.description}</span>
              </div>
              <button
                onClick={() => handleApply(currentPreset.id)}
                disabled={currentPreset.id === activePresetId}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  currentPreset.id === activePresetId
                    ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30 cursor-default'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md'
                }`}
              >
                {currentPreset.id === activePresetId ? 'Уже применен' : 'Применить пресет'}
              </button>
            </div>

            {isStrategyPreset ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-indigo-500" />
                    Профили обработки трафика ({profiles.length})
                  </span>
                  <span className="text-[10px] text-slate-500">Порядок важен: срабатывает первый подходящий</span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-bold text-slate-500 uppercase mr-1">Захват WinDivert:</span>
                  {globalFlags.map(f => (
                    <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border border-indigo-500/20 font-mono">
                      {f}
                    </span>
                  ))}
                </div>

                <div className="space-y-2">
                  {profiles.map((prof, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded-xl border ${
                        theme === 'dark' ? 'bg-black/30 border-white/5' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                          {prof.title}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
                          {prof.ports}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {prof.flags.map((f, k) => (
                          <span
                            key={k}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 text-slate-600 dark:text-slate-300 border border-black/5 dark:border-white/10 font-mono break-all"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Состав профилей меняется переключателями на главном экране
                  (QUIC, Discord, Telegram, «Весь трафик»). Для ручной настройки
                  создайте свой пресет кнопкой «Создать пресет».
                </p>
              </div>
            ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Edit3 className="w-3.5 h-3.5 text-indigo-500" />
                  Полный список флагов конфигурации
                </span>
                <span className="text-[10px] text-slate-500">Кликните на карточку для подсказки</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* 1. Desync Mode */}
                <div
                  onClick={() => setActiveTooltip(activeTooltip === 'desyncMode' ? null : 'desyncMode')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    activeTooltip === 'desyncMode'
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : theme === 'dark' ? 'bg-black/30 border-white/5 hover:border-white/20' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">--dpi-desync:</span>
                    <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
                  </div>
                  <input
                    type="text"
                    value={currentPreset.args.desyncMode}
                    onChange={(e) => updatePresetArgs(currentPreset.id, { desyncMode: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full bg-transparent font-mono text-xs font-bold text-indigo-600 dark:text-indigo-300 focus:outline-none"
                  />
                  <div className="text-[9px] text-slate-400 mt-1">Примеры: fake,multidisorder, multisplit</div>
                </div>

                {/* 2. Desync Fooling */}
                <div
                  onClick={() => setActiveTooltip(activeTooltip === 'desyncFooling' ? null : 'desyncFooling')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    activeTooltip === 'desyncFooling'
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : theme === 'dark' ? 'bg-black/30 border-white/5 hover:border-white/20' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">--dpi-desync-fooling:</span>
                    <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
                  </div>
                  <input
                    type="text"
                    value={currentPreset.args.desyncFooling || 'none'}
                    onChange={(e) => updatePresetArgs(currentPreset.id, { desyncFooling: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full bg-transparent font-mono text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none"
                  />
                  <div className="text-[9px] text-slate-400 mt-1">Примеры: badseq, badsum, md5sig</div>
                </div>

                {/* 3. Split Pos */}
                <div
                  onClick={() => setActiveTooltip(activeTooltip === 'splitPos' ? null : 'splitPos')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    activeTooltip === 'splitPos'
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : theme === 'dark' ? 'bg-black/30 border-white/5 hover:border-white/20' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">--dpi-desync-split-pos:</span>
                    <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
                  </div>
                  <input
                    type="text"
                    value={currentPreset.args.splitPos || '2'}
                    onChange={(e) => updatePresetArgs(currentPreset.id, { splitPos: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full bg-transparent font-mono text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none"
                  />
                  <div className="text-[9px] text-slate-400 mt-1">Примеры: 1, 2, 3, midsld</div>
                </div>

                {/* 4. Split Seqovl */}
                <div
                  onClick={() => setActiveTooltip(activeTooltip === 'splitSeqovl' ? null : 'splitSeqovl')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    activeTooltip === 'splitSeqovl'
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : theme === 'dark' ? 'bg-black/30 border-white/5 hover:border-white/20' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">--dpi-desync-split-seqovl:</span>
                    <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
                  </div>
                  <input
                    type="text"
                    value={currentPreset.args.splitSeqovl || '1'}
                    onChange={(e) => updatePresetArgs(currentPreset.id, { splitSeqovl: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full bg-transparent font-mono text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none"
                  />
                  <div className="text-[9px] text-slate-400 mt-1">Примеры: 1, 2, 0 (байт перекрытия)</div>
                </div>

                {/* 5. Cutoff */}
                <div
                  onClick={() => setActiveTooltip(activeTooltip === 'desyncCutoff' ? null : 'desyncCutoff')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    activeTooltip === 'desyncCutoff'
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : theme === 'dark' ? 'bg-black/30 border-white/5 hover:border-white/20' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">--dpi-desync-cutoff:</span>
                    <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
                  </div>
                  <input
                    type="text"
                    value={currentPreset.args.desyncCutoff || 'd3'}
                    onChange={(e) => updatePresetArgs(currentPreset.id, { desyncCutoff: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full bg-transparent font-mono text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none"
                  />
                  <div className="text-[9px] text-slate-400 mt-1">Примеры: d3, d4, n2 (кол-во пакетов)</div>
                </div>

                {/* 6. Repeats */}
                <div
                  onClick={() => setActiveTooltip(activeTooltip === 'repeats' ? null : 'repeats')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    activeTooltip === 'repeats'
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : theme === 'dark' ? 'bg-black/30 border-white/5 hover:border-white/20' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">--dpi-desync-repeats:</span>
                    <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
                  </div>
                  <input
                    type="text"
                    value={currentPreset.args.repeats || '6'}
                    onChange={(e) => updatePresetArgs(currentPreset.id, { repeats: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full bg-transparent font-mono text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none"
                  />
                  <div className="text-[9px] text-slate-400 mt-1">Примеры: 1, 2, 6, 11 (повторы фейка)</div>
                </div>

                {/* 7. TTL */}
                <div
                  onClick={() => setActiveTooltip(activeTooltip === 'desyncTtl' ? null : 'desyncTtl')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    activeTooltip === 'desyncTtl'
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : theme === 'dark' ? 'bg-black/30 border-white/5 hover:border-white/20' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">--dpi-desync-autottl:</span>
                    <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
                  </div>
                  <input
                    type="text"
                    value={currentPreset.args.desyncTtl || ''}
                    onChange={(e) => updatePresetArgs(currentPreset.id, { desyncTtl: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full bg-transparent font-mono text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none"
                  />
                  <div className="text-[9px] text-slate-400 mt-1">Примеры: 2:3-12, +2, 4 (пусто = не использовать)</div>
                </div>

                {/* 8. Filter Ports */}
                <div
                  onClick={() => setActiveTooltip(activeTooltip === 'filterTcp' ? null : 'filterTcp')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    activeTooltip === 'filterTcp'
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : theme === 'dark' ? 'bg-black/30 border-white/5 hover:border-white/20' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">--filter-tcp / udp:</span>
                    <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
                  </div>
                  <div className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                    TCP: {currentPreset.args.filterTcp || '443'} | UDP: {currentPreset.args.filterUdp || '443'}
                  </div>
                  <div className="text-[9px] text-slate-400 mt-1">Порты 80, 443, 50000-65535</div>
                </div>
              </div>
            </div>
            )}

            {/* Expandable Explanation Card for Selected Parameter */}
            {!isStrategyPreset && activeTooltip && paramDocs[activeTooltip] && (
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-indigo-950/40 to-slate-900/60 border border-indigo-500/30 space-y-1.5 animate-fadeIn">
                <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-400">
                  <Info className="w-4 h-4" />
                  <span>{paramDocs[activeTooltip].title}</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  {paramDocs[activeTooltip].hint}
                </p>
                <div className="text-[10px] text-slate-400 font-mono pt-1">
                  <strong>Что вводить:</strong> {paramDocs[activeTooltip].examples.join(', ')}
                </div>
                <div className="text-[10px] text-emerald-400">
                  💡 {paramDocs[activeTooltip].purpose}
                </div>
              </div>
            )}

            {/* Command Line Preview */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1">
                  <Terminal className="w-3 h-3 text-indigo-500" />
                  Строка запуска движка (Zapret winws):
                </span>
                <button
                  onClick={copyCommand}
                  className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline transition-colors"
                >
                  <Copy className="w-3 h-3" />
                  <span>{copied ? 'Скопировано!' : 'Копировать'}</span>
                </button>
              </div>

              <div className="p-3 rounded-lg bg-black/85 border border-black/10 dark:border-white/10 font-mono text-[11px] text-emerald-400 break-all select-text">
                {generateCommandLine(currentPreset)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
