import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { subscribeAppearance } from './services/appearancePreferences';
import './index.css';
import './styles/prototype-navigation.css';
import './styles/prototype-tools.css';
import './styles/prototype-reader.css';
import './styles/prototype-player.css';
import './styles/button-system.css';
import './styles/appearance.css';
import { PrototypeTooltipLayer } from './components/PrototypeTooltipLayer';
import { installSitesReaderBackend } from './sites/sitesReaderBackend';

subscribeAppearance(() => {});

if (import.meta.env.MODE === 'sites') installSitesReaderBackend();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <PrototypeTooltipLayer />
  </StrictMode>,
);
