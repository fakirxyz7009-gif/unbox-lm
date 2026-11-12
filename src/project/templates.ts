/**
 * Built-in project templates (one per genre): tempo, key, swing, instruments, a starter groove
 * (drums / bass / chords / extra parts), Reverb + Delay returns and a song structure with markers.
 * Everything is generated with the normal engine API, so a template is an ordinary project.
 */
import type { AudioEngine } from '../audio/AudioEngine.ts';
import type { DeviceType, SequencerTrack } from '../audio/types.ts';
import { syncTrackPatterns } from '../audio/sequencer/model.ts';

type DrumRole = 'kick' | 'snare' | 'hatC' | 'hatO' | 'clap' | 'perc';
type Scale = AudioEngine['scaleType'];
type Quality = '' | 'm' | '7' | 'm7' | 'maj7' | 'sus2' | 'sus4' | 'dim' | '5' | 'add9' | 'm9';
type ChordStyle = 'pad' | 'stabs' | 'offbeat' | 'arp' | 'pulse';

export interface GenreTemplate {
  id: string;
  name: string;
  genre: string;
  description: string;
  bpm: number;
  /** 0 = C … 11 = B */
  key: number;
  scale: Scale;
  swing?: number;
  drums?: { type: DeviceType; name?: string; parts: Partial<Record<DrumRole, string>> };
  /** Bass rhythm per bar: r = root, 5 = fifth, o = octave up, - = hold, . = rest. */
  bass?: { type: DeviceType; name?: string; rhythm: string; octave: number };
  /** One chord per bar (root semitones above the key, quality). */
  chords?: { type: DeviceType; name?: string; prog: [number, Quality][]; style: ChordStyle; octave: number; send?: number };
  /** Extra one-note parts (percussion, drones…). */
  extras?: { type: DeviceType; name: string; part: string; note: number; velocity?: number }[];
}

const CHORD: Record<Quality, number[]> = {
  '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], sus2: [0, 2, 7], sus4: [0, 5, 7],
  dim: [0, 3, 6], '5': [0, 7, 12], add9: [0, 4, 7, 14], m9: [0, 3, 7, 10, 14],
};

// minor-key progressions are relative to the tonic of a minor key, major ones to a major key
const MIN_EPIC: [number, Quality][] = [[0, 'm'], [8, ''], [3, ''], [10, '']];
const MIN_SAD: [number, Quality][] = [[0, 'm'], [5, 'm'], [8, ''], [7, '']];
const MIN_TRAP: [number, Quality][] = [[0, 'm'], [0, 'm'], [8, ''], [7, '']];
const MAJ_POP: [number, Quality][] = [[0, ''], [7, ''], [9, 'm'], [5, '']];
const MAJ_SOUL: [number, Quality][] = [[2, 'm7'], [7, '7'], [0, 'maj7'], [9, 'm7']];
const MIN_JAZZ: [number, Quality][] = [[2, 'm7'], [7, '7'], [0, 'm7'], [0, 'm7']];
const MIN_HOUSE: [number, Quality][] = [[0, 'm7'], [5, 'm7'], [10, '7'], [3, 'maj7']];
const MAJ_AFRO: [number, Quality][] = [[0, 'maj7'], [9, 'm7'], [2, 'm7'], [7, '7']];
const MIN_AMAPIANO: [number, Quality][] = [[0, 'm9'], [5, 'm7'], [10, 'add9'], [8, 'maj7']];
const BLUES: [number, Quality][] = [[0, '7'], [5, '7'], [0, '7'], [7, '7']];
const ROCK: [number, Quality][] = [[0, '5'], [10, '5'], [5, '5'], [7, '5']];
const DESI: [number, Quality][] = [[0, 'm'], [10, ''], [8, ''], [10, '']];

export const GENRE_TEMPLATES: GenreTemplate[] = [
  { id: 'hiphop', name: 'Hip-Hop / Boom Bap', genre: 'Hip-hop', description: '90 BPM swung drums, deep bass, dusty keys', bpm: 90, key: 9, scale: 'minor', swing: 0.35,
    drums: { type: 'redrum', parts: { kick: 'x.......x.x.....', snare: '....x.......x...', hatC: 'x.x.x.x.x.x.x.xx', perc: '..........o.....' } },
    bass: { type: 'monotone', rhythm: 'r-......r.r.....', octave: 2 }, chords: { type: 'rec_osiris_piano', name: 'Dusty Piano', prog: MIN_SAD, style: 'stabs', octave: 4, send: 0.25 } },
  { id: 'trap', name: 'Trap', genre: 'Trap', description: '140 BPM half-time, 808 slides, rolling hats', bpm: 140, key: 1, scale: 'minor',
    drums: { type: 'tr08', parts: { kick: 'x.....x...x.....', snare: '........x.......', hatC: 'x.x.x.x.xxx.x.xx', hatO: '..............x.', clap: '........x.......' } },
    bass: { type: 'moog_sub37', name: '808 Bass', rhythm: 'r-----r---r-----', octave: 1 }, chords: { type: 'europa', name: 'Dark Pad', prog: MIN_TRAP, style: 'pad', octave: 4, send: 0.35 } },
  { id: 'drill', name: 'UK / NY Drill', genre: 'Drill', description: '142 BPM sliding 808s, triplet hats, off-beat snares', bpm: 142, key: 6, scale: 'harmonic_minor',
    drums: { type: 'tr08', parts: { kick: 'x.........x..x..', snare: '........x.....x.', hatC: 'x..x..x.x.x..x..', perc: '.....x........x.' } },
    bass: { type: 'moog_sub37', name: '808 Glide', rhythm: 'r-------r-.r----', octave: 1 }, chords: { type: 'humana', name: 'Choir', prog: MIN_SAD, style: 'pad', octave: 4, send: 0.4 } },
  { id: 'rnb', name: 'R&B / Neo-Soul', genre: 'R&B', description: '84 BPM laid-back groove, seventh chords', bpm: 84, key: 3, scale: 'major', swing: 0.25,
    drums: { type: 'redrum', parts: { kick: 'x......x..x.....', snare: '....x.......x...', hatC: 'x.xxx.x.x.xxx.x.', perc: '...o.......o....' } },
    bass: { type: 'monotone', rhythm: 'r.....5.r...o...', octave: 2 }, chords: { type: 'polytone', name: 'Electric Keys', prog: MAJ_SOUL, style: 'stabs', octave: 4, send: 0.3 } },
  { id: 'pop', name: 'Pop', genre: 'Pop', description: '118 BPM four-chord song with a punchy beat', bpm: 118, key: 0, scale: 'major',
    drums: { type: 'tr8s', parts: { kick: 'x...x...x...x...', snare: '....x.......x...', hatC: '..x...x...x...x.', clap: '....x.......x...' } },
    bass: { type: 'monotone', rhythm: 'r.r.r.r.r.r.r.r.', octave: 2 }, chords: { type: 'prophet6', name: 'Pop Synth', prog: MAJ_POP, style: 'pulse', octave: 4, send: 0.25 } },
  { id: 'rock', name: 'Rock', genre: 'Rock', description: '120 BPM straight rock beat, power chords', bpm: 120, key: 4, scale: 'minor',
    drums: { type: 'drm1', name: 'Drums', parts: { kick: 'x.....x.x.......', snare: '....x.......x...', hatC: 'x.x.x.x.x.x.x.x.', hatO: '..............x.' } },
    bass: { type: 'monotone', rhythm: 'r.r.r.r.r.r.r.r.', octave: 2 }, chords: { type: 'rec_meta_steel_guitar', name: 'Steel-string Guitar', prog: ROCK, style: 'pulse', octave: 3, send: 0.15 } },
  { id: 'metal', name: 'Metal', genre: 'Metal', description: '160 BPM double kick, driving fifths', bpm: 160, key: 4, scale: 'phrygian',
    drums: { type: 'drm1', name: 'Drums', parts: { kick: 'xxxxxxxxxxxxxxxx', snare: '....x.......x...', hatC: 'x...x...x...x...' } },
    bass: { type: 'moog_sub37', rhythm: 'rrrrrrrrrrrrrrrr', octave: 1 }, chords: { type: 'pangea', name: 'Riff', prog: [[0, '5'], [1, '5'], [0, '5'], [3, '5']], style: 'pulse', octave: 3 } },
  { id: 'edm', name: 'EDM / Big Room', genre: 'EDM', description: '128 BPM four-on-the-floor, supersaw chords', bpm: 128, key: 5, scale: 'minor',
    drums: { type: 'tr8s', parts: { kick: 'x...x...x...x...', clap: '....x.......x...', hatO: '..x...x...x...x.', hatC: 'xxxxxxxxxxxxxxxx' } },
    bass: { type: 'moog_sub37', rhythm: '..r...r...r...r.', octave: 2 }, chords: { type: 'nord_lead4', name: 'Supersaw', prog: MIN_EPIC, style: 'offbeat', octave: 4, send: 0.3 } },
  { id: 'house', name: 'House', genre: 'House', description: '124 BPM deep house groove, minor sevenths', bpm: 124, key: 2, scale: 'minor', swing: 0.15,
    drums: { type: 'tr8s', parts: { kick: 'x...x...x...x...', clap: '....x.......x...', hatO: '..x...x...x...x.', hatC: 'x.xxx.xxx.xxx.xx' } },
    bass: { type: 'monotone', rhythm: '..r..r..r.r..r..', octave: 2 }, chords: { type: 'juno_x', name: 'Deep Chords', prog: MIN_HOUSE, style: 'stabs', octave: 4, send: 0.35 } },
  { id: 'techno', name: 'Techno', genre: 'Techno', description: '130 BPM driving kick, rumble and stabs', bpm: 130, key: 9, scale: 'phrygian',
    drums: { type: 'tr8s', parts: { kick: 'x...x...x...x...', hatO: '..x...x...x...x.', hatC: 'xxxxxxxxxxxxxxxx', clap: '....x.......x...', perc: '...x.....x...x..' } },
    bass: { type: 'moog_sub37', rhythm: '.r.r.r.r.r.r.r.r', octave: 1 }, chords: { type: 'novation_peak', name: 'Stab', prog: [[0, 'm'], [0, 'm'], [1, ''], [0, 'm']], style: 'stabs', octave: 4, send: 0.4 } },
  { id: 'trance', name: 'Trance', genre: 'Trance', description: '138 BPM rolling bass, uplifting arps', bpm: 138, key: 7, scale: 'minor',
    drums: { type: 'tr8s', parts: { kick: 'x...x...x...x...', hatO: '..x...x...x...x.', clap: '....x.......x...' } },
    bass: { type: 'moog_sub37', rhythm: '.rrr.rrr.rrr.rrr', octave: 2 }, chords: { type: 'waldorf_iridium', name: 'Trance Arp', prog: MIN_EPIC, style: 'arp', octave: 4, send: 0.35 } },
  { id: 'dubstep', name: 'Dubstep', genre: 'Dubstep', description: '140 BPM half-time with heavy sub', bpm: 140, key: 5, scale: 'minor',
    drums: { type: 'tr8s', parts: { kick: 'x.........x.....', snare: '........x.......', hatC: 'x.x.x.x.x.x.x.x.' } },
    bass: { type: 'novation_peak', name: 'Wobble', rhythm: 'r-r-r-..r-r-rr..', octave: 1 }, chords: { type: 'europa', prog: MIN_SAD, style: 'pad', octave: 4, send: 0.35 } },
  { id: 'dnb', name: 'Drum & Bass', genre: 'Drum & Bass', description: '174 BPM two-step breaks and reese bass', bpm: 174, key: 5, scale: 'minor',
    drums: { type: 'tr8s', parts: { kick: 'x.........x.....', snare: '....x.......x...', hatC: 'x.x.x.x.x.x.x.x.', perc: '.......x.....x..' } },
    bass: { type: 'novation_peak', name: 'Reese', rhythm: 'r-------r---r---', octave: 1 }, chords: { type: 'europa', prog: MIN_EPIC, style: 'pad', octave: 4, send: 0.35 } },
  { id: 'garage', name: 'UK Garage', genre: 'Garage', description: '132 BPM shuffled two-step', bpm: 132, key: 10, scale: 'minor', swing: 0.4,
    drums: { type: 'tr8s', parts: { kick: 'x......x..x.....', snare: '....x.......x...', hatC: '..x...x...x...x.', perc: '.x...x...x...x..' } },
    bass: { type: 'moog_sub37', rhythm: 'r..r..r...r..r..', octave: 2 }, chords: { type: 'juno_x', prog: MIN_HOUSE, style: 'stabs', octave: 4, send: 0.3 } },
  { id: 'lofi', name: 'Lo-fi Hip-Hop', genre: 'Lo-fi', description: '80 BPM lazy swing, jazzy keys', bpm: 80, key: 5, scale: 'major', swing: 0.45,
    drums: { type: 'redrum', parts: { kick: 'x......x..x.....', snare: '....x.......x...', hatC: 'x.x.x.x.x.x.x.x.' } },
    bass: { type: 'monotone', rhythm: 'r.....5...r.....', octave: 2 }, chords: { type: 'rec_osiris_piano', name: 'Lo-fi Piano', prog: MAJ_SOUL, style: 'stabs', octave: 4, send: 0.4 } },
  { id: 'afrobeats', name: 'Afrobeats', genre: 'Afrobeats', description: '105 BPM syncopated percussion and bright chords', bpm: 105, key: 7, scale: 'major',
    drums: { type: 'kong', name: 'Afro Kit', parts: { kick: 'x..x..x.x..x..x.', snare: '...x..x....x..x.', hatC: 'x.xxx.xxx.xxx.xx', perc: '..x..x.x..x..x.x' } },
    bass: { type: 'monotone', rhythm: 'r..r..5.r..r....', octave: 2 }, chords: { type: 'rec_meta_nylon_guitar', name: 'Nylon Guitar Lick', prog: MAJ_AFRO, style: 'offbeat', octave: 4, send: 0.2 } },
  { id: 'amapiano', name: 'Amapiano', genre: 'Amapiano', description: '112 BPM log-drum bass, shakers and jazzy chords', bpm: 112, key: 0, scale: 'minor',
    drums: { type: 'kong', name: 'Amapiano Kit', parts: { kick: 'x...x...x...x...', hatC: 'xxxxxxxxxxxxxxxx', clap: '........x.......', perc: '.x..x..x..x..x..' } },
    bass: { type: 'moog_sub37', name: 'Log Drum', rhythm: '...r..r....r.r..', octave: 2 }, chords: { type: 'rec_meta_piano', name: 'Recorded Piano', prog: MIN_AMAPIANO, style: 'stabs', octave: 4, send: 0.3 } },
  { id: 'reggaeton', name: 'Reggaeton / Dembow', genre: 'Reggaeton', description: '95 BPM dembow rhythm', bpm: 95, key: 9, scale: 'minor',
    drums: { type: 'tr08', parts: { kick: 'x...x...x...x...', snare: '...x..x....x..x.', hatC: 'x.x.x.x.x.x.x.x.' } },
    bass: { type: 'moog_sub37', rhythm: 'r...r...r...r...', octave: 1 }, chords: { type: 'prophet6', prog: MIN_EPIC, style: 'offbeat', octave: 4, send: 0.25 } },
  { id: 'reggae', name: 'Reggae (One Drop)', genre: 'Reggae', description: '75 BPM one-drop, skank chords', bpm: 75, key: 7, scale: 'major',
    drums: { type: 'redrum', parts: { kick: '........x.......', snare: '........x.......', hatC: 'x.x.x.x.x.x.x.x.' } },
    bass: { type: 'monotone', rhythm: 'r..r....5.r.....', octave: 2 }, chords: { type: 'polytone', name: 'Skank Organ', prog: MAJ_POP, style: 'offbeat', octave: 4, send: 0.3 } },
  { id: 'dancehall', name: 'Dancehall', genre: 'Dancehall', description: '100 BPM bashment groove', bpm: 100, key: 2, scale: 'minor',
    drums: { type: 'tr08', parts: { kick: 'x..x..x.x..x..x.', snare: '....x.......x...', hatC: 'x.x.x.x.x.x.x.x.' } },
    bass: { type: 'moog_sub37', rhythm: 'r..r..r...r..r..', octave: 1 }, chords: { type: 'prophet6', prog: MIN_TRAP, style: 'stabs', octave: 4, send: 0.25 } },
  { id: 'bollywood', name: 'Bollywood', genre: 'Bollywood', description: '96 BPM filmi groove: tabla, strings, harmonium', bpm: 96, key: 2, scale: 'harmonic_minor',
    drums: { type: 'redrum', parts: { kick: 'x.....x...x.....', snare: '....x.......x...', hatC: 'x.x.x.x.x.x.x.x.' } },
    bass: { type: 'monotone', rhythm: 'r...5...r...5...', octave: 2 }, chords: { type: 'friktion', name: 'Strings', prog: DESI, style: 'pad', octave: 4, send: 0.4 },
    extras: [{ type: 'rec_tabla_dholak', name: 'Tabla', part: 'x..x.x..x..x.x.x', note: 60 }, { type: 'rec_harmonium', name: 'Harmonium', part: 'x...............', note: 62 }] },
  { id: 'bhangra', name: 'Bhangra / Punjabi', genre: 'Bhangra', description: '100 BPM dhol chaal, tumbi riff', bpm: 100, key: 0, scale: 'minor',
    drums: { type: 'redrum', parts: { kick: 'x.....x.x.......', snare: '....x.......x...', hatC: 'x.x.x.x.x.x.x.x.' } },
    bass: { type: 'monotone', rhythm: 'r.....r.r...5...', octave: 2 }, chords: { type: 'rec_harmonium', name: 'Harmonium', prog: DESI, style: 'pad', octave: 4, send: 0.25 },
    extras: [{ type: 'rec_tabla_dholak', name: 'Dholak Bass', part: 'x..x..x.x..x..x.', note: 41 }, { type: 'tumbi', name: 'Tumbi', part: 'x.x...x.x.x...x.', note: 72 }] },
  { id: 'desi', name: 'Desi Hip-Hop', genre: 'Desi', description: '92 BPM boom bap with sitar-style hook and tabla', bpm: 92, key: 4, scale: 'bhairav', swing: 0.2,
    drums: { type: 'tr08', parts: { kick: 'x.......x.x.....', snare: '....x.......x...', hatC: 'x.x.x.x.x.x.x.x.' } },
    bass: { type: 'moog_sub37', rhythm: 'r-......r.r.....', octave: 1 }, chords: { type: 'pangea', name: 'Sitar-style', prog: DESI, style: 'arp', octave: 4, send: 0.25 },
    extras: [{ type: 'rec_tabla_dholak', name: 'Tabla', part: 'x..x..x...x..x..', note: 60 }] },
  { id: 'classical', name: 'Classical / Chamber', genre: 'Classical', description: '100 BPM piano and strings, no drums', bpm: 100, key: 0, scale: 'major',
    bass: { type: 'rec_vsco_cello_section', name: 'Cello Section', rhythm: 'r-------5-------', octave: 2 }, chords: { type: 'rec_meta_piano', name: 'Grand Piano', prog: MAJ_POP, style: 'arp', octave: 4, send: 0.35 } },
  { id: 'cinematic', name: 'Cinematic / Score', genre: 'Cinematic', description: '90 BPM epic strings, choir and taiko-style hits', bpm: 90, key: 2, scale: 'minor',
    drums: { type: 'kong', name: 'Epic Drums', parts: { kick: 'x.....x.x.......', perc: '..x.....x.x...x.' } },
    bass: { type: 'friktion', name: 'Low Strings', rhythm: 'r-r-r-r-r-r-r-r-', octave: 2 }, chords: { type: 'humana', name: 'Choir', prog: MIN_EPIC, style: 'pad', octave: 4, send: 0.5 } },
  { id: 'synthwave', name: 'Synthwave / 80s Wavetable', genre: 'Synthwave', description: '105 BPM analog drums, rolling bass, 3rd Wave vintage wavetable chords', bpm: 105, key: 9, scale: 'minor',
    drums: { type: 'tr8s', parts: { kick: 'x...x...x...x...', snare: '....x.......x...', hatC: 'x.x.x.x.x.x.x.x.', clap: '....x.......x...' } },
    bass: { type: 'moog_sub37', name: 'Analog Bass', rhythm: 'r.r.r.r.r.r.r.r.', octave: 2 }, chords: { type: 'third_wave', name: '3rd Wave Synth', prog: MIN_EPIC, style: 'pulse', octave: 4, send: 0.35 } },
  { id: 'ambient', name: 'Ambient', genre: 'Ambient', description: '70 BPM evolving pads and bells', bpm: 70, key: 4, scale: 'major',
    chords: { type: 'europa', name: 'Evolving Pad', prog: [[0, 'add9'], [9, 'm7'], [5, 'maj7'], [7, 'sus2']], style: 'pad', octave: 4, send: 0.6 },
    extras: [{ type: 'klang', name: 'Bells', part: 'x.......x...x...', note: 76, velocity: 0.5 }] },
  { id: 'jazz', name: 'Jazz Trio', genre: 'Jazz', description: '120 BPM swing ride, walking bass, ii–V–i', bpm: 120, key: 10, scale: 'dorian', swing: 0.55,
    drums: { type: 'redrum', parts: { hatC: 'x..xx..xx..xx..x', kick: 'x...............', snare: '..........o.....' } },
    bass: { type: 'rec_growlybass', name: 'Walking Bass', rhythm: 'r...5...o...5...', octave: 2 }, chords: { type: 'rec_osiris_piano', name: 'Studio Piano', prog: MIN_JAZZ, style: 'stabs', octave: 4, send: 0.3 } },
  { id: 'blues', name: 'Blues Shuffle', genre: 'Blues', description: '90 BPM shuffle with dominant sevenths', bpm: 90, key: 4, scale: 'minor', swing: 0.6,
    drums: { type: 'redrum', parts: { kick: 'x.......x.......', snare: '....x.......x...', hatC: 'x.xx.xx.xx.xx.xx' } },
    bass: { type: 'monotone', rhythm: 'r.5.o.5.r.5.o.5.', octave: 2 }, chords: { type: 'polytone', name: 'Organ', prog: BLUES, style: 'stabs', octave: 4, send: 0.25 } },
  { id: 'country', name: 'Country', genre: 'Country', description: '110 BPM train beat, open chords', bpm: 110, key: 7, scale: 'major',
    drums: { type: 'redrum', parts: { kick: 'x.......x.......', snare: '....x.......x...', hatC: 'xxxxxxxxxxxxxxxx' } },
    bass: { type: 'rec_growlybass', rhythm: 'r...5...r...5...', octave: 2 }, chords: { type: 'rec_meta_steel_guitar', name: 'Acoustic Strum', prog: MAJ_POP, style: 'pulse', octave: 3, send: 0.2 } },
  { id: 'folk', name: 'Folk', genre: 'Folk', description: '100 BPM acoustic strum and soft percussion', bpm: 100, key: 2, scale: 'major',
    drums: { type: 'kong', name: 'Hand Percussion', parts: { kick: 'x.......x.......', perc: '..x...x...x...x.' } },
    bass: { type: 'rec_vsco_contrabass', name: 'Upright Bass', rhythm: 'r.......5.......', octave: 2 }, chords: { type: 'rec_meta_steel_guitar', name: 'Acoustic Strum', prog: MAJ_POP, style: 'pulse', octave: 3, send: 0.25 } },
  { id: 'experimental', name: 'Experimental', genre: 'Experimental', description: '110 BPM west-coast synth textures, broken beat', bpm: 110, key: 1, scale: 'phrygian',
    drums: { type: 'perkons', name: 'Perkons', parts: { kick: 'x..x...x..x.....', snare: '.....x.......x..', perc: 'x.xx..x.x..xx.x.' } },
    bass: { type: 'make_noise_shared', name: 'West Coast', rhythm: 'r..r.5..r..o....', octave: 2 }, chords: { type: 'scenic', prog: [[0, 'sus2'], [1, ''], [6, 'dim'], [0, 'sus4']], style: 'arp', octave: 4, send: 0.45 } },
];

const STYLE_RHYTHM: Record<ChordStyle, string> = {
  pad: 'x---------------',
  stabs: 'x.....x...x.....',
  offbeat: '..x...x...x...x.',
  pulse: 'x.x.x.x.x.x.x.x.',
  arp: 'xxxxxxxxxxxxxxxx',
};

/** Writes a 4-bar (64-step) pattern on the track. */
function writePattern(engine: AudioEngine, track: SequencerTrack, fill: (step: number, bar: number, inBar: number) => { note: number; velocity: number; length: number; chordNotes?: number[] } | null): void {
  const p = syncTrackPatterns(track, engine.activePatternIndex);
  engine.sequencer.setPatternLength(track.id, p.id, 64, false);
  const q = syncTrackPatterns(track, engine.activePatternIndex);
  for (let i = 0; i < 64; i++) q.steps[i] = fill(i, Math.floor(i / 16), i % 16);
  track.steps = q.steps;
}

const hit = (part: string | undefined, i: number): 'x' | 'X' | 'o' | null => {
  if (!part) return null;
  const ch = part[i % part.length];
  return ch === 'x' || ch === 'X' || ch === 'o' ? ch : null;
};
const vel = (h: 'x' | 'X' | 'o') => (h === 'X' ? 1 : h === 'o' ? 0.45 : 0.85);

/** Builds the template into the (already cleared) engine. */
export function applyTemplate(engine: AudioEngine, t: GenreTemplate): void {
  engine.setBpm(t.bpm);
  engine.rootKey = t.key;
  engine.scaleType = t.scale;
  engine.globalSwing = t.swing ?? 0;
  const tonic = t.key;
  const made: { track: SequencerTrack; sections: ('intro' | 'verse' | 'chorus' | 'outro')[] }[] = [];
  const add = (type: DeviceType, name: string) => {
    const dev = engine.createDevice(type, name);
    const track = engine.tracks.find((x) => x.deviceId === dev.id)!;
    return { dev, track };
  };

  if (t.drums) {
    const { dev, track } = add(t.drums.type, t.drums.name ?? 'Drums');
    const roles = Object.keys(t.drums.parts) as DrumRole[];
    writePattern(engine, track, (i) => {
      const notes = roles.flatMap((r) => {
        const h = hit(t.drums!.parts[r], i);
        return h ? [{ note: engine.drumNoteFor(dev, r), velocity: vel(h) }] : [];
      });
      if (!notes.length) return null;
      return { note: notes[0].note, velocity: notes[0].velocity, length: 1, chordNotes: notes.slice(1).map((n) => n.note) };
    });
    made.push({ track, sections: ['verse', 'chorus', 'outro'] });
  }
  if (t.bass) {
    const { track } = add(t.bass.type, t.bass.name ?? 'Bass');
    const prog = t.chords?.prog ?? [[0, 'm'] as [number, Quality]];
    writePattern(engine, track, (i, bar, inBar) => {
      const ch = t.bass!.rhythm[inBar];
      if (!ch || ch === '.' || ch === '-') return null;
      let len = 1;
      while (inBar + len < 16 && t.bass!.rhythm[inBar + len] === '-') len++;
      const root = 12 * (t.bass!.octave + 1) + tonic + prog[bar % prog.length][0];
      const note = ch === '5' ? root + 7 : ch === 'o' ? root + 12 : root;
      return { note, velocity: 0.9, length: len };
    });
    made.push({ track, sections: ['verse', 'chorus'] });
  }
  if (t.chords) {
    const c = t.chords;
    const { track } = add(c.type, c.name ?? 'Chords');
    const rhythm = STYLE_RHYTHM[c.style];
    writePattern(engine, track, (i, bar, inBar) => {
      const ch = rhythm[inBar];
      if (ch !== 'x') return null;
      let len = 1;
      while (inBar + len < 16 && rhythm[inBar + len] === '-') len++;
      if (c.style === 'stabs' || c.style === 'offbeat') len = 2;
      const [deg, qual] = c.prog[bar % c.prog.length];
      const root = 12 * (c.octave + 1) + tonic + deg;
      const tones = CHORD[qual].map((x) => root + x);
      if (c.style === 'arp') return { note: tones[inBar % tones.length] + (inBar % 8 >= tones.length * 2 ? 12 : 0), velocity: 0.7, length: 1 };
      return { note: tones[0], velocity: 0.72, length: len, chordNotes: tones.slice(1) };
    });
    const reverb = engine.mixer.buses().find((b) => b.channel.name === 'Reverb');
    if (reverb && c.send) engine.mixer.setSend(track.deviceId, reverb.id, c.send);
    made.push({ track, sections: ['intro', 'verse', 'chorus', 'outro'] });
  }
  for (const x of t.extras ?? []) {
    const { track } = add(x.type, x.name);
    writePattern(engine, track, (i) => {
      const h = hit(x.part, i);
      return h ? { note: x.note, velocity: x.velocity ?? vel(h), length: 1 } : null;
    });
    made.push({ track, sections: ['verse', 'chorus'] });
  }

  // Song: Intro 4 · Verse 8 · Chorus 8 · Outro 4 bars
  const sections = { intro: [0, 4], verse: [4, 8], chorus: [12, 8], outro: [20, 4] } as const;
  engine.arrangementMarkers = [];
  engine.sequencer.addMarker(0, 'Intro', false);
  engine.sequencer.addMarker(4, 'Verse', false);
  engine.sequencer.addMarker(12, 'Chorus', false);
  engine.sequencer.addMarker(20, 'Outro', false);
  for (const m of made) {
    m.track.arrangementClips = [];
    for (const s of m.sections) {
      const [start, len] = sections[s];
      engine.sequencer.addPatternClip(m.track.id, start, { lengthBars: len, patternId: m.track.activePatternId }, false);
    }
  }
  engine.setLoopLocators(0, 24);
  engine.setLoopFollowsSong(true);
  engine.setPlaybackMode('song_arrangement');
}
