/** Colours of the arrangement timeline: the dark editor and the graphite Workstation sequencer. */
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

/** Workstation sequencer: graphite lanes with neutral ink. */
export const LIGHT_TIMELINE: TimelinePalette = {
  root: '#14171a',
  toolbar: '#1b1f23',
  rulerBg: '#101316',
  rulerLoopBand: '#2a2318',
  rulerMarkerBand: '#1a1e22',
  rulerMajor: '#7d858e',
  rulerMinor: '#343a40',
  rulerText: '#d5d9de',
  rulerBeat: '#23282d',
  rulerLetter: '#101316',
  markerText: '#f0ede6',
  headerBg: '#1b1f23',
  headerActive: '#2c3137',
  headerBorder: '#3a4047',
  headerText: '#e8e5df',
  laneA: '#181c20',
  laneB: '#15181b',
  laneBorder: '#2f343a',
  grid: ['rgba(200,205,212,0.14)', 'rgba(200,205,212,0.07)', 'rgba(200,205,212,0.03)'],
  clipInk: '#f0ede6',
  clipBody: (c) => `linear-gradient(180deg, ${c}55, ${c}2e)`,
  clipBorder: (c) => c,
  clipBar: (c) => `${c}cc`,
  clipBarInk: '#171a1d',
  muted: 'repeating-linear-gradient(45deg,#3a3f45 0 6px,#24282d 6px 12px)',
  loopShade: 'rgba(201,160,108,0.08)',
  addRow: '#1a1e22',
};
