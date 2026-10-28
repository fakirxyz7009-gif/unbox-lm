import { createRoot } from 'react-dom/client';
// Fonts ship with the app (open-licensed @fontsource files), so the desktop app looks the same offline.
// One interface family: Inter (tabular numerals for readouts).
import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import App from './App.tsx';
import { AppErrorBoundary } from './shell/AppErrorBoundary.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);
