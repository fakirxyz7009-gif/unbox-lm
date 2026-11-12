/**
 * App sections for the command search ("GO TO …") and main-menu navigation. The ViewIds map onto the
 * three workspace tabs (App `goSection`); PageIds are the full-screen pages rendered by StudioPages.
 */
import type { LucideIcon } from 'lucide-react';
import { AudioLines, Boxes, Cable, Disc3, Download, Drum, Gauge, FolderOpen, Home, KeyRound, LayoutGrid, ListMusic, Music, Piano, Settings, SlidersHorizontal, Sparkles } from 'lucide-react';

export type ViewId = 'studio' | 'sequencer' | 'mixer' | 'rack';
export type PageId =
  | 'projects'
  | 'instruments'
  | 'drums'
  | 'synths'
  | 'sampler'
  | 'effects'
  | 'patchbay'
  | 'export'
  | 'meters'
  | 'mastering'
  | 'settings';

export type SectionId = ViewId | PageId | 'arrange' | 'midi';

export interface Section {
  id: SectionId;
  label: string;
  icon: LucideIcon;
  /** Divider before this item. */
  group?: boolean;
}

export const SECTIONS: Section[] = [
  { id: 'studio', label: 'Home', icon: Home },
  { id: 'projects', label: 'Projects', icon: FolderOpen },
  { id: 'arrange', label: 'Arrange', icon: LayoutGrid, group: true },
  { id: 'midi', label: 'MIDI / Piano Roll', icon: Piano },
  { id: 'sequencer', label: 'Step Sequencer', icon: ListMusic },
  { id: 'mixer', label: 'Mixer', icon: SlidersHorizontal },
  { id: 'rack', label: 'Rack', icon: Boxes },
  { id: 'instruments', label: 'Instruments', icon: Music, group: true },
  { id: 'drums', label: 'Drums', icon: Drum },
  { id: 'synths', label: 'Synths', icon: KeyRound },
  { id: 'sampler', label: 'Samplers', icon: AudioLines },
  { id: 'effects', label: 'Effects', icon: Sparkles },
  { id: 'patchbay', label: 'Patchbay / Routing', icon: Cable },
  { id: 'meters', label: 'Meters', icon: Gauge, group: true },
  { id: 'mastering', label: 'Mastering', icon: Disc3 },
  { id: 'export', label: 'Export', icon: Download },
  { id: 'settings', label: 'Settings', icon: Settings, group: true },
];

export const PAGE_IDS: PageId[] = ['projects', 'instruments', 'drums', 'synths', 'sampler', 'effects', 'patchbay', 'export', 'meters', 'mastering', 'settings'];
export const isPage = (id: string): id is PageId => (PAGE_IDS as string[]).includes(id);
