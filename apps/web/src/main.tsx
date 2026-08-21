import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './features/auth/AuthProvider';
import { BrandingProvider } from './features/branding/BrandingProvider';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrandingProvider>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </BrandingProvider>
  </StrictMode>,
);
