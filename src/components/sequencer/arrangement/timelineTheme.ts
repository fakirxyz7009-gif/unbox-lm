/** Colours of the arrangement timeline: the dark editor and the light Workstation sequencer. */
export interface TimelinePalette {
  root: string;
  toolbar: string;
  rulerBg: string;
  rulerLoopBand: string;
  rulerMarkerBand: string;
  rulerMajor: string;
  rulerMinor: string;
  rulerText: string;
  rulerBeat: string;
  rulerLetter: string;
  markerText: string;
  headerBg: string;
  headerActive: string;
  headerBorder: string;
  headerText: string;
  laneA: string;
  laneB: string;
  laneBorder: string;
  grid: [string, string, string];
  clipInk: string;
  clipBody: (color: string) => string;
  clipBorder: (color: string) => string;
  clipBar: (color: string) => string;
  clipBarInk: string;
  muted: string;
  loopShade: string;
  addRow: string;
}

export const DARK_TIMELINE: TimelinePalette = {
  root: '#100e0b',
  toolbar: '#1b1712',
  rulerBg: '#0f0d0a',
  rulerLoopBand: '#251c12',
  rulerMarkerBand: '#1b150f',
  rulerMajor: '#88775d',
  rulerMinor: '#3b3226',
  rulerText: '#d8cbb6',
  rulerBeat: '#2e271d',
  rulerLetter: '#17110b',
  markerText: '#f0e2cc',
  headerBg: '#19150f',
  headerActive: '#302515',
  headerBorder: '#453625',
  headerText: '#ffffff',
  laneA: '#15120e',
  laneB: '#110f0c',
  laneBorder: 'rgba(99,78,52,0.72)',
  grid: ['rgba(208,184,145,0.34)', 'rgba(208,184,145,0.18)', 'rgba(208,184,145,0.07)'],
  clipInk: '',
  clipBody: (c) => `linear-gradient(180deg, ${c}55, ${c}30)`,
  clipBorder: (c) => c,
  clipBar: (c) => `${c}cc`,
  clipBarInk: '#17110b',
  muted: 'repeating-linear-gradient(45deg,#504333 0 6px,#30271c 6px 12px)',
  loopShade: 'rgba(214,163,88,0.08)',
  addRow: '#0d0b09',
};

/** Light sequencer from the Workstation mockup: grey lanes, grey clips with dark note lines. */
export const LIGHT_TIMELINE: TimelinePalette = {
  root: '#e4dfd5',
  toolbar: '#d8d1c5',
  rulerBg: '#f3efe7',
  rulerLoopBand: '#eee3d1',
  rulerMarkerBand: '#e5ddd0',
  rulerMajor: '#7c7160',
  rulerMinor: '#c7beaf',
  rulerText: '#373027',
  rulerBeat: '#bdb3a2',
  rulerLetter: '#fbf8f1',
  markerText: '#30271d',
  headerBg: '#ddd6c9',
  headerActive: '#f3eee5',
  headerBorder: '#b9ae9d',
  headerText: '#28231c',
  laneA: '#f1eee7',
  laneB: '#e9e4da',
  laneBorder: '#c9c0b2',
  grid: ['rgba(74,62,45,0.30)', 'rgba(74,62,45,0.16)', 'rgba(74,62,45,0.07)'],
  clipInk: '#2b3036',
  clipBody: () => 'linear-gradient(180deg, #d9dce0, #cdd1d6)',
  clipBorder: () => '#8f959c',
  clipBar: () => 'linear-gradient(180deg, #9aa0a7, #868c94)',
  clipBarInk: '#ffffff',
  muted: 'repeating-linear-gradient(45deg,#c9c1b3 0 6px,#e4dfd6 6px 12px)',
  loopShade: 'rgba(177,127,55,0.08)',
  addRow: '#ded8cd',
};
