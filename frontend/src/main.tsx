import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { SignalProvider, useSignals } from './state/SignalContext';
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

/** Demo / Measurement / Research mode (PPG integration). A new mode or signal session remounts the app state. */
function Application() {
  const { mode, session } = useSignals();
  return (
    <AppProvider key={`${mode}:${session?.id ?? 'none'}`}>
      <AlertsProvider>
        <HealthProvider>
          <RoutineProvider>
            <ShellProvider>
              <CvProvider>
                <App />
                {mode === 'demo' && <DemoBar />}
              </CvProvider>
            </ShellProvider>
          </RoutineProvider>
        </HealthProvider>
      </AlertsProvider>
    </AppProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <SignalProvider>
        <Application />
      </SignalProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
