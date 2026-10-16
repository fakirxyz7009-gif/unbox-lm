import React, { useState } from 'react';
import { AudioEngine } from '../audio/AudioEngine.ts';
import { DeviceType, WorkspaceViewMode } from '../audio/types.ts';
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
} from 'lucide-react';

interface HeaderTransportProps {
  audioEngine: AudioEngine;
  isBackView: boolean;
  onToggleBackView: () => void;
  onOpenAICoPilot: () => void;
  onOpenCVMatrix: () => void;
  onAddDevice: (type: DeviceType) => void;
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
  const bar = Math.floor(t.currentStep / 16) + 1;
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
      label: 'Native Synths & Tone Generators',
      badge: 'INSTRUMENTS',
      color: 'border-emerald-500/40 text-emerald-400',
      items: [
        { type: 'three_osc', name: '3x OSC Power Synth', desc: 'Triple oscillator synth with detune, shape & fat unison', u: 2 },
        { type: 'sytrus', name: 'Sytrus FM / Additive Synth', desc: 'Multi-operator FM synthesis & harmonic modulation', u: 2 },
        { type: 'flex', name: 'FLEX Advanced Rompler', desc: 'Preset-driven sound generator with acoustic & synth macros', u: 2 },
        { type: 'subtractor', name: 'Subtractor Analog Synth', desc: 'Dual-osc analog subtractive lead & bass', u: 2 },
        { type: 'thor', name: 'Thor Polysonic Synth', desc: 'Triple-oscillator polysonic powerhouse with chorus', u: 3 },
        { type: 'europa', name: 'Europa Wavetable Synth', desc: 'Shapeshifting spectral wavetable synth', u: 3 },
        { type: 'monotone', name: 'Monotone Bass Synth', desc: 'Punchy 24dB ladder filter bass synth', u: 1 },
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
        { type: 'percussion_electronic' as DeviceType, name: 'Tabla', desc: 'Indian classical hand drum pair', u: 2 },
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
      label: 'Drums & Samplers',
      badge: 'RHYTHM',
      color: 'border-amber-500/40 text-amber-400',
      items: [
        { type: 'redrum', name: 'Redrum 16-Step Drum Machine', desc: '8-channel drum computer with step sequencer', u: 3 },
        { type: 'mimic', name: 'Mimic Creative Sampler', desc: '8-pad instrument with acoustic & sample playback', u: 3 },
      ],
    },
    {
      label: 'Sequencing & Modulation',
      badge: 'CONTROL',
      color: 'border-emerald-500/40 text-emerald-400',
      items: [
        { type: 'matrix', name: 'Matrix Pattern / CV Sequencer', desc: '16-step pitch, gate, and curve CV sequencer', u: 2 },
        { type: 'pulsar', name: 'Pulsar Dual LFO Modulator', desc: 'Dual low-frequency oscillators for dynamic modulation', u: 1 },
        { type: 'spider_cv', name: 'Spider CV Splitter / Merger', desc: 'Multi-channel CV splitter, inverter & merger', u: 1 },
        { type: 'automation_clip', name: 'Automation Clip Modulator', desc: 'Envelope & LFO curve parameter modulator', u: 1 },
      ],
    },
    {
      label: 'Outboard DSP & Dynamics',
      badge: 'PROCESSING',
      color: 'border-teal-500/40 text-teal-400',
      items: [
        { type: 'scream4', name: 'Scream 4 Tape Distortion', desc: 'Harmonic saturation, tube warmth & overdrive', u: 1 },
        { type: 'echo', name: 'The Echo Stereo Delay', desc: 'Stereo delay with feedback and ping-pong bounce', u: 1 },
        { type: 'rv7000', name: 'RV7000 Studio Reverb', desc: 'Convolution & algorithmic reverb with decay & damping', u: 2 },
        { type: 'mclass_master', name: 'MClass Mastering Suite', desc: '4-band parametric EQ, bus compressor & limiter', u: 3 },
        { type: 'spider_audio', name: 'Spider Audio Splitter / Merger', desc: 'Signal routing and parallel split utility', u: 1 },
      ],
    },
  ];

  return (
    <header className="w-full bg-[#3c2415] border-b-2 border-amber-900/60 shadow-2xl flex flex-col select-none sticky top-0 z-50">
      {/* Top Polished Solid Mahogany Wood Trim Bar */}
      <div className="h-3 w-full wooden-mold-trim electrical-spark-effect flex items-center justify-between px-3 border-b border-[#2b160b]">
        <div className="flex space-x-12 opacity-60">
          <div className="brass-screw" style={{ width: 6, height: 6 }} />
          <div className="brass-screw" style={{ width: 6, height: 6 }} />
        </div>
        <span className="text-[7px] font-mono tracking-widest text-amber-200/60 uppercase">UNBOXED PRO AUDIO WORKSTATION</span>
        <div className="flex space-x-12 opacity-60">
          <div className="brass-screw" style={{ width: 6, height: 6 }} />
          <div className="brass-screw" style={{ width: 6, height: 6 }} />
        </div>
      </div>

      <div className="px-4 py-2 flex flex-wrap items-center justify-between gap-3">
        {/* Brand & Front/Back Toggle (Studio Light Grey, Wood & Dark Green theme) */}
        <div className="flex items-center space-x-3.5">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-md unboxed-gold-crest flex items-center justify-center p-0.5 shadow-lg">
              <UnboxedLogoIcon className="w-9 h-9" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center space-x-2">
                <span className="text-base font-black tracking-widest font-mono bg-gradient-to-r from-amber-200 via-amber-400 to-yellow-200 bg-clip-text text-transparent uppercase drop-shadow">
                  UNBOXED
                </span>
                <span className="text-[9px] font-mono font-black metallic-pure-gold px-2 py-0.5 rounded shadow-md">
                  GOLD EDITION
                </span>
              </div>
              <span className="text-[8px] font-mono text-amber-200/80 tracking-widest font-bold">
                24K MASTER STUDIO RACK &bull; STERLING SILVER DSP
              </span>
            </div>
          </div>

          {/* Parallel Workspace Multi-View Tabs (F1, F2, F3 & Split) with Dark Green active state */}
          <div className="flex items-center bg-black/60 p-1 rounded-lg border border-neutral-800 space-x-1">
            <button
              onClick={() => onViewModeChange('sequencer')}
              className={`px-3 py-1.5 rounded font-mono text-xs font-bold transition-all flex items-center space-x-1.5 ${
                activeViewMode === 'sequencer' && !isParallelView
                  ? 'bg-[#064e3b] text-emerald-200 border border-emerald-500/70 shadow-[0_0_12px_rgba(16,185,129,0.35)]'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
              }`}
              title="Channel Rack & Sequencer: 16-512 Steps, Piano Roll & Graph Editor (F1 Key)"
            >
              <span className="text-[10px] px-1 py-0.2 rounded bg-black/40 text-emerald-400 font-bold">F1</span>
              <span>SEQUENCER</span>
            </button>

            <button
              onClick={() => onViewModeChange('mixer')}
              className={`px-3 py-1.5 rounded font-mono text-xs font-bold transition-all flex items-center space-x-1.5 ${
                activeViewMode === 'mixer' && !isParallelView
                  ? 'bg-[#064e3b] text-emerald-200 border border-emerald-500/70 shadow-[0_0_12px_rgba(16,185,129,0.35)]'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
              }`}
              title="Mixing Console: 500 Inserts, 1 Master, 1 Utility Strip & 10 FX Slots (F2 Key)"
            >
              <span className="text-[10px] px-1 py-0.2 rounded bg-black/40 text-emerald-400 font-bold">F2</span>
              <span>MIXER</span>
            </button>

            <button
              onClick={() => onViewModeChange('rack')}
              className={`px-3 py-1.5 rounded font-mono text-xs font-bold transition-all flex items-center space-x-1.5 ${
                activeViewMode === 'rack' && !isParallelView
                  ? 'bg-[#064e3b] text-emerald-200 border border-emerald-500/70 shadow-[0_0_12px_rgba(16,185,129,0.35)]'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
              }`}
              title="Device Rack: Modular Wooden Box Chassis & Cable Patching (F3 Key)"
            >
              <span className="text-[10px] px-1 py-0.2 rounded bg-black/40 text-emerald-400 font-bold">F3</span>
              <span>RACK</span>
            </button>

            <div className="w-px h-5 bg-neutral-800 mx-0.5" />

            {/* Parallel Split Mode Toggle */}
            <button
              onClick={onToggleParallelView}
              className={`px-2.5 py-1.5 rounded font-mono text-xs font-bold transition-all flex items-center space-x-1.5 ${
                isParallelView
                  ? 'bg-[#047857] text-white shadow-[0_0_10px_#10b981]'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
              }`}
              title="Toggle Parallel View (Sequencer + Rack/Mixer Stacked)"
            >
              <SplitSquareVertical className="w-3.5 h-3.5" />
              <span className="text-[10px]">SPLIT</span>
            </button>
          </div>

        {/* Front / Back Rack Flip Switch */}
        <button
          onClick={onToggleBackView}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded border font-mono text-xs font-bold transition-all shadow-md ${
            isBackView
              ? 'bg-amber-500 text-black border-amber-300 ring-2 ring-amber-400/50'
              : 'bg-gradient-to-b from-neutral-800 to-neutral-900 hover:from-neutral-700 hover:to-neutral-800 text-neutral-100 border-neutral-700'
          }`}
          title="Toggle Front Hardware Controls / Back Modular Patch Bay (Tab Key)"
        >
          <RotateCcw className={`w-3.5 h-3.5 transition-transform duration-300 ${isBackView ? 'rotate-180 text-black' : 'text-blue-400'}`} />
          <span className="hidden sm:inline">{isBackView ? 'FRONT CONTROLS' : 'FLIP RACK (TAB)'}</span>
        </button>

        {/* Auto Patch Helper Button */}
        <button
          onClick={onAutoPatchMaster}
          className="hidden xl:flex items-center space-x-1.5 px-2.5 py-1.5 rounded border border-neutral-800 bg-neutral-900/80 hover:bg-neutral-800 text-neutral-300 text-xs font-mono transition-colors"
          title="Auto-wire all unpatched audio outputs to the Master Bus"
        >
          <Cable className="w-3.5 h-3.5 text-emerald-400" />
          <span>Auto-Route</span>
        </button>
      </div>

      {/* Center Transport & Clock (Studio Grey & Black) */}
      <div className="flex items-center space-x-3 bg-neutral-900/90 px-3 py-1.5 rounded-lg border border-neutral-800 shadow-inner">
        {/* Transport Buttons */}
        <div className="flex items-center space-x-1 bg-black/70 p-1 rounded border border-neutral-800">
          <button
            onClick={() => audioEngine.togglePlay()}
            className={`p-2 rounded transition-colors ${
              t.isPlaying
                ? 'bg-emerald-600 text-white shadow-[0_0_12px_#10b981]'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
            }`}
            title="Play / Pause (Spacebar)"
          >
            <Play className="w-4 h-4 fill-current" />
          </button>

          <button
            onClick={() => audioEngine.stopTransport()}
            className="p-2 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
            title="Stop & Reset Timecode"
          >
            <Square className="w-4 h-4 fill-current" />
          </button>

          <button
            onClick={() => {
              if (t.isRecording) audioEngine.stopRecording();
              else audioEngine.startRecording();
            }}
            className={`p-2 rounded transition-colors flex items-center space-x-1 ${
              t.isRecording
                ? 'bg-red-600 text-white shadow-[0_0_14px_#ef4444] animate-pulse'
                : 'text-neutral-400 hover:text-red-400 hover:bg-neutral-800'
            }`}
            title="Record Studio Master to Audio File"
          >
            <Circle className="w-4 h-4 fill-current" />
          </button>
        </div>

        {/* Timecode LCD Display */}
        <div className="lcd-display px-3 py-1.5 rounded flex items-center space-x-2 text-sm font-mono tracking-wider shadow-inner">
          <Clock className="w-3.5 h-3.5 text-emerald-400 opacity-80" />
          <span>
            {String(bar).padStart(2, '0')}:{String(beat).padStart(2, '0')}:{String(sixteenth).padStart(2, '0')}
          </span>
        </div>

        {/* BPM Knob (Studio Yellow Cap) */}
        <div className="flex items-center bg-black/50 px-2 py-0.5 rounded border border-neutral-800">
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

      {/* Right Controls: Add Device, AI Co-Pilot, CV Matrix, Master VU */}
      <div className="flex items-center space-x-3">
        {/* Add Device Dropdown (Equipment Locker) */}
        <div className="relative">
          <button
            onClick={() => setDeviceMenuOpen(!deviceMenuOpen)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded border border-amber-600 bg-[#4a2e1b] hover:bg-[#57351f] text-amber-100 font-mono text-xs font-bold transition-all shadow-md"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            <span>ADD MODULE</span>
            <ChevronDown className="w-3 h-3 text-amber-300" />
          </button>

          {deviceMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-[#4a2e1b] border border-amber-600 rounded-lg shadow-2xl p-2 z-50 text-xs font-mono animate-in fade-in max-h-[80vh] overflow-y-auto">
              <div className="px-2 py-1 mb-2 border-b border-amber-800 flex justify-between items-center">
                <span className="font-bold text-amber-200">STUDIO RACK LOCKER</span>
                <span className="text-[10px] text-amber-300/80">19&quot; OUTBOARD</span>
              </div>
              {deviceCategories.map((cat) => (
                <div key={cat.label} className="mb-2.5">
                  <div className="px-2 py-0.5 flex justify-between items-center text-[9px] uppercase tracking-wider font-bold mb-1">
                    <span className="text-amber-200">{cat.label}</span>
                    <span className={`px-1 rounded border ${cat.color}`}>{cat.badge}</span>
                  </div>
                  <div className="space-y-1">
                    {cat.items.map((item) => (
                      <button
                        key={item.name}
                        onClick={() => {
                          onAddDevice(item.type);
                          setDeviceMenuOpen(false);
                        }}
                        className="w-full text-left p-2 rounded bg-[#351a0b] hover:bg-[#57351f] border border-amber-800/60 hover:border-amber-500 transition-colors flex items-center justify-between group"
                      >
                        <div className="flex flex-col">
                          <span className="font-bold text-amber-100 group-hover:text-amber-300">
                            {item.name}
                          </span>
                          <span className="text-[10px] text-amber-200/70 line-clamp-1">{item.desc}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <span className="text-[8px] px-1 py-0.2 rounded bg-[#2d1810] text-amber-300 border border-amber-800">
                            {item.u}U
                          </span>
                          <Plus className="w-3.5 h-3.5 text-amber-400 opacity-60 group-hover:opacity-100" />
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
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded border border-blue-500/60 bg-gradient-to-r from-blue-950/80 to-slate-900 hover:from-blue-900 hover:to-slate-800 text-blue-200 font-mono text-xs font-bold transition-all shadow-md"
        >
          <Sparkles className="w-3.5 h-3.5 text-blue-400" />
          <span>AI CO-PILOT</span>
        </button>

        {/* CV Modulation Matrix Button */}
        <button
          onClick={onOpenCVMatrix}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 font-mono text-xs font-bold transition-colors shadow"
        >
          <Sliders className="w-3.5 h-3.5 text-amber-400" />
          <span>CV MATRIX</span>
        </button>

        {/* Master Output Volume Knob */}
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

        {/* Stereo Backlit Analog VU Meters (Cream Dial + Needle) */}
        <div className="flex space-x-1 bg-black/80 p-1 rounded border border-neutral-800 shadow-inner">
          <VUMeter label="OUT L" rms={t.rmsL} peak={t.peakL} width={62} height={42} />
          <VUMeter label="OUT R" rms={t.rmsR} peak={t.peakR} width={62} height={42} />
        </div>
      </div>
    </div>
  </header>
);
};
