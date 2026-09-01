import React, { useState } from 'react';
import { Globe, Plus, Search, Trash2, Download, Upload, CheckCircle2, XCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { HostlistItem } from '../types';

export const HostlistsView: React.FC = () => {
  const { hostlists, addHostlistDomain, removeHostlistDomain, toggleHostlistDomain, exportHostlists, importHostlists, theme } = useApp();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [newCategory, setNewCategory] = useState<HostlistItem['category']>('custom');

  const categories = [
    { id: 'all', label: 'Все домены', count: hostlists.length },
    { id: 'youtube', label: 'YouTube', count: hostlists.filter(h => h.category === 'youtube').length },
    { id: 'discord', label: 'Discord', count: hostlists.filter(h => h.category === 'discord').length },
    { id: 'custom', label: 'Пользовательские', count: hostlists.filter(h => h.category === 'custom').length },
    { id: 'exclude', label: 'Исключения', count: hostlists.filter(h => h.category === 'exclude').length },
  ];

  const filteredList = hostlists.filter(item => {
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    const matchesSearch = item.domain.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain.trim()) return;
    addHostlistDomain(newDomain.trim(), newCategory);
    setNewDomain('');
  };

  return (
    <div className="h-full flex flex-col p-6 space-y-4 overflow-y-auto select-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Globe className="w-5 h-5 text-indigo-500" />
            Списки сайтов и доменов (Hostlists)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Ваши дополнения к встроенным спискам. Базовые списки (list-general, list-google,
            list-exclude) уже применяются — здесь добавляются только свои домены.
            Изменения вступают в силу при следующем включении обхода.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportHostlists}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 text-xs font-medium border border-black/5 dark:border-white/5 transition-colors">
            <Download className="w-3.5 h-3.5" />
            <span>Экспорт</span>
          </button>
          <button
            onClick={importHostlists}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition-colors">
            <Upload className="w-3.5 h-3.5" />
            <span>Импорт списка</span>
          </button>
        </div>
      </div>

      {/* Add Domain Form */}
      <form onSubmit={handleAdd} className={`p-3 rounded-xl border flex items-center gap-2 ${
        theme === 'dark' ? 'bg-slate-900/70 border-white/10' : 'bg-white border-slate-200 shadow-xs'
      }`}>
        <input
          type="text"
          placeholder="Введите домен (например: instagram.com, twitter.com)..."
          value={newDomain}
          onChange={(e) => setNewDomain(e.target.value)}
          className={`flex-1 px-3 py-2 rounded-lg border text-xs focus:outline-none focus:border-indigo-500 font-mono ${
            theme === 'dark'
              ? 'bg-black/40 border-white/10 text-slate-100 placeholder:text-slate-500'
              : 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400'
          }`}
        />

        <select
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value as HostlistItem['category'])}
          className={`px-3 py-2 rounded-lg border text-xs focus:outline-none focus:border-indigo-500 ${
            theme === 'dark'
              ? 'bg-black/40 border-white/10 text-slate-300'
              : 'bg-slate-50 border-slate-300 text-slate-800'
          }`}
        >
          <option value="custom">Пользовательский</option>
          <option value="youtube">YouTube</option>
          <option value="discord">Discord</option>
          <option value="exclude">Исключение (Прямой доступ)</option>
        </select>

        <button
          type="submit"
          className="flex items-center gap-1 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors shrink-0 shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Добавить</span>
        </button>
      </form>

      {/* Categories & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Category pills */}
        <div className="flex items-center flex-wrap gap-1.5 w-full sm:w-auto">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
                selectedCategory === cat.id
                  ? theme === 'dark'
                    ? 'bg-indigo-600/25 text-indigo-300 border border-indigo-500/40 font-bold'
                    : 'bg-indigo-100 text-indigo-700 border border-indigo-300 font-bold'
                  : theme === 'dark'
                    ? 'bg-white/5 text-slate-400 hover:text-slate-200 border border-transparent'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900 border border-transparent'
              }`}
            >
              <span>{cat.label}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/10 dark:bg-black/30">
                {cat.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-56 shrink-0">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Поиск в списке..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-8 pr-3 py-1.5 rounded-lg border text-xs focus:outline-none focus:border-indigo-500 ${
              theme === 'dark'
                ? 'bg-slate-900/60 border-white/10 text-slate-200 placeholder:text-slate-500'
                : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 shadow-xs'
            }`}
          />
        </div>
      </div>

      {/* Domain List Table */}
      <div className={`flex-1 rounded-xl border overflow-hidden flex flex-col ${
        theme === 'dark' ? 'bg-slate-900/40 border-white/5' : 'bg-white border-slate-200 shadow-xs'
      }`}>
        <div className={`p-3 border-b text-[11px] font-bold grid grid-cols-12 gap-2 ${
          theme === 'dark' ? 'bg-slate-900/60 border-white/5 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'
        }`}>
          <span className="col-span-6">ДОМЕН</span>
          <span className="col-span-2">КАТЕГОРИЯ</span>
          <span className="col-span-2">ДОБАВЛЕН</span>
          <span className="col-span-2 text-right">ДЕЙСТВИЯ</span>
        </div>

        <div className="overflow-y-auto flex-1 divide-y divide-black/5 dark:divide-white/[0.03]">
          {filteredList.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              Список пуст. Встроенные списки уже работают — здесь добавляются только свои домены.
            </div>
          ) : (
            filteredList.map((item) => (
              <div
                key={item.id}
                className="p-3 text-xs grid grid-cols-12 gap-2 items-center hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
              >
                <div className="col-span-6 flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    item.category === 'exclude' ? 'bg-amber-400' : 'bg-emerald-500'
                  }`} />
                  <span className="font-mono text-slate-800 dark:text-slate-200 font-medium truncate">
                    {item.domain}
                  </span>
                </div>

                <div className="col-span-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                    item.category === 'youtube'
                      ? 'bg-red-500/10 text-red-600 dark:text-red-300 border-red-500/20'
                      : item.category === 'discord'
                      ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border-indigo-500/20'
                      : item.category === 'exclude'
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/20'
                      : 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 border-cyan-500/20'
                  }`}>
                    {item.category.toUpperCase()}
                  </span>
                </div>

                <div className="col-span-2 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  {item.addedAt || '—'}
                </div>

                <div className="col-span-2 flex items-center justify-end gap-1.5">
                  <button
                    onClick={() => toggleHostlistDomain(item.id)}
                    title={item.enabled ? 'Отключить' : 'Включить'}
                    className={`p-1.5 rounded-md transition-colors ${
                      item.enabled ? 'text-emerald-500 hover:bg-emerald-500/10' : 'text-slate-400 hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                  >
                    {item.enabled ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                  </button>

                  <button
                    onClick={() => removeHostlistDomain(item.id)}
                    title="Удалить из списка"
                    className="p-1.5 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
