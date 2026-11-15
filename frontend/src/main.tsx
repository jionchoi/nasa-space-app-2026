import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AlertsProvider } from './state/AlertsContext';
import { AppProvider } from './state/AppContext';
import { DemoBar } from './components/demo/DemoBar';
import { CvProvider } from './state/CvContext';
import { RoutineProvider } from './state/RoutineContext';
import { installMuteShortcut } from './lib/sound';
import './index.css';

installMuteShortcut();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProvider>
        <AlertsProvider>
          <RoutineProvider>
            <CvProvider>
              <App />
              <DemoBar />
            </CvProvider>
          </RoutineProvider>
        </AlertsProvider>
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
