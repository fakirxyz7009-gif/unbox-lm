/**
 * Hardware MIDI inputs (Web MIDI). Opens every input port (explicitly: a port that another
 * program holds reports an error instead of staying silent), re-binds when controllers are
 * plugged in, and keeps a small live state the UI reads per frame — held keys, wheels, last
 * activity — so no React state changes per MIDI message.
 * Notes, pitch bend, mod wheel and sustain go to `onMessage` (AudioEngine.handleMidiMessage);
 * other controller messages (knobs, faders, buttons) go to the `onControl` listeners.
 */
export type MidiStatus = 'off' | 'connecting' | 'ready' | 'blocked' | 'unsupported';

export interface MidiPortInfo {
  id: string;
  name: string;
  error?: string;
}

type ControlListener = (cc: number, value: number, channel: number) => void;

function inputOpenError(error: unknown): string {
  const name = typeof error === 'object' && error !== null && 'name' in error && typeof error.name === 'string' ? error.name : '';
  if (name === 'NotAllowedError') return 'MIDI permission denied while opening this input';
  const message = error instanceof Error ? error.message.trim() : '';
  return message ? `Could not open MIDI input: ${message}` : 'Could not open MIDI input; check its connection and other MIDI software';
}

export class MidiInput {
  status: MidiStatus = 'off';
  ports: MidiPortInfo[] = [];
  outputs: MidiPortInfo[] = [];
  /** Selected Web MIDI destination for sequencer notes and clock. */
  outputId = '';
  /** performance.now() of the last note or controller message (the transport LED). */
  lastActivity = 0;
  /** Keys held on the hardware keyboard right now. */
  readonly held = new Set<number>();
  /** Last hardware pitch bend (−1..1) and mod wheel (0..1). */
  pitch = 0;
  mod = 0;
  /** Bumped when held keys or wheels change; per-frame UI compares it. */
  version = 0;
  private access: MIDIAccess | null = null;
  private pending: Promise<boolean> | null = null;
  private readonly bound = new WeakSet<MIDIInput>();
  private readonly activeNotes = new Map<string, Map<string, number>>();
  private readonly activeSustain = new Map<string, Set<number>>();
  private readonly listeners = new Set<() => void>();
  private readonly controls = new Set<ControlListener>();
  private readonly monitors = new Set<(data: Uint8Array, port: string) => void>();

  constructor(private readonly onMessage: (data: Uint8Array) => void) {}

  /** Status / port list changes (not per message). */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setOutput(id: string): void {
    const next = this.outputs.some((port) => port.id === id) ? id : '';
    if (next !== this.outputId && this.outputId) {
      const previous = this.access?.outputs.get(this.outputId);
      try {
        (previous as any)?.clear?.();
        for (let channel = 0; channel < 16; channel++) previous?.send([0xb0 | channel, 123, 0]);
        previous?.send([0xfc]);
      } catch {
        // The old destination may have disconnected during the selection change.
      }
    }
    this.outputId = next;
    this.listeners.forEach((fn) => fn());
  }

  /** Controller messages other than mod wheel (CC 1) and sustain (CC 64). */
  onControl(fn: ControlListener): () => void {
    this.controls.add(fn);
    return () => this.controls.delete(fn);
  }

  /** Every incoming message with its port name (the Settings activity log). */
  monitor(fn: (data: Uint8Array, port: string) => void): () => void {
    this.monitors.add(fn);
    return () => this.monitors.delete(fn);
  }

  /** Asks for MIDI access (again after a refusal); resolves true once inputs are bound. */
  enable(): Promise<boolean> {
    if (this.status === 'ready') return Promise.resolve(true);
    if (this.pending) return this.pending;
    if (typeof navigator === 'undefined' || typeof navigator.requestMIDIAccess !== 'function') {
      this.setStatus('unsupported');
      return Promise.resolve(false);
    }
    this.setStatus('connecting');
    this.pending = navigator
      .requestMIDIAccess()
      .then(
        (access) => {
          this.access = access;
          access.onstatechange = () => this.bind();
          this.status = 'ready';
          this.bind();
          return true;
        },
        () => {
          this.setStatus('blocked');
          return false;
        }
      )
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }

  private setStatus(s: MidiStatus): void {
    this.status = s;
    this.listeners.forEach((f) => f());
  }

  private bind(): void {
    const access = this.access;
    if (!access) return;
    const ports: MidiPortInfo[] = [];
    const outputs: MidiPortInfo[] = [];
    const connectedInputs = new Set<string>();
    access.inputs.forEach((input) => {
      if (input.state !== 'connected') return;
      connectedInputs.add(input.id);
      const port: MidiPortInfo = { id: input.id, name: input.name || 'MIDI input' };
      ports.push(port);
      if (!this.bound.has(input)) {
        this.bound.add(input);
        input.addEventListener('midimessage', (e) => this.receive((e as MIDIMessageEvent).data, port.name, port.id));
      }
      // addEventListener doesn't open a port by itself (onmidimessage did, silently)
      if (input.connection !== 'open') {
        input.open().catch((error: unknown) => {
          port.error = inputOpenError(error);
          this.setStatus(this.status);
        });
      }
    });
    this.releaseDisconnectedInputs(connectedInputs);
    access.outputs.forEach((output) => {
      if (output.state === 'connected') outputs.push({ id: output.id, name: output.name || 'MIDI output' });
    });
    this.outputs = outputs;
    if (this.outputId && !outputs.some((p) => p.id === this.outputId)) this.outputId = '';
    this.ports = ports;
    this.setStatus('ready');
  }

  private releaseDisconnectedInputs(connectedInputs: Set<string>): void {
    for (const [id, notes] of this.activeNotes) {
      if (connectedInputs.has(id)) continue;
      this.activeNotes.delete(id);
      for (const [key, note] of notes) {
        const channel = Number(key.slice(0, key.indexOf(':')));
        if (!this.isNoteHeld(note, channel)) this.onMessage(new Uint8Array([0x80 | channel, note, 0]));
      }
    }
    for (const [id, channels] of this.activeSustain) {
      if (connectedInputs.has(id)) continue;
      for (const channel of channels) {
        const heldByAnotherInput = [...this.activeSustain.entries()].some(([otherId, otherChannels]) => otherId !== id && connectedInputs.has(otherId) && otherChannels.has(channel));
        if (!heldByAnotherInput) this.onMessage(new Uint8Array([0xb0 | channel, 64, 0]));
      }
      this.activeSustain.delete(id);
    }
    const held = new Set([...this.activeNotes.values()].flatMap((notes) => [...notes.values()]));
    if (held.size !== this.held.size || [...held].some((note) => !this.held.has(note))) {
      this.held.clear();
      held.forEach((note) => this.held.add(note));
      this.version++;
    }
  }

  private isNoteHeld(note: number, channel: number): boolean {
    const key = `${channel & 0x0f}:${note & 0x7f}`;
    return [...this.activeNotes.values()].some((notes) => notes.has(key));
  }

  private isPitchHeld(note: number): boolean {
    return [...this.activeNotes.values()].some((notes) => [...notes.values()].includes(note));
  }

  /** Sends a short MIDI message to the selected output at a performance-clock timestamp. */
  sendOutput(data: number[], timestamp?: number): boolean {
    const output = this.outputId ? this.access?.outputs.get(this.outputId) : undefined;
    if (!output || output.state !== 'connected') return false;
    try {
      output.send(data, timestamp);
      return true;
    } catch {
      return false;
    }
  }

  clearOutput(): void {
    const output = this.outputId ? this.access?.outputs.get(this.outputId) : undefined;
    try {
      (output as any)?.clear?.();
    } catch {
      // The destination may have disconnected between UI refreshes.
    }
  }

  private receive(d: Uint8Array | null, port: string, portId: string): void {
    if (!d || d.length < 2 || d[0] >= 0xf0) return; // clock, active sensing, SysEx
    this.lastActivity = performance.now();
    this.monitors.forEach((f) => f(d, port));
    const cmd = d[0] & 0xf0;
    const channel = d[0] & 0x0f;
    const a = d[1];
    const b = d.length > 2 ? d[2] : 0;
    if (cmd === 0x90 && b > 0) {
      const notes = this.activeNotes.get(portId) ?? new Map<string, number>();
      notes.set(`${channel}:${a}`, a);
      this.activeNotes.set(portId, notes);
      this.held.add(a);
      this.version++;
    } else if (cmd === 0x80 || cmd === 0x90) {
      const notes = this.activeNotes.get(portId);
      notes?.delete(`${channel}:${a}`);
      if (notes?.size === 0) this.activeNotes.delete(portId);
      const heldByAnotherInput = this.isNoteHeld(a, channel);
      if (!this.isPitchHeld(a)) this.held.delete(a);
      this.version++;
      if (heldByAnotherInput) return;
    } else if (cmd === 0xe0) {
      this.pitch = (((b << 7) | a) - 8192) / 8192;
      this.version++;
    } else if (cmd === 0xb0 && a === 1) {
      this.mod = b / 127;
      this.version++;
    } else if (cmd === 0xb0) {
      if (a === 64) {
        const channels = this.activeSustain.get(portId) ?? new Set<number>();
        if (b >= 64) channels.add(channel);
        else channels.delete(channel);
        if (channels.size) this.activeSustain.set(portId, channels);
        else this.activeSustain.delete(portId);
      } else if (a !== 1) {
        this.controls.forEach((f) => f(a, b, channel + 1));
        return;
      }
    }
    this.onMessage(d);
  }
}
