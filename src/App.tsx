import React, { useEffect, useState } from 'react';
import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { UpdateModal } from './components/UpdateModal';
import { CreatePresetModal } from './components/CreatePresetModal';
import { SetupWizard } from './components/SetupWizard';
import { DashboardView } from './views/DashboardView';
import { AutotuneView } from './views/AutotuneView';
import { PresetsView } from './views/PresetsView';
import { HostlistsView } from './views/HostlistsView';
import { TgProxyView } from './views/TgProxyView';
import { DiagnosticsView } from './views/DiagnosticsView';
import { LogsView } from './views/LogsView';
import { SettingsView } from './views/SettingsView';
import { useApp } from './context/AppContext';
import { BellRing, X } from 'lucide-react';

/** Ширина окна, при которой меню сворачивается до иконок. */
const COMPACT_BELOW = 900;

const useCompact = () => {
  const [compact, setCompact] = useState(() => window.innerWidth < COMPACT_BELOW);
  useEffect(() => {
    const onResize = () => setCompact(window.innerWidth < COMPACT_BELOW);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return compact;
};

export const App: React.FC = () => {
  const { activeTab, showTrayToast, setShowTrayToast, status } = useApp();
  const compact = useCompact();

  const renderActiveView = () => {
    switch (activeTab) {
      case 'dashboard': return <DashboardView compact={compact} />;
      case 'autotune': return <AutotuneView />;
      case 'presets': return <PresetsView />;
      case 'hostlists': return <HostlistsView />;
      case 'tgproxy': return <TgProxyView />;
      case 'diagnostics': return <DiagnosticsView />;
      case 'logs': return <LogsView />;
      case 'settings': return <SettingsView />;
      default: return <DashboardView compact={compact} />;
    }
  };

  return (
    <div className="app-shell h-screen w-screen flex flex-col select-none overflow-hidden bg-app text-t1">
      <TitleBar />

      <div className="flex-1 flex min-h-0 relative">
        <Sidebar compact={compact} />

        <main className="flex-1 min-w-0 overflow-hidden relative">
          {/* key: при смене экрана содержимое мягко появляется заново. */}
          <div key={activeTab} className="h-full animate-fadeIn">
            {renderActiveView()}
          </div>
        </main>
      </div>

      <UpdateModal />
      <CreatePresetModal />
      {/* Мастер первого запуска — сам при первом запуске, потом из «Настроек». */}
      <SetupWizard />

      {showTrayToast && (
        <div className="fixed bottom-4 right-4 z-50 px-3.5 py-2.5 rounded-[10px] bg-s3 border border-ac/40 shadow-lg flex items-center gap-3 animate-fadeIn">
          <BellRing className="w-4 h-4 text-ac shrink-0" />
          <div>
            <div className="text-[12px] font-semibold text-white">Программа свёрнута в трей</div>
            <div className="text-[11px] text-t2">
              {status === 'connected'
                ? 'Обход продолжает работать в фоне. Значок — в области уведомлений.'
                : 'Значок — в области уведомлений. Обход сейчас выключен.'}
            </div>
          </div>
          <button onClick={() => setShowTrayToast(false)} className="p-1 rounded text-t3 hover:text-t1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
