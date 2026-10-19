import React, { useState } from 'react';
import { AudioEngine } from '../audio/AudioEngine.ts';
import { DeviceType, WorkspaceViewMode, InternalOptionCategory } from '../audio/types.ts';
import { Knob } from './Knob.tsx';
import { VUMeter } from './VUMeter.tsx';
import { UnboxedLogoIcon } from './UnboxedLogoIcon.tsx';
import {
  Play,
  Square,
  Circle,
  RotateCcw,
  Sparkles,
  Sliders,
  Plus,
  Layers,
  ChevronDown,
  Volume2,
  Clock,
  Cable,
  Wand2,
  SplitSquareVertical,
  Columns,
  LayoutGrid,
  Rewind,
  FastForward,
  Repeat,
  Cpu,
  Save,
  Keyboard,
} from 'lucide-react';

interface HeaderTransportProps {
  audioEngine: AudioEngine;
  isBackView: boolean;
  onToggleBackView: () => void;
  onOpenAICoPilot: () => void;
  onOpenCVMatrix: () => void;
  onOpenInternalInspector?: (category: InternalOptionCategory) => void;
  onOpenShortcuts?: () => void;
  onAddDevice: (type: DeviceType, customName?: string) => void;
  onAutoPatchMaster: () => void;
  activeViewMode: WorkspaceViewMode;
  onViewModeChange: (mode: WorkspaceViewMode) => void;
  isParallelView: boolean;
  onToggleParallelView: () => void;
}

export const HeaderTransport: React.FC<HeaderTransportProps> = ({
  audioEngine,
  isBackView,
  onToggleBackView,
  onOpenAICoPilot,
  onOpenCVMatrix,
  onOpenInternalInspector,
  onOpenShortcuts,
  onAddDevice,
  onAutoPatchMaster,
  activeViewMode,
  onViewModeChange,
  isParallelView,
  onToggleParallelView,
}) => {
  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false);
  const [masterVol, setMasterVol] = useState(0.9);
  const [bpm, setBpm] = useState(audioEngine.bpm);

  const t = audioEngine.telemetry;
  const bar = (audioEngine.currentSongBar || 0) + 1;
  const beat = (Math.floor(t.currentStep / 4) % 4) + 1;
  const sixteenth = (t.currentStep % 4) + 1;

  const handleBpmChange = (newBpm: number) => {
    setBpm(newBpm);
    audioEngine.setBpm(newBpm);
  };

  const handleMasterVolChange = (v: number) => {
    setMasterVol(v);
    audioEngine.masterGain.gain.setValueAtTime(v, audioEngine.ctx.currentTime);
  };

  const deviceCategories: { label: string; badge: string; color: string; items: { type: DeviceType; name: string; desc: string; u: number }[] }[] = [
    {
      label: '🎹 Reason Rack Instruments & Synthesizers',
      badge: 'SYNTHS & KEYS',
      color: 'border-emerald-500/40 text-emerald-400',
      items: [
        { type: 'europa', name: 'Europa: Shapeshifting Wavetable Synth', desc: '3-engine spectral wavetable & harmonic modifier synth', u: 3 },
        { type: 'thor', name: 'Thor: Polysonic Synthesizer', desc: 'Semi-modular triple-oscillator polysonic powerhouse', u: 3 },
        { type: 'malstrom', name: 'Malström: Graintable Synthesizer', desc: 'Dual graintable engine with wave-shaper & dual filters', u: 3 },
        { type: 'subtractor', name: 'Subtractor: Analog Modeling Synth', desc: 'Dual-oscillator phase-diff subtractive lead & bass synth', u: 2 },
        { type: 'algoritm', name: 'Algoritm: 9-Slot FM Synthesizer', desc: '9-slot programmable FM operators, filters & wave-shapers', u: 3 },
        { type: 'complex1', name: 'Complex-1: Modular Synthesizer', desc: 'West-Coast wavefolder, lowpass gate & patchable modular synth', u: 3 },
        { type: 'parsec2', name: 'Parsec 2: Spectral Synthesizer', desc: 'Dual 512-partial additive spectral generator & formant filter', u: 3 },
        { type: 'polytone', name: 'Polytone: Dual-Layer Synthesizer', desc: 'Dual-layer vintage analog morphing polysynth with age drift', u: 2 },
        { type: 'monotone', name: 'Monotone: Bass Synthesizer', desc: 'Punchy monophonic 24dB ladder filter bass synth', u: 1 },
        { type: 'objekt', name: 'Objekt: Physical Modeling Synth', desc: 'Exciter + 3 modal acoustic resonators (Bell, Plate, String)', u: 3 },
        { type: 'grain', name: 'Grain: Sample Manipulator / Granular Synth', desc: 'Spectral & long-grain cloud synthesizer with jitter & spray', u: 3 },
        { type: 'friktion', name: 'Friktion: Modeled Strings', desc: 'Physical modeling bowed strings (Violin, Viola, Cello, Bass)', u: 3 },
        { type: 'scenic', name: 'Scenic: Hybrid Instrument', desc: 'Dual-engine cinematic atmospheric hybrid synth & shimmer', u: 3 },
        { type: 'humana', name: 'Humana: Vocal Ensemble Instrument', desc: 'Cathedral choir & soloist vocal ensemble formant instrument', u: 2 },
        { type: 'pangea', name: 'Pangea: World Instrument', desc: 'Multi-sampled world plucked & wind instruments (Saz, Oud, Duduk)', u: 2 },
        { type: 'klang', name: 'Klang: Tuned Percussion', desc: 'Glockenspiel, Kalimba, Music Box & singing wine glass percussion', u: 2 },
        { type: 'radical_piano', name: 'Radical Piano / Radical Keys', desc: 'Acoustic Grand, Upright, Suitcase Rhodes & Wurlitzer pianos', u: 3 },
        { type: 'reason_performance', name: 'Reason Drum Kits / Reason Electric Bass', desc: 'Multi-mic sampled studio drum kits & precision electric bass', u: 2 },
        { type: 'layers_id8', name: 'Layers / ID8: Sample Players & Toolbox', desc: 'Quad-wave vintage synth stack & songwriter instrument toolbox', u: 2 },
        { type: 'wyvern', name: 'Wyvern Synthesizer Module', desc: 'Stock virtual dual-wavetable, FM & comb-resonator dragon synth', u: 3 },
        { type: 'ember', name: 'Ember Synthesizer Module', desc: 'Stock virtual thermal-drift, formant & tube-saturation synth', u: 3 },
        { type: 'three_osc', name: '3x OSC Power Synth', desc: 'Triple oscillator synth with detune, shape & fat unison', u: 2 },
        { type: 'sytrus', name: 'Sytrus FM / Additive Synth', desc: 'Multi-operator FM synthesis & harmonic modulation', u: 2 },
        { type: 'flex', name: 'FLEX Advanced Rompler', desc: 'Preset-driven sound generator with acoustic & synth macros', u: 2 },
      ],
    },
    {
      label: 'Percussion Instruments (Idiophones & Membranophones)',
      badge: 'PERCUSSION',
      color: 'border-purple-500/50 text-purple-300',
      items: [
        { type: 'percussion_electronic' as DeviceType, name: 'Agogo', desc: 'Double-bell idiophone percussion', u: 1 },
        { type: 'percussion_electronic' as DeviceType, name: 'Afoxé', desc: 'Beaded gourd shaker percussion', u: 1 },
        { type: 'percussion_electronic' as DeviceType, name: 'Alimba', desc: 'Wooden mallet keyboard idiophone', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Anklung', desc: 'Bamboo tube idiophone rattle', u: 1 },
        { type: 'percussion_electronic' as DeviceType, name: 'Ashiko', desc: 'Tapered cylindrical African hand drum', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Balafon', desc: 'West African gourd-resonated xylophone', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Bass Drum', desc: 'Orchestral heavy low-frequency percussion', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Bata Drum', desc: 'Double-headed hourglass sacred drum', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Bell', desc: 'Cast bronze struck idiophone', u: 1 },
        { type: 'percussion_electronic' as DeviceType, name: 'Berimbau', desc: 'Single-string musical bow percussion', u: 1 },
        { type: 'percussion_electronic' as DeviceType, name: 'Bodhrán', desc: 'Irish frame drum with tipper', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Bongos', desc: 'Pair of attached small hand drums', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Boomwhacker', desc: 'Tuned plastic percussion tube', u: 1 },
        { type: 'percussion_electronic' as DeviceType, name: 'Cajón', desc: 'Box-shaped wooden percussion cajon', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Castanets', desc: 'Handheld clackers idiophone', u: 1 },
        { type: 'percussion_electronic' as DeviceType, name: 'Celesta', desc: 'Struck steel bar keyboard instrument', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Chimes', desc: 'Orchestral tubular bell chimes', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Claves', desc: 'Wooden striking sticks idiophone', u: 1 },
        { type: 'percussion_electronic' as DeviceType, name: 'Conga', desc: 'Tall single-headed hand drum', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Cowbell', desc: 'Hand-struck metal idiophone bell', u: 1 },
        { type: 'percussion_electronic' as DeviceType, name: 'Cymbal', desc: 'Crash/ride brass metal percussion', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Darbuka', desc: 'Goblet-shaped single-head hand drum', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Djembe', desc: 'Rope-tuned skin-covered goblet drum', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Doumbek', desc: 'Middle Eastern goblet drum', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Drum Kit', desc: 'Acoustic multi-drum percussion kit', u: 3 },
        { type: 'percussion_electronic' as DeviceType, name: 'Flexatone', desc: 'Flexible spring-steel swing percussion', u: 1 },
        { type: 'percussion_electronic' as DeviceType, name: 'Frame Drum', desc: 'Ancient circular membrane drum', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Glockenspiel', desc: 'Orchestral steel bar mallet percussion', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Gong', desc: 'Large bronze suspension disc gong', u: 3 },
        { type: 'percussion_electronic' as DeviceType, name: 'Guiro', desc: 'Notched gourd scraper idiophone', u: 1 },
        { type: 'percussion_electronic' as DeviceType, name: 'Handpan', desc: 'Steel acoustic melodic sound sculpture', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Hang', desc: 'Swiss convex steel hand drum', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Hi-Hat', desc: 'Foot-operated cymbal pair', u: 1 },
        { type: 'percussion_electronic' as DeviceType, name: 'Jalatarang', desc: 'Porcelain bowl water-tuned percussion', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Kagura Suzu', desc: 'Japanese shrine bell rattle', u: 1 },
        { type: 'percussion_electronic' as DeviceType, name: 'Kalimba', desc: 'Thumb piano lamellophone', u: 1 },
        { type: 'percussion_electronic' as DeviceType, name: 'Lambeg Drum', desc: 'Massive Northern Irish double-head drum', u: 3 },
        { type: 'percussion_electronic' as DeviceType, name: 'Lithophone', desc: 'Resonant stone bar percussion', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Log Drum', desc: 'Slit hollow wood percussion', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Maracas', desc: 'Shaker rattle percussion', u: 1 },
        { type: 'percussion_electronic' as DeviceType, name: 'Marimba', desc: 'Wooden bar mallet percussion with resonators', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Mbira', desc: 'African thumb piano idiophone', u: 1 },
        { type: 'percussion_electronic' as DeviceType, name: 'Mridangam', desc: 'South Indian classical double-headed drum', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Pahu', desc: 'Polynesian sacred wood drum', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Pandeiro', desc: 'Brazilian tambourine percussion', u: 1 },
        { type: 'percussion_electronic' as DeviceType, name: 'Panlos', desc: 'Traditional cylindrical folk drum', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Ratchet', desc: 'Wooden gear rotating clicker', u: 1 },
        { type: 'percussion_electronic' as DeviceType, name: 'Rek', desc: 'Middle Eastern tambourine', u: 1 },
        { type: 'percussion_electronic' as DeviceType, name: 'Rimshot', desc: 'Snare rim strike percussion', u: 1 },
        { type: 'percussion_electronic' as DeviceType, name: 'Riqq', desc: 'Egyptian jingle tambourine', u: 1 },
        { type: 'percussion_electronic' as DeviceType, name: 'Scraper', desc: 'Notched bar percussion', u: 1 },
        { type: 'percussion_electronic' as DeviceType, name: 'Shekere', desc: 'Beaded gourd rattle', u: 1 },
        { type: 'percussion_electronic' as DeviceType, name: 'Snare Drum', desc: 'Wire-snares membrane percussion', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Steelpan', desc: 'Caribbean hammered oil drum pan', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Tablilla', desc: 'Wooden clapper rhythm instrument', u: 1 },
        { type: 'tabla' as DeviceType, name: 'Tabla (Dayan & Bayan)', desc: 'Indian classical hand drum pair with Syahi & Meend', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Taiko', desc: 'Japanese traditional barrel drum', u: 3 },
        { type: 'percussion_electronic' as DeviceType, name: 'Tambourine', desc: 'Jingled frame drum', u: 1 },
        { type: 'percussion_electronic' as DeviceType, name: 'Temple Block', desc: 'Wooden hollow slit drum cluster', u: 1 },
        { type: 'percussion_electronic' as DeviceType, name: 'Timpani', desc: 'Orchestral pedal kettle drum', u: 3 },
        { type: 'percussion_electronic' as DeviceType, name: 'Toms', desc: 'Multi-rack tom-tom drum set', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Triangle', desc: 'Bent steel rod percussion', u: 1 },
        { type: 'percussion_electronic' as DeviceType, name: 'Tubaphone', desc: 'Tuned metal tube percussion', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Tubular Bells', desc: 'Orchestral chime bells', u: 3 },
        { type: 'percussion_electronic' as DeviceType, name: 'Vibra-Slap', desc: 'Jawbone sound effect percussion', u: 1 },
        { type: 'percussion_electronic' as DeviceType, name: 'Vibraslap', desc: 'Acoustic metal-ball clapper sound effect', u: 1 },
        { type: 'percussion_electronic' as DeviceType, name: 'Washboard', desc: 'Corrugated metal rub percussion', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Warlpiri Clappers', desc: 'Indigenous Australian wooden boomerang clappers', u: 1 },
        { type: 'percussion_electronic' as DeviceType, name: 'Wind Chime', desc: 'Suspended hanging chime tubes', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Wood Block', desc: 'Hollow wooden block struck idiophone', u: 1 },
        { type: 'percussion_electronic' as DeviceType, name: 'Xylophone', desc: 'Wooden bar mallet percussion', u: 2 },
      ],
    },
    {
      label: 'Keyboard & Electronic Instruments (Electrophones & Keyboards)',
      badge: 'ELECTROPHONES',
      color: 'border-cyan-500/50 text-cyan-300',
      items: [
        { type: 'percussion_electronic' as DeviceType, name: 'AlphaSphere', desc: 'Spherical touch-sensitive electronic controller', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Clavinet', desc: 'Electromechanical tangent-struck clavinet', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Continuous Controller', desc: 'Hardware expression surface module', u: 1 },
        { type: 'percussion_electronic' as DeviceType, name: 'Controller Keyboard', desc: 'Master MIDI keyboard controller unit', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Digital Piano', desc: 'Sampled weighted-key grand piano', u: 3 },
        { type: 'percussion_electronic' as DeviceType, name: 'Drum Machine', desc: 'Programmable electronic rhythm machine', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Electronic Keyboard', desc: 'Polyphonic rompler workstation keyboard', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Elektronova', desc: 'Modern electronic DSP sound sculpture', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'EWI (Electronic Wind Instrument)', desc: 'Breath-controlled MIDI wind controller', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Keytar', desc: 'Strap-on performance MIDI keyboard', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Line 6 Variax', desc: 'Modeling electric guitar interface', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Mellotron', desc: 'Tape-playback keyboard instrument', u: 3 },
        { type: 'percussion_electronic' as DeviceType, name: 'Midi Controller', desc: 'General MIDI hardware controller surface', u: 1 },
        { type: 'percussion_electronic' as DeviceType, name: 'Omniaccord', desc: 'Chord-button electronic harp instrument', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Ondes Martenot', desc: 'Early vacuum tube ribbon synthesizer', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Otamatone', desc: 'Quirky note-bending electronic toy synth', u: 1 },
        { type: 'percussion_electronic' as DeviceType, name: 'Piano', desc: 'Classic acoustic concert grand piano model', u: 3 },
        { type: 'percussion_electronic' as DeviceType, name: 'Sample Pad', desc: 'Multi-trigger drum sampling pad', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Sampler', desc: 'Multi-layer audio sample playback workstation', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Soundboard Synthesizer', desc: 'Acoustic soundboard acoustic resonator synth', u: 3 },
        { type: 'percussion_electronic' as DeviceType, name: 'Stylophone', desc: 'Stylus-played pocket analog synthesizer', u: 1 },
        { type: 'percussion_electronic' as DeviceType, name: 'Synthesizer', desc: 'General analog/wavetable synth workstation', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Teuffel Birdfish', desc: 'Modular boutique electric guitar interface', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Theremin', desc: 'Contactless antenna pitch-sweep synthesizer', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Trautonium', desc: 'Subharmonic sub-oscillator electronic instrument', u: 2 },
        { type: 'percussion_electronic' as DeviceType, name: 'Wheel Harp', desc: 'Bowed-string electromechanical keyboard', u: 3 },
      ],
    },
    {
      label: 'Traditional Indian Classical & Folk Suite',
      badge: 'RAGA & CLASSICAL',
      color: 'border-yellow-500/50 text-yellow-300',
      items: [
        { type: 'bansuri' as DeviceType, name: 'Bansuri Bamboo Flute', desc: 'Microtonal meend bending & breath curves', u: 2 },
        { type: 'harmonium' as DeviceType, name: 'Classical Harmonium', desc: 'Multi-reed voicing & air reservoir modeling', u: 2 },
        { type: 'tabla' as DeviceType, name: 'Tabla (Dayan & Bayan)', desc: 'Acoustic skin tension & Ga, Na, Tin, Ge strikes', u: 2 },
        { type: 'tanpura' as DeviceType, name: 'Tanpura & Drone Generator', desc: 'Continuous classical drone & Sa-Pa harmonics', u: 1 },
        { type: 'dhol' as DeviceType, name: 'Dhol Folk Drum', desc: 'Dual-headed regional percussion with transient punch', u: 2 },
        { type: 'tumbi' as DeviceType, name: 'Tumbi Folk Resonator', desc: 'Single-string high-resonator folk instrument module', u: 1 },
      ],
    },
    {
      label: 'Stringed Instruments (Chordophones)',
      badge: 'CHORDOPHONES',
      color: 'border-orange-500/50 text-orange-300',
      items: [
        { type: 'world_instrument' as DeviceType, name: 'Acoustic Guitar', desc: 'Steel-string acoustic guitar model', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Appalachian Dulcimer', desc: 'Folk plucked string box resonator', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Autoharp', desc: 'Chord-bar zither plucked string engine', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Baglama', desc: 'Long-necked Turkish lute stringed instrument', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Balalaika', desc: 'Triangular Russian folk stringed instrument', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Banjo', desc: 'Resonator skin plucked banjo model', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Banjolele', desc: 'Hybrid banjo-ukulele plucked resonator', u: 1 },
        { type: 'world_instrument' as DeviceType, name: 'Bass Guitar', desc: 'Electric 4-string bass guitar model', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Bouzouki', desc: 'Greek long-necked lute instrument', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Cello', desc: 'Bowed acoustic violoncello ensemble model', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Charango', desc: 'Small Andean armadillo-backed lute', u: 1 },
        { type: 'world_instrument' as DeviceType, name: 'Chitarrone', desc: 'Extended-neck baroque theorbo lute', u: 3 },
        { type: 'world_instrument' as DeviceType, name: 'Clavichord', desc: 'Tangent-struck early keyboard instrument', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Double Bass', desc: 'Acoustic upright orchestral bass', u: 3 },
        { type: 'world_instrument' as DeviceType, name: 'Dulcimer', desc: 'Fretboard plucked zither string module', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Erhu', desc: 'Traditional Chinese two-stringed bowed fiddle', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Fiddle', desc: 'Traditional folk violin model', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Guitar', desc: 'Classic nylon/steel string guitar model', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Hammered Dulcimer', desc: 'Struck trapezoidal string zither', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Harpsichord', desc: 'Quilled plucked keyboard instrument', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Hurdy-Gurdy', desc: 'Wheel-bowed drone string instrument', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Kora', desc: '21-string West African bridge harp', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Koto', desc: 'Traditional Japanese 13-string zither', u: 3 },
        { type: 'world_instrument' as DeviceType, name: 'Lute', desc: 'Renaissance plucked pear-shaped lute', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Lyre', desc: 'Ancient plucked string instrument', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Mandolin', desc: 'Paired-course plucked folk instrument', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Nyckelharpa', desc: 'Swedish keyed bowed fiddle', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Octobass', desc: 'Massive three-stringed sub-bass acoustic instrument', u: 3 },
        { type: 'world_instrument' as DeviceType, name: 'Oud', desc: 'Fretless short-necked Middle Eastern lute', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Psaltery', desc: 'Ancient plucked string zither box', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Rebab', desc: 'Spiked bowed lute of the Islamic world', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Ruan', desc: 'Traditional Chinese plucked round-bodied lute', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Shamisen', desc: 'Three-stringed Japanese traditional banjo-lute', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Sitar', desc: 'Sympathetic string classical Indian sitar', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Ukulele', desc: 'Four-string Hawaiian soprano guitar', u: 1 },
        { type: 'world_instrument' as DeviceType, name: 'Viola', desc: 'Orchestral bowed alto string instrument', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Violin', desc: 'Soprano bowed classical string instrument', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Violoncello', desc: 'Deep orchestral bowed cello model', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Zither', desc: 'Acoustic plucked tabletop chord zither', u: 2 },
      ],
    },
    {
      label: 'Wind Instruments (Aerophones)',
      badge: 'AEROPHONES',
      color: 'border-sky-500/50 text-sky-300',
      items: [
        { type: 'world_instrument' as DeviceType, name: 'Accordion', desc: 'Free-reed bellows aerophone', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Albogue', desc: 'Basque single-reed hornpipe', u: 1 },
        { type: 'world_instrument' as DeviceType, name: 'Alphorn', desc: 'Long wooden alpine natural horn', u: 3 },
        { type: 'world_instrument' as DeviceType, name: 'Bagpipes', desc: 'Reservoir-blown drone pipe aerophone', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Balaban', desc: 'Double-reed cylindrical folk woodwind', u: 1 },
        { type: 'world_instrument' as DeviceType, name: 'Bansuri', desc: 'Indian transverse bamboo flute', u: 1 },
        { type: 'world_instrument' as DeviceType, name: 'Baritone Horn', desc: 'Low brass valve aerophone', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Bass Clarinet', desc: 'Deep single-reed woodwind', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Bassoon', desc: 'Double-reed orchestral bass woodwind', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Bombarde', desc: 'Breton traditional double-reed shawm', u: 1 },
        { type: 'world_instrument' as DeviceType, name: 'Bugle', desc: 'Simplest brass wind instrument', u: 1 },
        { type: 'world_instrument' as DeviceType, name: 'Calliope', desc: 'Steam whistle organ aerophone', u: 3 },
        { type: 'world_instrument' as DeviceType, name: 'Carnyx', desc: 'Ancient Celtic bronze war horn', u: 3 },
        { type: 'world_instrument' as DeviceType, name: 'Chanter', desc: 'Bagpipe melody pipe simulator', u: 1 },
        { type: 'world_instrument' as DeviceType, name: 'Clarinet', desc: 'Standard single-reed woodwind', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Concertina', desc: 'Hexagonal free-reed bellows instrument', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Conches', desc: 'Natural shell horn aerophone', u: 1 },
        { type: 'world_instrument' as DeviceType, name: 'Cornett', desc: 'Ancient woodwind with cupped mouthpiece', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Corrugaphone', desc: 'Whirling flexible plastic tube aerophone', u: 1 },
        { type: 'world_instrument' as DeviceType, name: 'Didgeridoo', desc: 'Australian Indigenous drone pipe', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Duduk', desc: 'Armenian double-reed apricot wood flute', u: 1 },
        { type: 'world_instrument' as DeviceType, name: 'English Horn', desc: 'Double-reed alto woodwind', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Euphonium', desc: 'Wide-bore tenor brass horn', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Fife', desc: 'High-pitched transverse military flute', u: 1 },
        { type: 'world_instrument' as DeviceType, name: 'Flute', desc: 'Standard orchestral concert flute', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'French Horn', desc: 'Orchestral circular brass horn', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Fujara', desc: 'Traditional Slovak overblown shepherd pipe', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Glass Harmonica', desc: 'Friction glass bowl aerophone', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Harmonica', desc: 'Pocket free-reed mouth harp', u: 1 },
        { type: 'world_instrument' as DeviceType, name: 'Harmonium', desc: 'Pump reed organ instrument', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Helicon', desc: 'Wound circular brass bass horn', u: 3 },
        { type: 'world_instrument' as DeviceType, name: 'Horn', desc: 'Natural orchestral brass horn', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Hunnuu', desc: 'Mongolian overtone flute aerophone', u: 1 },
        { type: 'world_instrument' as DeviceType, name: 'Hydrolophone', desc: 'Acoustic water-jet instrument', u: 3 },
        { type: 'world_instrument' as DeviceType, name: "Jew's Harp", desc: 'Plucked frame aerophone/idiophone', u: 1 },
        { type: 'world_instrument' as DeviceType, name: 'Kazoo', desc: 'Mirliton membrane mazzotta aerophone', u: 1 },
        { type: 'world_instrument' as DeviceType, name: 'Kenas', desc: 'Andean notched vertical flute', u: 1 },
        { type: 'world_instrument' as DeviceType, name: 'Khaen', desc: 'Lao mouth organ free-reed pipe', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Khene', desc: 'Traditional Southeast Asian bamboo mouth organ', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Lituus', desc: 'Ancient Roman straight/j-shaped brass horn', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Melodica', desc: 'Keyboard-mounted free-reed wind instrument', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Mellophone', desc: 'Concert brass marching horn', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Murchunga', desc: 'Nepalese traditional jaw harp', u: 1 },
        { type: 'world_instrument' as DeviceType, name: 'Musette', desc: 'Small French bagpipe model', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Nay', desc: 'Middle Eastern reed flute', u: 1 },
        { type: 'world_instrument' as DeviceType, name: 'Oboe', desc: 'Double-reed treble woodwind', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Ocarina', desc: 'Vessel flute aerophone', u: 1 },
        { type: 'world_instrument' as DeviceType, name: 'Ophicleide', desc: 'Keyed brass bass instrument', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Pan Flute', desc: 'Multi-tubed bamboo panpipe', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Piccolo', desc: 'High octave transverse flute', u: 1 },
        { type: 'world_instrument' as DeviceType, name: 'Piri', desc: 'Korean cylindrical double-reed oboe', u: 1 },
        { type: 'world_instrument' as DeviceType, name: 'Pipe Organ', desc: 'Monumental pneumatic pipe organ instrument', u: 3 },
        { type: 'world_instrument' as DeviceType, name: 'Pungi', desc: 'Indian snake charmer double-clarinet', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Recorder', desc: 'Fipple wooden block flute', u: 1 },
        { type: 'world_instrument' as DeviceType, name: 'Rauschpfeife', desc: 'Renaissance capped double-reed wind', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Sackbut', desc: 'Renaissance slide trombone', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Saxhorn', desc: 'Valved conical brass horn', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Saxophone', desc: 'Single-reed brass body woodwind', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Serpent', desc: 'Winding bass brass aerophone', u: 3 },
        { type: 'world_instrument' as DeviceType, name: 'Shakuhachi', desc: 'Japanese end-blown bamboo flute', u: 1 },
        { type: 'world_instrument' as DeviceType, name: 'Shawm', desc: 'Medieval conical double-reed wind', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Sheng', desc: 'Chinese mouth-blown reed organ', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Shofar', desc: 'Ram horn ritual aerophone', u: 1 },
        { type: 'world_instrument' as DeviceType, name: 'Siku', desc: 'Andean raft panpipe', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Sousaphone', desc: 'Wound marching bass brass tuba', u: 3 },
        { type: 'world_instrument' as DeviceType, name: 'Suona', desc: 'Traditional Chinese high-pitch loud shawm', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Syrinx', desc: 'Ancient Greek multi-tube pan flute', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Tárogató', desc: 'Hungarian single-reed woodwind', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Tenor Horn', desc: 'Mid-range brass horn', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Trombone', desc: 'Slide brass aerophone', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Trumpet', desc: 'Valved high-register brass horn', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Tuba', desc: 'Deep brass bass horn', u: 3 },
        { type: 'world_instrument' as DeviceType, name: 'Uilleann Pipes', desc: 'Irish bellows-blown elbow pipes', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Valve Trombone', desc: 'Valved slide-less trombone', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Venu', desc: 'South Indian bamboo transverse flute', u: 1 },
        { type: 'world_instrument' as DeviceType, name: 'Veuze', desc: 'Breton traditional single-drone bagpipe', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Vibraphone', desc: 'Motorized metal-bar mallet percussion', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Vuvuzela', desc: 'Long plastic stadium horn aerophone', u: 2 },
        { type: 'world_instrument' as DeviceType, name: 'Whistle', desc: 'Fipple metal/plastic whistle', u: 1 },
        { type: 'world_instrument' as DeviceType, name: 'Willow Flute', desc: 'Nordic overtone willow bark flute', u: 1 },
        { type: 'world_instrument' as DeviceType, name: 'Xun', desc: 'Chinese globular clay vessel flute', u: 1 },
        { type: 'world_instrument' as DeviceType, name: 'Zurna', desc: 'Loud double-reed Near Eastern horn', u: 2 },
      ],
    },
    {
      label: '🥁 Samplers, Drum Designers & Loop Players',
      badge: 'SAMPLERS & DRUMS',
      color: 'border-amber-500/40 text-amber-400',
      items: [
        { type: 'mimic', name: 'Mimic: Creative Sampler', desc: '8-slot multi-mode slice, pitch & time-stretch creative sampler', u: 3 },
        { type: 'nnxt', name: 'NN-XT: Advanced Sampler', desc: 'Multi-zone velocity-crossfade hierarchical studio sampler', u: 3 },
        { type: 'nn19', name: 'NN-19: Digital Sampler', desc: 'Classic low-CPU rack digital sampler with resonant filter', u: 2 },
        { type: 'kong', name: 'Kong: 16-Pad Drum Designer', desc: '16-pad physical drum modeling, Nurse Rex & transient FX studio', u: 3 },
        { type: 'redrum', name: 'Redrum: 16-Step Drum Computer', desc: '10-channel classic pattern drum machine with step sequencer', u: 3 },
        { type: 'dr_octo_rex', name: 'Dr. Octo Rex: 8-Slot Loop Player', desc: '8-slot REX loop slicer with per-slice pitch & filter modulation', u: 3 },
        { type: 'umpf', name: 'Umpf Club Drums / Umpf Retro Beats', desc: 'Dual-edition club & 80s retro gated-reverb drum workstation', u: 3 },
      ],
    },
    {
      label: '🎛️ Reason Rack Audio Effects',
      badge: 'AUDIO EFFECTS',
      color: 'border-teal-500/40 text-teal-400',
      items: [
        { type: 'rv7000', name: 'RV7000 MkII: Advanced IR Reverb', desc: 'Convolution & algorithmic reverb with impulse response & EQ', u: 2 },
        { type: 'rv9', name: 'RV-9: Flagorous Reverb Station', desc: 'Abyssal shimmer, vortex & hall reverberation processor', u: 2 },
        { type: 'ripley', name: 'Ripley: Space Delay', desc: 'Space delay with tape wobble, diffusion reverb, ducker & bitcrush', u: 2 },
        { type: 'echo', name: 'The Echo: Tape Delay Emulation', desc: 'Stereo ping-pong & analog tape echo with roll-off & feedback', u: 1 },
        { type: 'scream4', name: 'Scream 4: Sound Destruction Unit', desc: '10-algorithm distortion, tape saturation & body resonator', u: 1 },
        { type: 'osmium', name: 'Osmium: Distortion Matrix', desc: 'Multiband crossover tube, wavefold & fuzz distortion matrix', u: 2 },
        { type: 'pulveriser', name: 'Pulveriser: Demolition Unit', desc: 'Parallel squash compressor, dirt distortion & tremor filter', u: 2 },
        { type: 'alligator', name: 'Alligator: 3-Ch Pattern Filter', desc: 'Three-channel (HP/BP/LP) 16-step pattern gate filter & drive', u: 3 },
        { type: 'bvx_vocoder', name: 'BV-X / BV512: Digital & Analog Vocoders', desc: '512-band FFT & 32-band vintage vocoder with formant shift', u: 3 },
        { type: 'neptune', name: 'Neptune: Pitch Adjuster & Voice Synth', desc: 'Live pitch correction, formant shift & 4-voice harmonizer', u: 2 },
        { type: 'quartet', name: 'Quartet: Chorus Ensemble', desc: '4-algorithm (BBD, FFT, Granular, Ensemble) stereo chorus', u: 2 },
        { type: 'sweeper', name: 'Sweeper: Phaser / Flanger / Chorus', desc: 'Dynamic envelope-following phaser, flanger & wide chorus', u: 2 },
        { type: 'audiomatic', name: 'Audiomatic: Retro Transformer', desc: 'One-click Tape, Vinyl, VHS, Psyche & Circuit transformer', u: 2 },
        { type: 'rotor', name: 'Rotor: Rotary Speaker Emulation', desc: 'Doppler horn & drum rotary cabinet with tube amp drive', u: 2 },
        { type: 'mclass_master', name: 'MClass Mastery Suite', desc: '4-band parametric EQ, stereo imager, bus compressor & maximizer', u: 3 },
        { type: 'softube_amp', name: 'Softube Guitar Amp / Softube Bass Amp', desc: 'Hardware valve guitar & bass amplifiers with 4x12 / 8x10 cabs', u: 2 },
      ],
    },
    {
      label: '🧩 Utilities & Routing Components',
      badge: 'UTILITIES & CV',
      color: 'border-emerald-500/40 text-emerald-400',
      items: [
        { type: 'combinator', name: 'Combinator: Multi-Device Macro Container', desc: '4 rotary macros, 4 switches & multi-device layer patch container', u: 3 },
        { type: 'pulsar', name: 'Pulsar: Dual LFO Modulation Device', desc: 'Dual syncable low-frequency oscillators with cross-modulation', u: 1 },
        { type: 'spider_audio', name: 'Spider Audio Merger & Splitter', desc: '4-to-1 stereo audio merger & 1-to-4 parallel signal splitter', u: 1 },
        { type: 'spider_cv', name: 'Spider CV Merger & Splitter', desc: 'Modular control voltage router, inverter & scale trimmer', u: 1 },
        { type: 'matrix', name: 'Matrix: Pattern Sequencer', desc: '32-step analog note, gate & curve CV pattern sequencer', u: 2 },
        { type: 'rpg8', name: 'RPG-8: Monophonic Arpeggiator', desc: 'Arpeggiator with Up/Down/Random modes, octave range & pattern mask', u: 2 },
        { type: 'midi_out', name: 'MIDI Out Device: External Control', desc: '16-channel external hardware & plugin MIDI CC / Program module', u: 2 },
        { type: 'line_mixer', name: 'Line Mixer 6:2 / 14:2 Mixer', desc: 'Switchable 6:2 & 14:2 rack line mixer with aux send/return', u: 2 },
        { type: 'automation_clip', name: 'Automation Clip Modulator', desc: 'Envelope & LFO curve parameter modulator', u: 1 },
      ],
    },
  ];

  return (
    <header className="w-full bg-[#060911]/95 backdrop-blur-md border-b border-cyan-500/40 shadow-[0_8px_30px_rgba(0,0,0,0.85)] flex flex-col select-none sticky top-0 z-50">
      {/* Top Anodized Titanium & Laser-Cyan Telemetry Bezel */}
      <div className="h-3.5 w-full wooden-mold-trim electrical-spark-effect flex items-center justify-between px-4 border-b border-cyan-950/80">
        <div className="flex items-center space-x-3 opacity-80">
          <div className="brass-screw" style={{ width: 6, height: 6 }} />
          <span className="text-[7px] font-mono tracking-widest text-cyan-400 font-bold">
            DSP CLOCK: {audioEngine.sampleRateTarget / 1000}kHz / {audioEngine.bufferSize} SMP ({audioEngine.driverModel})
          </span>
        </div>
        <span className="text-[7.5px] font-mono tracking-[0.22em] text-cyan-200/80 font-bold uppercase">
          UNBOXED // TECHNO HI-FI DIGITAL AUDIO WORKSTATION
        </span>
        <div className="flex items-center space-x-3 opacity-80">
          <span className="text-[7px] font-mono tracking-widest text-emerald-400 font-bold">
            LUFS: {audioEngine.lufsMetering.momentary} dB &bull; CORR: {audioEngine.lufsMetering.phaseCorrelation}
          </span>
          <div className="brass-screw" style={{ width: 6, height: 6 }} />
        </div>
      </div>

      <div className="px-4 py-2 flex flex-wrap items-center justify-between gap-2.5">
        {/* Brand & Workspace Deck Switcher */}
        <div className="flex items-center space-x-3">
          <div
            onClick={() => onOpenInternalInspector?.('unboxed_gold')}
            className="flex items-center space-x-2.5 cursor-pointer group"
            title="Click to inspect UNBOXED // TECHNO HI-FI Core DSP Engine & Graphics Pipeline [Shortcut: I]"
          >
            <div className="w-10 h-10 rounded-lg unboxed-gold-crest flex items-center justify-center p-0.5 shadow-lg group-hover:scale-105 transition-transform">
              <UnboxedLogoIcon className="w-9 h-9" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center space-x-1.5">
                <span className="text-base font-black tracking-widest font-mono bg-gradient-to-r from-cyan-300 via-teal-200 to-emerald-400 bg-clip-text text-transparent uppercase drop-shadow">
                  UNBOXED
                </span>
                <span className="text-[9px] font-mono font-black metallic-pure-gold px-2 py-0.5 rounded shadow-md tracking-wider">
                  TECHNO HI-FI
                </span>
              </div>
              <span className="text-[8px] font-mono text-cyan-300/80 tracking-widest font-bold">
                64-BIT NEURAL DSP STUDIO &bull; [I] INSPECT
              </span>
            </div>
          </div>

          {/* Parallel Workspace Multi-View Tabs (F1, F2, F3 & F4 Split) */}
          <div className="flex items-center bg-[#030509] p-1 rounded-lg border border-slate-800 space-x-1 shadow-inner">
            <button
              onClick={() => onViewModeChange('sequencer')}
              onContextMenu={(e) => {
                e.preventDefault();
                onOpenInternalInspector?.('f1_sequencer');
              }}
              className={`px-2.5 py-1.5 rounded-md font-mono text-xs font-bold transition-all flex items-center space-x-1.5 ${
                activeViewMode === 'sequencer' && !isParallelView
                  ? 'bg-gradient-to-r from-cyan-950 to-emerald-950 text-cyan-200 border border-cyan-400/80 shadow-[0_0_14px_rgba(6,182,212,0.35)]'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
              title="Channel Rack, Piano Roll & Sequencer [Shortcut: F1] | Right-click for F1 SEQUENCER Internal Tools"
            >
              <kbd className="text-[9px] px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-black">F1</kbd>
              <span>SEQUENCER</span>
            </button>

            <button
              onClick={() => onViewModeChange('mixer')}
              onContextMenu={(e) => {
                e.preventDefault();
                onOpenInternalInspector?.('f2_mixer');
              }}
              className={`px-2.5 py-1.5 rounded-md font-mono text-xs font-bold transition-all flex items-center space-x-1.5 ${
                activeViewMode === 'mixer' && !isParallelView
                  ? 'bg-gradient-to-r from-cyan-950 to-emerald-950 text-cyan-200 border border-cyan-400/80 shadow-[0_0_14px_rgba(6,182,212,0.35)]'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
              title="500-Track Hi-Fi Mixing Console [Shortcut: F2] | Right-click for F2 MIXER Internal Tools"
            >
              <kbd className="text-[9px] px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-black">F2</kbd>
              <span>MIXER</span>
            </button>

            <button
              onClick={() => onViewModeChange('rack')}
              onContextMenu={(e) => {
                e.preventDefault();
                onOpenInternalInspector?.('f3_rack');
              }}
              className={`px-2.5 py-1.5 rounded-md font-mono text-xs font-bold transition-all flex items-center space-x-1.5 ${
                activeViewMode === 'rack' && !isParallelView
                  ? 'bg-gradient-to-r from-cyan-950 to-emerald-950 text-cyan-200 border border-cyan-400/80 shadow-[0_0_14px_rgba(6,182,212,0.35)]'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
              title="19-Inch Modular Hardware Rack [Shortcut: F3] | Right-click for F3 RACK Internal Tools"
            >
              <kbd className="text-[9px] px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-black">F3</kbd>
              <span>RACK</span>
            </button>

            <div className="w-px h-5 bg-slate-800 mx-0.5" />

            {/* Parallel Split Mode Toggle */}
            <button
              onClick={onToggleParallelView}
              onContextMenu={(e) => {
                e.preventDefault();
                onOpenInternalInspector?.('split_view');
              }}
              className={`px-2.5 py-1.5 rounded-md font-mono text-xs font-bold transition-all flex items-center space-x-1.5 ${
                isParallelView
                  ? 'bg-emerald-600 text-white border border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.5)]'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
              title="Toggle Parallel Dual-Deck Split View [Shortcut: F4] | Right-click for SPLIT Internal Tools"
            >
              <SplitSquareVertical className="w-3.5 h-3.5" />
              <span className="text-[10px]">SPLIT</span>
              <kbd className="text-[8px] px-1 rounded bg-black/50 text-emerald-300 border border-emerald-500/30">F4</kbd>
            </button>
          </div>

          {/* Front / Back Rack Flip Switch */}
          <button
            onClick={onToggleBackView}
            className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md border font-mono text-xs font-bold transition-all shadow-md ${
              isBackView
                ? 'bg-cyan-500 text-slate-950 border-cyan-300 shadow-[0_0_14px_rgba(6,182,212,0.6)]'
                : 'bg-[#0b101b] hover:bg-slate-800 text-slate-200 border-slate-700/80'
            }`}
            title="Flip Hardware Rack between Front Controls & Rear Modular Patch Bay [Shortcut: TAB]"
          >
            <RotateCcw className={`w-3.5 h-3.5 transition-transform duration-300 ${isBackView ? 'rotate-180 text-slate-950' : 'text-cyan-400'}`} />
            <span className="hidden sm:inline">{isBackView ? 'FRONT PANEL' : 'PATCH BAY'}</span>
            <kbd className={`text-[8px] px-1 rounded ${isBackView ? 'bg-slate-950/30 text-slate-950' : 'bg-slate-900 text-cyan-300 border border-cyan-500/30'}`}>TAB</kbd>
          </button>

          {/* Auto Patch Helper Button */}
          <button
            onClick={onAutoPatchMaster}
            className="hidden xl:flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md border border-slate-800 bg-[#0b101b] hover:bg-slate-800 text-slate-300 text-xs font-mono transition-colors"
            title="Auto-wire all unpatched audio outputs to the Master Bus"
          >
            <Cable className="w-3.5 h-3.5 text-emerald-400" />
            <span>AUTO-ROUTE</span>
          </button>
        </div>

        {/* Center Transport & Clock (Rewind, Play, Stop, Fast-Forward, Record, Loop, Timecode & BPM) */}
        <div className="flex items-center space-x-2 bg-[#090d16] px-3 py-1 rounded-lg border border-slate-800/90 shadow-inner">
          {/* Full Transport Bar Buttons */}
          <div className="flex items-center space-x-1 bg-[#030509] p-1 rounded-md border border-slate-800/80">
            <button
              onClick={() => audioEngine.rewindTransport(4)}
              className="px-1.5 py-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-slate-900 transition-colors flex items-center space-x-0.5"
              title="Rewind 1 Beat (-4 Steps) [Shortcut: ←]"
            >
              <Rewind className="w-3.5 h-3.5 fill-current" />
              <span className="text-[8px] font-mono text-slate-500">←</span>
            </button>

            <button
              onClick={() => audioEngine.togglePlay()}
              className={`px-2.5 py-1 rounded-md transition-all flex items-center space-x-1 font-mono text-[10px] font-bold ${
                t.isPlaying
                  ? 'bg-emerald-500 text-slate-950 shadow-[0_0_14px_#10b981]'
                  : 'text-slate-300 hover:text-white hover:bg-slate-900'
              }`}
              title="Play / Pause Master Transport [Shortcut: SPACE]"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span className="hidden md:inline">SPC</span>
            </button>

            <button
              onClick={() => audioEngine.stopTransport()}
              className="px-2 py-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-900 transition-colors flex items-center space-x-1 font-mono text-[10px]"
              title="Stop & Reset Timecode [Shortcut: S]"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span className="text-[8px] text-slate-500">S</span>
            </button>

            <button
              onClick={() => audioEngine.fastForwardTransport(4)}
              className="px-1.5 py-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-slate-900 transition-colors flex items-center space-x-0.5"
              title="Fast-Forward 1 Beat (+4 Steps) [Shortcut: →]"
            >
              <FastForward className="w-3.5 h-3.5 fill-current" />
              <span className="text-[8px] font-mono text-slate-500">→</span>
            </button>

            <button
              onClick={() => audioEngine.toggleLoop()}
              className={`px-2 py-1 rounded-md transition-colors flex items-center space-x-1 font-mono text-[9px] font-bold ${
                audioEngine.loopEnabled
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                  : 'text-slate-500 hover:text-white'
              }`}
              title="Toggle Pattern / Timeline Loop [Shortcut: L]"
            >
              <Repeat className="w-3.5 h-3.5" />
              <span>L</span>
            </button>

            <button
              onClick={() => {
                if (t.isRecording) audioEngine.stopRecording();
                else audioEngine.startRecording();
              }}
              className={`px-2 py-1 rounded-md transition-colors flex items-center space-x-1 font-mono text-[9px] font-bold ${
                t.isRecording
                  ? 'bg-red-600 text-white shadow-[0_0_14px_#ef4444] animate-pulse'
                  : 'text-slate-400 hover:text-red-400 hover:bg-slate-900'
              }`}
              title="Record Studio Master to Audio File [Shortcut: R]"
            >
              <Circle className="w-3.5 h-3.5 fill-current" />
              <span>R</span>
            </button>
          </div>

          {/* Timecode LCD Display */}
          <div className="lcd-display px-3 py-1.5 rounded-md flex items-center space-x-2 text-sm font-mono tracking-wider shadow-inner border border-emerald-500/30">
            <Clock className="w-3.5 h-3.5 text-cyan-400 opacity-90" />
            <span className="text-cyan-300 font-bold">
              {String(bar).padStart(2, '0')}:{String(beat).padStart(2, '0')}:{String(sixteenth).padStart(2, '0')}
            </span>
          </div>

          {/* BPM Knob */}
          <div className="flex items-center bg-[#030509] px-2 py-0.5 rounded-md border border-slate-800">
            <Knob
              label="BPM"
              value={bpm}
              min={40}
              max={220}
              step={1}
              unit=" BPM"
              size="sm"
              variant="yellow"
              onChange={handleBpmChange}
            />
          </div>
        </div>

        {/* Right Controls: Add Device, AI Co-Pilot, CV Matrix, Internal Tools, Shortcuts [?], Master VU */}
        <div className="flex items-center space-x-2">
          {/* Add Device Dropdown (Equipment Locker) */}
          <div className="relative">
            <button
              onClick={() => setDeviceMenuOpen(!deviceMenuOpen)}
              onContextMenu={(e) => {
                e.preventDefault();
                onOpenInternalInspector?.('add_module');
              }}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md border border-cyan-500/60 bg-gradient-to-b from-[#0c192c] to-[#07101d] hover:from-[#11243e] hover:to-[#0a1628] text-cyan-100 font-mono text-xs font-bold transition-all shadow-md"
              title="Mount Instrument or FX Module into Rack & Sequencer | Right-click for VST3/CLAP Host Tools"
            >
              <Plus className="w-3.5 h-3.5 text-cyan-400" />
              <span>ADD MODULE</span>
              <ChevronDown className="w-3 h-3 text-cyan-300" />
            </button>

            {deviceMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-84 bg-[#080d18] border border-cyan-500/60 rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.95)] p-2.5 z-50 text-xs font-mono animate-in fade-in max-h-[80vh] overflow-y-auto">
                <div className="px-2 py-1.5 mb-2 border-b border-slate-800 flex justify-between items-center">
                  <span className="font-bold text-cyan-300 tracking-wider">TECHNO HI-FI MODULE LOCKER</span>
                  <button
                    onClick={() => {
                      setDeviceMenuOpen(false);
                      onOpenInternalInspector?.('add_module');
                    }}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-900"
                  >
                    VST3/CLAP HOST
                  </button>
                </div>
                {deviceCategories.map((cat) => (
                  <div key={cat.label} className="mb-3">
                    <div className="px-2 py-0.5 flex justify-between items-center text-[9px] uppercase tracking-wider font-bold mb-1">
                      <span className="text-slate-300">{cat.label}</span>
                      <span className={`px-1.5 py-0.2 rounded border ${cat.color}`}>{cat.badge}</span>
                    </div>
                    <div className="space-y-1">
                      {cat.items.map((item) => (
                        <button
                          key={item.name}
                          onClick={() => {
                            onAddDevice(item.type, item.name);
                            setDeviceMenuOpen(false);
                          }}
                          className="w-full text-left p-2 rounded-lg bg-[#0d1424] hover:bg-[#132038] border border-slate-800 hover:border-cyan-500/60 transition-colors flex items-center justify-between group"
                        >
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-100 group-hover:text-cyan-300">
                              {item.name}
                            </span>
                            <span className="text-[10px] text-slate-400 line-clamp-1">{item.desc}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <span className="text-[8px] px-1.5 py-0.5 rounded bg-slate-950 text-cyan-300 border border-cyan-900">
                              {item.u}U
                            </span>
                            <Plus className="w-3.5 h-3.5 text-cyan-400 opacity-60 group-hover:opacity-100" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI Co-Pilot Button */}
          <button
            onClick={onOpenAICoPilot}
            onContextMenu={(e) => {
              e.preventDefault();
              onOpenInternalInspector?.('ai_copilot');
            }}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md border border-indigo-500/60 bg-gradient-to-r from-indigo-950/90 to-slate-900 hover:from-indigo-900 hover:to-slate-800 text-indigo-200 font-mono text-xs font-bold transition-all shadow-md"
            title="Open AI Studio Co-Pilot [Shortcut: A] | Right-click for AI CO-PILOT Internal Neural Tools"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden lg:inline">AI CO-PILOT</span>
            <kbd className="text-[8px] px-1 rounded bg-black/50 text-indigo-300 border border-indigo-500/40">A</kbd>
          </button>

          {/* CV Modulation Matrix Button */}
          <button
            onClick={onOpenCVMatrix}
            onContextMenu={(e) => {
              e.preventDefault();
              onOpenInternalInspector?.('cv_matrix');
            }}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md border border-slate-700 bg-[#0b101b] hover:bg-slate-800 text-slate-200 font-mono text-xs font-bold transition-colors shadow"
            title="Open CV Modulation Matrix [Shortcut: C] | Right-click for CV MATRIX Internal Tools"
          >
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden lg:inline">CV MATRIX</span>
            <kbd className="text-[8px] px-1 rounded bg-black/50 text-cyan-300 border border-cyan-500/30">C</kbd>
          </button>

          {/* Dedicated Internal Subsystems, Modulators & Auto-Save Daemon Launcher */}
          <button
            onClick={() => onOpenInternalInspector?.('unboxed_gold')}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md border border-emerald-500/60 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-200 font-mono text-xs font-bold transition-all shadow-md"
            title="Open Internal Subsystems, 19 Advanced Engines, LFO/ADSR & Auto-Save Daemon [Shortcut: I]"
          >
            <Cpu className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden xl:inline">SUBSYSTEMS</span>
            <kbd className="text-[8px] px-1 rounded bg-black/50 text-emerald-300 border border-emerald-500/40">I</kbd>
          </button>

          {/* Global Keyboard Shortcuts Matrix Button */}
          <button
            onClick={onOpenShortcuts}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-md border border-cyan-500/50 bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-200 font-mono text-xs font-bold transition-all shadow-md"
            title="Open Global Keyboard Shortcuts & Hotkey Command Matrix [Shortcut: ? or H]"
          >
            <Keyboard className="w-3.5 h-3.5 text-cyan-300" />
            <kbd className="text-[9px] px-1 rounded bg-black/60 text-cyan-300 border border-cyan-400/40 font-black">?</kbd>
          </button>

          {/* Master Output Volume Knob */}
          <div
            onContextMenu={(e) => {
              e.preventDefault();
              onOpenInternalInspector?.('master_knob');
            }}
            title="Master Gain Knob | Right-click for MASTER (Knob) Internal Tools"
          >
            <Knob
              label="MASTER"
              value={masterVol}
              min={0}
              max={1.5}
              step={0.05}
              size="sm"
              variant="metal"
              onChange={handleMasterVolChange}
            />
          </div>

          {/* Stereo Backlit Analog VU Meters */}
          <div
            onClick={() => onOpenInternalInspector?.('vu_dials')}
            className="flex space-x-1 bg-[#030509] p-1 rounded-md border border-slate-800 shadow-inner cursor-pointer hover:border-cyan-500/50 transition-colors"
            title="Click to inspect OUT L / OUT R (VU Dials) Internal Ballistics & FFT RMS Tools"
          >
            <VUMeter label="OUT L" rms={t.rmsL} peak={t.peakL} width={60} height={40} />
            <VUMeter label="OUT R" rms={t.rmsR} peak={t.peakR} width={60} height={40} />
          </div>
        </div>
      </div>
    </header>
  );
};
