import React, { useState } from 'react';
import {
  Plus,
  X,
  Sliders,
  Sparkles,
  Terminal,
  Check,
  Info,
  Globe,
  Shield,
  Cpu,
  Clock,
  FileCode,
  HelpCircle,
  ChevronRight
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Preset, PresetArgs } from '../types';
import { buildPresetCommand, DEFAULT_TOGGLES } from '../lib/zapretCommand';

export const CreatePresetModal: React.FC = () => {
  const { isCreatePresetModalOpen, setIsCreatePresetModalOpen, createPreset, theme } = useApp();

  const [activeTab, setActiveTab] = useState<'general' | 'filters' | 'strategy' | 'timing' | 'payloads'>('general');
  const [activeFieldHelp, setActiveFieldHelp] = useState<string | null>('desyncMode');

  // Form states
  const [name, setName] = useState('');
  const [badge, setBadge] = useState('Кастом');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('YouTube, Discord, 4K');

  // Strategy & Filters
  const [filterTcp, setFilterTcp] = useState('443');
  const [filterUdp, setFilterUdp] = useState('');
  const [filterL7, setFilterL7] = useState('tls');
  const [hostlist, setHostlist] = useState('{LISTS}/list-general.txt');

  const [desyncMode, setDesyncMode] = useState('fake,multidisorder');
  const [desyncFooling, setDesyncFooling] = useState('badseq');
  const [splitPos, setSplitPos] = useState('1,midsld');
  const [splitSeqovl, setSplitSeqovl] = useState('');

  const [desyncCutoff, setDesyncCutoff] = useState('');
  const [repeats, setRepeats] = useState('6');
  const [desyncTtl, setDesyncTtl] = useState('');

  const [desyncFakeTls, setDesyncFakeTls] = useState('tls_clienthello_www_google_com.bin');
  const [wssize, setWssize] = useState('');
  const [anyProtocol, setAnyProtocol] = useState(false);
  const [extraArgs, setExtraArgs] = useState('');

  if (!isCreatePresetModalOpen) return null;

  const helpDocs: Record<string, { title: string; desc: string; examples: string[]; recommendation: string }> = {
    name: {
      title: 'Название профиля',
      desc: 'Понятное имя пресета для быстрого выбора в главном меню.',
      examples: ['Ростелеком 4K Fix (Split2)', 'Discord RTC Voice Low-Ping', 'МТС Ultra Speed'],
      recommendation: 'Укажите провайдера или сервис для удобства.'
    },
    filterTcp: {
      title: 'TCP Порты перехвата (--filter-tcp)',
      desc: 'Номера TCP портов, трафик которых перехватывается драйвером WinDivert.',
      examples: ['80,443', '443', '1-65535'],
      recommendation: 'Для YouTube и большинства сайтов укажите 80,443.'
    },
    filterUdp: {
      title: 'UDP Порты перехвата (--filter-udp)',
      desc: 'Номера UDP портов для голосовых звонков и стримов.',
      examples: ['443,50000-65535', '50000-65535', '443'],
      recommendation: '50000-65535 необходимы для голосовых каналов Discord (RTC).'
    },
    filterL7: {
      title: 'L7 Протоколы фильтрации (--filter-l7)',
      desc: 'Фильтрация на прикладном уровне (Application Layer).',
      examples: ['http,tls,quic', 'tls', 'wireguard,dht'],
      recommendation: 'http,tls,quic покрывает браузеры, YouTube и мессенджеры.'
    },
    hostlist: {
      title: 'Список доменов (--hostlist)',
      desc: 'Файл со списком заблокированных сайтов, к которым применяется обход.',
      examples: ['{LISTS}/list-general.txt', '{LISTS}/list-user.txt'],
      recommendation: '{LISTS} заменяется на путь к папке host-list при запуске ядра. Пустое поле — обход для всего трафика на портах.'
    },
    desyncMode: {
      title: 'Метод десинхронизации (--dpi-desync)',
      desc: 'Главный алгоритм изменения пакетов: fake подмешивает ложный запрос; split/split2 разрезает ClientHello; disorder2 меняет очередность сегментов.',
      examples: ['fake,multidisorder', 'fake,multisplit', 'multisplit', 'multidisorder', 'fake', 'syndata'],
      recommendation: 'fake,multidisorder — комбинация из рабочих конфигураций zapret v72.'
    },
    desyncFooling: {
      title: 'Способ обмана ТСПУ (--dpi-desync-fooling)',
      desc: 'Как заставить цензор провайдера отбросить фейковый пакет, пока сервер продолжает работу.',
      examples: ['badseq (ломает SeqNum)', 'badsum (ломает TCP Checksum)', 'md5sig', 'none'],
      recommendation: 'badseq работает у большинства провайдеров (Ростелеком, Билайн, Дом.ру).'
    },
    splitPos: {
      title: 'Позиция разрезания пакета (--dpi-desync-split-pos)',
      desc: 'Байт заголовка SNI, где пакет разделяется на две части.',
      examples: ['1,midsld', 'method+2', '2', 'sniext', 'host+1'],
      recommendation: '1,midsld - рабочая позиция для TLS, method+2 - для открытого HTTP.'
    },
    splitSeqovl: {
      title: 'Наложение сегментов (--dpi-desync-split-seqovl)',
      desc: 'Количество байт перекрытия между разрезанными частями TCP-пакета.',
      examples: ['1', '2', '0'],
      recommendation: 'Значение 1 создает перекрытие, ломающее парсер ТСПУ.'
    },
    desyncCutoff: {
      title: 'Отсечка десинхронизации (--dpi-desync-cutoff)',
      desc: 'Сколько начальных пакетов соединения модифицировать перед отключением обхода.',
      examples: ['d3', 'd4', 'n2', 's2'],
      recommendation: 'Нужен в основном вместе с --dpi-desync-any-protocol. В обычных пресетах можно оставить пустым.'
    },
    repeats: {
      title: 'Повторы фейка (--dpi-desync-repeats)',
      desc: 'Сколько раз подряд отправлять фейковый пакет для переполнения очереди анализатора.',
      examples: ['6', '1', '2', '11', '20'],
      recommendation: 'Значение 6 гарантированно пробивает ТСПУ с большим буфером.'
    },
    desyncTtl: {
      title: 'Управление TTL пакетов (--dpi-desync-ttl)',
      desc: 'Время жизни фейкового пакета, чтобы он умер на узле провайдера и не дошел до сервера.',
      examples: ['2:3-12', '+2', '4', '1:2-8'],
      recommendation: 'Синтаксис ядра: [+|-]<delta>[:<min>[-<max>]]. Пустое поле — TTL не менять.'
    },
    desyncFakeTls: {
      title: 'Пейлоад фейка TLS (--dpi-desync-fake-tls)',
      desc: 'Файл или HEX поддельного ClientHello с нейтральным именем (например, iana.org).',
      examples: ['tls_clienthello_www_google_com.bin', 'tls_clienthello_iana_org.bin'],
      recommendation: 'Файл ищется в каталоге ядра рядом с winws.exe.'
    },
    wssize: {
      title: 'Размер TCP Window Size (--wssize)',
      desc: 'Принудительное уменьшение окна приема TCP Window для фрагментации ответов сервера.',
      examples: ['1:6', '1:4', '0'],
      recommendation: 'Оставьте пустым, если видео открывается без задержек.'
    },
    anyProtocol: {
      title: 'Флаг --dpi-desync-any-protocol',
      desc: 'Применять десинхронизацию даже если сигнатура протокола не опознана на уровне L7.',
      examples: ['Включено', 'Выключено'],
      recommendation: 'Включать осторожно: без --dpi-desync-cutoff ломает соединения. Приложение добавит cutoff=d4 автоматически.'
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    createPreset({
      name: name.trim(),
      badge: badge.trim() || undefined,
      description: description.trim() || 'Пользовательский пресет десинхронизации DPI',
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      recommended: false,
      args: {
        filterTcp: filterTcp.trim() || undefined,
        filterUdp: filterUdp.trim() || undefined,
        filterL7: filterL7.trim() || undefined,
        hostlist: hostlist.trim() || undefined,
        desyncMode: desyncMode.trim() || 'fake,multidisorder',
        desyncFooling: desyncFooling.trim() || undefined,
        splitPos: splitPos.trim() || undefined,
        splitSeqovl: splitSeqovl.trim() || undefined,
        desyncCutoff: desyncCutoff.trim() || undefined,
        repeats: repeats.trim() || undefined,
        desyncTtl: desyncTtl.trim() || undefined,
        desyncFakeTls: desyncFakeTls.trim() || undefined,
        wssize: wssize.trim() || undefined,
        anyProtocol,
        extraArgs: extraArgs.trim() || undefined
      }
    });

    setIsCreatePresetModalOpen(false);
    setName('');
    setDescription('');
  };

  const currentArgs = (): PresetArgs => ({
    filterTcp: filterTcp.trim() || undefined,
    filterUdp: filterUdp.trim() || undefined,
    filterL7: filterL7.trim() || undefined,
    hostlist: hostlist.trim() || undefined,
    desyncMode: desyncMode.trim() || 'fake,multidisorder',
    desyncFooling: desyncFooling.trim() || undefined,
    splitPos: splitPos.trim() || undefined,
    splitSeqovl: splitSeqovl.trim() || undefined,
    desyncCutoff: desyncCutoff.trim() || undefined,
    repeats: repeats.trim() || undefined,
    desyncTtl: desyncTtl.trim() || undefined,
    desyncFakeTls: desyncFakeTls.trim() || undefined,
    wssize: wssize.trim() || undefined,
    anyProtocol,
    extraArgs: extraArgs.trim() || undefined
  });

  const generatePreview = () =>
    buildPresetCommand(
      { id: 'preview', name: 'preview', description: '', tags: [], args: currentArgs() },
      DEFAULT_TOGGLES
    );

  const activeDoc = activeFieldHelp ? helpDocs[activeFieldHelp] : helpDocs.desyncMode;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn select-none">
      <div className={`w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${
        theme === 'dark' ? 'bg-slate-900 border-indigo-500/40 text-slate-100' : 'bg-white border-indigo-200 text-slate-900'
      }`}>
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/10 dark:border-white/10 bg-black/5 dark:bg-black/20">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-500 flex items-center justify-center">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2">
                Конструктор профессионального пресета Zapret2
                <span className="text-[10px] px-2 py-0.2 rounded-full bg-indigo-500/20 text-indigo-400 font-mono">
                  winws v69.2
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Полный набор всех параметров десинхронизации, фильтров и сигнатур ТСПУ
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsCreatePresetModalOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center px-6 border-b border-black/10 dark:border-white/10 bg-black/5 dark:bg-black/10 gap-1">
          {[
            { id: 'general', label: '1. Основное', icon: Sliders },
            { id: 'filters', label: '2. Фильтры портов & L7', icon: Globe },
            { id: 'strategy', label: '3. Стратегия десинхронизации', icon: Cpu },
            { id: 'timing', label: '4. Тайминги, TTL и Повторы', icon: Clock },
            { id: 'payloads', label: '5. Фейки и Флаги', icon: Shield },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
                  isActive
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Main Content: Left Form + Right Live Help Inspector */}
        <div className="grid grid-cols-1 md:grid-cols-12 flex-1 overflow-hidden">
          {/* Left Form (7 cols) */}
          <form onSubmit={handleSubmit} className="md:col-span-7 p-6 overflow-y-auto space-y-4 text-xs">
            {/* TAB 1: GENERAL */}
            {activeTab === 'general' && (
              <div className="space-y-4 animate-fadeIn">
                <div className="space-y-1" onFocus={() => setActiveFieldHelp('name')}>
                  <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                    <span>Название пресета *</span>
                    <span className="text-[10px] text-slate-400">Обязательное</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="например: Ростелеком 4K Fix (Split2)"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border font-medium ${
                      theme === 'dark' ? 'bg-black/40 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 dark:text-slate-300">Бейдж / Метка</label>
                    <input
                      type="text"
                      placeholder="Кастом"
                      value={badge}
                      onChange={(e) => setBadge(e.target.value)}
                      className={`w-full px-3 py-2 rounded-xl border font-medium ${
                        theme === 'dark' ? 'bg-black/40 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 dark:text-slate-300">Теги (через запятую)</label>
                    <input
                      type="text"
                      value={tags}
                      onChange={(e) => setTags(e.target.value)}
                      placeholder="YouTube, Discord, 4K"
                      className={`w-full px-3 py-2 rounded-xl border font-medium ${
                        theme === 'dark' ? 'bg-black/40 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Описание стратегии</label>
                  <textarea
                    rows={3}
                    placeholder="например: Агрессивный обход замедления YouTube и голосовых каналов Discord для региональных провайдеров"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border resize-none ${
                      theme === 'dark' ? 'bg-black/40 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                </div>
              </div>
            )}

            {/* TAB 2: FILTERS */}
            {activeTab === 'filters' && (
              <div className="space-y-4 animate-fadeIn">
                <div className="space-y-1" onFocus={() => setActiveFieldHelp('filterTcp')}>
                  <label className="font-bold text-slate-700 dark:text-slate-300">TCP Порты фильтрации (--filter-tcp)</label>
                  <input
                    type="text"
                    value={filterTcp}
                    onChange={(e) => setFilterTcp(e.target.value)}
                    placeholder="80,443"
                    className={`w-full px-3 py-2 rounded-xl border font-mono ${
                      theme === 'dark' ? 'bg-black/40 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                </div>

                <div className="space-y-1" onFocus={() => setActiveFieldHelp('filterUdp')}>
                  <label className="font-bold text-slate-700 dark:text-slate-300">UDP Порты фильтрации (--filter-udp)</label>
                  <input
                    type="text"
                    value={filterUdp}
                    onChange={(e) => setFilterUdp(e.target.value)}
                    placeholder="443,50000-65535"
                    className={`w-full px-3 py-2 rounded-xl border font-mono ${
                      theme === 'dark' ? 'bg-black/40 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                </div>

                <div className="space-y-1" onFocus={() => setActiveFieldHelp('filterL7')}>
                  <label className="font-bold text-slate-700 dark:text-slate-300">L7 Протоколы (--filter-l7)</label>
                  <input
                    type="text"
                    value={filterL7}
                    onChange={(e) => setFilterL7(e.target.value)}
                    placeholder="http,tls,quic"
                    className={`w-full px-3 py-2 rounded-xl border font-mono ${
                      theme === 'dark' ? 'bg-black/40 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                </div>

                <div className="space-y-1" onFocus={() => setActiveFieldHelp('hostlist')}>
                  <label className="font-bold text-slate-700 dark:text-slate-300">Файл списков хостов (--hostlist)</label>
                  <input
                    type="text"
                    value={hostlist}
                    onChange={(e) => setHostlist(e.target.value)}
                    placeholder="{LISTS}/list-general.txt"
                    className={`w-full px-3 py-2 rounded-xl border font-mono ${
                      theme === 'dark' ? 'bg-black/40 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                </div>
              </div>
            )}

            {/* TAB 3: STRATEGY */}
            {activeTab === 'strategy' && (
              <div className="space-y-4 animate-fadeIn">
                <div className="space-y-1" onFocus={() => setActiveFieldHelp('desyncMode')}>
                  <label className="font-bold text-slate-700 dark:text-slate-300">Метод десинхронизации (--dpi-desync)</label>
                  <select
                    value={desyncMode}
                    onChange={(e) => setDesyncMode(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border font-mono font-bold ${
                      theme === 'dark' ? 'bg-slate-900 border-white/10 text-indigo-300' : 'bg-white border-slate-300 text-indigo-700'
                    }`}
                  >
                    <option value="fake,multidisorder">fake,multidisorder (Рекомендуется)</option>
                    <option value="fake,multisplit">fake,multisplit</option>
                    <option value="multidisorder">multidisorder</option>
                    <option value="fake,split2">fake,split2 (устар. синоним multisplit)</option>
                    <option value="split2">split2 (Разделение по середине)</option>
                    <option value="disorder2">disorder2 (Перестановка сегментов)</option>
                    <option value="fake">fake (Только поддельный пакет)</option>
                    <option value="multisplit">multisplit (Множественное дробление)</option>
                    <option value="syndata">syndata (TCP SYN payload)</option>
                    <option value="ipfrag2">ipfrag2 (IP Фрагментация)</option>
                  </select>
                </div>

                <div className="space-y-1" onFocus={() => setActiveFieldHelp('desyncFooling')}>
                  <label className="font-bold text-slate-700 dark:text-slate-300">Способ обмана ТСПУ (--dpi-desync-fooling)</label>
                  <select
                    value={desyncFooling}
                    onChange={(e) => setDesyncFooling(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border font-mono ${
                      theme === 'dark' ? 'bg-slate-900 border-white/10 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="badseq">badseq (Поврежденный Sequence Number)</option>
                    <option value="badsum">badsum (Поврежденная TCP Checksum)</option>
                    <option value="md5sig">md5sig (Фальшивая MD5 подпись)</option>
                    <option value="datanoack">datanoack</option>
                    <option value="hopbyhop">hopbyhop</option>
                    <option value="none">none (Без подделки)</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1" onFocus={() => setActiveFieldHelp('splitPos')}>
                    <label className="font-bold text-slate-700 dark:text-slate-300">Позиция разделения (--dpi-desync-split-pos)</label>
                    <input
                      type="text"
                      value={splitPos}
                      onChange={(e) => setSplitPos(e.target.value)}
                      placeholder="2"
                      className={`w-full px-3 py-2 rounded-xl border font-mono ${
                        theme === 'dark' ? 'bg-black/40 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>

                  <div className="space-y-1" onFocus={() => setActiveFieldHelp('splitSeqovl')}>
                    <label className="font-bold text-slate-700 dark:text-slate-300">Наложение (--dpi-desync-split-seqovl)</label>
                    <input
                      type="text"
                      value={splitSeqovl}
                      onChange={(e) => setSplitSeqovl(e.target.value)}
                      placeholder="1"
                      className={`w-full px-3 py-2 rounded-xl border font-mono ${
                        theme === 'dark' ? 'bg-black/40 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: TIMINGS & TTL */}
            {activeTab === 'timing' && (
              <div className="space-y-4 animate-fadeIn">
                <div className="space-y-1" onFocus={() => setActiveFieldHelp('desyncCutoff')}>
                  <label className="font-bold text-slate-700 dark:text-slate-300">Отсечка десинхронизации (--dpi-desync-cutoff)</label>
                  <input
                    type="text"
                    value={desyncCutoff}
                    onChange={(e) => setDesyncCutoff(e.target.value)}
                    placeholder="d3"
                    className={`w-full px-3 py-2 rounded-xl border font-mono ${
                      theme === 'dark' ? 'bg-black/40 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                </div>

                <div className="space-y-1" onFocus={() => setActiveFieldHelp('repeats')}>
                  <label className="font-bold text-slate-700 dark:text-slate-300">Повторы фейка (--dpi-desync-repeats)</label>
                  <input
                    type="text"
                    value={repeats}
                    onChange={(e) => setRepeats(e.target.value)}
                    placeholder="6"
                    className={`w-full px-3 py-2 rounded-xl border font-mono ${
                      theme === 'dark' ? 'bg-black/40 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                </div>

                <div className="space-y-1" onFocus={() => setActiveFieldHelp('desyncTtl')}>
                  <label className="font-bold text-slate-700 dark:text-slate-300">Управление TTL / Auto-TTL (--dpi-desync-autottl)</label>
                  <input
                    type="text"
                    value={desyncTtl}
                    onChange={(e) => setDesyncTtl(e.target.value)}
                    placeholder="2:3-12"
                    className={`w-full px-3 py-2 rounded-xl border font-mono ${
                      theme === 'dark' ? 'bg-black/40 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                </div>
              </div>
            )}

            {/* TAB 5: PAYLOADS & FLAGS */}
            {activeTab === 'payloads' && (
              <div className="space-y-4 animate-fadeIn">
                <div className="space-y-1" onFocus={() => setActiveFieldHelp('desyncFakeTls')}>
                  <label className="font-bold text-slate-700 dark:text-slate-300">Пейлоад фейка TLS (--dpi-desync-fake-tls)</label>
                  <input
                    type="text"
                    value={desyncFakeTls}
                    onChange={(e) => setDesyncFakeTls(e.target.value)}
                    placeholder="tls_clienthello_iana_org.bin"
                    className={`w-full px-3 py-2 rounded-xl border font-mono ${
                      theme === 'dark' ? 'bg-black/40 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                </div>

                <div className="space-y-1" onFocus={() => setActiveFieldHelp('wssize')}>
                  <label className="font-bold text-slate-700 dark:text-slate-300">Размер окна TCP Window (--wssize)</label>
                  <input
                    type="text"
                    value={wssize}
                    onChange={(e) => setWssize(e.target.value)}
                    placeholder="1:6"
                    className={`w-full px-3 py-2 rounded-xl border font-mono ${
                      theme === 'dark' ? 'bg-black/40 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                </div>

                <div
                  onClick={() => setAnyProtocol(!anyProtocol)}
                  className="p-3 rounded-xl border flex items-center justify-between cursor-pointer bg-black/5 dark:bg-black/20"
                >
                  <div>
                    <div className="font-bold text-slate-800 dark:text-slate-200">--dpi-desync-any-protocol</div>
                    <div className="text-[11px] text-slate-500">Десинхронизировать любой трафик даже при неизвестном L7</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={anyProtocol}
                    onChange={(e) => setAnyProtocol(e.target.checked)}
                    className="w-4 h-4 accent-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Дополнительные аргументы winws</label>
                  <input
                    type="text"
                    value={extraArgs}
                    onChange={(e) => setExtraArgs(e.target.value)}
                    placeholder="--dpi-desync-fooling=badseq"
                    className={`w-full px-3 py-2 rounded-xl border font-mono ${
                      theme === 'dark' ? 'bg-black/40 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                </div>
              </div>
            )}

            {/* Generated CLI Command Preview */}
            <div className="p-3 rounded-xl bg-black/90 text-emerald-400 font-mono text-[11px] break-all border border-black/10 dark:border-white/10">
              <span className="text-slate-500 select-none block mb-1">Командная строка winws:</span>
              {generatePreview()}
            </div>

            {/* Submit / Cancel Buttons */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-black/10 dark:border-white/10">
              <button
                type="button"
                onClick={() => setIsCreatePresetModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-950/40 transition-all hover:scale-105"
              >
                <Check className="w-4 h-4" />
                <span>Сохранить пресет</span>
              </button>
            </div>
          </form>

          {/* Right Inspector & Help Panel (5 cols) */}
          <div className="md:col-span-5 p-6 border-l border-black/10 dark:border-white/10 bg-black/5 dark:bg-black/30 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-indigo-500 font-bold text-xs">
                <Info className="w-4 h-4" />
                <span>Справочник параметров Zapret2</span>
              </div>

              {activeDoc ? (
                <div className="space-y-3 animate-fadeIn">
                  <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                    <h4 className="font-bold text-xs text-indigo-400 mb-1">{activeDoc.title}</h4>
                    <p className="text-[11px] text-slate-300 leading-relaxed">{activeDoc.desc}</p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Примеры значений:</span>
                    <div className="flex flex-wrap gap-1">
                      {activeDoc.examples.map((ex, i) => (
                        <span key={i} className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/40 text-emerald-400 border border-white/5">
                          {ex}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-300">
                    <strong>💡 Рекомендация для РФ:</strong> {activeDoc.recommendation}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  Выберите поле в левой части, чтобы увидеть подробное руководство и примеры для российских провайдеров.
                </p>
              )}
            </div>

            <div className="pt-4 border-t border-black/10 dark:border-white/10 text-[10px] text-slate-500 space-y-1">
              <div><strong>Архитектура ядра:</strong> Zapret2 / winws (bol-van)</div>
              <div>Драйвер перехвата: WinDivert 64-bit с автоочисткой</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
