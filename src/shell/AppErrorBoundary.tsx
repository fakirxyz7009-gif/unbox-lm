/**
 * AppErrorBoundary — a crash must never take the session with it.
 *
 * React render/lifecycle errors land here instead of a white screen. The panel offers a reload,
 * a downloaded copy of the live project state, and the last error text.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { audioEngine } from '../audio/AudioEngine.ts';
import { showAlert } from './dialogService.ts';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  copied: boolean;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unbox Studio crashed:', error, info.componentStack);
    try {
      sessionStorage.setItem('unbox:lastCrash', JSON.stringify({ message: error.message, stack: error.stack, at: Date.now() }));
    } catch {
      // storage is optional
    }
  }

  private downloadRecovery = (): void => {
    try {
      const json = audioEngine.exportProjectJSON();
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `unbox-recovery-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      this.setState({ copied: true });
    } catch (e) {
      void showAlert({ title: 'Could not read the project state', message: (e as Error).message });
    }
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen bg-[#141210] text-[#d5dade] grid place-items-center p-8 font-sans">
        <div className="w-full max-w-[640px] rounded border border-[#4a3a28] bg-[#1a1714] p-6 shadow-2xl">
          <div className="text-[11px] font-label font-bold uppercase tracking-widest text-[#b99a6d]">Unbox Studio</div>
          <h1 className="mt-1 text-[22px] font-semibold text-white">Something went wrong</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-[#a7aeb5]">
            The interface hit an unexpected error. Your project is still in memory and autosaves every few seconds.
            Download a copy of the current state before reloading if you made a lot of changes.
          </p>
          <pre className="mt-3 max-h-40 overflow-auto rounded bg-black/50 p-3 text-[11px] text-[#e08b8b] whitespace-pre-wrap">
            {this.state.error.message}
          </pre>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={this.downloadRecovery}
              className="rounded bg-[#d6a358] px-3 py-1.5 text-[13px] font-semibold text-black hover:bg-[#e0b266]"
            >
              {this.state.copied ? 'Copy downloaded' : 'Download recovery copy'}
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded border border-[#4a3a28] px-3 py-1.5 text-[13px] font-semibold text-[#d5dade] hover:bg-white/5"
            >
              Reload the studio
            </button>
          </div>
          <p className="mt-3 text-[11px] text-[#7f878e]">
            If this keeps happening, the last error is kept in this tab&apos;s session storage as <code>unbox:lastCrash</code>.
          </p>
        </div>
      </div>
    );
  }
}
