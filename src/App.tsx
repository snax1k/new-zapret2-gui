import React from 'react';
import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { UpdateModal } from './components/UpdateModal';
import { CreatePresetModal } from './components/CreatePresetModal';
import { AutotuneModal } from './components/AutotuneModal';
import { DashboardView } from './views/DashboardView';
import { PresetsView } from './views/PresetsView';
import { HostlistsView } from './views/HostlistsView';
import { DiagnosticsView } from './views/DiagnosticsView';
import { LogsView } from './views/LogsView';
import { SettingsView } from './views/SettingsView';
import { useApp } from './context/AppContext';
import { BellRing, X } from 'lucide-react';

export const App: React.FC = () => {
  const { activeTab, theme, showTrayToast, setShowTrayToast, status } = useApp();

  const renderActiveView = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardView />;
      case 'presets':
        return <PresetsView />;
      case 'hostlists':
        return <HostlistsView />;
      case 'diagnostics':
        return <DiagnosticsView />;
      case 'logs':
        return <LogsView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className={`h-screen w-screen flex flex-col select-none overflow-hidden transition-colors duration-200 ${
      theme === 'dark'
        ? 'bg-[#0B0F19] text-slate-100'
        : 'bg-slate-100 text-slate-900'
    }`}>
      {/* Windows 11 Styled Title Bar */}
      <TitleBar />

      {/* Main App Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Navigation */}
        <Sidebar />

        {/* Dynamic Content Area */}
        <main className={`flex-1 overflow-hidden relative transition-colors duration-200 ${
          theme === 'dark' ? 'bg-[#0D121F]/90' : 'bg-slate-50/80'
        }`}>
          {/* Subtle Ambient Background Gradients */}
          <div className="absolute top-0 right-1/4 w-96 h-96 bg-indigo-600/5 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 right-0 w-80 h-80 bg-emerald-600/5 rounded-full blur-3xl pointer-events-none" />

          {/* Current Screen View */}
          <div className="relative z-10 h-full">
            {renderActiveView()}
          </div>
        </main>
      </div>

      {/* Auto-Update Modal */}
      <UpdateModal />

      {/* Create Custom Preset Modal */}
      <CreatePresetModal />

      {/* Автоподбор стратегии — открывается и с главной, и из «Пресетов» */}
      <AutotuneModal />

      {/* Tray Toast Notification */}
      {showTrayToast && (
        <div className="fixed bottom-4 right-4 z-50 p-3.5 rounded-2xl bg-indigo-950/90 text-white border border-indigo-500/40 shadow-2xl backdrop-blur-md flex items-center gap-3 animate-fadeIn">
          <div className="w-8 h-8 rounded-xl bg-indigo-600/30 border border-indigo-400/30 flex items-center justify-center text-indigo-400 shrink-0">
            <BellRing className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold">Приложение свернуто в трей</div>
            <div className="text-[10px] text-slate-300">
              {status === 'connected'
                ? 'Обход продолжает работать в фоне. Иконка в области уведомлений.'
                : 'Иконка в области уведомлений. Обход сейчас выключен.'}
            </div>
          </div>
          <button
            onClick={() => setShowTrayToast(false)}
            className="p-1 rounded text-slate-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
