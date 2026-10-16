import { BaseDevice } from './BaseDevice.ts';
import { SubtractorDevice } from './devices/SubtractorDevice.ts';
import { ThorDevice } from './devices/ThorDevice.ts';
import { EuropaDevice } from './devices/EuropaDevice.ts';
import { MonotoneDevice } from './devices/MonotoneDevice.ts';
import { RedrumDevice } from './devices/RedrumDevice.ts';
import { MimicDevice } from './devices/MimicDevice.ts';
import { MatrixDevice } from './devices/MatrixDevice.ts';
import { PulsarDevice } from './devices/PulsarDevice.ts';
import { Scream4Device } from './devices/Scream4Device.ts';
import { EchoDevice } from './devices/EchoDevice.ts';
import { RV7000Device } from './devices/RV7000Device.ts';
import { MClassMasterSuite } from './devices/MClassMasterSuite.ts';
import { SpiderAudioDevice } from './devices/SpiderAudioDevice.ts';
import { SpiderCVDevice } from './devices/SpiderCVDevice.ts';
import { ThreeOscDevice } from './devices/ThreeOscDevice.ts';
import { SytrusDevice } from './devices/SytrusDevice.ts';
import { FlexDevice } from './devices/FlexDevice.ts';
import { BansuriDevice } from './devices/BansuriDevice.ts';
import { HarmoniumDevice } from './devices/HarmoniumDevice.ts';
import { TablaDevice } from './devices/TablaDevice.ts';
import { TanpuraDroneDevice } from './devices/TanpuraDroneDevice.ts';
import { DholDevice } from './devices/DholDevice.ts';
import { TumbiDevice } from './devices/TumbiDevice.ts';
import { UniversalWorldInstrumentDevice } from './devices/UniversalWorldInstrumentDevice.ts';
import { UniversalPercussionElectronicDevice } from './devices/UniversalPercussionElectronicDevice.ts';
import { CVEngine } from './CVEngine.ts';
import { AudioConnection, CVConnection, DeviceType, TelemetryData, SequencerTrack, SequencerNote } from './types.ts';

export class AudioEngine {
  public ctx: AudioContext;
  public masterBusL: GainNode;
  public masterBusR: GainNode;
  public masterGain: GainNode;
  public masterLimiter: DynamicsCompressorNode;

  public analyserL: AnalyserNode;
  public analyserR: AnalyserNode;
  private analyserDataL: Float32Array;
  private analyserDataR: Float32Array;

  public devices: Map<string, BaseDevice> = new Map();
  public audioConnections: AudioConnection[] = [];
  public cvConnections: CVConnection[] = [];
  public cvEngine: CVEngine;

  // Master Sequencer Tracks (Synced with rack instruments)
  public tracks: SequencerTrack[] = [];
  public patternLength: number = 16; // 16 to 512 steps
  public globalSwing: number = 0; // 0.0 to 1.0

  // Master Transport State
  public bpm: number = 124;
  public isPlaying: boolean = false;
  public isRecording: boolean = false;
  public currentStep: number = 0;
  private timerId: number | null = null;
  private nextNoteTime: number = 0;
  private scheduleAheadTime: number = 0.1;
  private lookaheadMs: number = 25;

  // Recorder state
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private mediaDest: MediaStreamAudioDestinationNode | null = null;

  // Master telemetry
  public telemetry: TelemetryData = {
    rmsL: 0,
    rmsR: 0,
    peakL: 0,
    peakR: 0,
    gainReductionDb: 0,
    currentStep: 0,
    bpm: 124,
    isPlaying: false,
    isRecording: false,
    audioTime: 0,
  };

  private listeners: Set<() => void> = new Set();

  constructor() {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioCtx({ latencyHint: 'interactive' });

    this.cvEngine = new CVEngine();

    // Master Bus Nodes
    this.masterBusL = this.ctx.createGain();
    this.masterBusR = this.ctx.createGain();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.9;

    this.masterLimiter = this.ctx.createDynamicsCompressor();
    this.masterLimiter.threshold.setValueAtTime(-0.5, this.ctx.currentTime);
    this.masterLimiter.knee.setValueAtTime(0, this.ctx.currentTime);
    this.masterLimiter.ratio.setValueAtTime(20, this.ctx.currentTime);
    this.masterLimiter.attack.setValueAtTime(0.002, this.ctx.currentTime);
    this.masterLimiter.release.setValueAtTime(0.08, this.ctx.currentTime);

    // Master Analysers for VU metering
    this.analyserL = this.ctx.createAnalyser();
    this.analyserR = this.ctx.createAnalyser();
    this.analyserL.fftSize = 256;
    this.analyserR.fftSize = 256;
    this.analyserDataL = new Float32Array(this.analyserL.fftSize);
    this.analyserDataR = new Float32Array(this.analyserR.fftSize);

    // Connect Left and Right channels directly to their respective analysers
    this.masterBusL.connect(this.analyserL);
    this.masterBusR.connect(this.analyserR);

    // Master sum
    const merger = this.ctx.createChannelMerger(2);
    this.masterBusL.connect(merger, 0, 0);
    this.masterBusR.connect(merger, 0, 1);

    merger.connect(this.masterGain);
    this.masterGain.connect(this.masterLimiter);
    this.masterLimiter.connect(this.ctx.destination);

    this.initDefaultSession();
    this.startTelemetryLoop();
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify(): void {
    this.listeners.forEach((cb) => cb());
  }

  public async resumeContext(): Promise<void> {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  // Factory device creator
  public createDevice(type: DeviceType, customName?: string): BaseDevice {
    const id = `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    let dev: BaseDevice;

    switch (type) {
      case 'subtractor':
        dev = new SubtractorDevice(this.ctx, id, customName || 'Subtractor Analog Synth');
        break;
      case 'thor':
        dev = new ThorDevice(this.ctx, id, customName || 'Thor Polysonic Synth');
        break;
      case 'europa':
        dev = new EuropaDevice(this.ctx, id, customName || 'Europa Wavetable Synth');
        break;
      case 'monotone':
        dev = new MonotoneDevice(this.ctx, id, customName || 'Monotone Bass Synth');
        break;
      case 'redrum':
        dev = new RedrumDevice(this.ctx, id, customName || 'Redrum Drum Computer');
        break;
      case 'mimic':
        dev = new MimicDevice(this.ctx, id, customName || 'Mimic Creative Sampler');
        break;
      case 'matrix':
        dev = new MatrixDevice(this.ctx, id, customName || 'Matrix Pattern / CV');
        break;
      case 'pulsar':
        dev = new PulsarDevice(this.ctx, id, customName || 'Pulsar Dual LFO');
        break;
      case 'scream4':
        dev = new Scream4Device(this.ctx, id, customName || 'Scream 4 Distortion');
        break;
      case 'echo':
        dev = new EchoDevice(this.ctx, id, customName || 'The Echo Stereo Delay');
        break;
      case 'rv7000':
        dev = new RV7000Device(this.ctx, id, customName || 'RV7000 Reverb');
        break;
      case 'mclass_master':
        dev = new MClassMasterSuite(this.ctx, id, customName || 'MClass Mastering Suite');
        break;
      case 'spider_audio':
        dev = new SpiderAudioDevice(this.ctx, id, customName || 'Spider Audio Utility');
        break;
      case 'spider_cv':
        dev = new SpiderCVDevice(this.ctx, id, customName || 'Spider CV Utility');
        break;
      case 'three_osc':
        dev = new ThreeOscDevice(this.ctx, id, customName || '3x OSC Power Synth');
        break;
      case 'sytrus':
        dev = new SytrusDevice(this.ctx, id, customName || 'Sytrus FM Synth');
        break;
      case 'flex':
        dev = new FlexDevice(this.ctx, id, customName || 'FLEX Advanced Rompler');
        break;
      case 'bansuri':
        dev = new BansuriDevice(this.ctx, id, customName || 'Bansuri Bamboo Flute');
        break;
      case 'harmonium':
        dev = new HarmoniumDevice(this.ctx, id, customName || 'Classical Harmonium');
        break;
      case 'tabla':
        dev = new TablaDevice(this.ctx, id, customName || 'Tabla Percussion');
        break;
      case 'tanpura':
        dev = new TanpuraDroneDevice(this.ctx, id, customName || 'Tanpura & Drone Generator');
        break;
      case 'dhol':
        dev = new DholDevice(this.ctx, id, customName || 'Dhol Folk Drum');
        break;
      case 'tumbi':
        dev = new TumbiDevice(this.ctx, id, customName || 'Tumbi Folk Resonator');
        break;
      case 'world_instrument': {
        const name = customName || 'World Instrument';
        const isWind = name.toLowerCase().includes('flute') || name.toLowerCase().includes('horn') || name.toLowerCase().includes('pipe') || name.toLowerCase().includes('bagpipe') || name.toLowerCase().includes('clarinet') || name.toLowerCase().includes('oboe') || name.toLowerCase().includes('accordion') || name.toLowerCase().includes('saxophone') || name.toLowerCase().includes('whistle') || name.toLowerCase().includes('didgeridoo') || name.toLowerCase().includes('duduk') || name.toLowerCase().includes('recorder');
        dev = new UniversalWorldInstrumentDevice(this.ctx, id, name, isWind ? 'wind' : 'string');
        break;
      }
      case 'percussion_electronic': {
        const name = customName || 'Percussion/Electronic';
        const isElectronic = name.toLowerCase().includes('synth') || name.toLowerCase().includes('piano') || name.toLowerCase().includes('keyboard') || name.toLowerCase().includes('theremin') || name.toLowerCase().includes('mellotron') || name.toLowerCase().includes('clavinet') || name.toLowerCase().includes('keytar') || name.toLowerCase().includes('sampler') || name.toLowerCase().includes('stylophone') || name.toLowerCase().includes('ewi') || name.toLowerCase().includes('controller');
        dev = new UniversalPercussionElectronicDevice(this.ctx, id, name, isElectronic ? 'electronic' : 'percussion');
        break;
      }
      case 'automation_clip':
        dev = new SubtractorDevice(this.ctx, id, customName || 'Automation Clip Modulator');
        break;
      default:
        dev = new SubtractorDevice(this.ctx, id, customName || 'Subtractor Synth');
    }

    this.devices.set(id, dev);
    dev.isPowered = true;
    this.cvEngine.registerDevice(dev);

    // Automatically spawn corresponding Sequencer track & Mixer routing
    this.getOrCreateTrackForDevice(id);

    // Smart auto-routing: connect stereo outputs to master or master suite
    const hasOutL = dev.ports.some((p) => p.id === 'out_l');
    const hasOutR = dev.ports.some((p) => p.id === 'out_r');
    // Special handling for instruments that need to connect to master differently or already do
    const isSpecial = type === 'mclass_master' || type === 'spider_audio' || type === 'spider_cv';

    if (hasOutL && hasOutR && !isSpecial) {
      const mclass = Array.from(this.devices.values()).find((d) => d.type === 'mclass_master');
      const targetId = mclass ? mclass.id : 'master';
      const targetL = mclass ? 'in_l' : 'master_l';
      const targetR = mclass ? 'in_r' : 'master_r';
      try {
        this.connectAudio(id, 'out_l', targetId, targetL);
        this.connectAudio(id, 'out_r', targetId, targetR);
      } catch (e) {}
    }

    this.notify();
    return dev;
  }

  public removeDevice(deviceId: string): void {
    const dev = this.devices.get(deviceId);
    if (!dev) return;

    // Disconnect all audio cables to/from this device
    const toRemoveAudio = this.audioConnections.filter(
      (c) => c.sourceDeviceId === deviceId || c.targetDeviceId === deviceId
    );
    toRemoveAudio.forEach((c) => this.disconnectAudio(c.id));

    // Disconnect CV cables
    const toRemoveCV = this.cvConnections.filter(
      (c) => c.sourceDeviceId === deviceId || c.targetDeviceId === deviceId
    );
    toRemoveCV.forEach((c) => this.disconnectCV(c.id));

    this.cvEngine.unregisterDevice(deviceId);
    dev.dispose();
    this.devices.delete(deviceId);
    this.notify();
  }

  // Audio Cabling
  public connectAudio(
    sourceDeviceId: string,
    sourcePortId: string,
    targetDeviceId: string | 'master',
    targetPortId: string,
    color?: string
  ): string | null {
    const srcDev = this.devices.get(sourceDeviceId);
    if (!srcDev) return null;

    const srcOut = srcDev.audioOutputs.get(sourcePortId);
    if (!srcOut) return null;

    let targetIn: GainNode | null = null;
    if (targetDeviceId === 'master') {
      targetIn = targetPortId === 'master_r' ? this.masterBusR : this.masterBusL;
    } else {
      const tgtDev = this.devices.get(targetDeviceId);
      if (!tgtDev) return null;
      targetIn = tgtDev.audioInputs.get(targetPortId) || null;
    }

    if (!targetIn) return null;

    try {
      srcOut.connect(targetIn);
      const cableColors = ['#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#ec4899', '#8b5cf6'];
      const chosenColor = color || cableColors[this.audioConnections.length % cableColors.length];
      const connId = `aud_conn_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;

      this.audioConnections.push({
        id: connId,
        sourceDeviceId,
        sourcePortId,
        targetDeviceId,
        targetPortId,
        color: chosenColor,
      });

      this.playJackSnapSound();
      this.notify();
      return connId;
    } catch (e) {
      console.error('Audio connection failed:', e);
      return null;
    }
  }

  public disconnectAudio(connectionId: string): void {
    const idx = this.audioConnections.findIndex((c) => c.id === connectionId);
    if (idx === -1) return;

    const conn = this.audioConnections[idx];
    const srcDev = this.devices.get(conn.sourceDeviceId);
    if (srcDev) {
      const srcOut = srcDev.audioOutputs.get(conn.sourcePortId);
      let targetIn: GainNode | null = null;
      if (conn.targetDeviceId === 'master') {
        targetIn = conn.targetPortId === 'master_r' ? this.masterBusR : this.masterBusL;
      } else {
        const tgt = this.devices.get(conn.targetDeviceId);
        targetIn = tgt?.audioInputs.get(conn.targetPortId) || null;
      }

      if (srcOut && targetIn) {
        try {
          srcOut.disconnect(targetIn);
        } catch (e) {}
      }
    }

    this.audioConnections.splice(idx, 1);
    this.notify();
  }

  // CV Cabling
  public connectCV(
    sourceDeviceId: string,
    sourcePortId: string,
    targetDeviceId: string,
    targetPortId: string,
    amount: number = 1.0,
    color?: string
  ): string | null {
    const srcDev = this.devices.get(sourceDeviceId);
    const tgtDev = this.devices.get(targetDeviceId);
    if (!srcDev || !tgtDev) return null;

    const cvColors = ['#06b6d4', '#eab308', '#d946ef', '#a855f7', '#22d3ee'];
    const chosenColor = color || cvColors[this.cvConnections.length % cvColors.length];
    const connId = `cv_conn_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;

    this.cvConnections.push({
      id: connId,
      sourceDeviceId,
      sourcePortId,
      targetDeviceId,
      targetPortId,
      amount,
      color: chosenColor,
    });

    // Also register in CV Engine matrix for live modulation calculations
    this.cvEngine.addMatrixEntry({
      sourceDeviceId,
      sourcePortId,
      targetDeviceId,
      targetParam: targetPortId,
      amount,
      offset: 0,
      inverted: false,
    });

    this.playJackSnapSound();
    this.notify();
    return connId;
  }

  public playJackSnapSound(): void {
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(2600, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.02);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.03);
    } catch (e) {}
  }

  public autoPatchAllToMaster(): void {
    // Find all devices with audio outputs that aren't yet plugged into anything
    const mclass = Array.from(this.devices.values()).find((d) => d.type === 'mclass_master');
    const targetId = mclass ? mclass.id : 'master';
    const targetL = mclass ? 'in_l' : 'master_l';
    const targetR = mclass ? 'in_r' : 'master_r';

    this.devices.forEach((dev) => {
      if (dev.id === targetId || dev.type === 'mclass_master') return;
      const hasOutL = dev.ports.some((p) => p.id === 'out_l');
      const hasOutR = dev.ports.some((p) => p.id === 'out_r');

      if (hasOutL && hasOutR) {
        const isLConnected = this.audioConnections.some(
          (c) => c.sourceDeviceId === dev.id && c.sourcePortId === 'out_l'
        );
        const isRConnected = this.audioConnections.some(
          (c) => c.sourceDeviceId === dev.id && c.sourcePortId === 'out_r'
        );

        if (!isLConnected) {
          this.connectAudio(dev.id, 'out_l', targetId, targetL);
        }
        if (!isRConnected) {
          this.connectAudio(dev.id, 'out_r', targetId, targetR);
        }
      }
    });

    this.notify();
  }

  public disconnectCV(connectionId: string): void {
    const idx = this.cvConnections.findIndex((c) => c.id === connectionId);
    if (idx === -1) return;

    this.cvConnections.splice(idx, 1);
    this.notify();
  }

  // Transport Clock
  public async startTransport(): Promise<void> {
    await this.resumeContext();
    if (this.isPlaying) return;

    this.isPlaying = true;
    this.currentStep = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.05;

    if (this.timerId) clearInterval(this.timerId);
    this.timerId = window.setInterval(() => {
      this.scheduler();
    }, this.lookaheadMs);

    this.notify();
  }

  public stopTransport(): void {
    this.isPlaying = false;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.currentStep = 0;
    this.notify();
  }

  public async togglePlay(): Promise<void> {
    if (this.isPlaying) {
      this.stopTransport();
    } else {
      await this.startTransport();
    }
  }

  public setBpm(newBpm: number): void {
    this.bpm = Math.max(30, Math.min(300, newBpm));
    this.notify();
  }

  private scheduler(): void {
    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
      this.scheduleStep(this.currentStep, this.nextNoteTime);
      this.advanceStep();
    }
  }

  public setPatternLength(len: number): void {
    this.patternLength = Math.max(16, Math.min(512, len));
    // Ensure all tracks have at least patternLength steps
    this.tracks.forEach((t) => {
      if (t.steps.length < this.patternLength) {
        const extra = Array(this.patternLength - t.steps.length).fill(null);
        t.steps = [...t.steps, ...extra];
      }
    });
    this.notify();
  }

  public setGlobalSwing(swing: number): void {
    this.globalSwing = Math.max(0, Math.min(1, swing));
    this.notify();
  }

  // Sequencer Track Methods
  public getOrCreateTrackForDevice(deviceId: string): SequencerTrack | null {
    const dev = this.devices.get(deviceId);
    if (!dev) return null;
    let track = this.tracks.find((t) => t.deviceId === deviceId);
    if (!track) {
      const colors = ['#10b981', '#059669', '#34d399', '#06b6d4', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6'];
      const isDrum = dev.type === 'redrum' || dev.type === 'mimic';
      const stepsCount = Math.max(16, this.patternLength);
      track = {
        id: `track_${deviceId}`,
        deviceId,
        name: dev.name,
        color: colors[this.tracks.length % colors.length],
        mute: false,
        solo: false,
        volume: 0.85,
        pan: 0,
        mixerTrack: this.tracks.length + 1,
        swingMix: 0,
        group: isDrum ? 'Drums' : dev.type === 'three_osc' || dev.type === 'sytrus' || dev.type === 'flex' || dev.type === 'subtractor' || dev.type === 'thor' || dev.type === 'europa' || dev.type === 'monotone' ? 'Synths' : dev.type === 'world_instrument' || dev.type === 'percussion_electronic' ? 'World' : 'Samplers',
        pitchOffset: 0,
        cutoff: 0.8,
        resonance: 0.3,
        steps: Array(stepsCount).fill(null),
        graphData: {
          velocity: Array(stepsCount).fill(0.85),
          pitch: Array(stepsCount).fill(0),
          pan: Array(stepsCount).fill(0),
          cutoff: Array(stepsCount).fill(0.8),
          resonance: Array(stepsCount).fill(0.3),
        },
      };
      this.tracks.push(track);
      this.notify();
    }
    return track;
  }

  public setTrackStep(trackId: string, stepIndex: number, note: SequencerNote | null): void {
    const track = this.tracks.find((t) => t.id === trackId);
    if (!track) return;
    if (stepIndex >= track.steps.length) {
      const extra = Array(stepIndex + 1 - track.steps.length).fill(null);
      track.steps = [...track.steps, ...extra];
    }
    track.steps[stepIndex] = note;
    this.notify();
  }

  public clearTrackSteps(trackId: string): void {
    const track = this.tracks.find((t) => t.id === trackId);
    if (!track) return;
    track.steps = Array(Math.max(16, this.patternLength)).fill(null);
    this.notify();
  }

  public cloneTrack(trackId: string): void {
    const orig = this.tracks.find((t) => t.id === trackId);
    if (!orig) return;
    const cloneId = `track_${orig.deviceId}_clone_${Date.now().toString(36).slice(-4)}`;
    const cloned: SequencerTrack = {
      ...orig,
      id: cloneId,
      name: `${orig.name} (Copy)`,
      steps: [...orig.steps],
      graphData: orig.graphData ? {
        velocity: [...orig.graphData.velocity],
        pitch: [...orig.graphData.pitch],
        pan: [...orig.graphData.pan],
        cutoff: [...orig.graphData.cutoff],
        resonance: [...orig.graphData.resonance],
      } : undefined,
    };
    this.tracks.push(cloned);
    this.notify();
  }

  public toggleTrackMute(trackId: string): void {
    const track = this.tracks.find((t) => t.id === trackId);
    if (!track) return;
    track.mute = !track.mute;
    this.notify();
  }

  public toggleTrackSolo(trackId: string): void {
    const track = this.tracks.find((t) => t.id === trackId);
    if (!track) return;
    track.solo = !track.solo;
    this.notify();
  }

  private scheduleStep(step: number, time: number): void {
    // 1. Fire step tick on all active devices
    this.devices.forEach((dev) => {
      if (dev.onStepTick) {
        dev.onStepTick(step, time);
      }
    });

    // 2. Multi-Track Sequencer Playback
    const hasSolo = this.tracks.some((t) => t.solo);
    const secondsPerBeat = 60.0 / this.bpm;
    const stepDuration = 0.25 * secondsPerBeat;

    this.tracks.forEach((track) => {
      if (hasSolo && !track.solo) return;
      if (track.mute) return;

      const trackLen = track.steps.length || 16;
      const stepIdx = step % trackLen;
      const note = track.steps[stepIdx];
      if (!note) return;

      const dev = this.devices.get(track.deviceId);
      if (!dev || !dev.isPowered || dev.isBypassed) return;

      // Calculate effective velocity with channel volume & graph velocity
      const chanVol = track.volume !== undefined ? track.volume : 0.85;
      const graphVel = track.graphData?.velocity?.[stepIdx] ?? 1.0;
      const effVelocity = Math.max(0.05, Math.min(1.0, note.velocity * chanVol * graphVel));

      // Calculate pitch offset if any
      const pitchOffset = (track.pitchOffset || 0) + (track.graphData?.pitch?.[stepIdx] ?? 0);
      const effNote = Math.max(0, Math.min(127, note.note + pitchOffset));

      if (dev.type === 'redrum') {
        const redrum = dev as RedrumDevice;
        redrum.triggerPad(effNote % 8, effVelocity, time);
      } else if (dev.type === 'mimic') {
        const mimic = dev as MimicDevice;
        mimic.triggerPad(effNote % 8, effVelocity, time);
      } else if (dev.noteOn) {
        dev.noteOn(effNote, effVelocity, time);
        const noteDuration = (note.length || 1) * stepDuration * 0.9;
        setTimeout(() => {
          if (dev.noteOff) dev.noteOff(effNote, time + noteDuration);
        }, Math.max(20, noteDuration * 1000));
      }
    });

    // 3. Matrix CV triggering to connected synth (legacy support):
    const matrix = Array.from(this.devices.values()).find((d) => d.type === 'matrix') as MatrixDevice | undefined;
    if (matrix && matrix.isPowered) {
      const curPat = matrix.currentPattern;
      const mStep = step % matrix.numSteps;
      if (curPat.gates[mStep]) {
        const noteOffset = curPat.notes[mStep];
        const midiNote = 48 + noteOffset; // Base C3 + semitones
        const firstSynth = Array.from(this.devices.values()).find(
          (d) => d.type === 'subtractor' || d.type === 'thor' || d.type === 'europa' || d.type === 'monotone' || d.type === 'three_osc'
        );
        const hasTrackNote = this.tracks.some((t) => t.deviceId === firstSynth?.id && t.steps[step % (t.steps.length || 16)]);
        if (firstSynth && firstSynth.noteOn && !hasTrackNote) {
          firstSynth.noteOn(midiNote, 0.85, time);
          setTimeout(() => {
            if (firstSynth.noteOff) firstSynth.noteOff(midiNote, time + 0.12);
          }, 100);
        }
      }
    }
  }

  private advanceStep(): void {
    const secondsPerBeat = 60.0 / this.bpm;
    let stepDuration = 0.25 * secondsPerBeat; // 16th notes
    // Humanized swing calculation on odd 16th steps
    const isOdd = (this.currentStep % 2) === 1;
    if (this.globalSwing > 0) {
      const swingOffset = stepDuration * (this.globalSwing * 0.35);
      stepDuration = isOdd ? (stepDuration - swingOffset) : (stepDuration + swingOffset);
    }
    this.nextNoteTime += Math.max(0.015, stepDuration);
    this.currentStep = (this.currentStep + 1) % this.patternLength;
  }

  // Master WAV Recording & Download
  public startRecording(): void {
    this.resumeContext();
    if (this.isRecording) return;

    try {
      this.mediaDest = this.ctx.createMediaStreamDestination();
      this.masterLimiter.connect(this.mediaDest);

      this.mediaRecorder = new MediaRecorder(this.mediaDest.stream);
      this.recordedChunks = [];

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.recordedChunks.push(e.data);
      };

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, { type: 'audio/webm; codecs=opus' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Unboxed_Session_Master_${new Date().toISOString().slice(0, 10)}.webm`;
        a.click();
      };

      this.mediaRecorder.start();
      this.isRecording = true;
      this.notify();
    } catch (e) {
      console.error('Failed to start master recording:', e);
    }
  }

  public stopRecording(): void {
    if (!this.isRecording || !this.mediaRecorder) return;
    this.mediaRecorder.stop();
    this.isRecording = false;
    this.notify();
  }

  // Telemetry loop for reactive VU meters
  private startTelemetryLoop(): void {
    const update = () => {
      this.analyserL.getFloatTimeDomainData(this.analyserDataL as any);
      this.analyserR.getFloatTimeDomainData(this.analyserDataR as any);

      let sumSqL = 0;
      let peakL = 0;
      let sumSqR = 0;
      let peakR = 0;

      for (let i = 0; i < this.analyserDataL.length; i++) {
        const vL = this.analyserDataL[i];
        const vR = this.analyserDataR[i];
        sumSqL += vL * vL;
        sumSqR += vR * vR;
        if (Math.abs(vL) > peakL) peakL = Math.abs(vL);
        if (Math.abs(vR) > peakR) peakR = Math.abs(vR);
      }

      const rmsL = Math.sqrt(sumSqL / this.analyserDataL.length);
      const rmsR = Math.sqrt(sumSqR / this.analyserDataR.length);

      // Find MClass master gain reduction
      let gr = 0;
      const mclass = Array.from(this.devices.values()).find((d) => d.type === 'mclass_master') as MClassMasterSuite | undefined;
      if (mclass) {
        gr = mclass.getGainReduction();
      }

      this.telemetry = {
        rmsL,
        rmsR,
        peakL,
        peakR,
        gainReductionDb: gr,
        currentStep: this.currentStep,
        bpm: this.bpm,
        isPlaying: this.isPlaying,
        isRecording: this.isRecording,
        audioTime: this.ctx.currentTime,
      };

      requestAnimationFrame(update);
    };

    requestAnimationFrame(update);
  }

  // Setup rich starting rack
  private initDefaultSession(): void {
    // 1. Subtractor Synth
    const sub = this.createDevice('subtractor', 'Subtractor Analog Synth');
    // 2. Scream 4 Distortion
    const scream = this.createDevice('scream4', 'Scream 4 Tape Warmer');
    // 3. The Echo
    const echo = this.createDevice('echo', 'The Echo Space Delay');
    // 4. RV7000 Reverb
    const rv = this.createDevice('rv7000', 'RV7000 Studio Reverb');
    // 5. Redrum Drum Computer
    const redrum = this.createDevice('redrum', 'Redrum Drum Computer');
    // 6. Matrix Sequencer
    const matrix = this.createDevice('matrix', 'Matrix Pattern Sequencer');
    // 7. Pulsar Dual LFO
    const pulsar = this.createDevice('pulsar', 'Pulsar Dual LFO');
    // 8. MClass Master Suite
    const mclass = this.createDevice('mclass_master', 'MClass Mastering Suite');

    // 9. 3x OSC Power Synth
    const threeOsc = this.createDevice('three_osc', '3x OSC Lead & Pluck');
    // 10. FLEX Rompler
    const flex = this.createDevice('flex', 'FLEX Sound Generator');

    // Route default audio cabling:
    // Subtractor -> Scream4 -> Echo -> RV7000 -> MClass -> Master Bus
    this.connectAudio(sub.id, 'out_l', scream.id, 'in_l', '#f59e0b');
    this.connectAudio(sub.id, 'out_r', scream.id, 'in_r', '#f59e0b');

    this.connectAudio(scream.id, 'out_l', echo.id, 'in_l', '#10b981');
    this.connectAudio(scream.id, 'out_r', echo.id, 'in_r', '#10b981');

    this.connectAudio(echo.id, 'out_l', rv.id, 'in_l', '#3b82f6');
    this.connectAudio(echo.id, 'out_r', rv.id, 'in_r', '#3b82f6');

    this.connectAudio(rv.id, 'out_l', mclass.id, 'in_l', '#8b5cf6');
    this.connectAudio(rv.id, 'out_r', mclass.id, 'in_r', '#8b5cf6');

    // Redrum drums directly to Master MClass
    this.connectAudio(redrum.id, 'out_l', mclass.id, 'in_l', '#ef4444');
    this.connectAudio(redrum.id, 'out_r', mclass.id, 'in_r', '#ef4444');

    // 3x OSC and FLEX to Master MClass
    this.connectAudio(threeOsc.id, 'out_l', mclass.id, 'in_l', '#10b981');
    this.connectAudio(threeOsc.id, 'out_r', mclass.id, 'in_r', '#10b981');
    this.connectAudio(flex.id, 'out_l', mclass.id, 'in_l', '#34d399');
    this.connectAudio(flex.id, 'out_r', mclass.id, 'in_r', '#34d399');

    // MClass to Master Bus Out
    this.connectAudio(mclass.id, 'out_l', 'master', 'master_l', '#ec4899');
    this.connectAudio(mclass.id, 'out_r', 'master', 'master_r', '#ec4899');

    // CV Cables:
    // Pulsar LFO1 -> Subtractor Cutoff
    this.connectCV(pulsar.id, 'lfo1_out', sub.id, 'cv_cutoff', 0.65, '#06b6d4');
    // Matrix Curve -> Scream4 Tone
    this.connectCV(matrix.id, 'curve_cv', scream.id, 'cv_tone', 0.5, '#eab308');

    // Initialize default sequencer tracks with a musical pattern
    const subTrack = this.getOrCreateTrackForDevice(sub.id);
    if (subTrack) {
      subTrack.color = '#10b981';
      subTrack.mixerTrack = 1;
      // Arpeggiated hook in C minor: C3, D#3, G3, A#3, C4, A#3, G3, D#3
      subTrack.steps[0] = { note: 48, velocity: 0.9, length: 1 };
      subTrack.steps[2] = { note: 51, velocity: 0.85, length: 1 };
      subTrack.steps[4] = { note: 55, velocity: 0.9, length: 1 };
      subTrack.steps[6] = { note: 58, velocity: 0.85, length: 1 };
      subTrack.steps[8] = { note: 60, velocity: 0.95, length: 1 };
      subTrack.steps[10] = { note: 58, velocity: 0.85, length: 1 };
      subTrack.steps[12] = { note: 55, velocity: 0.9, length: 1 };
      subTrack.steps[14] = { note: 51, velocity: 0.85, length: 1 };
    }

    const threeOscTrack = this.getOrCreateTrackForDevice(threeOsc.id);
    if (threeOscTrack) {
      threeOscTrack.color = '#34d399';
      threeOscTrack.mixerTrack = 2;
      threeOscTrack.steps[0] = { note: 60, velocity: 0.8, length: 2 };
      threeOscTrack.steps[4] = { note: 63, velocity: 0.8, length: 2 };
      threeOscTrack.steps[8] = { note: 67, velocity: 0.85, length: 2 };
      threeOscTrack.steps[12] = { note: 65, velocity: 0.8, length: 2 };
    }

    const flexTrack = this.getOrCreateTrackForDevice(flex.id);
    if (flexTrack) {
      flexTrack.color = '#059669';
      flexTrack.mixerTrack = 3;
      flexTrack.steps[2] = { note: 72, velocity: 0.7, length: 1 };
      flexTrack.steps[6] = { note: 75, velocity: 0.75, length: 1 };
      flexTrack.steps[10] = { note: 72, velocity: 0.7, length: 1 };
      flexTrack.steps[14] = { note: 70, velocity: 0.7, length: 1 };
    }

    const redrumTrack = this.getOrCreateTrackForDevice(redrum.id);
    if (redrumTrack) {
      redrumTrack.color = '#f59e0b';
      redrumTrack.mixerTrack = 4;
      // Kick on 0, 8; Snare on 4, 12; Hats on 2, 6, 10, 14
      redrumTrack.steps[0] = { note: 0, velocity: 0.95, length: 1 };
      redrumTrack.steps[2] = { note: 2, velocity: 0.7, length: 1 };
      redrumTrack.steps[4] = { note: 1, velocity: 0.9, length: 1 };
      redrumTrack.steps[6] = { note: 2, velocity: 0.75, length: 1 };
      redrumTrack.steps[8] = { note: 0, velocity: 0.95, length: 1 };
      redrumTrack.steps[10] = { note: 2, velocity: 0.7, length: 1 };
      redrumTrack.steps[12] = { note: 1, velocity: 0.9, length: 1 };
      redrumTrack.steps[14] = { note: 2, velocity: 0.8, length: 1 };
    }
  }
}

// Global Singleton Instance
export const audioEngine = new AudioEngine();
