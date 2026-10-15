import React, { useRef, useState } from 'react';
import {
  RefreshCw, Download, Trash2, FolderOpen, Sparkles, Cpu, ExternalLink, Image as ImageIcon,
  CheckCircle2, Check
} from 'lucide-react';
import { useApp, BUNDLED_CORE_VERSION, APP_VERSION } from '../context/AppContext';
import { ACCENTS, BACKGROUNDS } from '../lib/theme';
import { Button, Card, CardHead, Note, Toggle } from '../components/ui';
import { AppLogo } from '../components/AppLogo';

/** Размер в человеческом виде: нативная часть шлёт байты. */
const formatSize = (bytes: number): string => {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' ГБ';
  if (bytes >= 1048576) return Math.round(bytes / 1048576) + ' МБ';
  if (bytes >= 1024) return Math.round(bytes / 1024) + ' КБ';
  return bytes + ' Б';
};

/** «05.09.2026, 14:31» вместо ISO-строки. */
const formatChecked = (iso: string): string => {
  if (!iso) return 'ещё не проверялось';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'ещё не проверялось';
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const openUrl = (url: string) => {
  if (window.chrome?.webview) window.chrome.webview.postMessage('open_url:' + url);
  else window.open(url, '_blank');
};

export const SettingsView: React.FC = () => {
  const {
    openWizard, stats, updateInfo, checkForUpdates, autoCheckUpdates, setAutoCheckUpdates,
    setIsUpdateModalOpen, accent, setAccent, background, setBackground,
    customBackground, setCustomBackground, clearCustomBackground,
    closeBehavior, setCloseBehavior, killZombieWinDivert, openAppFolder, isWatchdogClean,
    discordCache, isDiscordCleaning, scanDiscordCache, cleanDiscordCache
  } = useApp();

  // Удаление необратимо, поэтому кнопка срабатывает со второго нажатия:
  // первое показывает, сколько именно будет удалено.
  const [armed, setArmed] = useState(false);
  const discordTotal = (discordCache || []).reduce((sum, i) => sum + i.sizeBytes, 0);
  const discordRunning = (discordCache || []).some(i => i.running);

  const fileInput = useRef<HTMLInputElement>(null);
  const [bgBusy, setBgBusy] = useState(false);

  const pickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    // Значение сбрасываем сразу: иначе повторный выбор того же файла не
    // вызовет onChange и это будет выглядеть поломкой.
    e.target.value = '';
    if (!file) return;
    setBgBusy(true);
    try { await setCustomBackground(file); } finally { setBgBusy(false); }
  };

  return (
    <div className="h-full overflow-y-auto p-5 space-y-3 select-none">
      <div className="grid grid-cols-2 gap-3">
        {/* Внешний вид */}
        <Card className="p-3.5 space-y-2.5">
          <div className="text-[13px] font-semibold text-t1">Внешний вид</div>
          <div className="grid grid-cols-2 gap-2">
            {BACKGROUNDS.map(t => {
              const on = background === t.id && !customBackground;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setBackground(t.id)}
                  className={`p-2.5 rounded-[9px] text-left transition-all border ${on ? 'border-ac' : 'border-line hover:border-line-strong'}`}
                  style={{ backgroundColor: t.bg }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-t1">{t.label}</span>
                    {on && <Check className="w-3.5 h-3.5 text-ac" />}
                  </div>
                  <div className="flex items-center gap-1 mt-1.5">
                    {[t.s1, t.s2, t.s3].map(c => <span key={c} className="w-4 h-3 rounded-[3px] border border-white/10" style={{ backgroundColor: c }} />)}
                    <span className="text-[11px] font-mono text-t3 ml-1">{t.bg}</span>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between pt-0.5">
            <span className="text-[12px] text-t2">Цвет акцента:</span>
            <div className="flex items-center gap-2">
              {ACCENTS.map(a => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAccent(a.id)}
                  title={a.label}
                  className="w-5 h-5 rounded-full transition-transform hover:scale-110"
                  style={{ backgroundColor: a.swatch, outline: accent === a.id ? '2px solid white' : 'none', outlineOffset: 2 }}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 px-2.5 py-2 rounded-[8px] bg-s2 border border-line">
            <div className="flex items-center gap-2.5 min-w-0">
              {customBackground
                ? <img src={customBackground} alt="" className="w-10 h-7 rounded-[5px] object-cover border border-line shrink-0" />
                : <div className="w-10 h-7 rounded-[5px] bg-white/[0.04] border border-line flex items-center justify-center shrink-0"><ImageIcon className="w-3.5 h-3.5 text-t3" /></div>}
              <div className="min-w-0">
                <div className="text-[12px] font-medium text-t1">{customBackground ? 'Фоном стоит своё изображение' : 'Своё изображение фоном'}</div>
                <div className="text-[11px] text-t3 truncate">Под затемняющим слоем; акцент подберётся под тон снимка</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {customBackground && <Button variant="ghost" size="sm" onClick={clearCustomBackground}>Убрать</Button>}
              <Button variant="secondary" size="sm" onClick={() => fileInput.current && fileInput.current.click()} disabled={bgBusy}>
                {bgBusy ? 'Обработка…' : 'Выбрать…'}
              </Button>
              <input ref={fileInput} type="file" accept="image/*" onChange={pickImage} className="hidden" />
            </div>
          </div>
        </Card>

        {/* Поведение и обновления */}
        <Card className="p-3.5 space-y-2.5">
          <div className="text-[13px] font-semibold text-t1">Поведение и обновления</div>
          <div className="flex items-center justify-between gap-2 text-[12px]">
            <span className="text-t2">При закрытии окна:</span>
            <select
              value={closeBehavior}
              onChange={(e) => setCloseBehavior(e.target.value as typeof closeBehavior)}
              className="ui-input px-2.5 py-1 text-[12px]"
            >
              <option value="minimize_to_tray">Сворачивать в трей</option>
              <option value="exit_app">Закрывать полностью</option>
            </select>
          </div>
          <div className="text-[11px] text-t3 leading-snug -mt-1">
            {closeBehavior === 'minimize_to_tray'
              ? 'Окно прячется в трей около часов, обход продолжает работать в фоне.'
              : 'Ядро останавливается, драйвер WinDivert выгружается — если им не пользуется другая программа.'}
          </div>

          <div className="flex items-center justify-between gap-2 text-[12px] pt-1 border-t border-line">
            <div className="min-w-0">
              <div className="text-t1 flex items-center gap-1.5">
                Текущая версия v{APP_VERSION}
                {updateInfo.hasUpdate
                  ? <span className="text-ac-300 text-[11px]">· вышла {updateInfo.latestVersion}</span>
                  : updateInfo.lastCheckedAt && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
              </div>
              <div className="text-[11px] text-t3">Проверялось: {formatChecked(updateInfo.lastCheckedAt)}</div>
            </div>
            {updateInfo.hasUpdate
              ? <Button size="sm" icon={Download} onClick={() => setIsUpdateModalOpen(true)}>Обновить до {updateInfo.latestVersion}</Button>
              : <Button variant="secondary" size="sm" icon={RefreshCw} spin={updateInfo.isChecking} onClick={() => checkForUpdates(false)} disabled={updateInfo.isChecking}>
                  {updateInfo.isChecking ? 'Проверка…' : 'Проверить обновления'}
                </Button>}
          </div>
          <div className="flex items-center justify-between gap-2 text-[12px]">
            <div className="min-w-0">
              <div className="text-t2">Автоматическая проверка при запуске</div>
              <div className="text-[11px] text-t3">Один запрос к GitHub, не чаще раза в 6 часов</div>
            </div>
            <Toggle checked={autoCheckUpdates} onChange={setAutoCheckUpdates} />
          </div>
          <div className="text-[11px] text-t3 leading-snug">
            Обновляется само приложение: сборка сверяется по SHA-256 и подменяется при перезапуске. Ядро zapret
            ({BUNDLED_CORE_VERSION}) зашито в .exe и приезжает только с новой сборкой.
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Кэш Discord */}
        <Card className="p-3.5 space-y-2">
          <CardHead
            title="Discord — очистка кэша"
            hint={<span className="text-green-400">вход и настройки не трогаем</span>}
            actions={<Button variant="secondary" size="sm" icon={RefreshCw} spin={isDiscordCleaning} onClick={scanDiscordCache} disabled={isDiscordCleaning}>Посчитать</Button>}
          />
          <p className="text-[11px] text-t3 leading-snug">
            Помогает, когда Discord висит на «Starting» или не грузит картинки при работающем обходе: в кэше остаются
            обрезанные ответы времён, когда связь рвалась.
          </p>

          {discordCache === null && (
            <div className="px-3 py-2 rounded-[8px] bg-s2 border border-line text-[12px] text-t2">
              Нажмите «Посчитать», чтобы узнать размер. Само по себе ничего не удаляется.
            </div>
          )}
          {discordCache !== null && discordCache.length === 0 && (
            <div className="px-3 py-2 rounded-[8px] bg-s2 border border-line text-[12px] text-t2">
              Discord на этом компьютере не найден — чистить нечего.
            </div>
          )}
          {discordCache !== null && discordCache.length > 0 && (
            <div className="space-y-2">
              <div className="rounded-[8px] bg-s2 border border-line divide-y divide-white/[0.05]">
                {discordCache.map(item => (
                  <div key={item.id} className="flex items-center justify-between px-3 py-1.5 text-[12px]">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-t1">{item.name}</span>
                      {item.running && <span className="px-1.5 rounded text-[10px] bg-amber-500/15 text-amber-300">запущен</span>}
                    </span>
                    <span className="font-mono text-t2 shrink-0">{formatSize(item.sizeBytes)}<span className="text-t3"> · {item.dirs} кат.</span></span>
                  </div>
                ))}
              </div>
              <div className="text-[11px] text-t3 leading-snug">
                <span className="text-t2">Удаляется:</span> Cache, Code Cache, GPUCache, Dawn*Cache, Service Worker, logs.{' '}
                <span className="text-green-400">Не трогаем:</span> Local Storage — там ваш вход в аккаунт.
              </div>
              {discordRunning && (
                <Note tone="warn">Discord запущен. Пока процесс жив, файлы заблокированы — кнопка сначала закроет его. Звонок оборвётся.</Note>
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-t2">Освободится примерно <span className="font-mono text-t1">{formatSize(discordTotal)}</span></span>
                <Button
                  variant={armed ? 'danger' : 'secondary'}
                  size="sm"
                  icon={Trash2}
                  disabled={isDiscordCleaning || discordTotal === 0}
                  onClick={() => {
                    if (!armed) { setArmed(true); return; }
                    setArmed(false);
                    cleanDiscordCache(discordCache.map(i => i.id), discordRunning);
                  }}
                >
                  {isDiscordCleaning ? 'Очищаю…'
                    : armed ? `Точно удалить ${formatSize(discordTotal)}?`
                    : discordRunning ? 'Закрыть Discord и очистить' : 'Очистить кэш'}
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Настройка заново и обслуживание */}
        <Card className="p-3.5 space-y-2.5">
          <div className="text-[13px] font-semibold text-t1">Настройка заново и обслуживание</div>
          <div className="flex items-start justify-between gap-3 px-3 py-2 rounded-[8px] bg-s2 border border-line">
            <div className="min-w-0">
              <div className="text-[12px] font-medium text-t1">Мастер настройки</div>
              <div className="text-[11px] text-t3 leading-snug">Проверит компьютер, подберёт обход для Discord и YouTube и включит мост Telegram. Пригодится, если сменили провайдера.</div>
            </div>
            <Button variant="secondary" size="sm" icon={Sparkles} onClick={openWizard}>Открыть</Button>
          </div>
          <div className="flex items-start justify-between gap-3 px-3 py-2 rounded-[8px] bg-s2 border border-line">
            <div className="min-w-0">
              <div className="text-[12px] font-medium text-t1">Зависшие копии ядра</div>
              <div className="text-[11px] text-t3 leading-snug">
                Снимает только посторонние winws.exe. Своё ядро не трогает.{' '}
                <span className={stats.pid ? 'text-green-400' : 'text-t2'}>
                  {!isWatchdogClean ? 'Очистка…' : stats.pid ? `Ядро работает (PID ${stats.pid})` : 'Ядро не запущено'}
                </span>
              </div>
            </div>
            <Button variant="secondary" size="sm" icon={Cpu} onClick={killZombieWinDivert}>Очистить</Button>
          </div>
          <div className="flex items-start justify-between gap-3 px-3 py-2 rounded-[8px] bg-s2 border border-line">
            <div className="min-w-0">
              <div className="text-[12px] font-medium text-t1">Папка программы</div>
              <div className="text-[11px] text-t3 font-mono break-all">%LOCALAPPDATA%\Zapret2-GUI — bin, списки, журналы, настройки</div>
            </div>
            <Button variant="secondary" size="sm" icon={FolderOpen} onClick={openAppFolder}>Открыть</Button>
          </div>
        </Card>
      </div>

      {/* О программе */}
      <Card className="px-4 py-2.5 flex items-center justify-between gap-3 text-[12px]">
        <div className="flex items-center gap-4 text-t2 flex-wrap">
          <span className="flex items-center gap-2">
            <AppLogo className="w-5 h-5 shrink-0" />
            <span><strong className="text-t1">О программе:</strong> v{APP_VERSION}</span>
          </span>
          <span>Ядро zapret {BUNDLED_CORE_VERSION}</span>
          <span>Драйвер WinDivert 2.2</span>
          <span>Права администратора — встроены в .exe</span>
        </div>
        <button
          type="button"
          onClick={() => openUrl('https://github.com/snax1k/new-zapret2-gui')}
          className="flex items-center gap-1 text-ac-300 hover:underline shrink-0"
        >
          <span>GitHub проекта</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </Card>
    </div>
  );
};
