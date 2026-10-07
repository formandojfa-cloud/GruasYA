import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './ui/estilos.css';
import { App } from './ui/App';
import { arrancarMotor } from './data/motor';

arrancarMotor();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
