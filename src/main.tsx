import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AccessProvider } from './context/AccessContext';
import AccessGate from './components/access/AccessGate';

// AccessProvider + AccessGate wrap the whole app, so every route is gated
// behind a valid session and any expiry/invalidation returns to the code page.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AccessProvider>
      <AccessGate>
        <App />
      </AccessGate>
    </AccessProvider>
  </StrictMode>
);
