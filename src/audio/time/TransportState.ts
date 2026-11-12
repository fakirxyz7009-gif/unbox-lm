import {
  type LoopRange,
  type PunchRange,
  type SnapGridDivision,
  type TimeRange,
  type TransportStatus,
} from './types.ts';

export class TransportState {
  public status: TransportStatus = 'stopped';
  public playheadTick: number = 0;
  public playStartTick: number = 0;
  public editCursorTick: number = 0;

  public loopRange: LoopRange = {
    startTick: 0,
    endTick: 192 * 4, // 4 bars default
    active: true,
    enabled: true,
    followSong: true,
  };

  public timeSelection: TimeRange = {
    startTick: 0,
    endTick: 0,
    active: false,
  };

  public punchRange: PunchRange = {
    startTick: 0,
    endTick: 192 * 4,
    active: false,
    enabled: false,
    preRollBars: 0,
    postRollBars: 0,
  };

  public countInBars: number = 0;
  public followPlayhead: boolean = true;
  public snap: SnapGridDivision = '1/16';

  private listeners: Set<() => void> = new Set();

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public notify(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.error('Transport listener error:', err);
      }
    });
  }

  public setStatus(status: TransportStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.notify();
  }

  public setPlayhead(tick: number): void {
    const t = Math.max(0, Math.round(Number(tick) || 0));
    if (this.playheadTick === t) return;
    this.playheadTick = t;
    this.notify();
  }

  public setEditCursor(tick: number): void {
    const t = Math.max(0, Math.round(Number(tick) || 0));
    if (this.editCursorTick === t) return;
    this.editCursorTick = t;
    this.notify();
  }

  public setPlayStart(tick: number): void {
    const t = Math.max(0, Math.round(Number(tick) || 0));
    if (this.playStartTick === t) return;
    this.playStartTick = t;
    this.notify();
  }

  public setTimeSelection(startTick: number, endTick: number, active: boolean = true): void {
    let s = Math.max(0, Math.round(Number(startTick) || 0));
    let e = Math.max(0, Math.round(Number(endTick) || 0));
    if (e < s) [s, e] = [e, s];

    this.timeSelection = {
      startTick: s,
      endTick: e,
      active: active && e > s,
    };
    this.notify();
  }

  public clearTimeSelection(): void {
    if (!this.timeSelection.active) return;
    this.timeSelection = { startTick: 0, endTick: 0, active: false };
    this.notify();
  }

  public setLoopRange(startTick: number, endTick: number, enabled?: boolean): void {
    let s = Math.max(0, Math.round(Number(startTick) || 0));
    let e = Math.max(0, Math.round(Number(endTick) || 0));
    if (e < s) [s, e] = [e, s];
    if (e === s) e = s + 192; // at least 1 bar

    this.loopRange = {
      startTick: s,
      endTick: e,
      active: true,
      enabled: enabled !== undefined ? enabled : this.loopRange.enabled,
      followSong: false,
    };
    this.notify();
  }

  public setLoopEnabled(enabled: boolean): void {
    if (this.loopRange.enabled === enabled) return;
    this.loopRange.enabled = enabled;
    this.notify();
  }

  public setLoopFollowsSong(follow: boolean): void {
    if (this.loopRange.followSong === follow) return;
    this.loopRange.followSong = follow;
    this.notify();
  }

  public setPunchRange(startTick: number, endTick: number, enabled?: boolean): void {
    let s = Math.max(0, Math.round(Number(startTick) || 0));
    let e = Math.max(0, Math.round(Number(endTick) || 0));
    if (e < s) [s, e] = [e, s];

    this.punchRange = {
      ...this.punchRange,
      startTick: s,
      endTick: e,
      active: e > s,
      enabled: enabled !== undefined ? enabled : this.punchRange.enabled,
    };
    this.notify();
  }

  public setPunchEnabled(enabled: boolean): void {
    if (this.punchRange.enabled === enabled) return;
    this.punchRange.enabled = enabled;
    this.notify();
  }

  public setFollowPlayhead(follow: boolean): void {
    if (this.followPlayhead === follow) return;
    this.followPlayhead = follow;
    this.notify();
  }

  public setSnap(snap: SnapGridDivision): void {
    if (this.snap === snap) return;
    this.snap = snap;
    this.notify();
  }

  public setCountIn(bars: number): void {
    this.countInBars = Math.max(0, Math.floor(Number(bars) || 0));
    this.notify();
  }

  public serialize(): unknown {
    return {
      playStartTick: this.playStartTick,
      editCursorTick: this.editCursorTick,
      loopRange: { ...this.loopRange },
      timeSelection: { ...this.timeSelection },
      punchRange: { ...this.punchRange },
      countInBars: this.countInBars,
      followPlayhead: this.followPlayhead,
      snap: this.snap,
    };
  }

  public deserialize(data: unknown): void {
    if (!data || typeof data !== 'object') return;
    const obj = data as Partial<TransportState>;
    if (typeof obj.playStartTick === 'number') this.playStartTick = Math.max(0, obj.playStartTick);
    if (typeof obj.editCursorTick === 'number') this.editCursorTick = Math.max(0, obj.editCursorTick);
    if (obj.loopRange && typeof obj.loopRange === 'object') {
      this.loopRange = {
        startTick: Math.max(0, obj.loopRange.startTick || 0),
        endTick: Math.max(obj.loopRange.startTick || 0, obj.loopRange.endTick || 768),
        active: !!obj.loopRange.active,
        enabled: obj.loopRange.enabled !== false,
        followSong: !!obj.loopRange.followSong,
      };
    }
    if (obj.timeSelection && typeof obj.timeSelection === 'object') {
      this.timeSelection = {
        startTick: Math.max(0, obj.timeSelection.startTick || 0),
        endTick: Math.max(0, obj.timeSelection.endTick || 0),
        active: !!obj.timeSelection.active,
      };
    }
    if (obj.punchRange && typeof obj.punchRange === 'object') {
      this.punchRange = {
        startTick: Math.max(0, obj.punchRange.startTick || 0),
        endTick: Math.max(0, obj.punchRange.endTick || 0),
        active: !!obj.punchRange.active,
        enabled: !!obj.punchRange.enabled,
        preRollBars: obj.punchRange.preRollBars || 0,
        postRollBars: obj.punchRange.postRollBars || 0,
      };
    }
    if (typeof obj.countInBars === 'number') this.countInBars = obj.countInBars;
    if (typeof obj.followPlayhead === 'boolean') this.followPlayhead = obj.followPlayhead;
    if (obj.snap) this.snap = obj.snap;
  }
}

