import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { SignalProvider, useSignals } from './state/SignalContext';
import { AlertsProvider } from './state/AlertsContext';
import { AppProvider } from './state/AppContext';
import { CvProvider } from './state/CvContext';
import { RoutineProvider } from './state/RoutineContext';
import './index.css';

function Application() {
  const {mode,session}=useSignals();
  return <AppProvider key={`${mode}:${session?.id??'none'}`}>
    <AlertsProvider><RoutineProvider><CvProvider><App/></CvProvider></RoutineProvider></AlertsProvider>
  </AppProvider>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <SignalProvider><Application/></SignalProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
