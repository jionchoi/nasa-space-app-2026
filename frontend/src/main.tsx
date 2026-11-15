import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AlertsProvider } from './state/AlertsContext';
import { AppProvider } from './state/AppContext';
import { DemoBar } from './components/demo/DemoBar';
import { CvProvider } from './state/CvContext';
import { RoutineProvider } from './state/RoutineContext';
import { HealthProvider } from './state/HealthContext';
import { ShellProvider } from './state/ShellContext';
import { installMuteShortcut } from './lib/sound';
import './index.css';

installMuteShortcut();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProvider>
        <AlertsProvider>
          <HealthProvider>
            <RoutineProvider>
              <ShellProvider>
                <CvProvider>
                  <App />
                  <DemoBar />
                </CvProvider>
              </ShellProvider>
            </RoutineProvider>
          </HealthProvider>
        </AlertsProvider>
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
