import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { DataProvider } from './lib/useData';
import { EditGateProvider } from './lib/editGate';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <DataProvider>
        <EditGateProvider>
          <App />
        </EditGateProvider>
      </DataProvider>
    </HashRouter>
  </StrictMode>,
);
