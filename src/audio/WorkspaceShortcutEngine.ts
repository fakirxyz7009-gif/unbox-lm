/**
 * Workspace Shortcut Engine, Tool State, Transport Shortcuts & MIDI Remote Mapping Controller
 */
export type EditToolMode = 'selection' | 'pencil' | 'eraser' | 'razor' | 'mute' | 'zoom' | 'hand';
export type CableStyleMode = 'animated' | 'transparent' | 'hidden';

export class WorkspaceShortcutEngine {
  public activeTool: EditToolMode = 'selection';
  public cableStyle: CableStyleMode = 'animated';
  public isCapsKeyboardActive: boolean = false;
  public zoomLevel: number = 1.0; // G / H zoom
  public trackHeight: number = 72; // track height
  public midiLearnActiveForParam: string | null = null;
  public midiMappings: Map<string, number> = new Map(); // paramKey -> ccNumber

  constructor(private onStateChange: () => void) {
    this.initKeyboardListeners();
  }

  private initKeyboardListeners(): void {
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

      // Tool shortcuts
      const key = e.key.toLowerCase();
      if (key === 'q') { this.activeTool = 'selection'; this.onStateChange(); }
      if (key === 'w') { this.activeTool = 'pencil'; this.onStateChange(); }
      if (key === 'e') { this.activeTool = 'eraser'; this.onStateChange(); }
      if (key === 'r') { this.activeTool = 'razor'; this.onStateChange(); }
      if (key === 't') { this.activeTool = 'mute'; this.onStateChange(); }
      if (key === 'y') { this.activeTool = 'zoom'; this.onStateChange(); }
      if (key === 'u') { this.activeTool = 'hand'; this.onStateChange(); }

      // CapsLock toggle for computer keyboard MIDI
      if (e.code === 'CapsLock') {
        this.isCapsKeyboardActive = !this.isCapsKeyboardActive;
        this.onStateChange();
      }
    });
  }

  public learnMidiCC(paramKey: string, ccNumber: number): void {
    this.midiMappings.set(paramKey, ccNumber);
    this.onStateChange();
  }
}
