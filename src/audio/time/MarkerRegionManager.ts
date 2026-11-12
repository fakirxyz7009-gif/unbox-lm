import type { MarkerItem, RegionItem, Timebase } from './types.ts';
import type { ProjectTimeMap } from './ProjectTimeMap.ts';

export class MarkerRegionManager {
  private markers: MarkerItem[] = [];
  private regions: RegionItem[] = [];
  private timeMap: ProjectTimeMap;
  private listeners: Set<() => void> = new Set();

  constructor(timeMap: ProjectTimeMap) {
    this.timeMap = timeMap;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.error('MarkerRegionManager listener error:', e);
      }
    });
  }

  // ---- Markers ----

  public getAllMarkers(): readonly MarkerItem[] {
    return this.markers;
  }

  public addMarker(opts: {
    name: string;
    bar?: number;
    tick?: number;
    color?: string;
    comment?: string;
    timebase?: Timebase;
    id?: string;
  }): MarkerItem {
    let tick = 0;
    let bar = 1;

    if (opts.tick !== undefined) {
      tick = Math.max(0, Math.round(opts.tick));
      bar = this.timeMap.meterMap.tickToBar(tick).bar;
    } else {
      bar = Math.max(1, Math.round(opts.bar || 1));
      tick = this.timeMap.meterMap.barToTick(bar);
    }

    const marker: MarkerItem = {
      id: opts.id || `marker_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: opts.name || `Marker ${this.markers.length + 1}`,
      color: opts.color || '#38bdf8',
      bar,
      tick,
      timebase: opts.timebase || 'musical',
      comment: opts.comment,
    };

    this.markers.push(marker);
    this.markers.sort((a, b) => a.tick - b.tick);
    this.notify();
    return marker;
  }

  public updateMarker(id: string, updates: Partial<Omit<MarkerItem, 'id'>>): boolean {
    const idx = this.markers.findIndex((m) => m.id === id);
    if (idx < 0) return false;

    const m = this.markers[idx];
    if (updates.tick !== undefined) {
      m.tick = Math.max(0, Math.round(updates.tick));
      m.bar = this.timeMap.meterMap.tickToBar(m.tick).bar;
    } else if (updates.bar !== undefined) {
      m.bar = Math.max(1, Math.round(updates.bar));
      m.tick = this.timeMap.meterMap.barToTick(m.bar);
    }

    if (updates.name !== undefined) m.name = updates.name;
    if (updates.color !== undefined) m.color = updates.color;
    if (updates.comment !== undefined) m.comment = updates.comment;
    if (updates.timebase !== undefined) m.timebase = updates.timebase;

    this.markers.sort((a, b) => a.tick - b.tick);
    this.notify();
    return true;
  }

  public removeMarker(id: string): boolean {
    const idx = this.markers.findIndex((m) => m.id === id);
    if (idx < 0) return false;
    this.markers.splice(idx, 1);
    this.notify();
    return true;
  }

  // ---- Regions ----

  public getAllRegions(): readonly RegionItem[] {
    return this.regions;
  }

  public addRegion(opts: {
    name: string;
    startBar: number;
    lengthBars: number;
    color?: string;
    timebase?: Timebase;
    tags?: string[];
    id?: string;
  }): RegionItem {
    const startBar = Math.max(1, Math.round(opts.startBar || 1));
    const lengthBars = Math.max(1, Math.round(opts.lengthBars || 4));

    const startTick = this.timeMap.meterMap.barToTick(startBar);
    const endTick = this.timeMap.meterMap.barToTick(startBar + lengthBars);
    const lengthTicks = endTick - startTick;

    const region: RegionItem = {
      id: opts.id || `region_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: opts.name || 'New Region',
      color: opts.color || '#f59e0b',
      startBar,
      lengthBars,
      startTick,
      lengthTicks,
      timebase: opts.timebase || 'musical',
      tags: opts.tags,
    };

    this.regions.push(region);
    this.regions.sort((a, b) => a.startTick - b.startTick);
    this.notify();
    return region;
  }

  public updateRegion(id: string, updates: Partial<Omit<RegionItem, 'id'>>): boolean {
    const idx = this.regions.findIndex((r) => r.id === id);
    if (idx < 0) return false;

    const r = this.regions[idx];
    if (updates.startBar !== undefined) r.startBar = Math.max(1, Math.round(updates.startBar));
    if (updates.lengthBars !== undefined) r.lengthBars = Math.max(1, Math.round(updates.lengthBars));

    const startTick = this.timeMap.meterMap.barToTick(r.startBar);
    const endTick = this.timeMap.meterMap.barToTick(r.startBar + r.lengthBars);
    r.startTick = startTick;
    r.lengthTicks = endTick - startTick;

    if (updates.name !== undefined) r.name = updates.name;
    if (updates.color !== undefined) r.color = updates.color;
    if (updates.tags !== undefined) r.tags = updates.tags;
    if (updates.timebase !== undefined) r.timebase = updates.timebase;

    this.regions.sort((a, b) => a.startTick - b.startTick);
    this.notify();
    return true;
  }

  public removeRegion(id: string): boolean {
    const idx = this.regions.findIndex((r) => r.id === id);
    if (idx < 0) return false;
    this.regions.splice(idx, 1);
    this.notify();
    return true;
  }

  public getRegionAtBar(bar: number): RegionItem | undefined {
    return this.regions.find((r) => bar >= r.startBar && bar < r.startBar + r.lengthBars);
  }

  // ---- Serialization ----

  public serialize(): unknown {
    return {
      markers: this.markers.map((m) => ({ ...m })),
      regions: this.regions.map((r) => ({ ...r })),
    };
  }

  public deserialize(data: unknown): void {
    if (!data || typeof data !== 'object') return;
    const obj = data as { markers?: MarkerItem[]; regions?: RegionItem[] };
    if (Array.isArray(obj.markers)) {
      this.markers = obj.markers
        .filter((m) => m && typeof m.name === 'string')
        .map((m) => {
          const bar = Math.max(1, Math.round(Number(m.bar) || 1));
          const tick = m.tick !== undefined ? Math.max(0, Math.round(m.tick)) : this.timeMap.meterMap.barToTick(bar);
          return {
            id: m.id || `marker_${Math.random().toString(36).slice(2, 6)}`,
            name: m.name,
            color: m.color || '#38bdf8',
            bar,
            tick,
            timebase: m.timebase || 'musical',
            comment: m.comment,
          };
        });
      this.markers.sort((a, b) => a.tick - b.tick);
    }

    if (Array.isArray(obj.regions)) {
      this.regions = obj.regions
        .filter((r) => r && typeof r.name === 'string')
        .map((r) => {
          const startBar = Math.max(1, Math.round(Number(r.startBar) || 1));
          const lengthBars = Math.max(1, Math.round(Number(r.lengthBars) || 4));
          const startTick = this.timeMap.meterMap.barToTick(startBar);
          const endTick = this.timeMap.meterMap.barToTick(startBar + lengthBars);
          return {
            id: r.id || `region_${Math.random().toString(36).slice(2, 6)}`,
            name: r.name,
            color: r.color || '#f59e0b',
            startBar,
            lengthBars,
            startTick,
            lengthTicks: endTick - startTick,
            timebase: r.timebase || 'musical',
            tags: r.tags,
          };
        });
      this.regions.sort((a, b) => a.startTick - b.startTick);
    }
    this.notify();
  }
}

