import React from 'react';
import { Sparkles, Download, CheckCircle2, X, Loader2, ShieldCheck, ArrowRight, AlertTriangle, ExternalLink } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const UpdateModal: React.FC = () => {
  const { isUpdateModalOpen, setIsUpdateModalOpen, updateInfo, startAutoUpdate, openReleasePage, theme } = useApp();

  if (!isUpdateModalOpen) return null;

  // Ставить без контрольной суммы нельзя: exe запускается с правами
  // администратора, и непроверенный файл здесь недопустим.
  const canInstall = !!updateInfo.assetUrl && !!updateInfo.assetSha256;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn select-none">
      <div className={`w-full max-w-lg rounded-2xl border p-5 shadow-2xl space-y-4 ${
        theme === 'dark' ? 'bg-[#0F172A] border-indigo-500/40 text-slate-100' : 'bg-white border-indigo-200 text-slate-900'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-500 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Обновление Zapret2 Control Center</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Загрузка из GitHub Releases с проверкой SHA-256
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsUpdateModalOpen(false)}
            disabled={updateInfo.isDownloading}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Version Compare Banner */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs">
          <div>
            <span className="text-slate-500 dark:text-slate-400 block text-[10px]">Текущая версия:</span>
            <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{updateInfo.currentVersion}</span>
          </div>
          <ArrowRight className="w-4 h-4 text-indigo-500" />
          <div>
            <span className="text-slate-500 dark:text-slate-400 block text-[10px]">Новая версия:</span>
            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{updateInfo.latestVersion}</span>
          </div>
          <div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 font-bold">
              РЕЛИЗ
            </span>
          </div>
        </div>

        {/* Changes list */}
        <div className={`space-y-1.5 text-xs ${updateInfo.highlights.length ? '' : 'hidden'}`}>
          <span className="font-bold text-slate-800 dark:text-slate-200">Что включено в обновление:</span>
          <ul className="space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
            {updateInfo.highlights.map((h, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </div>

        {!canInstall && !updateInfo.isDownloading && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 flex items-start gap-2 text-[11px] leading-relaxed">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              {updateInfo.assetUrl
                ? 'В релизе нет файла SHA256SUMS.txt, проверить сборку нечем. Установка из приложения отключена — скачайте вручную со страницы релиза.'
                : 'В релизе нет собранного .exe. Скачайте вручную со страницы релиза.'}
            </span>
          </div>
        )}

        {updateInfo.error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 flex items-start gap-2 text-[11px] leading-relaxed">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{updateInfo.error}</span>
          </div>
        )}

        {/* Progress bar when downloading */}
        {updateInfo.isDownloading && (
          <div className="space-y-2 p-3 rounded-xl bg-black/20 border border-white/5">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-indigo-400 flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {updateInfo.downloadStep}
              </span>
              <span className="font-mono">{updateInfo.downloadProgress}%</span>
            </div>

            <div className="w-full h-2 rounded-full bg-black/40 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-300 rounded-full"
                style={{ width: `${updateInfo.downloadProgress}%` }}
              />
            </div>
          </div>
        )}

        {updateInfo.isInstalled && !updateInfo.hasUpdate && (
          <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-center gap-2 text-xs font-bold">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Установлена актуальная версия.</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-black/5 dark:border-white/5">
          <button
            onClick={() => setIsUpdateModalOpen(false)}
            disabled={updateInfo.isDownloading}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 mr-auto"
          >
            {updateInfo.hasUpdate ? 'Позже' : 'Закрыть'}
          </button>

          <button
            onClick={openReleasePage}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/5 dark:border-white/5"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Страница релиза</span>
          </button>

          {updateInfo.hasUpdate && canInstall && (
            <button
              onClick={startAutoUpdate}
              disabled={updateInfo.isDownloading}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-md transition-all ${
                updateInfo.isDownloading
                  ? 'bg-indigo-900/50 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-950/30 hover:scale-105'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>
                {updateInfo.isDownloading ? 'Загрузка...' : 'Скачать и установить'}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
