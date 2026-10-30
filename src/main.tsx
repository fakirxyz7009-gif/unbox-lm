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
import { toast } from './shell/toast.ts';
import './index.css';

const recentlyReported = new Map<string, number>();
/** Errors outside React's render (event handlers, async work) are logged and shown, not lost. Repeats are shown once. */
function reportUncaught(reason: unknown): void {
  const message = reason instanceof Error ? reason.message : String(reason);
  console.error('Uncaught error:', reason);
  if (message.includes('ResizeObserver loop')) return; // a harmless browser notice
  const now = Date.now();
  if ((recentlyReported.get(message) ?? 0) > now - 5000) return;
  recentlyReported.set(message, now);
  toast(`Something went wrong: ${message}`, 'error');
}
window.addEventListener('error', (event) => reportUncaught(event.error ?? event.message));
window.addEventListener('unhandledrejection', (event) => reportUncaught(event.reason));

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);
