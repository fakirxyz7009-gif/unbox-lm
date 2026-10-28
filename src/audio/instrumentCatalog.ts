import { DeviceType } from './types.ts';
import { DEVICE_SPECS, SPEC_GROUPS } from '../../shared/rack/devices/index.ts';

export interface CatalogInstrumentItem {
  id: string;
  type: DeviceType;
  name: string;
  desc: string;
  u: number;
  categoryLabel: string;
  badge: string;
}

export interface InstrumentCategory {
  label: string;
  badge: string;
  color: string;
  /** Shown in instrument pickers (piano roll / keyboard). Defaults by badge. */
  playable?: boolean;
  items: { type: DeviceType; name: string; desc: string; u: number }[];
}

const BASE_CATEGORIES: InstrumentCategory[] = [
  {
    label: 'Native Synths & Tone Generators',
    badge: 'SYNTHS',
    color: 'border-emerald-500/40 text-emerald-400',
    items: [
      { type: 'three_osc', name: 'Tri-Osc Power Synth', desc: 'Triple oscillator synth with detune, shape & fat unison', u: 2 },
      { type: 'sytrus', name: 'Fusion FM / Additive Synth', desc: 'Multi-operator FM synthesis & harmonic modulation', u: 2 },
      { type: 'flex', name: 'Romplex Advanced Rompler', desc: 'Preset-driven sound generator with acoustic & synth macros', u: 2 },
      { type: 'subtractor', name: 'Twin-Osc Analog Synth', desc: 'Dual-osc analog subtractive lead & bass', u: 2 },
      { type: 'thor', name: 'Thunderhead Polysonic Synth', desc: 'Triple-oscillator polysonic powerhouse with chorus', u: 3 },
      { type: 'third_wave', name: '3rd Wave Advanced Wavetable Synth', desc: '24-voice wavetable synth with 3 oscs, Wave Surfer, dual filters & vintage PPG engine', u: 4 },
      { type: 'europa', name: 'Aurora Wavetable Synth', desc: 'Shapeshifting spectral wavetable synth', u: 3 },
      { type: 'monotone', name: 'Monobass Synth', desc: 'Punchy 24dB ladder filter bass synth', u: 1 },
    ],
  },
  {
    label: 'Traditional Indian Classical & Folk Suite',
    badge: 'RAGA & CLASSICAL',
    color: 'border-yellow-500/50 text-yellow-300',
    items: [
      { type: 'bansuri', name: 'Bansuri Bamboo Flute', desc: 'Microtonal meend bending & breath curves', u: 2 },
      { type: 'rec_harmonium', name: 'Classical Harmonium', desc: 'Recorded hand harmonium with chromatic keys from C2 to D5 (CC0)', u: 2 },
      { type: 'rec_tabla_dholak', name: 'Tabla (Dayan & Bayan)', desc: 'Recorded tabla bols and dholak skins with round robins (CC0)', u: 2 },
      { type: 'tanpura', name: 'Tanpura & Drone Generator', desc: 'Continuous classical drone & Sa-Pa harmonics', u: 1 },
      { type: 'dhol', name: 'Dhol Folk Drum', desc: 'Dual-headed regional percussion with transient punch', u: 2 },
      { type: 'tumbi', name: 'Tumbi Folk Resonator', desc: 'Single-string high-resonator folk instrument module', u: 1 },
    ],
  },
  {
    label: 'Keyboard & Electronic Instruments (Electrophones)',
    badge: 'KEYBOARDS',
    color: 'border-cyan-500/50 text-cyan-300',
    items: [
      { type: 'rec_meta_piano', name: 'Piano', desc: 'Recorded 88-key upright piano with four velocity layers (CC0)', u: 3 },
      { type: 'rec_osiris_piano', name: 'Studio Piano (Recorded)', desc: 'Recorded acoustic piano sample pack with three mic perspectives and two velocity layers (CC0)', u: 3 },
      { type: 'percussion_electronic', name: 'Funk Clav Keyboard', desc: 'Electromechanical tangent-struck funky clavinet', u: 2 },
      { type: 'percussion_electronic', name: 'Tape Strings Keyboard', desc: 'Vintage tape-playback orchestral keyboard', u: 3 },
      { type: 'percussion_electronic', name: 'Electronic Keyboard', desc: 'Polyphonic rompler workstation keyboard', u: 2 },
      { type: 'percussion_electronic', name: 'Synthesizer', desc: 'General analog/wavetable synth workstation', u: 2 },
      { type: 'percussion_electronic', name: 'Theremin', desc: 'Contactless antenna pitch-sweep synthesizer', u: 2 },
      { type: 'percussion_electronic', name: 'Ondes Martenot', desc: 'Early vacuum tube ribbon synthesizer', u: 2 },
      { type: 'percussion_electronic', name: 'Stylus Pocket Synth', desc: 'Stylus-played pocket analog synthesizer', u: 1 },
      { type: 'percussion_electronic', name: 'Note-Bender Synth', desc: 'Quirky note-bending electronic vocal synth', u: 1 },
      { type: 'percussion_electronic', name: 'Keytar', desc: 'Strap-on performance lead synth keyboard', u: 2 },
      { type: 'percussion_electronic', name: 'Strum Chord Synth', desc: 'Chord-button electronic harp & strum synth', u: 2 },
      { type: 'percussion_electronic', name: 'Wind Controller Synth', desc: 'Breath-controlled expressive lead synth', u: 2 },
      { type: 'percussion_electronic', name: 'Trautonium', desc: 'Subharmonic sub-oscillator electronic instrument', u: 2 },
      { type: 'percussion_electronic', name: 'Wheel Harp', desc: 'Bowed-string electromechanical keyboard', u: 3 },
      { type: 'percussion_electronic', name: 'Elektronova', desc: 'Modern electronic DSP sound sculpture', u: 2 },
      { type: 'percussion_electronic', name: 'Soundboard Synthesizer', desc: 'Acoustic soundboard resonator synth', u: 3 },
      { type: 'percussion_electronic', name: 'Modeling Guitar', desc: 'Modeling electric guitar interface', u: 2 },
      { type: 'percussion_electronic', name: 'Boutique Modular Guitar', desc: 'Modular boutique electric guitar tone', u: 2 },
      { type: 'percussion_electronic', name: 'Touch Sphere Pad', desc: 'Spherical touch-sensitive electronic pad synth', u: 2 },
      { type: 'percussion_electronic', name: 'Drum Machine', desc: 'Programmable electronic rhythm synth', u: 2 },
      { type: 'percussion_electronic', name: 'Sample Pad', desc: 'Multi-trigger electronic percussion pad', u: 2 },
      { type: 'percussion_electronic', name: 'Sampler', desc: 'Multi-layer harmonic sample workstation', u: 2 },
    ],
  },
  {
    label: 'Stringed Instruments (Chordophones)',
    badge: 'STRINGS',
    color: 'border-orange-500/50 text-orange-300',
    items: [
      { type: 'rec_meta_steel_guitar', name: 'Acoustic Guitar', desc: 'Recorded steel-string acoustic guitar with string-aware multisampling (CC0)', u: 2 },
      { type: 'rec_meta_nylon_guitar', name: 'Guitar', desc: 'Recorded nylon-string classical guitar with velocity layers (CC0)', u: 2 },
      { type: 'rec_growlybass', name: 'Bass Guitar', desc: 'Recorded Squier Jazz Bass with three velocity layers and two round robins (CC0)', u: 2 },
      { type: 'rec_vsco_solo_violin', name: 'Violin', desc: 'Recorded solo violin sustain from VSCO 2 Community Edition (CC0)', u: 2 },
      { type: 'rec_vsco_viola_section', name: 'Viola', desc: 'Recorded viola ensemble sustain with vibrato (CC0)', u: 2 },
      { type: 'rec_vsco_cello_section', name: 'Cello', desc: 'Recorded cello section sustain with vibrato (CC0)', u: 2 },
      { type: 'rec_vsco_cello_section', name: 'Violoncello', desc: 'Recorded cello section sustain with vibrato (CC0)', u: 2 },
      { type: 'rec_vsco_contrabass', name: 'Double Bass', desc: 'Recorded orchestral contrabass sustain with vibrato (CC0)', u: 3 },
      { type: 'rec_vsco_harp', name: 'Harp', desc: 'Recorded concert harp plucks (CC0)', u: 2 },
      { type: 'world_instrument', name: 'Sitar', desc: 'Sympathetic string classical Indian sitar', u: 2 },
      { type: 'world_instrument', name: 'Banjo', desc: 'Resonator skin plucked 5-string banjo', u: 2 },
      { type: 'world_instrument', name: 'Mandolin', desc: 'Paired-course bright plucked folk mandolin', u: 2 },
      { type: 'world_instrument', name: 'Ukulele', desc: 'Four-string Hawaiian soprano ukulele', u: 1 },
      { type: 'world_instrument', name: 'Harpsichord', desc: 'Quilled plucked baroque keyboard instrument', u: 2 },
      { type: 'world_instrument', name: 'Clavichord', desc: 'Tangent-struck early keyboard string instrument', u: 2 },
      { type: 'world_instrument', name: 'Erhu', desc: 'Traditional Chinese two-stringed bowed fiddle', u: 2 },
      { type: 'rec_vsco_solo_violin', name: 'Fiddle', desc: 'Recorded solo violin sustain from VSCO 2 Community Edition (CC0)', u: 2 },
      { type: 'world_instrument', name: 'Koto', desc: 'Traditional Japanese 13-string plucked zither', u: 3 },
      { type: 'world_instrument', name: 'Kora', desc: '21-string West African calabash bridge harp', u: 2 },
      { type: 'world_instrument', name: 'Oud', desc: 'Fretless short-necked Middle Eastern lute', u: 2 },
      { type: 'world_instrument', name: 'Shamisen', desc: 'Three-stringed Japanese percussive banjo-lute', u: 2 },
      { type: 'world_instrument', name: 'Baglama', desc: 'Long-necked Turkish folk lute (Saz)', u: 2 },
      { type: 'world_instrument', name: 'Bouzouki', desc: 'Greek long-necked sharp metallic lute', u: 2 },
      { type: 'world_instrument', name: 'Balalaika', desc: 'Triangular Russian folk plucked string', u: 2 },
      { type: 'world_instrument', name: 'Charango', desc: 'Bright Andean 10-string plucked lute', u: 1 },
      { type: 'world_instrument', name: 'Lute', desc: 'Renaissance plucked pear-shaped lute', u: 2 },
      { type: 'world_instrument', name: 'Lyre', desc: 'Ancient harp-like plucked string instrument', u: 2 },
      { type: 'world_instrument', name: 'Zither', desc: 'Acoustic plucked tabletop chord zither', u: 2 },
      { type: 'world_instrument', name: 'Hammered Dulcimer', desc: 'Mallet-struck trapezoidal string zither', u: 2 },
      { type: 'world_instrument', name: 'Appalachian Dulcimer', desc: 'Folk plucked fretted string box resonator', u: 2 },
      { type: 'world_instrument', name: 'Dulcimer', desc: 'Resonant plucked string zither module', u: 2 },
      { type: 'world_instrument', name: 'Autoharp', desc: 'Chord-bar zither plucked string engine', u: 2 },
      { type: 'world_instrument', name: 'Banjolele', desc: 'Hybrid banjo-ukulele plucked resonator', u: 1 },
      { type: 'world_instrument', name: 'Chitarrone', desc: 'Extended-neck baroque theorbo bass lute', u: 3 },
      { type: 'world_instrument', name: 'Hurdy-Gurdy', desc: 'Wheel-bowed drone string instrument', u: 2 },
      { type: 'world_instrument', name: 'Nyckelharpa', desc: 'Swedish keyed bowed resonant fiddle', u: 2 },
      { type: 'world_instrument', name: 'Octobass', desc: 'Massive three-stringed sub-bass bowed string', u: 3 },
      { type: 'world_instrument', name: 'Psaltery', desc: 'Ancient plucked string zither soundbox', u: 2 },
      { type: 'world_instrument', name: 'Rebab', desc: 'Spiked bowed lute with warm vocal tone', u: 2 },
      { type: 'world_instrument', name: 'Ruan', desc: 'Traditional Chinese plucked moon lute', u: 2 },
    ],
  },
  {
    label: 'Wind Instruments (Aerophones)',
    badge: 'WINDS & BRASS',
    color: 'border-sky-500/50 text-sky-300',
    items: [
      { type: 'rec_vsco_flute', name: 'Flute', desc: 'Recorded non-vibrato concert flute sustain (CC0)', u: 2 },
      { type: 'world_instrument', name: 'Saxophone', desc: 'Expressive single-reed brass jazz woodwind', u: 2 },
      { type: 'rec_vsco_trumpet', name: 'Trumpet', desc: 'Recorded trumpet sustain with vibrato (CC0)', u: 2 },
      { type: 'rec_vsco_trombone', name: 'Trombone', desc: 'Recorded trombone sustain (CC0)', u: 2 },
      { type: 'rec_vsco_french_horn', name: 'French Horn', desc: 'Recorded French horn sustain (CC0)', u: 2 },
      { type: 'rec_vsco_clarinet', name: 'Clarinet', desc: 'Recorded clarinet sustain (CC0)', u: 2 },
      { type: 'rec_vsco_oboe', name: 'Oboe', desc: 'Recorded non-vibrato oboe sustain (CC0)', u: 2 },
      { type: 'rec_vsco_bassoon', name: 'Bassoon', desc: 'Recorded bassoon sustain (CC0)', u: 2 },
      { type: 'rec_vsco_tuba', name: 'Tuba', desc: 'Recorded tuba sustain (CC0)', u: 3 },
      { type: 'world_instrument', name: 'Accordion', desc: 'Free-reed bellows folk & tango aerophone', u: 2 },
      { type: 'world_instrument', name: 'Harmonica', desc: 'Bluesy pocket free-reed mouth harp', u: 1 },
      { type: 'world_instrument', name: 'Pipe Organ', desc: 'Monumental cathedral pneumatic pipe organ', u: 3 },
      { type: 'world_instrument', name: 'Bagpipes', desc: 'Reservoir-blown Highland drone pipe aerophone', u: 2 },
      { type: 'world_instrument', name: 'Pan Flute', desc: 'Breath-blown multi-tubed bamboo panpipe', u: 2 },
      { type: 'world_instrument', name: 'Shakuhachi', desc: 'Japanese end-blown zen bamboo flute', u: 1 },
      { type: 'world_instrument', name: 'Duduk', desc: 'Soulful Armenian apricot-wood double reed', u: 1 },
      { type: 'world_instrument', name: 'Ocarina', desc: 'Pure ceramic vessel flute aerophone', u: 1 },
      { type: 'world_instrument', name: 'Recorder', desc: 'Baroque wooden fipple block flute', u: 1 },
      { type: 'world_instrument', name: 'Piccolo', desc: 'Brilliant high-octave transverse flute', u: 1 },
      { type: 'world_instrument', name: 'English Horn', desc: 'Melancholic alto double-reed woodwind', u: 2 },
      { type: 'world_instrument', name: 'Bass Clarinet', desc: 'Deep woody single-reed bass woodwind', u: 2 },
      { type: 'world_instrument', name: 'Euphonium', desc: 'Mellow wide-bore tenor brass horn', u: 2 },
      { type: 'world_instrument', name: 'Baritone Horn', desc: 'Warm low-register valved brass horn', u: 2 },
      { type: 'world_instrument', name: 'Melodica', desc: 'Keyboard free-reed dub & folk wind horn', u: 2 },
      { type: 'world_instrument', name: 'Didgeridoo', desc: 'Australian Indigenous resonant drone pipe', u: 2 },
      { type: 'world_instrument', name: 'Bansuri', desc: 'Indian transverse bamboo flute', u: 1 },
      { type: 'rec_harmonium', name: 'Harmonium', desc: 'Recorded hand harmonium with chromatic keys from C2 to D5 (CC0)', u: 2 },
      { type: 'world_instrument', name: 'Concertina', desc: 'Hexagonal free-reed bellows instrument', u: 2 },
      { type: 'world_instrument', name: 'Uilleann Pipes', desc: 'Irish bellows-blown sweet elbow pipes', u: 2 },
      { type: 'world_instrument', name: 'Nay', desc: 'Middle Eastern breathy end-blown reed flute', u: 1 },
      { type: 'world_instrument', name: 'Kenas', desc: 'Andean notched vertical bamboo flute', u: 1 },
      { type: 'world_instrument', name: 'Siku', desc: 'Andean double-row bamboo panpipe', u: 2 },
      { type: 'world_instrument', name: 'Sheng', desc: 'Chinese polyphonic mouth-blown reed organ', u: 2 },
      { type: 'world_instrument', name: 'Suona', desc: 'Traditional Chinese high-pitch double-reed horn', u: 2 },
      { type: 'world_instrument', name: 'Zurna', desc: 'Festive double-reed Near Eastern shawm', u: 2 },
      { type: 'world_instrument', name: 'Alphorn', desc: 'Long wooden alpine natural resonant horn', u: 3 },
      { type: 'world_instrument', name: 'Sousaphone', desc: 'Marching bass brass horn', u: 3 },
      { type: 'world_instrument', name: 'Bugle', desc: 'Military natural brass call horn', u: 1 },
      { type: 'world_instrument', name: 'Shofar', desc: 'Ancient ram horn ritual aerophone', u: 1 },
      { type: 'world_instrument', name: 'Whistle', desc: 'Celtic tin/folk fipple whistle', u: 1 },
      { type: 'world_instrument', name: 'Fife', desc: 'High-pitched transverse folk flute', u: 1 },
      { type: 'world_instrument', name: 'Glass Harmonica', desc: 'Crystalline friction glass bowl aerophone', u: 2 },
      { type: 'world_instrument', name: 'Khaen', desc: 'Lao bamboo mouth organ free-reed pipe', u: 2 },
      { type: 'world_instrument', name: 'Xun', desc: 'Chinese ancient clay vessel flute', u: 1 },
      { type: 'world_instrument', name: 'Venu', desc: 'South Indian Carnatic bamboo flute', u: 1 },
      { type: 'world_instrument', name: 'Pungi', desc: 'Indian double-reed snake charmer pipe', u: 2 },
      { type: 'world_instrument', name: 'Kazoo', desc: 'Buzzing membrane mirliton aerophone', u: 1 },
      { type: 'world_instrument', name: "Jew's Harp", desc: 'Overtone-rich plucked mouth reed', u: 1 },
      { type: 'world_instrument', name: 'Calliope', desc: 'Circus steam whistle organ aerophone', u: 3 },
    ],
  },
  {
    label: 'Percussion Instruments (Idiophones & Membranophones)',
    badge: 'PERCUSSION',
    color: 'border-purple-500/50 text-purple-300',
    items: [
      { type: 'rec_vcsl_marimba', name: 'Marimba', desc: 'Recorded acoustic marimba with three dynamic layers across F2–C7 (CC0)', u: 2 },
      { type: 'percussion_electronic', name: 'Xylophone', desc: 'Bright wooden bar orchestral mallet percussion', u: 2 },
      { type: 'percussion_electronic', name: 'Vibraphone', desc: 'Metallic jazz mallet bars with motor tremolo', u: 2 },
      { type: 'percussion_electronic', name: 'Glockenspiel', desc: 'Sparkling orchestral steel bar bells', u: 2 },
      { type: 'percussion_electronic', name: 'Celesta', desc: 'Magical felt-hammer struck steel bar keyboard', u: 2 },
      { type: 'percussion_electronic', name: 'Kalimba', desc: 'African plucked metal-tine thumb piano', u: 1 },
      { type: 'percussion_electronic', name: 'Mbira', desc: 'Traditional Zimbabwean resonant thumb piano', u: 1 },
      { type: 'percussion_electronic', name: 'Handpan', desc: 'Harmonic steel acoustic melodic sound sculpture', u: 2 },
      { type: 'percussion_electronic', name: 'Tuned Steel Handpan', desc: 'Swiss convex steel harmonic hand drum', u: 2 },
      { type: 'percussion_electronic', name: 'Steelpan', desc: 'Caribbean hammered melodic oil drum pan', u: 2 },
      { type: 'percussion_electronic', name: 'Tubular Bells', desc: 'Grand orchestral chime bells', u: 3 },
      { type: 'percussion_electronic', name: 'Timpani', desc: 'Tuned orchestral pedal kettle drum', u: 3 },
      { type: 'percussion_electronic', name: 'Taiko', desc: 'Thunderous Japanese barrel drum', u: 3 },
      { type: 'percussion_electronic', name: 'Djembe', desc: 'West African rope-tuned skin goblet drum', u: 2 },
      { type: 'percussion_electronic', name: 'Conga', desc: 'Warm Afro-Cuban tall single-head hand drum', u: 2 },
      { type: 'percussion_electronic', name: 'Bongos', desc: 'High-pitched attached pair of hand drums', u: 2 },
      { type: 'percussion_electronic', name: 'Cajón', desc: 'Peruvian slap & bass wooden box drum', u: 2 },
      { type: 'percussion_electronic', name: 'Darbuka', desc: 'Crisp Middle Eastern goblet hand drum', u: 2 },
      { type: 'percussion_electronic', name: 'Doumbek', desc: 'Resonant metallic Middle Eastern goblet drum', u: 2 },
      { type: 'rec_tabla_dholak', name: 'Tabla', desc: 'Recorded tabla bols and dholak skins with round robins (CC0)', u: 2 },
      { type: 'percussion_electronic', name: 'Mridangam', desc: 'South Indian classical double-headed drum', u: 2 },
      { type: 'percussion_electronic', name: 'Balafon', desc: 'West African gourd-resonated wooden xylophone', u: 2 },
      { type: 'percussion_electronic', name: 'Jalatarang', desc: 'Porcelain water-tuned melodic bowls', u: 2 },
      { type: 'rec_big_rusty_drums', name: 'Acoustic Drum Kit (Recorded)', desc: 'Recorded acoustic rock kit with velocity layers, round robins and hi-hat choke (CC0)', u: 3 },
      { type: 'percussion_electronic', name: 'Bass Drum', desc: 'Deep orchestral & studio kick drum', u: 2 },
      { type: 'percussion_electronic', name: 'Snare Drum', desc: 'Crisp wire-snare acoustic drum', u: 2 },
      { type: 'percussion_electronic', name: 'Toms', desc: 'Tuned rack & floor tom drum set', u: 2 },
      { type: 'percussion_electronic', name: 'Hi-Hat', desc: 'Crisp metallic foot-operated cymbal pair', u: 1 },
      { type: 'percussion_electronic', name: 'Cymbal', desc: 'Shimmering bronze crash & ride cymbal', u: 2 },
      { type: 'percussion_electronic', name: 'Gong', desc: 'Deep bronze harmonic tam-tam gong', u: 3 },
      { type: 'percussion_electronic', name: 'Bell', desc: 'Cast bronze resonant temple bell', u: 1 },
      { type: 'percussion_electronic', name: 'Chimes', desc: 'Shimmering metallic bar chimes', u: 2 },
      { type: 'percussion_electronic', name: 'Cowbell', desc: 'Punchy Latin & 808 metal cowbell', u: 1 },
      { type: 'percussion_electronic', name: 'Agogo', desc: 'Samba double-bell metallic idiophone', u: 1 },
      { type: 'percussion_electronic', name: 'Triangle', desc: 'Pure high-frequency steel rod idiophone', u: 1 },
      { type: 'percussion_electronic', name: 'Wood Block', desc: ' Crisp hollow slit hardwood block', u: 1 },
      { type: 'percussion_electronic', name: 'Temple Block', desc: 'Tuned hollow wooden slit block cluster', u: 1 },
      { type: 'percussion_electronic', name: 'Claves', desc: 'Bright resonant rosewood rhythm sticks', u: 1 },
      { type: 'percussion_electronic', name: 'Castanets', desc: 'Flamenco rapid wooden shell clackers', u: 1 },
      { type: 'percussion_electronic', name: 'Maracas', desc: 'Crisp Latin gourd rattle shakers', u: 1 },
      { type: 'percussion_electronic', name: 'Shekere', desc: 'Beaded net gourd shaker percussion', u: 1 },
      { type: 'percussion_electronic', name: 'Tambourine', desc: 'Bright jingled frame drum', u: 1 },
      { type: 'percussion_electronic', name: 'Pandeiro', desc: 'Tuned Brazilian samba tambourine', u: 1 },
      { type: 'percussion_electronic', name: 'Bodhrán', desc: 'Irish traditional tipper frame drum', u: 2 },
      { type: 'percussion_electronic', name: 'Frame Drum', desc: 'Warm ancient circular hand drum', u: 2 },
      { type: 'percussion_electronic', name: 'Log Drum', desc: 'Warm wooden slit tongue drum', u: 2 },
      { type: 'percussion_electronic', name: 'Berimbau', desc: 'Brazilian single-string gourd musical bow', u: 1 },
      { type: 'percussion_electronic', name: 'Anklung', desc: 'Indonesian shaken bamboo rattle tubes', u: 1 },
      { type: 'percussion_electronic', name: 'Tuned Pitch Tubes', desc: 'Tuned hollow plastic pitch tube', u: 1 },
      { type: 'percussion_electronic', name: 'Guiro', desc: 'Notched gourd rhythmic scraper', u: 1 },
      { type: 'percussion_electronic', name: 'Jawbone Rattle', desc: 'Metallic rattling jawbone effect', u: 1 },
      { type: 'percussion_electronic', name: 'Wind Chime', desc: 'Ethereal suspended aluminum chime tubes', u: 2 },
    ],
  },
  {
    label: 'Drums & Samplers',
    badge: 'RHYTHM',
    color: 'border-amber-500/40 text-amber-400',
    items: [
      { type: 'redrum', name: 'Beatbox 8 Drum Machine', desc: '8-channel drum computer with step sequencer', u: 3 },
      { type: 'mimic', name: 'Copycat Creative Sampler', desc: '8-pad instrument with acoustic & sample playback', u: 3 },
    ],
  },
  {
    label: 'Sequencing & Modulation',
    badge: 'CONTROL',
    color: 'border-emerald-500/40 text-emerald-400',
    items: [
      { type: 'matrix', name: 'Matrix Pattern / CV Sequencer', desc: '16-step pitch, gate, and curve CV sequencer', u: 2 },
      { type: 'pulsar', name: 'Twin LFO Modulator', desc: 'Dual low-frequency oscillators for dynamic modulation', u: 1 },
      { type: 'spider_cv', name: 'CV Splitter / Merger', desc: 'Multi-channel CV splitter, inverter & merger', u: 1 },
    ],
  },
  {
    label: 'Outboard DSP & Dynamics',
    badge: 'PROCESSING',
    color: 'border-teal-500/40 text-teal-400',
    items: [
      { type: 'scream4', name: 'Howler Tape Distortion', desc: 'Harmonic saturation, tube warmth & overdrive', u: 1 },
      { type: 'echo', name: 'Repeater Stereo Delay', desc: 'Stereo delay with feedback and ping-pong bounce', u: 1 },
      { type: 'rv7000', name: 'Cathedral Studio Reverb', desc: 'Convolution & algorithmic reverb with decay & damping', u: 2 },
      { type: 'mclass_master', name: 'Masterline Mastering Suite', desc: '4-band parametric EQ, bus compressor & limiter', u: 3 },
      { type: 'spider_audio', name: 'Audio Splitter / Merger', desc: 'Signal routing and parallel split utility', u: 1 },
    ],
  },
];

/** Reason lineup + hardware emulations (shared/rack/devices), grouped like the Rack browser. */
const SPEC_CATEGORIES: InstrumentCategory[] = SPEC_GROUPS.map((g) => ({
  label: g.label,
  badge: g.badge,
  color: g.color,
  playable: g.playable,
  items: DEVICE_SPECS.filter((s) => s.group === g.label).map((s) => ({ type: s.type as DeviceType, name: s.name, desc: s.description, u: s.panel.units ?? 2 })),
})).filter((c) => c.items.length > 0);

export const INSTRUMENT_CATEGORIES: InstrumentCategory[] = [...BASE_CATEGORIES, ...SPEC_CATEGORIES];

/** Recorded packs for compact instrument pickers such as the sequencer's Add Instrument menu. */
export const RECORDED_INSTRUMENT_OPTIONS = INSTRUMENT_CATEGORIES
  .filter((cat) => cat.label === 'Recorded Instruments' || cat.label === 'Recorded Drums & Percussion')
  .flatMap((cat) => cat.items);

// Only playable instruments (excluding pure FX/routing utilities) for Piano Roll & MIDI Keyboard selectors
export const PLAYABLE_INSTRUMENT_CATEGORIES = INSTRUMENT_CATEGORIES.filter(
  (cat) => cat.playable ?? (cat.badge !== 'PROCESSING' && cat.badge !== 'CONTROL')
);

export const ALL_PLAYABLE_INSTRUMENTS: CatalogInstrumentItem[] = PLAYABLE_INSTRUMENT_CATEGORIES.flatMap((cat) =>
  cat.items.map((item) => ({
    ...item,
    id: `${item.type}::${item.name}`,
    categoryLabel: cat.label,
    badge: cat.badge,
  }))
);
