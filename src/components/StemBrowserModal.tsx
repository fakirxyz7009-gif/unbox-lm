/** StemBrowserModal — the project's samples and the experimental stem split, in the browser panel. */
import { SampleBrowser } from './browser/SampleBrowser.tsx';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onMessage: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export function StemBrowserModal({ isOpen, onClose, onMessage }: Props) {
  return <SampleBrowser isOpen={isOpen} onClose={onClose} onMessage={onMessage} />;
}
