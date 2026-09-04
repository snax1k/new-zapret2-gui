import React, { useRef, useState } from 'react';
import {
  Settings,
  Shield,
  Layers,
  Check,
  ExternalLink,
  Sparkles,
  RefreshCw,
  Sun,
  Moon,
  Lock,
  CheckCircle2,
  Trash2,
  Activity,
  FolderOpen,
  BellRing,
  Download,
  HardDrive,
  Palette,
  Flame,
  Image as ImageIcon
} from 'lucide-react';
import { useApp, BUNDLED_CORE_VERSION } from '../context/AppContext';
import { ACCENTS, BACKGROUNDS, buildSurfaceRamp } from '../lib/theme';
import { CloseBehavior } from '../types';

/** «2026-09-05, 14:31» вместо ISO-строки, которую читать невозможно. */
const formatChecked = (iso: string): string => {
  if (!iso) return 'ещё не проверялось';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'ещё не проверялось';
  return d.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
};

export const SettingsView: React.FC = () => {
  const {
    addLog,
    stats,
    theme,
    toggleTheme,
    updateInfo,
    checkForUpdates,
    autoCheckUpdates,
    setAutoCheckUpdates,
    setIsUpdateModalOpen,
    setTheme,
    accent,
    setAccent,
    background,
    setBackground,
    customBackground,
    setCustomBackground,
    clearCustomBackground,
    closeBehavior,
    setCloseBehavior,
    killZombieWinDivert,
    openAppFolder,
    isWatchdogClean
  } = useApp();

  const fileInput = useRef<HTMLInputElement>(null);
  const [bgBusy, setBgBusy] = useState(false);

  const pickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    // Значение сбрасываем сразу: иначе повторный выбор того же файла не
    // вызовет onChange и это будет выглядеть поломкой.
    e.target.value = '';
    if (!file) return;
    setBgBusy(true);
    try {
      await setCustomBackground(file);
    } finally {
      setBgBusy(false);
    }
  };

  /** Цвет плитки фона — та же ступень, которой закрашено окно. */
  const swatchOf = (hue: number, sat: number) => {
    const r = buildSurfaceRamp(hue, sat);
    const c = r[theme === 'dark' ? 900 : 200];
    return `rgb(${c[0]} ${c[1]} ${c[2]})`;
  };

  return (
    <div className="h-full flex flex-col p-6 space-y-5 overflow-y-auto select-none">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Settings className="w-5 h-5 text-indigo-500" />
          Настройки приложения, WinDivert и системного трея
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Управление зависшими процессами, хранением файлов ядра и поведением окна
        </p>
      </div>

      <div className="space-y-4">
        {/* 0. Оформление */}
        <div className={`p-4 rounded-xl border space-y-3.5 ${
          theme === 'dark' ? 'bg-slate-900/60 border-white/10' : 'bg-white border-slate-200 shadow-xs'
        }`}>
          <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Palette className="w-4 h-4 text-indigo-500" />
            Оформление: схема, акцент и фон
          </span>

          {/* Схема */}
          <div>
            <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              Схема
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'light', label: 'Светлая', icon: Sun, on: theme === 'light' },
                { id: 'dark', label: 'Тёмная', icon: Moon, on: theme === 'dark' && accent !== 'red' },
                { id: 'dark-red', label: 'Тёмная красная', icon: Flame, on: theme === 'dark' && accent === 'red' }
              ].map(s => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      if (s.id === 'light') setTheme('light');
                      else if (s.id === 'dark') { setTheme('dark'); if (accent === 'red') setAccent('indigo'); }
                      else { setTheme('dark'); setAccent('red'); }
                    }}
                    className={`p-2.5 rounded-xl border text-[11px] font-bold flex items-center gap-2 transition-all ${
                      s.on
                        ? 'bg-indigo-600/20 border-indigo-500 text-indigo-900 dark:text-indigo-200'
                        : 'bg-black/5 dark:bg-black/20 border-black/5 dark:border-white/5 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{s.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Акцент */}
          <div>
            <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              Цвет акцента
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {ACCENTS.map(a => (
                <button
                  key={a.id}
                  onClick={() => setAccent(a.id)}
                  title={a.label}
                  className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${
                    accent === a.id
                      ? 'border-slate-900 dark:border-white scale-110'
                      : 'border-transparent'
                  }`}
                  style={{ background: a.swatch }}
                />
              ))}
              <span className="text-[10px] text-slate-500 dark:text-slate-400 ml-1">
                Кнопки, ссылки и выделения по всему приложению
              </span>
            </div>
          </div>

          {/* Фон */}
          <div>
            <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              Фон
            </div>
            <div className="grid grid-cols-4 gap-2">
              {BACKGROUNDS.map(b => (
                <button
                  key={b.id}
                  onClick={() => setBackground(b.id)}
                  className={`p-2 rounded-xl border text-[10px] font-bold flex items-center gap-2 transition-all ${
                    background === b.id && !customBackground
                      ? 'border-indigo-500 text-slate-900 dark:text-slate-100'
                      : 'border-black/5 dark:border-white/5 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <span
                    className="w-5 h-5 rounded-md border border-black/10 dark:border-white/10 shrink-0"
                    style={{ background: swatchOf(b.hue, b.sat) }}
                  />
                  <span className="truncate">{b.label}</span>
                </button>
              ))}
            </div>

            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2">
              Фон задаёт тон всем панелям и тексту: светлота ступеней не меняется,
              поэтому контраст остаётся прежним при любом выборе. Вместе с фоном
              подставляется подходящий ему акцент — его можно поменять выше.
            </p>
          </div>

          {/* Своя картинка */}
          <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-black/5 dark:bg-black/20 border border-black/5 dark:border-white/5">
            <div className="min-w-0 flex items-center gap-3">
              {customBackground ? (
                <img
                  src={customBackground}
                  alt=""
                  className="w-12 h-9 rounded-md object-cover border border-black/10 dark:border-white/10 shrink-0"
                />
              ) : (
                <div className="w-12 h-9 rounded-md bg-black/10 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center shrink-0">
                  <ImageIcon className="w-4 h-4 text-slate-400" />
                </div>
              )}
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  {customBackground ? 'Фоном стоит своё изображение' : 'Своё изображение фоном'}
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  Тон интерфейса подбирается по среднему цвету картинки. Поверх неё
                  кладётся затемняющий слой — без него текст поверх снимка нечитаем.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {customBackground && (
                <button
                  onClick={clearCustomBackground}
                  className="px-3 py-1.5 rounded-lg bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-[11px] font-bold text-slate-700 dark:text-slate-200 border border-black/10 dark:border-white/10 transition-colors"
                >
                  Убрать
                </button>
              )}
              <button
                onClick={() => fileInput.current && fileInput.current.click()}
                disabled={bgBusy}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-[11px] font-bold shadow-xs transition-colors"
              >
                {bgBusy ? 'Обработка...' : 'Выбрать...'}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                onChange={pickImage}
                className="hidden"
              />
            </div>
          </div>
        </div>

        {/* 1. WinDivert Zombie Process Watchdog & Cleanup */}
        <div className={`p-4 rounded-xl border space-y-3 ${
          theme === 'dark' ? 'bg-slate-900/60 border-white/10' : 'bg-white border-slate-200 shadow-xs'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-500" />
              Автообнаружение и очистка зависших процессов (WinDivert Watchdog)
            </span>
            <button
              onClick={killZombieWinDivert}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Очистить зависшие winws</span>
            </button>
          </div>

          <div className="p-3 rounded-xl bg-black/5 dark:bg-black/20 border border-black/5 dark:border-white/5 space-y-2 text-xs">
            <div>
              <div className="font-semibold text-slate-800 dark:text-slate-200">Автовыгрузка при непредвиденном закрытии</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Оставшиеся процессы winws.exe завершаются автоматически при запуске
                и при выходе из приложения — отдельно включать это не нужно.
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-black/5 dark:border-white/5 text-[11px]">
              <span className="text-slate-500">Процесс ядра:</span>
              <span className={`font-mono font-bold ${
                stats.pid ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'
              }`}>
                {!isWatchdogClean ? 'Очистка...' : stats.pid ? `winws.exe работает (PID ${stats.pid})` : 'Не запущен'}
              </span>
            </div>
          </div>
        </div>

        {/* 2. Storage & Release Location */}
        <div className={`p-4 rounded-xl border space-y-3 ${
          theme === 'dark' ? 'bg-slate-900/60 border-white/10' : 'bg-white border-slate-200 shadow-xs'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-indigo-500" />
              Хранение данных и расположение файлов ядра Zapret2
            </span>
            <button
              onClick={openAppFolder}
              className="px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30 text-xs font-bold transition-colors flex items-center gap-1.5"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Открыть папку с файлами</span>
            </button>
          </div>

          <div className="p-3.5 rounded-xl bg-black/5 dark:bg-black/20 border border-black/5 dark:border-white/5 space-y-2 text-xs">
            <div className="text-slate-700 dark:text-slate-300 leading-relaxed">
              <p><strong>📁 Где хранятся файлы:</strong></p>
              <p className="font-mono text-[11px] text-indigo-600 dark:text-indigo-300 break-all bg-black/10 dark:bg-black/40 p-1.5 rounded-md mt-1">
                %LOCALAPPDATA%\Zapret2-GUI\ — bin\ (winws.exe, WinDivert, списки доменов), dist\ (интерфейс), logs\ (журналы с ротацией)
              </p>
            </div>
            <div className="pt-2 border-t border-black/5 dark:border-white/5 text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
              <p>💡 <strong>Что внутри одного .exe (~2,4 МБ)</strong></p>
              <p>
                Интерфейс и ядро zapret (winws.exe, WinDivert, списки доменов, TLS-пейлоады)
                упакованы в исполняемый файл как ресурсы и распаковываются при запуске.
                Отрисовкой занимается встроенный в Windows движок WebView2, поэтому
                сборка не тащит с собой браузер, как Electron.
              </p>
            </div>
          </div>
        </div>

        {/* 3. GitHub Auto-Updater with Accurate Status */}
        <div className={`p-4 rounded-xl border space-y-3 ${
          theme === 'dark' ? 'bg-slate-900/60 border-white/10' : 'bg-white border-slate-200 shadow-xs'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <RefreshCw className={`w-4 h-4 text-indigo-500 ${updateInfo.isChecking ? 'animate-spin' : ''}`} />
              Обновление приложения с GitHub (snax1k/new-zapret2-gui)
            </span>

            {updateInfo.hasUpdate ? (
              <button
                onClick={() => setIsUpdateModalOpen(true)}
                className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Открыть релиз {updateInfo.latestVersion}</span>
              </button>
            ) : (
              <button
                onClick={() => checkForUpdates(false)}
                disabled={updateInfo.isChecking}
                className="px-3.5 py-1.5 rounded-lg bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-slate-800 dark:text-slate-200 border border-black/10 dark:border-white/10 text-xs font-bold transition-colors flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${updateInfo.isChecking ? 'animate-spin' : ''}`} />
                <span>{updateInfo.isChecking ? 'Проверка...' : 'Проверить обновления'}</span>
              </button>
            )}
          </div>

          <div className="p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-500/20 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600 dark:text-slate-400">
                Версия приложения: <strong>v{updateInfo.currentVersion}-portable</strong>
              </span>

              {updateInfo.hasUpdate ? (
                <span className="text-indigo-600 dark:text-indigo-300 font-semibold flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                  Вышла версия {updateInfo.latestVersion}
                </span>
              ) : updateInfo.lastCheckedAt ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  Установлена последняя версия
                </span>
              ) : (
                <span className="text-slate-500 dark:text-slate-400 font-semibold">
                  Обновления ещё не проверялись
                </span>
              )}
            </div>

            <div className="text-[11px] text-slate-600 dark:text-slate-300">
              <strong className="text-slate-900 dark:text-slate-100">Что именно обновляется:</strong>{' '}
              само приложение. Сборка скачивается из релиза, сверяется по SHA-256 и
              подменяется при перезапуске. Без файла контрольных сумм установка не
              выполняется — иначе мы запускали бы непроверенный файл от администратора.
            </div>

            <div className="text-[11px] text-slate-600 dark:text-slate-300">
              <strong className="text-slate-900 dark:text-slate-100">Ядро zapret так не обновляется:</strong>{' '}
              winws.exe и WinDivert зашиты в .exe ресурсами и приезжают только с новой
              сборкой приложения. Сейчас в сборке {BUNDLED_CORE_VERSION}.
            </div>
          </div>

          <div
            onClick={() => setAutoCheckUpdates(!autoCheckUpdates)}
            className="flex items-center justify-between gap-3 p-3 rounded-xl border cursor-pointer transition-colors bg-black/5 dark:bg-black/20 border-black/5 dark:border-white/5 hover:bg-black/10 dark:hover:bg-white/5"
          >
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                Проверять обновления при запуске
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                Один запрос к GitHub, не чаще раза в шесть часов. Окно не открывается —
                о новой версии сообщает плашка в боковом меню.
                {' '}Последняя проверка: {formatChecked(updateInfo.lastCheckedAt)}.
              </p>
            </div>

            <div className={`w-9 h-5 rounded-full shrink-0 transition-colors relative ${
              autoCheckUpdates ? 'bg-indigo-600' : 'bg-slate-400/40 dark:bg-slate-600'
            }`}>
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                autoCheckUpdates ? 'translate-x-4' : 'translate-x-0'
              }`} />
            </div>
          </div>
        </div>

        {/* 4. Window Close Behavior (Tray vs Full Exit) */}
        <div className={`p-4 rounded-xl border space-y-3 ${
          theme === 'dark' ? 'bg-slate-900/60 border-white/10' : 'bg-white border-slate-200 shadow-xs'
        }`}>
          <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <BellRing className="w-4 h-4 text-indigo-500" />
            Действие при нажатии кнопки «Закрыть» (Крестик)
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div
              onClick={() => setCloseBehavior('minimize_to_tray')}
              className={`p-3 rounded-xl border cursor-pointer transition-all ${
                closeBehavior === 'minimize_to_tray'
                  ? 'bg-indigo-600/20 border-indigo-500 text-indigo-900 dark:text-indigo-200 shadow-xs'
                  : 'bg-black/5 dark:bg-black/20 border-black/5 dark:border-white/5 text-slate-600 dark:text-slate-400'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold">Сворачивать в системный трей (По умолчанию)</span>
                {closeBehavior === 'minimize_to_tray' && <Check className="w-3.5 h-3.5 text-indigo-500" />}
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Окно прячется в трей около часов. Обход блокировок продолжает работать в фоне.
              </p>
            </div>

            <div
              onClick={() => setCloseBehavior('exit_app')}
              className={`p-3 rounded-xl border cursor-pointer transition-all ${
                closeBehavior === 'exit_app'
                  ? 'bg-rose-600/20 border-rose-500 text-rose-900 dark:text-rose-200 shadow-xs'
                  : 'bg-black/5 dark:bg-black/20 border-black/5 dark:border-white/5 text-slate-600 dark:text-slate-400'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold">Полностью закрывать приложение</span>
                {closeBehavior === 'exit_app' && <Check className="w-3.5 h-3.5 text-rose-500" />}
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Завершать все процессы winws.exe, выгружать WinDivert и полностью закрывать приложение.
              </p>
            </div>
          </div>
        </div>

        {/* 5. Windows Elevation & Autostart */}
        <div className={`p-4 rounded-xl border space-y-3 ${
          theme === 'dark' ? 'bg-slate-900/60 border-white/10' : 'bg-white border-slate-200 shadow-xs'
        }`}>
          <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-500" />
            Интеграция с Windows и Служба
          </span>

          <div className="space-y-2 text-xs">
            {/* UAC Elevation Status */}
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-500 shrink-0" />
                <div>
                  <div className="font-semibold text-amber-700 dark:text-amber-300">Права Администратора (UAC requireAdministrator)</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">Встроено в бинарник .exe для прямого доступа к сокетам WinDivert</div>
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold">
                ВКЛЮЧЕНО
              </span>
            </div>

            {/* Автозапуск и служба */}
            <div className="p-3 rounded-lg bg-black/5 dark:bg-black/20 border border-black/5 dark:border-white/5 space-y-1">
              <div className="font-semibold text-slate-800 dark:text-slate-200">Автозапуск и работа как служба</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Пока не реализованы. Приложению нужны права администратора, поэтому
                обычный автозапуск через папку «Автозагрузка» приводил бы к запросу UAC
                при каждом входе в систему — корректное решение требует задания в
                планировщике задач и будет добавлено отдельно.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
