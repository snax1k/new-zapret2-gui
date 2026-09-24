import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppProvider } from './context/AppContext';
import './index.css';

const render = () =>
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <AppProvider>
        <App />
      </AppProvider>
    </React.StrictMode>,
  );

// Имитация нативной части — только в режиме разработки и только с ?mock в
// адресе (см. src/dev/mockHost.ts). В релизной сборке import.meta.env.DEV
// равен false, и ветка вместе с модулем вырезается.
if (import.meta.env.DEV && new URLSearchParams(location.search).has('mock')) {
  import('./dev/mockHost').then(m => { m.installMockHost(); render(); });
} else {
  render();
}
