import React, { useState } from 'react';
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
  HardDrive
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { CloseBehavior } from '../types';

export const SettingsView: React.FC = () => {
  const {
    addLog,
    stats,
    theme,
    toggleTheme,
    updateInfo,
    checkForUpdates,
    setIsUpdateModalOpen,
    closeBehavior,
    setCloseBehavior,
    killZombieWinDivert,
    openAppFolder,
    isWatchdogClean
  } = useApp();


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
              Автообновление релизов ядра с GitHub (bol-van/zapret)
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
                onClick={checkForUpdates}
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
              <span className="text-slate-600 dark:text-slate-400">Версия GUI: <strong>v0.1.2-portable</strong></span>

              {updateInfo.hasUpdate ? (
                <span className="text-indigo-600 dark:text-indigo-300 font-semibold flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                  Доступен новый релиз ядра: {updateInfo.latestVersion}
                </span>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  Ядро актуально: {updateInfo.currentVersion}
                </span>
              )}
            </div>

            <div className="text-[11px] text-slate-600 dark:text-slate-300">
              <strong className="text-slate-900 dark:text-slate-100">Как обновляется ядро:</strong>{' '}
              winws.exe и WinDivert зашиты в этот .exe как ресурсы, поэтому заменить их
              на лету нельзя. Проверка сравнивает версию в сборке с последним релизом
              на GitHub и открывает страницу релиза — обновление ставится новой сборкой.
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
