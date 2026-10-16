/**
 * @file projectStore.ts
 * @brief Reactive state management for Unboxed DAW project metadata, BPM, and track states.
 */
type TrackState = {
  id: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
};

class ProjectStore {
  private listeners: Set<() => void> = new Set();
  
  public state = {
    bpm: 124,
    tracks: new Map<string, TrackState>(),
  };

  public subscribe(callback: () => void) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notify() {
    this.listeners.forEach((callback) => callback());
  }

  public setBpm(bpm: number) {
    this.state.bpm = bpm;
    this.notify();
  }

  public updateTrack(id: string, updates: Partial<TrackState>) {
    const track = this.state.tracks.get(id) || { id, volume: 0.85, pan: 0, mute: false, solo: false };
    this.state.tracks.set(id, { ...track, ...updates });
    this.notify();
  }
}

export const projectStore = new ProjectStore();
