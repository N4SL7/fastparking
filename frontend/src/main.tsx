import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { Simulacion } from './simulacion/Simulacion';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* /simulacion: vista del parqueadero completo para el iPad (RF-20); el resto: app del conductor */}
    {window.location.pathname.startsWith('/simulacion') ? <Simulacion /> : <App />}
  </StrictMode>,
);
