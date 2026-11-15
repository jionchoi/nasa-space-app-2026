import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AlertsProvider } from './state/AlertsContext';
import { AppProvider } from './state/AppContext';
import { CvProvider } from './state/CvContext';
import { RoutineProvider } from './state/RoutineContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProvider>
        <AlertsProvider>
          <RoutineProvider>
            <CvProvider>
              <App />
            </CvProvider>
          </RoutineProvider>
        </AlertsProvider>
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
