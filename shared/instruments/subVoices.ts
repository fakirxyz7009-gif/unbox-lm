/**
 * subVoices.ts
 *
 * Catalog of authentic voices, articulations, mic positions, and timbre presets
 * for every built-in instrument across all categories (starting with Electrophones /
 * Keyboard & Electronic Instruments, through Strings, Synths, Winds, World, and Drums).
 */

export interface SubVoiceOption {
  id: string;
  name: string;
  category: 'Mic Position' | 'Articulation' | 'Voice' | 'Tone';
  description?: string;
  default?: boolean;
}

export const INSTRUMENT_SUB_VOICES: Record<string, SubVoiceOption[]> = {
  // --- Electrophones: Keyboards & Electronic Instruments ---
  'Piano': [
    { id: 'piano-upright-close', name: 'Upright Close Mic', category: 'Mic Position', description: 'Dry, direct proximity microphone placement on the soundboard', default: true },
    { id: 'piano-upright-room', name: 'Upright Room Mic', category: 'Mic Position', description: 'Wide stereo ambient room microphones capturing natural acoustic space' },
    { id: 'piano-felt', name: 'Felt Piano', category: 'Tone', description: 'Soft damper felt dampening the hammer strikes for intimate scoring' },
    { id: 'piano-honky-tonk', name: 'Honky-Tonk', category: 'Tone', description: 'Tack-hammer modified detuned upright with bright saloon twang' },
  ],

  'Studio Piano (Recorded)': [
    { id: 'studio-piano-close', name: 'Close Perspective', category: 'Mic Position', description: 'Pair of cardioid condensers 6 inches above the hammers', default: true },
    { id: 'studio-piano-player', name: 'Player Perspective', category: 'Mic Position', description: 'Binaural perspective from the piano bench' },
    { id: 'studio-piano-room', name: 'Room Perspective', category: 'Mic Position', description: 'Blumlein ribbon pair 12 feet back in a wood-paneled recital hall' },
    { id: 'studio-piano-ambient', name: 'Ambient Mics', category: 'Mic Position', description: 'Diffuse omnidirectional hall microphones for large cinematic depth' },
  ],

  'Funk Clav Keyboard': [
    { id: 'clav-d6-mute', name: 'Hohner D6 Clavinet Mute', category: 'Articulation', description: 'Mechanical slider mute engaged for rhythmic percussive chucks', default: true },
    { id: 'clav-pickups-ab', name: 'Clavinet Pickups AB', category: 'Voice', description: 'Both bridge and neck electromagnetic pickups in parallel' },
    { id: 'clav-brilliant', name: 'Clavinet Brilliant', category: 'Tone', description: 'High-pass brilliance tone filter engaged for cutting funk rhythm' },
    { id: 'clav-wah-filter', name: 'Wah Filter Clav', category: 'Tone', description: 'Dynamic envelope sweep responsive to touch velocity' },
  ],

  'Tape Strings Keyboard': [
    { id: 'tape-mkii-violins', name: 'Mellotron MKII Violins', category: 'Voice', description: 'Legendary 3-violin tape bank recorded at Abbey Road (1963)', default: true },
    { id: 'tape-flute', name: 'Mellotron Flute', category: 'Voice', description: 'Authentic 8-second tape-loop wooden flute with iconic flutter' },
    { id: 'tape-cello', name: 'Mellotron Cello', category: 'Voice', description: 'Single solo cello tape rack with warm vintage saturation' },
    { id: 'tape-chamberlin-brass', name: 'Chamberlin Brass', category: 'Voice', description: 'American tape-replay trumpet & trombone section' },
  ],

  'Electronic Keyboard': [
    { id: 'ep-vintage-stage', name: 'Vintage Stage EP', category: 'Voice', description: '1973 suitcase electro-acoustic tine piano with stereo pan tremolo', default: true },
    { id: 'ep-dyno-tine', name: 'Dyno Tine EP', category: 'Tone', description: 'Modified bell-heavy tine adjustment with crisp top-end bite' },
    { id: 'ep-electric-grand', name: 'Electric Grand 80', category: 'Voice', description: '70s stage electro-acoustic piano with CP-style piezoelectric pickups' },
    { id: 'ep-dx-fm-tines', name: 'DX FM Tines', category: 'Voice', description: 'Crisp 6-operator digital frequency modulation electric piano' },
  ],

  'Synthesizer': [
    { id: 'synth-poly-lead', name: 'Analog Poly Lead', category: 'Voice', description: 'Dual detuned saw waveforms through a 24dB ladder filter', default: true },
    { id: 'synth-saw-brass', name: 'Saw Brass 80s', category: 'Voice', description: 'Classic synth brass with resonant filter envelope swell' },
    { id: 'synth-warm-strings', name: 'Warm String Pad', category: 'Voice', description: 'Multi-oscillator ensemble string pad with subtle chorus' },
    { id: 'synth-resonant-sweep', name: 'Resonant Sweep', category: 'Tone', description: 'High-resonance modulation filter sweep with sub-oscillator body' },
  ],

  'Theremin': [
    { id: 'theremin-heterodyne', name: 'Pure Heterodyne Sine', category: 'Voice', description: 'Classic dual-oscillator RF beat frequency sine wave', default: true },
    { id: 'theremin-portamento', name: 'Expressive Portamento', category: 'Articulation', description: 'Continuous pitch-glide with player hand-capacitance modeling' },
    { id: 'theremin-valve', name: 'Vintage Valve Theremin', category: 'Tone', description: 'Warm tube-driven harmonic coloration with 50Hz hum nuances' },
    { id: 'theremin-vibrato', name: 'Ghostly Vibrato', category: 'Articulation', description: 'Deep human hand-shake vibrato for classic sci-fi/hauntology leads' },
  ],

  'Ondes Martenot': [
    { id: 'ondes-ruban', name: 'Ruban Expression (Ribbon)', category: 'Articulation', description: 'Ring-controlled finger slide for seamless glissandi', default: true },
    { id: 'ondes-de-choc', name: 'Onde de Choc (Ring)', category: 'Voice', description: 'Percussive key strike triggering the mechanical ribbon resonator' },
    { id: 'ondes-metallique', name: 'Metallique Gong Resonator', category: 'Tone', description: 'Acoustic gong loudspeaker diffuser producing metallic overtones' },
    { id: 'ondes-palme', name: 'Palme Diffuser', category: 'Tone', description: 'Strings-in-a-palm acoustic cabinet producing sympathetic resonance' },
  ],

  'Stylus Pocket Synth': [
    { id: 'stylus-buzzer', name: 'Classic Stylus Buzzer', category: 'Voice', description: 'Direct metal-pad stylus contact raw square wave buzz', default: true },
    { id: 'stylus-vibrato', name: 'Vibrato Square', category: 'Articulation', description: '5.5 Hz pitch modulation switch engaged on the stylus oscillator' },
    { id: 'stylus-pocket-bass', name: 'Pocket Bass', category: 'Tone', description: 'Sub-octave divider mode for crunchy miniature bass riffs' },
    { id: 'stylus-filter-lead', name: 'Filter Click Lead', category: 'Voice', description: 'Transient key-tap pop on each note contact' },
  ],

  'Note-Bender Synth': [
    { id: 'notebender-vocal-lead', name: 'Mouth-Wobble Vocal Lead', category: 'Voice', description: 'Silicone mouth-squeeze modulating acoustic vowel cavity', default: true },
    { id: 'notebender-formant-squeeze', name: 'Cheek Squeeze Formant', category: 'Tone', description: 'Tight formant shift from "OOH" to "AAH" on press' },
    { id: 'notebender-nasal-reed', name: 'Nasal Reed Bend', category: 'Tone', description: 'Upper-harmonic nasal resonance with continuous ribbon pitch strip' },
    { id: 'notebender-grunt-bass', name: 'Low Grunt Bass', category: 'Voice', description: 'Lower octave register with quirky guttural transient articulation' },
  ],

  'Keytar': [
    { id: 'keytar-stadium-solo', name: 'Stadium Solo Saw', category: 'Voice', description: 'High-gain polyphonic saw lead with neck pitch-ribbon response', default: true },
    { id: 'keytar-lead-screamer', name: 'Harmonic Lead Screamer', category: 'Voice', description: 'Sync-lead oscillator screaming with neck mod-bar modulation' },
    { id: 'keytar-funky-clav', name: 'Funky Synth Clav', category: 'Tone', description: 'Snappy percussive keytar pluck for syncopated stage solos' },
    { id: 'keytar-feedback-solo', name: 'Feedback Solo', category: 'Tone', description: 'Simulated guitar amp feedback tone triggered on sustained notes' },
  ],

  'Strum Chord Synth': [
    { id: 'strum-touch-plate', name: 'Touch Plate Strum', category: 'Voice', description: 'Capacitive touch strumplate gliding through chord harp notes', default: true },
    { id: 'strum-arp-harp', name: 'Major Arp Harp', category: 'Articulation', description: 'Automated 16th-note arpeggiated electronic autoharp strum' },
    { id: 'strum-celesta-chord', name: 'Crystal Celesta Chord', category: 'Tone', description: 'Pristine 80s analog sine/triangle bell tones' },
    { id: 'strum-auto-rhythm', name: '80s Auto-Strummer', category: 'Voice', description: 'Retro analog accompaniment chord generator with synchronized strum' },
  ],

  'Wind Controller Synth': [
    { id: 'wind-breathy-lead', name: 'Breathy Lyric Lead', category: 'Voice', description: 'Dynamic breath-pressure sensor driving filter cutoff and amplitude', default: true },
    { id: 'wind-analog-brass', name: 'Analog Brass Horn', category: 'Voice', description: 'Aggressive sawtooth brass swell responsive to blowing intensity' },
    { id: 'wind-flute', name: 'Expressive Flute', category: 'Voice', description: 'Harmonic overblowing simulation when breath pressure peaks' },
    { id: 'wind-harmonica', name: 'Harmonica Reed', category: 'Tone', description: 'Bluesy dual-reed electronic emulation with lip-bite pitch bend' },
  ],

  'Trautonium': [
    { id: 'trautonium-wire-solo', name: 'Subharmonic Wire Solo', category: 'Voice', description: 'Manual string-wire resistor pitch controller with neon-lamp oscillator', default: true },
    { id: 'trautonium-mixtur-organ', name: 'Mixtur-Trautonium Organ', category: 'Voice', description: 'Subharmonic frequency divider chords built on fractional sub-multiples' },
    { id: 'trautonium-percussive-stroke', name: 'Percussive String Stroke', category: 'Articulation', description: 'Dynamic touch rail stroke producing transient bell-like impacts' },
    { id: 'trautonium-sub-drone', name: 'Deep Subharmonic Drone', category: 'Tone', description: 'Sub-fundamental undertone oscillation tuned for cinematic dread' },
  ],

  'Wheel Harp': [
    { id: 'wheelharp-hurdy-gurdy', name: 'Hurdy-Gurdy Continuous Bow', category: 'Voice', description: 'Rotating rosined wheel continuously exciting 61 acoustic strings', default: true },
    { id: 'wheelharp-violin-wheel', name: 'Violin Wheel Chords', category: 'Voice', description: 'Polyphonic bowed string chords with keyboard-actuated string dampers' },
    { id: 'wheelharp-cello-drone', name: 'Cello Drone Bass', category: 'Tone', description: 'Low register acoustic wheel drag with rich rosin friction harmonics' },
    { id: 'wheelharp-sympathetic-pluck', name: 'Sympathetic Rosin Pluck', category: 'Articulation', description: 'Staccato key release snapping the strings against the wheel rim' },
  ],

  'Elektronova': [
    { id: 'elektronova-spectral-pad', name: 'Spectral Shimmer Pad', category: 'Tone', description: 'FFT-synthesized harmonic pad with shifting crystal overtones', default: true },
    { id: 'elektronova-particle-cloud', name: 'Granular Particle Cloud', category: 'Voice', description: 'Asynchronous granular cloud scattering acoustic fragments' },
    { id: 'elektronova-hypersaw', name: 'Hyper-Saw Texture', category: 'Voice', description: 'Multi-voice supersaw detuned with complex stereo chorus dispersion' },
    { id: 'elektronova-sub-warp', name: 'Sub-Bass Warp', category: 'Tone', description: 'Pitch-swept 32-bit floating point sub oscillator with tube drive' },
  ],

  'Soundboard Synthesizer': [
    { id: 'soundboard-spruce', name: 'Spruce Soundboard Resonance', category: 'Voice', description: 'Acoustic piano soundboard transducer impulse response synthesis', default: true },
    { id: 'soundboard-harp-ping', name: 'Harp Resonator Ping', category: 'Voice', description: 'Triangular frame acoustic reflection with high string sustain' },
    { id: 'soundboard-contact-mic', name: 'Contact Mic Knock', category: 'Articulation', description: 'Piezo contact microphone capturing structural wood knocks' },
    { id: 'soundboard-chamber-body', name: 'Chamber Acoustic Body', category: 'Tone', description: 'Hollow wooden instrument body cavity with resonant air mode' },
  ],

  'Modeling Guitar': [
    { id: 'modeling-guitar-strat-neck', name: 'Clean Strat Neck Pickup', category: 'Voice', description: 'Warm, glassy single-coil tone with chime and bell harmonics', default: true },
    { id: 'modeling-guitar-tele-bridge', name: 'Tele Bridge Twang', category: 'Voice', description: 'Punchy, biting bridge single-coil cutting through the mix' },
    { id: 'modeling-guitar-lp-drive', name: 'Les Paul Overdrive', category: 'Tone', description: 'Thick dual-humbucker midrange crunch through British valve stack' },
    { id: 'modeling-guitar-acoustic-piezo', name: 'Acoustic Piezo Simulation', category: 'Tone', description: 'Under-saddle transducer model simulating dreadnought steel acoustic' },
  ],

  'Boutique Modular Guitar': [
    { id: 'modular-guitar-tube-crunch', name: 'Tube Preamp Crunch', category: 'Tone', description: '12AX7 dual-triode dynamic tube saturation responding to pick velocity', default: true },
    { id: 'modular-guitar-fuzz-sustainer', name: 'Fuzz Face Sustainer', category: 'Voice', description: 'Germanium transistor fuzz circuit delivering endless singing sustain' },
    { id: 'modular-guitar-chorus-clean', name: 'Stereo Chorus Clean', category: 'Tone', description: 'Dual analog bucket-brigade delay lines modulating pitch in stereo' },
    { id: 'modular-guitar-octave-fuzz', name: 'Octave Fuzz Lead', category: 'Voice', description: 'Upper octave harmonic generation blended with heavy square fuzz' },
  ],

  'Touch Sphere Pad': [
    { id: 'sphere-glass-pad', name: 'Ambient Glass Sphere', category: 'Voice', description: 'Crystalline physical model of a struck hollow glass sphere', default: true },
    { id: 'sphere-morph-pad', name: 'Velocity Morph Pad', category: 'Tone', description: 'Continuous 3D XYZ pressure interpolation between saw, bell, and noise' },
    { id: 'sphere-metal-texture', name: 'Anisotropic Metal Texture', category: 'Voice', description: 'Non-linear vibrating metal shell with microtonal mode distribution' },
    { id: 'sphere-cinematic-swell', name: 'Cinematic Swell', category: 'Articulation', description: 'Slow-attack orchestral pad swelling into wide stereo shimmer' },
  ],

  'Drum Machine': [
    { id: 'drum-machine-808', name: 'Vintage 808 Analog', category: 'Voice', description: 'Bridged-T oscillator kick, snappy noise snare, and metallic cymbals', default: true },
    { id: 'drum-machine-909', name: 'Punchy 909 Dance', category: 'Voice', description: 'Punchy analog kick & toms with 6-bit sampled hi-hats and cymbals' },
    { id: 'drum-machine-707', name: 'Lo-Fi 707 Rhythm', category: 'Voice', description: 'Crisp 8-bit digital linear PCM drum samples of early 80s dancehall' },
    { id: 'drum-machine-electro-crunch', name: 'Electro Percussion Crunch', category: 'Tone', description: 'Bit-crushed analog synth percussions with tuned noise bursts' },
  ],

  'Sample Pad': [
    { id: 'sample-pad-studio', name: 'Studio Percussion Set', category: 'Voice', description: 'Woodblocks, cowbells, shakers, and acoustic studio percussion hits', default: true },
    { id: 'sample-pad-mallets', name: 'Acoustic Mallet Chime', category: 'Voice', description: 'Struck crotales and orchestral chime bars with long ring' },
    { id: 'sample-pad-urban-claps', name: 'Urban Clap & Snap', category: 'Voice', description: 'Layered finger snaps and room claps with velocity round robins' },
    { id: 'sample-pad-transient-stabs', name: 'FX Transient Stabs', category: 'Tone', description: 'Short modular synth noise clicks, blips, and sub drop thumps' },
  ],

  'Sampler': [
    { id: 'sampler-poly-map', name: 'Poly Multi-Sample Map', category: 'Voice', description: 'Chromatic pitch-mapped multisample instrument across 88 keys', default: true },
    { id: 'sampler-time-stretch', name: 'Time-Stretched Grain', category: 'Tone', description: 'Granular pitch/time decoupled playback preserving sample duration' },
    { id: 'sampler-12bit-grit', name: 'Vintage 12-Bit Grit', category: 'Tone', description: '26 kHz 12-bit ADC emulation with analog anti-aliasing reconstruction filter' },
    { id: 'sampler-reverse-decay', name: 'Reversed Acoustic Decay', category: 'Articulation', description: 'Backwards buffer playback with forward transient preservation' },
  ],

  // --- Chordophones: Strings & Guitars ---
  'Acoustic Guitar': [
    { id: 'guitar-steel-finger', name: 'Steel String Fingerpicked', category: 'Articulation', description: 'Flesh-on-string fingerstyle picking with natural wood resonance', default: true },
    { id: 'guitar-steel-picked', name: 'Steel String Picked', category: 'Articulation', description: 'Celluloid plectrum attack with brilliant upper harmonics' },
    { id: 'guitar-steel-harmonics', name: 'Natural Harmonics', category: 'Articulation', description: '12th, 7th, and 5th fret chiming bell-like node overtones' },
    { id: 'guitar-steel-mic-room', name: 'Stereo Pair Room Mic', category: 'Mic Position', description: 'Small condenser stereo pair at 12th fret and bridge' },
  ],

  'Guitar': [
    { id: 'guitar-nylon-flesh', name: 'Nylon Classical Fingerstyle', category: 'Articulation', description: 'Spanish classical nylon warm timber played with thumb & fingers', default: true },
    { id: 'guitar-nylon-tirando', name: 'Tirando (Free Stroke)', category: 'Articulation', description: 'Light, singing melodic classical guitar stroke' },
    { id: 'guitar-nylon-apoyando', name: 'Apoyando (Rest Stroke)', category: 'Articulation', description: 'Firm, authoritative rest stroke driving maximum soundboard volume' },
    { id: 'guitar-nylon-mic-close', name: 'Soundhole Close Mic', category: 'Mic Position', description: 'Large diaphragm condenser aimed directly across the rosette' },
  ],

  'Bass Guitar': [
    { id: 'bass-jazz-finger', name: 'Jazz Bass Fingerstyle', category: 'Articulation', description: 'Dual single-coil pickups, tone wide open, warm fingerboard pluck', default: true },
    { id: 'bass-jazz-slap', name: 'Slap & Pop Bass', category: 'Articulation', description: 'Thumb slap on low strings, index finger pop on high strings' },
    { id: 'bass-jazz-pick', name: 'Plectrum Hard Attack', category: 'Articulation', description: 'Heavy pick stroke for rock and punk drive' },
    { id: 'bass-jazz-palm-mute', name: 'Vintage Palm Mute', category: 'Tone', description: 'Flesh of palm resting on bridge for Motown thump' },
  ],

  'Violin': [
    { id: 'violin-solo-sustain', name: 'Solo Sustain Vibrato', category: 'Articulation', description: 'Expressive lyrical vibrato with smooth bow changes', default: true },
    { id: 'violin-solo-spiccato', name: 'Solo Spiccato', category: 'Articulation', description: 'Bouncing bow creating short, crisp, agile staccato notes' },
    { id: 'violin-solo-pizzicato', name: 'Solo Pizzicato', category: 'Articulation', description: 'Plucked string with finger, resonant wooden acoustic decay' },
    { id: 'violin-solo-tremolo', name: 'Solo Tremolo', category: 'Articulation', description: 'Rapid unmeasured bow agitation for dramatic tension' },
  ],

  'Viola': [
    { id: 'viola-section-sustain', name: 'Section Sustain Vibrato', category: 'Articulation', description: 'Warm, mellow alto register ensemble sustain', default: true },
    { id: 'viola-section-pizzicato', name: 'Section Pizzicato', category: 'Articulation', description: 'Unified plucked viola section with body resonance' },
    { id: 'viola-section-staccato', name: 'Section Staccato', category: 'Articulation', description: 'Crisp on-the-string short bow strokes' },
    { id: 'viola-section-con-sordino', name: 'Con Sordino (Muted)', category: 'Tone', description: 'Mute placed on bridge for veiled, mysterious warmth' },
  ],

  'Cello': [
    { id: 'cello-section-sustain', name: 'Ensemble Cello Sustain', category: 'Articulation', description: 'Rich, authoritative lower string section legato vibrato', default: true },
    { id: 'cello-section-spiccato', name: 'Ensemble Spiccato', category: 'Articulation', description: 'Short biting bow bounces driving rhythmic ostinatos' },
    { id: 'cello-section-pizzicato', name: 'Ensemble Pizzicato', category: 'Articulation', description: 'Heavy plucked cello plucks with immense low-end resonance' },
    { id: 'cello-section-col-legno', name: 'Col Legno (Wood Stroke)', category: 'Articulation', description: 'Striking strings with the wood of the bow for eerie clicks' },
  ],

  'Violoncello': [
    { id: 'violoncello-solo-sustain', name: 'Solo Lyrical Sustain', category: 'Articulation', description: 'Solo cello with impassioned vibrato and warm portamento', default: true },
    { id: 'violoncello-solo-staccato', name: 'Solo Staccato', category: 'Articulation', description: 'Crisp articulate short bow strokes' },
    { id: 'violoncello-solo-pizz', name: 'Solo Pizzicato', category: 'Articulation', description: 'Warm, round plucked bass notes' },
    { id: 'violoncello-solo-sul-tasto', name: 'Sul Tasto (Over Fingerboard)', category: 'Tone', description: 'Bowing lightly over the fingerboard for soft, flute-like tone' },
  ],

  'Double Bass': [
    { id: 'bass-orchestral-sustain', name: 'Orchestral Contrabass Sustain', category: 'Articulation', description: 'Deep, room-shaking sub-bass bowed sustain', default: true },
    { id: 'bass-orchestral-staccato', name: 'Orchestral Staccato', category: 'Articulation', description: 'Weighty, thunderous short bow strikes' },
    { id: 'bass-jazz-pizz', name: 'Jazz Pizzicato Walk', category: 'Articulation', description: 'Acoustic upright finger pluck with sustained woody resonance' },
    { id: 'bass-orchestral-snap', name: 'Bartok Snap Pizzicato', category: 'Articulation', description: 'String pulled vertically and snapping against fingerboard' },
  ],

  'Harp': [
    { id: 'harp-concert-pluck', name: 'Concert Harp Fingertip Pluck', category: 'Articulation', description: 'Flesh of finger on gut and wire strings, ringing freely', default: true },
    { id: 'harp-concert-pres-de-la-table', name: 'Pres de la Table', category: 'Tone', description: 'Plucked near the soundboard for guitar-like nasal timbre' },
    { id: 'harp-concert-harmonics', name: 'Harp Harmonics', category: 'Articulation', description: 'One octave above fundamentals, delicate and ethereal' },
    { id: 'harp-concert-damped', name: 'Bisbigliando Damped', category: 'Articulation', description: 'Hand muting the strings shortly after plucking' },
  ],

  // --- Indian Classical & Folk Suite ---
  'Bansuri Bamboo Flute': [
    { id: 'bansuri-meend-sustain', name: 'Meend Microtonal Bend', category: 'Articulation', description: 'Smooth continuous gliding between swaras using finger slides', default: true },
    { id: 'bansuri-breath-lead', name: 'Breathy Overblow', category: 'Tone', description: 'Airy embouchure with audible bamboo breath harmonics' },
    { id: 'bansuri-gamak', name: 'Gamak (Heavy Oscillations)', category: 'Articulation', description: 'Vigorous diaphragm-driven vocalic ornamentations' },
    { id: 'bansuri-staccato', name: 'Tongued Staccato', category: 'Articulation', description: 'Crisp rhythmic ti-ti-ka articulations for fast taans' },
  ],

  'Classical Harmonium': [
    { id: 'harmonium-double-reed', name: 'Double Reed (Male/Female)', category: 'Voice', description: 'Two sets of brass reeds vibrating an octave apart', default: true },
    { id: 'harmonium-triple-reed', name: 'Triple Reed Full Bellows', category: 'Voice', description: 'Three reed banks engaged for massive devotional presence' },
    { id: 'harmonium-soft-bellows', name: 'Gentle Pumping Bellows', category: 'Tone', description: 'Soft air pressure producing intimate, mellow reed hum' },
    { id: 'harmonium-tremolo', name: 'Bellows Shake Tremolo', category: 'Articulation', description: 'Fast rhythmic pumping causing dynamic amplitude flutter' },
  ],

  'Tabla (Dayan & Bayan)': [
    { id: 'tabla-na-tin', name: 'Dayan High Bols (Na, Tin)', category: 'Articulation', description: 'Crisp resonant rim strikes on the high wooden drum', default: true },
    { id: 'tabla-ge-mod-bayan', name: 'Bayan Modulated Bass (Ge, Ke)', category: 'Articulation', description: 'Deep bass modulation using palm heel glide across the skin' },
    { id: 'tabla-dha-dhil', name: 'Full Combined Strikes (Dha, Dhin)', category: 'Articulation', description: 'Simultaneous resonant bass and treble bols' },
    { id: 'tabla-ti-re-ki-te', name: 'Fast Rolls (Ti-Re-Ki-Te)', category: 'Articulation', description: 'Rapid 4-stroke finger patterns with round robins' },
  ],

  'Tanpura & Drone Generator': [
    { id: 'tanpura-pa-sa-sa-sa', name: 'Pancham Tuning (Pa-Sa-Sa-Sa)', category: 'Voice', description: 'Standard 4-string classical tuning with cotton thread jivari', default: true },
    { id: 'tanpura-ma-sa-sa-sa', name: 'Madhyam Tuning (Ma-Sa-Sa-Sa)', category: 'Voice', description: 'Fourth note drone tuning for rāgas omitting Pa' },
    { id: 'tanpura-ni-sa-sa-sa', name: 'Nishad Tuning (Ni-Sa-Sa-Sa)', category: 'Voice', description: 'Seventh note drone tuning for Marwa and Puriya' },
    { id: 'tanpura-resonant-jivari', name: 'Maximum Jivari Buzz', category: 'Tone', description: 'Deep cotton buzz releasing a shimmering cascade of upper harmonics' },
  ],

  'Dhol Folk Drum': [
    { id: 'dhol-dagga-bass', name: 'Dagga Bass Stick', category: 'Articulation', description: 'Heavy curved wooden stick striking the goat skin bass head', default: true },
    { id: 'dhol-tilli-treble', name: 'Tilli Treble Cane', category: 'Articulation', description: 'Thin flexible bamboo cane cracking against the treble skin' },
    { id: 'dhol-bhargra-full', name: 'Bhangra Full Strike', category: 'Articulation', description: 'Simultaneous bass and treble strike with room reverb' },
    { id: 'dhol-rim-click', name: 'Tilli Rim Click', category: 'Articulation', description: 'Cane clicking against the wooden shell rim' },
  ],

  'Tumbi Folk Resonator': [
    { id: 'tumbi-open-string', name: 'Open String Twang', category: 'Articulation', description: 'High-pitched single steel string strummed with index finger', default: true },
    { id: 'tumbi-fingered-lead', name: 'Fingered Folk Lead', category: 'Articulation', description: 'Rapid melody runs across the single gourd resonator' },
    { id: 'tumbi-muted-pluck', name: 'Muted Staccato Pluck', category: 'Tone', description: 'Fleshy finger dampening the skin head for percussive chop' },
    { id: 'tumbi-slide-bend', name: 'Pitch-Slide Bend', category: 'Articulation', description: 'Pressing string behind finger to bend notes upward' },
  ],

  // --- World Instruments ---
  'Sitar': [
    { id: 'sitar-da-dir-stroke', name: 'Da-Dir Mizrab Stroke', category: 'Articulation', description: 'Wire plectrum striking the baj tar main playing string', default: true },
    { id: 'sitar-meend-glide', name: 'Meend (Pull Across Fret)', category: 'Articulation', description: 'Pulling the string across curved frets for 5-semitone glissandi' },
    { id: 'sitar-taraf-shimmer', name: 'Tarab (Sympathetic Strings)', category: 'Tone', description: 'Cascade of 13 resonant sympathetic strings humming in the gourd' },
    { id: 'sitar-jhala-speed', name: 'Jhala High-Speed Rhythmic', category: 'Articulation', description: 'Fast rhythmic alternate picking against chikari high strings' },
  ],

  'Banjo': [
    { id: 'banjo-scruggs-roll', name: 'Scruggs 3-Finger Roll', category: 'Articulation', description: 'Metal fingerpicks on 5 strings with tight banjo skin snap', default: true },
    { id: 'banjo-clawhammer', name: 'Clawhammer Down-Pick', category: 'Articulation', description: 'Traditional thumb and fingernail downstroke folk style' },
    { id: 'banjo-harmonics', name: 'Chime Harmonics', category: 'Tone', description: 'Light finger node bell harmonics over the 12th fret' },
    { id: 'banjo-choke-bend', name: 'Bluegrass Choke Bend', category: 'Articulation', description: 'Bluesy string push behind the nut and fret' },
  ],

  'Mandolin': [
    { id: 'mandolin-tremolo-duet', name: 'Rapid Double-Course Tremolo', category: 'Articulation', description: 'Fast alternating pick across paired steel courses', default: true },
    { id: 'mandolin-chop-chord', name: 'Bluegrass Chop Chord', category: 'Articulation', description: 'Tight percussive damped chord driving bluegrass rhythm' },
    { id: 'mandolin-single-pluck', name: 'Single Note Pluck', category: 'Articulation', description: 'Pure bell-toned paired string melodic pluck' },
    { id: 'mandolin-mic-close', name: 'Carved Top Close Mic', category: 'Mic Position', description: 'Direct stereo ribbon microphone capturing F-hole resonance' },
  ],

  'Ukulele': [
    { id: 'ukulele-reentrant-strum', name: 'Re-entrant High-G Strum', category: 'Voice', description: 'Authentic Hawaiian re-entrant tuning with finger strum', default: true },
    { id: 'ukulele-fingerstyle', name: 'Fingerstyle Sweet Pluck', category: 'Articulation', description: 'Individual nylon strings plucked with fingertips' },
    { id: 'ukulele-rasgueado', name: 'Rasgueado Fan Roll', category: 'Articulation', description: 'Quick fanning of four fingers across the strings' },
    { id: 'ukulele-ko-wood-mic', name: 'Koa Wood Resonance', category: 'Mic Position', description: 'Warm condenser pair highlighting island koa wood tone' },
  ],

  'Harpsichord': [
    { id: 'harpsichord-quill-8foot', name: 'Single 8\' Principal (Quill Pluck)', category: 'Voice', description: 'Crow quill plectrum plucking the main 8-foot string choir', default: true },
    { id: 'harpsichord-tutti-8-4', name: 'Tutti (8\' + 4\' Octave Coupler)', category: 'Voice', description: 'Both 8-foot and 4-foot upper octave choirs plucked together' },
    { id: 'harpsichord-lute-buff-stop', name: 'Lute / Buff Stop (Pizzicato)', category: 'Tone', description: 'Felt pads damping string vibration for a delicate harp sound' },
    { id: 'harpsichord-release-clack', name: 'Authentic Key Clack Release', category: 'Articulation', description: 'Sound of jacks dropping back onto the strings on key release' },
  ],

  // --- Synths ---
  'Tri-Osc Power Synth': [
    { id: 'triosc-fat-saw', name: 'Fat Triple Saw Unison', category: 'Voice', description: 'Three oscillators detuned by 7 cents each for massive lead weight', default: true },
    { id: 'triosc-sync-lead', name: 'Hard Sync Lead', category: 'Voice', description: 'Oscillator 2 hard-synced to Oscillator 1 with envelope sweep' },
    { id: 'triosc-sub-punch', name: 'Sub-Bass Foundation', category: 'Tone', description: 'Sine sub-oscillator mixed with warm 2-pole lowpass filter' },
    { id: 'triosc-hollow-square', name: 'Hollow Square PWM', category: 'Voice', description: 'Dual pulse width modulated square waves in antiphase' },
  ],

  'Thunderhead Polysonic Synth': [
    { id: 'thor-poly-warm-brass', name: 'Polysonic Warm Brass', category: 'Voice', description: 'Triple analog/wavetable oscillators through dual state-variable filters', default: true },
    { id: 'thor-wavetable-evolving', name: 'Evolving Glass Pad', category: 'Tone', description: 'Wavetable scanner modulation creating morphing acoustic textures' },
    { id: 'thor-fm-bell', name: 'FM Resonant Bells', category: 'Voice', description: 'Phase modulation cross-talk between high-frequency operators' },
    { id: 'thor-chorus-strings', name: 'Dimension Chorus Strings', category: 'Voice', description: 'Ensemble chorus circuit widening analog string sawtooths' },
  ],

  'Aurora Wavetable Synth': [
    { id: 'europa-spectral-morph', name: 'Spectral Morph Wave', category: 'Voice', description: 'Multi-frame wavetable scanned with spectral filter engine', default: true },
    { id: 'europa-vocal-formant', name: 'Formant Throat Lead', category: 'Tone', description: 'Vowel formant synthesis gliding through A-E-I-O-U resonances' },
    { id: 'europa-sub-crush', name: 'Heavy Industrial Drive', category: 'Tone', description: 'Bit-reduced wavetable run through tube waveshaper saturation' },
    { id: 'europa-lush-shimmer', name: 'Lush Shimmer Texture', category: 'Voice', description: 'Triple engine layered unison with independent LFO pans' },
  ],

  '3rd Wave Advanced Wavetable Synth': [
    { id: 'thirdwave-classic-ppg', name: 'Vintage PPG Wave Table', category: 'Voice', description: '8-bit wavetable stepped playback with vintage analog lowpass filter', default: true },
    { id: 'thirdwave-wave-surfer', name: 'Continuous Wave Surfer', category: 'Articulation', description: 'Interpolated smooth wave scanning across 64 custom single-cycles' },
    { id: 'thirdwave-digital-chimes', name: 'Crystal Digital Chimes', category: 'Voice', description: 'Bell-like digital harmonics with resonant self-oscillation peak' },
    { id: 'thirdwave-dual-filter', name: 'Dual Filter Resonance Sweep', category: 'Tone', description: 'Series 24dB ladder plus state-variable bandpass sweep' },
  ],

  'Monobass Synth': [
    { id: 'monobass-acid-squelch', name: 'Acid Resonance Squelch', category: 'Voice', description: '18dB diode ladder filter with accent resonance scream', default: true },
    { id: 'monobass-sub-thump', name: 'Pure Sub Thump', category: 'Tone', description: 'Filtered square wave with fast pitch decay envelope' },
    { id: 'monobass-drive-lead', name: 'Overdriven Bass Lead', category: 'Voice', description: 'Saturated transistor preamp drive with aggressive high-mid edge' },
    { id: 'monobass-smooth-glide', name: 'Portamento Legato Glide', category: 'Articulation', description: 'Constant-time fingered glide between overlapping notes' },
  ],
};

/**
 * Standard fallback sub-voices for any instrument without an explicit entry.
 */
const DEFAULT_SUB_VOICES: SubVoiceOption[] = [
  { id: 'default-standard', name: 'Standard Voice', category: 'Voice', description: 'Balanced full-spectrum instrument tuning', default: true },
  { id: 'default-close-mic', name: 'Close Perspective', category: 'Mic Position', description: 'Direct proximity capture with maximum transient definition' },
  { id: 'default-room-mic', name: 'Room Perspective', category: 'Mic Position', description: 'Acoustic hall microphones capturing spatial ambience' },
  { id: 'default-warm-tone', name: 'Warm Tone', category: 'Tone', description: 'Softened high frequencies for intimate arrangements' },
];

/**
 * Returns the list of sub-voices/articulations for a given instrument name and optional type.
 */
export function getSubVoicesForDevice(name: string, _type?: string): SubVoiceOption[] {
  if (INSTRUMENT_SUB_VOICES[name]) return INSTRUMENT_SUB_VOICES[name];

  // Try case-insensitive or partial match
  const lower = name.toLowerCase().trim();
  for (const [key, voices] of Object.entries(INSTRUMENT_SUB_VOICES)) {
    if (key.toLowerCase() === lower || lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
      return voices;
    }
  }

  // Generate customized default options matching the instrument's name
  return [
    { id: `${lower.replace(/\s+/g, '-')}-standard`, name: `${name} (Standard)`, category: 'Voice', description: `Standard recording of ${name}`, default: true },
    { id: `${lower.replace(/\s+/g, '-')}-close`, name: `${name} (Close Mic)`, category: 'Mic Position', description: `Close perspective microphone on ${name}` },
    { id: `${lower.replace(/\s+/g, '-')}-ambient`, name: `${name} (Ambient Room)`, category: 'Mic Position', description: `Natural room ambience on ${name}` },
    { id: `${lower.replace(/\s+/g, '-')}-warm`, name: `${name} (Warm Tone)`, category: 'Tone', description: `Warm harmonic coloration on ${name}` },
  ];
}

/**
 * Returns the default sub-voice for a given device.
 */
export function getDefaultSubVoice(name: string, type?: string): SubVoiceOption {
  const voices = getSubVoicesForDevice(name, type);
  return voices.find((v) => v.default) || voices[0] || DEFAULT_SUB_VOICES[0];
}

