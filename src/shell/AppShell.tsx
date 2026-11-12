/**
 * Unbox Studio cabinet: title bar (brand, main menu, workspace tabs, quick tools), the
 * active tab or a full-screen page (Projects, Devices, Meters, Mastering, Export, Settings), and
 * the transport docked at the bottom.
 */
import React, { Activity, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, AudioLines, Bot, Command, HelpCircle, Menu as MenuIcon } from 'lucide-react';
import { audioEngine } from '../audio/AudioEngine.ts';
import { projectManager } from '../project/ProjectManager.ts';
import { SECTIONS, type PageId } from '../studio/sections.ts';
import { TransportBar } from './TransportBar.tsx';
import { setUi, getUi, useUi } from './uiStore.ts';
import { toast } from './toast.ts';
import { UnboxLogo } from '../ui/skin/UnboxLogo.tsx';
import { HardwareStatusBar } from '../components/HardwareStatusBar.tsx';
import { ProjectStartDialog } from './dialogs.tsx';
import { showPrompt } from './dialogService.ts';

export type WorkspaceTab = 'workstation' | 'rack' | 'mixer';

export const TABS: { id: WorkspaceTab; label: string; key: string }[] = [
  { id: 'workstation', label: 'Workstation & Sequencer', key: 'F7' },
  { id: 'rack', label: '3-Column Rack', key: 'F6' },
  { id: 'mixer', label: 'Mixer & Clip Editor', key: 'F5' },
];

export interface ShellActions {
  aiCopilot: () => void;
  cvMatrix: () => void;
  shortcuts: () => void;
  f8: () => void;
  stage: () => void;
  command: () => void;
  autoPatch: () => void;
  flipRack: () => void;
  toggleKeyboardDock: () => void;
  openStems: () => void;
}

interface Props {
  tab: WorkspaceTab;
  onTab: (t: WorkspaceTab) => void;
  page: PageId | null;
  onPage: (p: PageId | null) => void;
  renderPage: (id: PageId) => ReactNode;
  content: ReactNode;
  actions: ShellActions;
  children?: ReactNode;
}

const pageLabel = (id: PageId) => SECTIONS.find((s) => s.id === id)?.label ?? id;

const savedAgo = (at: number): string => {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 45) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
};

/** Always-visible save confidence: dot + "Saved 2m ago" (or amber "Unsaved"). */
function SaveIndicator({ onSave }: { onSave: () => void }) {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => projectManager.subscribe(() => force()), []);
  useEffect(() => {
    const timer = window.setInterval(() => force(), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const dirty = projectManager.hasUnsavedChanges;
  const label = dirty ? 'Unsaved' : projectManager.lastSavedAt ? `Saved ${savedAgo(projectManager.lastSavedAt)}` : 'Not saved';
  return (
    <button
      type="button"
      onClick={onSave}
      title={dirty ? 'Unsaved changes — click to save now (Ctrl+S)' : 'Click to save now (Ctrl+S)'}
      className="hidden md:flex items-center gap-1.5 h-[34px] px-2 rounded-[6px] us-btn font-label text-[11px] font-bold"
      data-testid="save-state"
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${dirty ? 'bg-amber-400' : 'bg-emerald-400/80'}`} />
      <span className="max-w-[128px] truncate">{label}</span>
    </button>
  );
}

export function AppShell({ tab, onTab, page, onPage, renderPage, content, actions, children }: Props) {
  const { mixerLayout } = useUi();
  const [menuOpen, setMenuOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const saveNow = () => {
    void projectManager.save().then((saved) =>
      toast(saved ? `Saved “${projectManager.currentName}”` : projectManager.status || 'Save failed', saved ? 'success' : 'error'),
    );
  };
  const promptSaveAs = () => {
    void showPrompt({
      title: 'Save as new project',
      label: 'Project name',
      defaultValue: `${projectManager.currentName} copy`,
      confirmLabel: 'Save as',
    }).then(async (name) => {
      if (name === null) return;
      const saved = await projectManager.saveAs(name);
      toast(saved ? `Saved as “${name}”` : projectManager.status || 'Save failed', saved ? 'success' : 'error');
    });
  };

  useEffect(() => {
    const updateTitle = () => {
      document.title = `${projectManager.hasUnsavedChanges ? '● ' : ''}${projectManager.currentName} — Unbox Studio`;
    };
    updateTitle();
    return projectManager.subscribe(updateTitle);
  }, []);
  // Dirty state can change without a ProjectManager emit (a device edit only notifies the engine),
  // so keep the title in step with the shell's own renders too.
  useEffect(() => {
    document.title = `${projectManager.hasUnsavedChanges ? '● ' : ''}${projectManager.currentName} — Unbox Studio`;
  });

  // Ctrl+N / Ctrl+Shift+S live here (the App only owns plain Ctrl+S / Ctrl+E).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'n' && !e.shiftKey) {
        e.preventDefault();
        setNewProjectOpen(true);
      } else if (k === 's' && e.shiftKey) {
        e.preventDefault();
        promptSaveAs();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [menuOpen]);

  const exportJson = () => {
    if (audioEngine.recorder.busy) {
      toast('Finish the current recording take before exporting the project.', 'info');
      return;
    }
    const url = URL.createObjectURL(new Blob([audioEngine.exportProjectJSON()], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectManager.currentName || 'THE_UNBOX_APP_Project'}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast('The .json file holds the project without its audio. Use Export .unbox to keep the audio too.', 'info');
  };
  const importFile = async (f: File) => {
    try {
      await projectManager.importArchive(f, f.name.replace(/\.[^.]+$/, ''));
    } catch (e) {
      toast(`That file could not be imported: ${(e as Error).message}`, 'error');
    }
  };

  const go = (t: WorkspaceTab) => () => {
    onPage(null);
    onTab(t);
  };
  const MENU: [string, [string, () => void, string?][]][] = [
    [
      'File',
      [
        ['New project…', () => setNewProjectOpen(true), 'Ctrl+N'],
        ['Save', saveNow, 'Ctrl+S'],
        ['Save as…', promptSaveAs, 'Ctrl+Shift+S'],
        ['Projects…', () => onPage('projects')],
        ['Save version', () => void projectManager.saveVersion(`Version ${new Date().toLocaleTimeString()}`)],
        ['Export project (.json)', exportJson],
        ['Import project (.json / .unbox)…', () => fileRef.current?.click()],
        ['Bounce to WAV (real time)', () => void audioEngine.bounceRealtimeWav()],
        ['Export…', () => onPage('export'), 'Ctrl+Shift+E'],
        ['Stage mode', actions.stage, 'F11'],
      ],
    ],
    [
      'Edit',
      [
        ['Undo', () => void audioEngine.undo(), 'Ctrl+Z'],
        ['Redo', () => void audioEngine.redo(), 'Ctrl+Shift+Z'],
      ],
    ],
    [
      'View',
      [
        ...TABS.map((t): [string, () => void, string] => [t.label, go(t.id), t.key]),
        ['Clip editor (Full screen)', () => { onPage(null); onTab('mixer'); setUi({ mixerLayout: 'clip' }); }, 'F10'],
        ['Mixer & Clip editor (Split)', () => { onPage(null); onTab('mixer'); setUi({ mixerLayout: 'split' }); }],
        ['Rack front / rear', actions.flipRack, 'Tab'],
        ['Keyboard dock (Rack / Mixer)', actions.toggleKeyboardDock, 'Alt+K'],
        [getUi().qwertyPiano ? 'Computer keys: commands' : 'Computer keys: play notes', () => setUi({ qwertyPiano: !getUi().qwertyPiano })],
      ],
    ],
    [
      'Insert',
      [
        ['Samples & Stems…', actions.openStems, 'Alt+S'],
        ['Instruments…', () => onPage('instruments')],
        ['Drums…', () => onPage('drums')],
        ['Synths…', () => onPage('synths')],
        ['Samplers…', () => onPage('sampler')],
        ['Effects…', () => onPage('effects')],
        ['Patchbay…', () => onPage('patchbay')],
        ['Auto-patch all to master', actions.autoPatch],
        ['CV matrix…', actions.cvMatrix, 'Alt+M'],
      ],
    ],
    [
      'Tools',
      [
        ['Command search', actions.command, 'Ctrl+K'],
        ['MIDI tools', actions.f8, 'F8'],
        ['Meters', () => onPage('meters')],
        ['Mastering', () => onPage('mastering')],
        ['AI Co-Pilot', actions.aiCopilot, 'Alt+C'],
        ['Settings', () => onPage('settings')],
      ],
    ],
    [
      'Help',
      [
        ['Operation Manual (PDF)', () => window.open('/UNBOX_STUDIOS_USER_MANUAL.pdf', '_blank')],
        ['Keyboard shortcuts', actions.shortcuts, '?'],
      ],
    ],
  ];

  return (
    <div className="unbox-cabinet h-screen w-screen overflow-hidden flex flex-col bg-chrome-0 text-chrome-ink text-xs" onPointerDown={() => void audioEngine.resumeContext()}>
      {/* title bar */}
      <div className="us-chrome unbox-titlebar h-[46px] shrink-0 flex items-stretch relative" data-testid="title-bar">
        <span className="us-screw shrink-0 ml-2.5 my-auto" aria-hidden />
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="unbox-brand-button flex items-center gap-2 pl-2.5 pr-4"
          title="Main menu"
          aria-label="Main menu"
          aria-expanded={menuOpen}
          data-testid="main-menu"
        >
          <MenuIcon className="w-4 h-4 text-[#b99a6d]" />
          <UnboxLogo />
        </button>
        <div className="flex items-stretch" role="tablist" aria-label="Workspace">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={!page && tab === t.id}
              onClick={go(t.id)}
              className="unbox-workspace-tab border-l border-black/50"
              title={`${t.label} (${t.key})`}
              aria-label={`${t.label} workspace`}
              data-testid={`tab-${t.id}`}
            >
              {t.id === 'workstation' ? 'WORKSTATION' : t.id === 'rack' ? 'RACK' : 'MIXER'}
              <kbd>{t.key}</kbd>
            </button>
          ))}
        </div>
        {!page && tab === 'mixer' && (
          <div className="flex items-center px-3 border-l border-black/60 gap-1.5 text-xs">
            <span className="font-label font-bold text-[11px] uppercase tracking-wider text-[#7c8590]">View:</span>
            <div className="rack-seg" role="group" aria-label="Mixer and clip editor view mode">
              <button
                type="button"
                onClick={() => setUi({ mixerLayout: 'split' })}
                aria-pressed={mixerLayout === 'split'}
                title="Split view (Mixer above, Clip Editor below)"
              >
                Split
              </button>
              <button
                type="button"
                onClick={() => setUi({ mixerLayout: 'clip' })}
                aria-pressed={mixerLayout === 'clip'}
                title="Full screen Clip Editor (F10)"
              >
                Clip Editor
              </button>
              <button
                type="button"
                onClick={() => setUi({ mixerLayout: 'mixer' })}
                aria-pressed={mixerLayout === 'mixer'}
                title="Full screen Mixer"
              >
                Mixer
              </button>
            </div>
          </div>
        )}
        <div className="flex-1 border-l border-black/60" />
        <SaveIndicator onSave={saveNow} />
        <div className="flex items-center gap-1 pr-2">
          {([
            ['Samples & Stems (Alt+S)', actions.openStems, AudioLines],
            ['AI Co-Pilot (Alt+C)', actions.aiCopilot, Bot],
            ['Command search (Ctrl+K)', actions.command, Command],
            ['Keyboard shortcuts (?)', actions.shortcuts, HelpCircle],
          ] as const).map(([title, fn, Icon]) => (
            <button key={title} type="button" onClick={fn} title={title} aria-label={title} className="unbox-utility-button w-8 h-8 grid place-items-center">
              <Icon className="w-4 h-4" />
            </button>
          ))}
          <span className="us-screw shrink-0 ml-1.5 my-auto" aria-hidden />
        </div>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onPointerDown={() => setMenuOpen(false)} />
            <div className="absolute left-2 top-[44px] z-50 flex gap-0 rounded-md border border-chrome-line bg-chrome-1 shadow-2xl p-2" role="menu">
              {MENU.map(([title, items]) => (
                <div key={title} className="w-[190px] px-1">
                  <div className="font-label font-bold text-[13px] text-sel px-2 pb-1 tracking-wide">{title}</div>
                  {items.map(([label, fn, key]) => (
                    <button
                      key={label}
                      type="button"
                      role="menuitem"
                      className="w-full flex items-center justify-between gap-2 px-2 py-1 rounded text-left text-[13px] text-[#d5dae0] hover:bg-sel hover:text-black"
                      onClick={() => {
                        fn();
                        setMenuOpen(false);
                      }}
                    >
                      <span className="truncate">{label}</span>
                      {key && <span className="text-[11px] opacity-60 shrink-0">{key}</span>}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Hardware PC Device Telemetry & Performance HUD */}
      <HardwareStatusBar />

      {/* tab or page */}
      <div className="unbox-screen-well flex-1 min-h-0 flex flex-col">
        {page && (
          <div className="flex-1 min-h-0 flex flex-col bg-chrome-0">
            <div className="unbox-page-bar h-9 shrink-0 flex items-center gap-3 px-3">
              <button type="button" onClick={() => onPage(null)} className="us-btn rounded px-2 py-1 flex items-center gap-1 font-label font-bold text-[13px]" data-testid="page-back">
                <ArrowLeft className="w-3.5 h-3.5" /> {TABS.find((t) => t.id === tab)?.label}
              </button>
              <span className="font-label font-bold text-[18px] text-white tracking-wide">{pageLabel(page)}</span>
            </div>
            <div className="flex-1 min-h-0 flex flex-col us-page">{renderPage(page)}</div>
          </div>
        )}
        {/* the tab stays alive behind a page, so closing the page does not rebuild it */}
        <Activity mode={page ? 'hidden' : 'visible'}>{content}</Activity>
      </div>

      <TransportBar onOpenSettings={() => onPage('settings')} />
      <input
        ref={fileRef}
        type="file"
        accept=".json,.unbox,.zip,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importFile(f);
          e.target.value = '';
        }}
      />
      {children}

      {newProjectOpen && (
        <ProjectStartDialog
          mode="new"
          onCancel={() => setNewProjectOpen(false)}
          onChoose={async (kind, name) => {
            setNewProjectOpen(false);
            const created = await projectManager.create(kind, name);
            if (created) {
              onPage(null);
              toast(`Created “${name}”`, 'success');
            }
          }}
        />
      )}
    </div>
  );
}
