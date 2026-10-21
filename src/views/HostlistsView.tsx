import React, { useState } from 'react';
import { Plus, Search, Trash2, Download, Upload, SearchX, ListPlus, X, RefreshCw, ListChecks } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { HostlistItem } from '../types';
import { Badge, Button, Empty, PageHeader, Segmented, Toggle, plural } from '../components/ui';

const CATEGORY_LABEL: Record<HostlistItem['category'], string> = {
  custom: 'Обходить',
  youtube: 'YouTube',
  discord: 'Discord',
  exclude: 'Не трогать'
};

/** «2026-10-15» → «15.10.2026». */
const formatDay = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '—';
};

/** Когда проверяли: «сегодня в 14:31», «15.10 в 09:05», «ещё не проверялось». */
const formatChecked = (iso: string) => {
  const d = new Date(iso);
  if (!iso || isNaN(d.getTime())) return 'ещё не проверялось';
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const today = new Date().toDateString() === d.toDateString();
  return today ? `сегодня в ${time}` : `${d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} в ${time}`;
};

/**
 * Встроенные списки: версия, откуда взяты, проверка обновлений. Списки
 * обновляются из репозитория без новой версии программы — ядро
 * подхватывает их само.
 */
const BuiltinListsCard: React.FC = () => {
  const {
    listsInfo, listsCheckedAt, checkListsUpdate, resetListsToBuiltin, listsAutoUpdate, setListsAutoUpdate
  } = useApp();
  const fromRepo = listsInfo.source === 'update';

  const status = listsInfo.checking ? 'проверяю репозиторий…'
    : listsInfo.lastResult === 'error' ? null
    : listsInfo.lastResult === 'updated' ? 'только что обновлены'
    : listsInfo.lastResult === 'up_to_date' ? `новее нет · проверено ${formatChecked(listsCheckedAt)}`
    : listsInfo.lastResult === 'reset' ? 'возвращены встроенные'
    : `проверено ${formatChecked(listsCheckedAt)}`;

  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-[10px] bg-s1 border border-line">
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-1.5 rounded-[7px] shrink-0 bg-ac/15 text-ac-300">
          <ListChecks className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[12px] font-medium text-t1 truncate">
            {listsInfo.known
              ? <>Встроенные списки · версия {listsInfo.version} от {formatDay(listsInfo.updated)}
                  {fromRepo && <span className="text-green-400"> · обновлены из репозитория</span>}</>
              : 'Встроенные списки'}
          </div>
          <div className="text-[11px] text-t3 truncate">
            {listsInfo.known && <>{listsInfo.domains} {plural(listsInfo.domains, ['адрес', 'адреса', 'адресов'])} для обхода · </>}
            {status ?? <span className="text-red-300">не удалось проверить: {listsInfo.error}</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2.5 shrink-0">
        <label
          className="flex items-center gap-1.5 text-[11px] text-t2 cursor-pointer"
          title="Раз в 6 часов программа смотрит, не вышли ли новые списки, и ставит их сама"
        >
          Автоматически
          <Toggle checked={listsAutoUpdate} onChange={setListsAutoUpdate} />
        </label>
        {fromRepo && (
          <Button variant="ghost" size="sm" onClick={resetListsToBuiltin} disabled={listsInfo.checking}
            title={`Вернуть списки, встроенные в программу (версия ${listsInfo.builtinVersion})`}>
            Вернуть встроенные
          </Button>
        )}
        <Button variant="secondary" size="sm" icon={RefreshCw} spin={listsInfo.checking}
          onClick={checkListsUpdate} disabled={listsInfo.checking || !listsInfo.known}>
          {listsInfo.checking ? 'Проверяю…' : 'Проверить'}
        </Button>
      </div>
    </div>
  );
};

/**
 * Свои дополнения к встроенным спискам. Базовые списки (list-general,
 * list-google, list-exclude) применяются всегда — здесь только свои домены.
 * При включённом обходе изменения действуют сразу: ядро перечитывает файлы
 * списков само.
 */
export const HostlistsView: React.FC = () => {
  const { hostlists, addHostlistDomain, removeHostlistDomain, toggleHostlistDomain, exportHostlists, importHostlists } = useApp();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [newCategory, setNewCategory] = useState<HostlistItem['category']>('custom');

  const count = (c: string) => hostlists.filter(h => h.category === c).length;
  const categories = [
    { id: 'all', label: 'Все', n: hostlists.length },
    { id: 'custom', label: 'Мои сайты', n: count('custom') },
    { id: 'youtube', label: 'YouTube', n: count('youtube') },
    { id: 'discord', label: 'Discord', n: count('discord') },
    { id: 'exclude', label: 'Исключения', n: count('exclude') },
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
    <div className="h-full flex flex-col p-5 gap-3 overflow-hidden select-none">
      <PageHeader
        title="Списки сайтов"
        subtitle="Discord, YouTube и основные сервисы уже встроены — здесь ваши дополнения и исключения"
        actions={
          <>
            <Button variant="secondary" size="sm" icon={Upload} onClick={importHostlists}>Импорт</Button>
            <Button variant="secondary" size="sm" icon={Download} onClick={exportHostlists}>Экспорт</Button>
          </>
        }
      />

      <BuiltinListsCard />

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Segmented
          size="sm"
          value={selectedCategory}
          onChange={setSelectedCategory}
          items={categories.map(c => ({
            id: c.id,
            label: c.label,
            extra: <span className="text-[10px] px-1 rounded bg-white/[0.06] text-t3">{c.n}</span>
          }))}
        />
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-t3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск домена…"
            className="ui-input pl-8 pr-7 py-1.5 text-[12px] w-48"
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-t3 hover:text-t1">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <form onSubmit={handleAdd} className="flex items-center gap-2 p-2.5 rounded-[10px] bg-s1 border border-line">
        <input
          type="text"
          value={newDomain}
          onChange={(e) => setNewDomain(e.target.value)}
          placeholder="домен, например example.com"
          className="ui-input flex-1 px-3 py-1.5 text-[12px] font-mono"
        />
        <select
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value as HostlistItem['category'])}
          className="ui-input px-3 py-1.5 text-[12px]"
        >
          <option value="custom">Обходить</option>
          <option value="youtube">Обходить — как YouTube</option>
          <option value="discord">Обходить — как Discord</option>
          <option value="exclude">Не трогать (прямой доступ)</option>
        </select>
        <Button type="submit" icon={Plus}>Добавить</Button>
      </form>

      <div className="flex-1 min-h-0 rounded-[12px] overflow-hidden flex flex-col bg-s1 border border-line">
        {filteredList.length > 0 ? (
          <div className="overflow-y-auto divide-y divide-white/[0.05]">
            {filteredList.map(item => (
              <div key={item.id} className={`px-4 py-2.5 flex items-center justify-between gap-3 text-[12px] ${item.enabled ? '' : 'opacity-60'}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono font-medium text-t1 truncate">{item.domain}</span>
                  <Badge tone={item.category === 'exclude' ? 'neutral' : 'accent'}>{CATEGORY_LABEL[item.category]}</Badge>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-[11px] text-t3">{item.addedAt || '—'}</span>
                  <Toggle
                    checked={item.enabled}
                    onChange={() => toggleHostlistDomain(item.id)}
                    title={item.enabled ? 'Отключить' : 'Включить'}
                  />
                  <button
                    type="button"
                    onClick={() => removeHostlistDomain(item.id)}
                    title="Удалить из списка"
                    className="p-1 rounded text-t3 hover:text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : hostlists.length === 0 ? (
          <Empty
            icon={ListPlus}
            title="Своих сайтов пока нет — основные списки уже встроены"
            text="Discord, YouTube и основные сервисы работают автоматически. Добавляйте домен, только если конкретный сайт не открывается: обход применится и к нему."
          />
        ) : (
          <Empty
            icon={SearchX}
            title="Поиск ничего не нашёл"
            text={<>{searchQuery ? <>По запросу «{searchQuery}» совпадений нет.</> : <>В этой категории пока пусто.</>}{' '}
              Всего в списке {hostlists.length} {hostlists.length === 1 ? 'домен' : hostlists.length < 5 ? 'домена' : 'доменов'}.</>}
            action={(searchQuery || selectedCategory !== 'all')
              ? <Button variant="secondary" size="sm" onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }}>Показать все</Button>
              : undefined}
          />
        )}
      </div>
    </div>
  );
};
