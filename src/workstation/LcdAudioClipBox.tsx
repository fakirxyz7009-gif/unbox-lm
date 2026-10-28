/**
 * LcdAudioClipBox — Interactive LCD Audio Clip Editor & Controller
 * Placed in the Workstation LCD editor to edit and control audio clips played in the piano roll,
 * MIDI notes, and arrangement.
 *
 * Provides per-note audio clip editing for ANY instrument (e.g. Big Rusty Drums, Spotlight Piano, synths):
 * - Selects the note played in MIDI; an explicit capture creates an editable audio copy.
 * - Controls how audio from each note sounds: Start Trim (OFFSET), Duration (DUR), Pitch Transpose,
 *   Reverse (REV), Loop (LOOP), Fades, Normalization (NORM), ADSR envelope, Splitting and Beat-Grid Chopping.
 * - Directly binds to the sound engine via deviceSamples: every edit alters how that note plays in real time.
 */
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { audioEngine } from '../audio/AudioEngine.ts';
import type { BaseDevice } from '../audio/BaseDevice.ts';
import type { SequencerTrack } from '../audio/types.ts';
import { audioStore, PEAK_BIN } from '../audio/clips/audioStore.ts';
import { drumLanesFor, type DrumLane } from '../audio/drumLanes.ts';
import { deviceSample, installSampleVoice, subscribeDeviceSamples, deviceSamplesVersion, type PadSample } from '../audio/deviceSamples.ts';
import { editPadSample, editPadSamples, beginPadSampleGesture, type PadSampleGesture } from '../audio/deviceSampleEdits.ts';
import { capturePointer } from '../ui/skin/pointer.ts';
import { renderDeviceNote } from '../audio/render/renderDeviceNote.ts';

interface Props {
  track: SequencerTrack;
  onTouched?: (t: { label: string; value: string }) => void;
  onForce?: () => void;
}

const CHROMATIC_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function setPadSample(deviceId: string, note: number, sample: PadSample): void {
  editPadSample(audioEngine, deviceId, note, sample);
}
function midiToNoteName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  const name = CHROMATIC_NAMES[midi % 12];
  return `${name}${octave}`;
}

export const LcdAudioClipBox: React.FC<Props> = ({ track, onTouched, onForce }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [previewing, setPreviewing] = useState(false);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('Loading note sample...');
  const [audioError, setAudioError] = useState<string | null>(null);
  const [hoverSec, setHoverSec] = useState<number | null>(null);
  const [chopMode, setChopMode] = useState<boolean>(false);
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const previewGainRef = useRef<GainNode | null>(null);
  const sampleGestureRef = useRef<PadSampleGesture | null>(null);
  const dragRef = useRef<{ mode: 'offset' | 'end'; startX: number; origOffset: number; origDuration: number } | null>(null);

  // Subscribe to audioStore updates
  useSyncExternalStore(
    (cb) => audioStore.subscribe(cb),
    () => audioStore.all().length + audioStore.missing.size * 1000,
    () => 0
  );

  const activeTrack = track;
  useSyncExternalStore(subscribeDeviceSamples, deviceSamplesVersion);
  const dev: BaseDevice | undefined = audioEngine.devices.get(activeTrack.deviceId);

  // Install sample voice shim on device so custom pad audio settings apply immediately to noteOn
  useEffect(() => {
    if (dev) {
      installSampleVoice(dev);
    }
  }, [dev]);

  // Determine available notes / lanes for this instrument
  const drumLanes: DrumLane[] | null = drumLanesFor(dev);
  const noteOptions: { name: string; note: number }[] = [];

  if (drumLanes && drumLanes.length > 0) {
    drumLanes.forEach((l) => noteOptions.push({ name: `${l.name} (${l.note})`, note: l.note }));
  } else {
    // Collect notes from track's pattern steps
    const stepNotes = new Set<number>();
    (activeTrack.steps ?? []).forEach((s) => {
      if (s) {
        stepNotes.add(s.note);
        s.chordNotes?.forEach((cn) => stepNotes.add(cn));
      }
    });

    if (stepNotes.size > 0) {
      Array.from(stepNotes)
        .sort((a, b) => a - b)
        .forEach((n) => noteOptions.push({ name: `${midiToNoteName(n)} (${n})`, note: n }));
    }

    // Include standard chromatic range C2..C5
    const basePitches = [48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72];
    basePitches.forEach((n) => {
      if (!noteOptions.some((o) => o.note === n)) {
        noteOptions.push({ name: `${midiToNoteName(n)} (${n})`, note: n });
      }
    });
    noteOptions.sort((a, b) => a.note - b.note);
  }

  // Active selected note being edited
  const [selectedNote, setSelectedNote] = useState<number>(() => {
    if (noteOptions.length > 0) return noteOptions[0].note;
    return 60;
  });

  // Automatically update selectedNote when a note is played live in MIDI or on the keyboard
  useEffect(() => {
    return audioEngine.onLiveNote((devId, note) => {
      if (devId === activeTrack.deviceId) {
        setSelectedNote(note);
      }
    });
  }, [activeTrack.deviceId]);

  // Current note's PadSample settings from deviceSamples
  const devSamples = dev ? deviceSample(dev.id) : undefined;
  const noteSample: PadSample | undefined = devSamples?.pads?.[selectedNote];
  const asset = noteSample ? audioStore.get(noteSample.audioId) : undefined;
  const assetDuration = asset?.buffer.duration ?? 0;

  // Cleanup preview on unmount
  useEffect(() => {
    return () => {
      sampleGestureRef.current?.cancel();
      if (previewSourceRef.current) {
        try {
          previewSourceRef.current.stop();
        } catch {}
        previewSourceRef.current = null;
      }
    };
  }, []);

  // Stop preview if song starts
  useEffect(() => {
    if (!previewing) return;
    const stopForTransport = () => { if (audioEngine.isPlaying) stopPreview(); };
    stopForTransport();
    return audioEngine.subscribe(stopForTransport);
  }, [previewing]);

  const stopPreview = () => {
    const source = previewSourceRef.current;
    if (source) {
      const now = audioEngine.ctx.currentTime;
      previewGainRef.current?.gain.cancelScheduledValues(now);
      previewGainRef.current?.gain.setTargetAtTime(0, now, 0.005);
      try { source.stop(now + 0.03); } catch {}
      previewSourceRef.current = null;
      previewGainRef.current = null;
    }
    setPreviewing(false);
  };

  // A bounded monitor audition uses AudioContext time and can always be stopped.
  const togglePreview = () => {
    if (previewing) return stopPreview();
    if (!noteSample || !asset) return;
    try {
      void audioEngine.resumeContext();
      const ctx = audioEngine.ctx;
      const source = ctx.createBufferSource();
      source.buffer = noteSample.reverse ? audioStore.reversedBuffer(asset.id) ?? asset.buffer : asset.buffer;
      const rate = Math.pow(2, ((noteSample.pitch ?? 0) + (noteSample.tune ?? 0) / 100) / 12);
      const offset = Math.max(0, Math.min(source.buffer.duration - 0.005, noteSample.offset ?? 0));
      const span = Math.max(0.005, Math.min(source.buffer.duration - offset, noteSample.duration ?? source.buffer.duration - offset));
      const seconds = Math.min(3, noteSample.loop ? 3 : span / rate);
      const now = ctx.currentTime + 0.01;
      source.playbackRate.setValueAtTime(rate, now);
      source.loop = !!noteSample.loop;
      if (source.loop) { source.loopStart = offset; source.loopEnd = offset + span; }
      const gain = ctx.createGain();
      const peak = Math.max(0, Math.min(4, noteSample.level)) * 0.9;
      const attack = Math.min(seconds * 0.25, Math.max(0.002, noteSample.attack ?? 0.002));
      const release = Math.min(seconds * 0.25, Math.max(0.01, noteSample.release ?? 0.05));
      const releaseAt = now + seconds - release;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(peak, now + attack);
      gain.gain.linearRampToValueAtTime(peak * Math.max(0, Math.min(1, noteSample.sustain ?? 1)), Math.min(releaseAt, now + attack + (noteSample.decay ?? 0.25)));
      gain.gain.setTargetAtTime(0, releaseAt, Math.max(0.003, release / 3));
      source.connect(gain).connect(audioEngine.monitor.clickInput);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        if (previewSourceRef.current === source) {
          previewSourceRef.current = null;
          previewGainRef.current = null;
          setPreviewing(false);
        }
      };
      previewSourceRef.current = source;
      previewGainRef.current = gain;
      source.start(now, offset);
      source.stop(now + seconds);
      setPreviewing(true);
      onTouched?.({ label: 'Audition Note', value: `${selectedNote}` });
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : String(error));
      setPreviewing(false);
    }
  };
  // Capturing is explicit: opening this editor must not replace velocity layers or timbres.
  const loadNoteAudio = useCallback(async (note: number) => {
    if (!dev || loadingAudio) return;
    setLoadingAudio(true);
    setAudioError(null);
    const noteName = midiToNoteName(note);
    setLoadingMsg(`Rendering ${dev.name} · ${noteName}…`);
    try {
      const buffer = await renderDeviceNote(audioEngine, dev, note);
      if (audioEngine.devices.get(dev.id) !== dev) throw new Error('The instrument changed while its note was rendering.');
      audioEngine.runStructuralEdit('Capture note audio', () => {
        const assetObj = audioStore.add(`${activeTrack.name} - ${noteName}`, buffer);
        setPadSample(dev.id, note, {
          audioId: assetObj.id, level: 1, offset: 0, duration: buffer.duration,
          pitch: 0, tune: 0, reverse: false, loop: false,
          attack: 0.002, decay: 0.25, sustain: 1, release: 0.05,
        });
        audioEngine.changed();
      });
      onTouched?.({ label: 'Captured Note', value: noteName });
      onForce?.();
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingAudio(false);
    }
  }, [dev, loadingAudio, activeTrack.name, onTouched, onForce]);

  useEffect(() => {
    sampleGestureRef.current?.cancel();
    sampleGestureRef.current = null;
    dragRef.current = null;
    stopPreview();
    setAudioError(null);
  }, [selectedNote, dev?.id]);
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !sampleGestureRef.current) return;
      sampleGestureRef.current.cancel();
      sampleGestureRef.current = null;
      dragRef.current = null;
      event.stopPropagation();
    };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, []);
  // Adjust Start Offset (trim attack / cut section)
  const adjustOffset = (deltaSec: number) => {
    if (!dev || !noteSample || !asset) return;
    const cur = noteSample.offset ?? 0;
    const dur = asset.buffer.duration;
    const next = Math.max(0, Math.min(dur - 0.02, Math.round((cur + deltaSec) * 100) / 100));
    setPadSample(dev.id, selectedNote, { ...noteSample, offset: next });
    onTouched?.({ label: 'Start Offset', value: `${next.toFixed(2)}s` });
    onForce?.();
  };

  // Adjust Duration (cut tail / ring-out time)
  const adjustDuration = (deltaSec: number) => {
    if (!dev || !noteSample || !asset) return;
    const cur = noteSample.duration ?? asset.buffer.duration;
    const next = Math.max(0.02, Math.min(asset.buffer.duration, Math.round((cur + deltaSec) * 100) / 100));
    setPadSample(dev.id, selectedNote, { ...noteSample, duration: next });
    onTouched?.({ label: 'Note Duration', value: `${next.toFixed(2)}s` });
    onForce?.();
  };

  // Fit duration to entire sample length
  const fitDuration = () => {
    if (!dev || !noteSample || !asset) return;
    const dur = asset.buffer.duration;
    setPadSample(dev.id, selectedNote, { ...noteSample, duration: dur, offset: 0 });
    onTouched?.({ label: 'Fit Duration', value: `${dur.toFixed(2)}s` });
    onForce?.();
  };

  // Adjust Pitch Transpose (semitones)
  const adjustPitch = (deltaSemi: number) => {
    if (!dev || !noteSample) return;
    const cur = noteSample.pitch ?? 0;
    const next = Math.max(-24, Math.min(24, cur + deltaSemi));
    setPadSample(dev.id, selectedNote, { ...noteSample, pitch: next });
    onTouched?.({ label: 'Pitch', value: `${next >= 0 ? '+' : ''}${next} st` });
    onForce?.();
  };

  // Toggle Reverse Playback
  const toggleReverse = () => {
    if (!dev || !noteSample) return;
    const rev = !noteSample.reverse;
    setPadSample(dev.id, selectedNote, { ...noteSample, reverse: rev });
    onTouched?.({ label: 'Reverse', value: rev ? 'On' : 'Off' });
    onForce?.();
  };

  // Toggle Loop
  const toggleLoop = () => {
    if (!dev || !noteSample) return;
    const loop = !noteSample.loop;
    setPadSample(dev.id, selectedNote, { ...noteSample, loop });
    onTouched?.({ label: 'Loop', value: loop ? 'On' : 'Off' });
    onForce?.();
  };

  // Split note audio at hover/scrub position
  const splitNoteAt = (targetSec?: number) => {
    if (!dev || !noteSample || !asset || assetDuration <= 0) return;
    const splitPoint = typeof targetSec === 'number' ? targetSec : (noteSample.offset ?? 0) + (noteSample.duration ?? assetDuration) / 2;
    const part1Dur = Math.max(0.02, splitPoint - (noteSample.offset ?? 0));
    setPadSample(dev.id, selectedNote, { ...noteSample, duration: part1Dur });
    onTouched?.({ label: 'Split Note', value: `${part1Dur.toFixed(2)}s` });
    onForce?.();
  };

  // Chop into rhythmic beat divisions (16th, 8th, 1/4, 1bar)
  const chopBeat = (div: number) => {
    if (!dev || !noteSample || !asset) return;
    const dur = noteSample.duration ?? assetDuration;
    const sliceLen = Math.max(0.02, dur / div);
    setPadSample(dev.id, selectedNote, { ...noteSample, duration: sliceLen });
    onTouched?.({ label: 'Chop Beat', value: `1/${div}` });
    onForce?.();
  };

  // Spread audio slices across keyboard chromatic keys
  const spreadToKeys = () => {
    if (!dev || !noteSample || !asset) return;
    const offset = noteSample.offset ?? 0;
    const dur = Math.min(assetDuration - offset, noteSample.duration ?? assetDuration - offset);
    const sliceDur = dur / 8;
    const changes = new Map<number, PadSample>();
    for (let i = 0; i < 8; i++) {
      const noteNum = 60 + i;
      changes.set(noteNum, {
        audioId: asset.id,
        level: noteSample.level,
        offset: offset + i * sliceDur,
        duration: sliceDur,
        pitch: noteSample.pitch ?? 0,
        tune: noteSample.tune ?? 0,
        reverse: noteSample.reverse ?? false,
        loop: false,
        attack: 0.002,
        decay: 0.25,
        sustain: 1,
        release: 0.05,
      });
    }
    editPadSamples(audioEngine, dev.id, changes, 'Spread note audio to keys');
    onTouched?.({ label: 'Chop to Keys', value: 'MIDI 60–67 (C4–G4)' });
    onForce?.();
  };

  // Measure the selected audio; the persisted sample level supports up to 4x gain.
  const normalizeAudio = () => {
    if (!dev || !noteSample || !asset) return;
    const buffer = noteSample.reverse ? audioStore.reversedBuffer(asset.id) ?? asset.buffer : asset.buffer;
    const start = Math.round((noteSample.offset ?? 0) * buffer.sampleRate);
    const end = Math.min(buffer.length, start + Math.round((noteSample.duration ?? assetDuration) * buffer.sampleRate));
    let peak = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = start; i < end; i++) peak = Math.max(peak, Math.abs(data[i]));
    }
    if (peak <= 1e-8) return;
    const level = Math.min(4, 1 / peak);
    setPadSample(dev.id, selectedNote, { ...noteSample, level });
    onTouched?.({ label: 'Normalize', value: `${(20 * Math.log10(peak * level)).toFixed(1)} dBFS` });
    onForce?.();
  };

  // Adjust Fade-in (attack envelope in ms)
  const adjustFadeIn = (delta: number) => {
    if (!dev || !noteSample) return;
    const cur = noteSample.attack ?? 0.002;
    const next = Math.max(0, Math.min(2, cur + delta));
    setPadSample(dev.id, selectedNote, { ...noteSample, attack: Math.round(next * 1000) / 1000 });
    onTouched?.({ label: 'Fade In', value: `${(next * 1000).toFixed(0)}ms` });
    onForce?.();
  };

  // Adjust Fade-out (release envelope in seconds)
  const adjustFadeOut = (delta: number) => {
    if (!dev || !noteSample) return;
    const cur = noteSample.release ?? 0.05;
    const next = Math.max(0, Math.min(3, cur + delta));
    setPadSample(dev.id, selectedNote, { ...noteSample, release: Math.round(next * 100) / 100 });
    onTouched?.({ label: 'Fade Out', value: `${next.toFixed(2)}s` });
    onForce?.();
  };

  // Draw interactive LCD Waveform & Trim Handles
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const g = cv.getContext('2d');
    if (!g) return;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const rect = cv.getBoundingClientRect();
    const w = Math.max(100, Math.round(rect.width || 220));
    const h = Math.max(30, Math.round(rect.height || 38));
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    // Retro turquoise inset panel background (matches media_1792972685143_a6164c82.png)
    g.fillStyle = '#5e878d';
    g.fillRect(0, 0, w, h);

    if (!noteSample || !asset || assetDuration <= 0) {
      g.strokeStyle = 'rgba(17, 35, 40, 0.4)';
      g.lineWidth = 1;
      g.strokeRect(0.5, 0.5, w - 1, h - 1);
      g.fillStyle = 'rgba(17, 35, 40, 0.7)';
      g.font = '10px monospace';
      g.textAlign = 'center';
      g.fillText('Capture a note to edit audio', w / 2, h / 2 + 3);
      return;
    }

    const mid = h / 2;

    // Subtle horizontal zero-crossing centerline
    g.strokeStyle = 'rgba(17, 35, 40, 0.28)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, mid);
    g.lineTo(w, mid);
    g.stroke();

    const peaks = asset.peaks;
    const bins = peaks.length / 2;
    const sr = asset.buffer.sampleRate;
    const dur = assetDuration;

    const activeStartSec = Math.max(0, noteSample.offset ?? 0);
    const activeSpanSec = Math.min(dur - activeStartSec, noteSample.duration ?? (dur - activeStartSec));
    const activeEndSec = Math.min(dur, activeStartSec + activeSpanSec);

    const xStart = Math.max(0, Math.min(w, (activeStartSec / dur) * w));
    const xEnd = Math.max(0, Math.min(w, (activeEndSec / dur) * w));

    // 1. Trimmed Start Section (hatch pattern)
    if (xStart > 0) {
      g.fillStyle = 'rgba(17, 35, 40, 0.35)';
      g.fillRect(0, 0, xStart, h);
      g.strokeStyle = 'rgba(17, 35, 40, 0.5)';
      g.lineWidth = 1;
      for (let x = -h; x < xStart; x += 6) {
        g.beginPath();
        g.moveTo(x, h);
        g.lineTo(x + h, 0);
        g.stroke();
      }
    }

    // 2. Trimmed End Section (hatch pattern)
    if (xEnd < w) {
      g.fillStyle = 'rgba(17, 35, 40, 0.35)';
      g.fillRect(xEnd, 0, w - xEnd, h);
      g.strokeStyle = 'rgba(17, 35, 40, 0.5)';
      g.lineWidth = 1;
      for (let x = xEnd - h; x < w; x += 6) {
        g.beginPath();
        g.moveTo(x, h);
        g.lineTo(x + h, 0);
        g.stroke();
      }
    }

    // 3. Draw Waveform Peaks
    for (let x = 0; x < w; x++) {
      const t0 = (x / w) * dur;
      const t1 = ((x + 1) / w) * dur;
      const isActive = x >= xStart && x <= xEnd;

      let lo = 0;
      let hi = 0;
      for (let p = t0; p <= t1; p += Math.max(PEAK_BIN / sr, (t1 - t0) / 4)) {
        if (p < 0 || p >= dur) continue;
        const b = Math.min(bins - 1, Math.floor((p * sr) / PEAK_BIN));
        if (peaks[b * 2] < lo) lo = peaks[b * 2];
        if (peaks[b * 2 + 1] > hi) hi = peaks[b * 2 + 1];
      }

      const y0 = mid - Math.min(1, hi) * (mid - 2);
      const y1 = mid - Math.max(-1, lo) * (mid - 2);

      g.fillStyle = isActive ? '#112328' : 'rgba(17, 35, 40, 0.4)';
      g.fillRect(x, y0, 1, Math.max(1, y1 - y0));
    }

    // 4. Draw Hover / Scrub Split Line
    if (hoverSec !== null && hoverSec >= activeStartSec && hoverSec <= activeEndSec) {
      const xH = (hoverSec / dur) * w;
      g.strokeStyle = '#ef4444';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(xH, 0);
      g.lineTo(xH, h);
      g.stroke();

      g.fillStyle = '#ef4444';
      g.fillRect(Math.max(0, xH - 12), 0, 24, 9);
      g.fillStyle = '#ffffff';
      g.font = '7px monospace';
      g.textAlign = 'center';
      g.fillText('✂ SPLIT', Math.max(12, Math.min(w - 12, xH)), 7);
    }

    // 5. Trim Handles
    g.fillStyle = '#112328';
    g.fillRect(Math.max(0, xStart - 1.5), 0, 3, h);
    g.fillStyle = 'rgba(255, 255, 255, 0.9)';
    g.fillRect(Math.max(0, xStart - 1), 0, 2, 8);

    g.fillStyle = '#112328';
    g.fillRect(Math.max(0, xEnd - 1.5), 0, 3, h);
    g.fillStyle = 'rgba(255, 255, 255, 0.9)';
    g.fillRect(Math.max(0, xEnd - 1), h - 8, 2, 8);

    // Boundary box
    g.strokeStyle = '#2b4f55';
    g.lineWidth = 1;
    g.strokeRect(0.5, 0.5, w - 1, h - 1);
  }, [noteSample, asset, assetDuration, hoverSec]);

  // Pointer interactions on canvas for direct drag-trimming & click-to-split
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dev || !noteSample || !asset || assetDuration <= 0) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const w = rect.width;
    const norm = Math.max(0, Math.min(1, x / w));
    const sec = norm * assetDuration;

    if (chopMode) {
      splitNoteAt(sec);
      setChopMode(false);
      return;
    }

    const startSec = noteSample.offset ?? 0;
    const endSec = startSec + (noteSample.duration ?? (assetDuration - startSec));
    const startX = (startSec / assetDuration) * w;
    const endX = (endSec / assetDuration) * w;

    const isNearStart = Math.abs(x - startX) <= 10;
    const isNearEnd = Math.abs(x - endX) <= 10;

    capturePointer(e.currentTarget, e.pointerId);
    sampleGestureRef.current?.cancel();
    sampleGestureRef.current = beginPadSampleGesture(audioEngine, dev.id, selectedNote);

    if (isNearStart || (!isNearEnd && norm < (startSec + endSec) / (2 * assetDuration))) {
      dragRef.current = {
        mode: 'offset',
        startX: e.clientX,
        origOffset: startSec,
        origDuration: noteSample.duration ?? (assetDuration - startSec),
      };
      if (!isNearStart) {
        const next = Math.max(0, Math.min(assetDuration - 0.02, Math.round(sec * 100) / 100));
        sampleGestureRef.current.update({ ...noteSample, offset: next });
        onForce?.();
      }
    } else {
      dragRef.current = {
        mode: 'end',
        startX: e.clientX,
        origOffset: startSec,
        origDuration: noteSample.duration ?? (assetDuration - startSec),
      };
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current;
    if (!cv || !dev || !noteSample || !asset || assetDuration <= 0) return;
    const rect = cv.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const w = rect.width;
    const norm = Math.max(0, Math.min(1, x / w));
    const sec = norm * assetDuration;

    setHoverSec(sec);

    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dt = (dx / w) * assetDuration;

    if (dragRef.current.mode === 'offset') {
      const nextOffset = Math.max(0, Math.min(assetDuration - 0.05, dragRef.current.origOffset + dt));
      sampleGestureRef.current?.update({ ...noteSample, offset: Math.round(nextOffset * 100) / 100 });
      onTouched?.({ label: 'Trim Start', value: `${nextOffset.toFixed(2)}s` });
      onForce?.();
    } else {
      const nextDur = Math.max(0.05, Math.min(assetDuration, dragRef.current.origDuration + dt));
      sampleGestureRef.current?.update({ ...noteSample, duration: Math.round(nextDur * 100) / 100 });
      onTouched?.({ label: 'Note Duration', value: `${nextDur.toFixed(2)}s` });
      onForce?.();
    }
  };

  const handlePointerUp = () => {
    sampleGestureRef.current?.commit();
    sampleGestureRef.current = null;
    dragRef.current = null;
  };
  const cancelPointer = () => {
    sampleGestureRef.current?.cancel();
    sampleGestureRef.current = null;
    dragRef.current = null;
  };

  const handlePointerLeave = () => {
    setHoverSec(null);
  };

  const selectedNoteIndex = noteOptions.findIndex((o) => o.note === selectedNote);
  const currentNoteLabel = noteOptions[selectedNoteIndex]?.name || `${midiToNoteName(selectedNote)} (${selectedNote})`;

  if (loadingAudio) {
    return (
      <div className="flex-1 w-full flex flex-col items-center justify-center p-2 font-lcd text-lcd-ink animate-pulse select-none">
        <div className="text-[13px] font-bold text-center leading-tight">CAPTURING NOTE AUDIO…</div>
        <div className="text-[11px] font-label opacity-80 mt-1 text-center">{loadingMsg}</div>
        <div className="text-[11px] font-label opacity-60 mt-0.5">{activeTrack.name}</div>
      </div>
    );
  }

  return (
    <div className="flex-1 w-full min-h-0 flex flex-col justify-between text-lcd-ink select-none gap-0.5" data-testid="note-audio-editor">
      {/* 1. Header: Note / Pad Selector + Preview Audition Button */}
      <div className="flex items-center justify-between gap-1 shrink-0">
        <div className="flex items-center gap-0.5 flex-1 min-w-0">
          <span className="font-label font-bold text-[11px] uppercase tracking-wider shrink-0">NOTE:</span>
          <button
            type="button"
            onClick={() => {
              const prevIdx = (selectedNoteIndex - 1 + noteOptions.length) % noteOptions.length;
              setSelectedNote(noteOptions[prevIdx].note);
            }}
            className="px-1 hover:us-lcd-inverse font-bold text-[11px] rounded"
            title="Previous note / drum pad"
          >
            ◀
          </button>
          <select
            value={selectedNote}
            onChange={(e) => setSelectedNote(Number(e.target.value))}
            aria-label="Note audio pitch"
            className="us-lcd-box bg-transparent font-lcd text-[13px] leading-tight px-1 py-0 flex-1 truncate outline-none cursor-pointer"
          >
            {noteOptions.map((o) => (
              <option key={o.note} value={o.note}>
                {o.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              const nextIdx = (selectedNoteIndex + 1) % noteOptions.length;
              setSelectedNote(noteOptions[nextIdx].note);
            }}
            className="px-1 hover:us-lcd-inverse font-bold text-[11px] rounded"
            title="Next note / drum pad"
          >
            ▶
          </button>
        </div>

        <button type="button" onClick={() => void loadNoteAudio(selectedNote)} className="us-lcd-box px-1 py-0.5 font-label font-bold text-[11px] rounded" aria-label="Capture selected instrument note" title="Capture this instrument note as editable audio; this replaces only the selected note's sound">
          CAPTURE
        </button>

        {/* Record Arm */}
        <button
          type="button"
          onClick={() => {
            audioEngine.noteRecordArmed = !audioEngine.noteRecordArmed;
            onTouched?.({ label: 'Record Arm', value: audioEngine.noteRecordArmed ? 'Armed' : 'Off' });
            onForce?.();
          }}
          className={`px-1 py-0.5 rounded truncate flex-1 text-center cursor-pointer ${
            audioEngine.noteRecordArmed ? 'us-lcd-inverse text-red-400' : 'us-lcd-box hover:us-lcd-inverse'
          }`}
          aria-label="Arm live pattern note writing" title="Write played notes into the active pattern while transport plays"
        >
          ◎
        </button>

        {/* Audition Button */}
        <button
          type="button"
          onClick={togglePreview}
          disabled={!noteSample || !asset}
          className={`font-label font-bold text-[11px] px-1.5 py-0.5 rounded transition-all shrink-0 flex items-center gap-1 ${
            previewing ? 'us-lcd-inverse animate-pulse' : 'us-lcd-box hover:us-lcd-inverse'
          }`}
          title={previewing ? 'Stop Audition' : `Audition ${currentNoteLabel}`}
        >
          {previewing ? '■ STOP' : '▶ AUDITION'}
        </button>
      </div>

      {(audioError || !noteSample) && <div role={audioError ? 'alert' : 'status'} className="text-[11px] font-label">{audioError ?? 'Capture the selected instrument note to edit its audio.'}</div>}

      <fieldset disabled={!noteSample || !asset} className="contents" aria-label="Captured note audio controls">

      {/* 2. Interactive LCD Waveform Display */}
      <div className="relative w-full h-[38px] shrink-0 cursor-ew-resize overflow-hidden">
        <canvas
          ref={canvasRef}
          width={220}
          height={38}
          className="w-full h-full block"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={cancelPointer}
          onLostPointerCapture={cancelPointer}
          onPointerLeave={handlePointerLeave}
          title={chopMode ? 'Click on waveform to split note audio' : 'Drag left edge to trim start offset; drag right edge to adjust duration'}
        />
        {/* Shaded labels overlay */}
        <div className="absolute top-0.5 left-1 font-lcd text-[11px] pointer-events-none opacity-80 leading-none">
          {(noteSample?.offset ?? 0) > 0 ? `OFFSET: ${(noteSample?.offset ?? 0).toFixed(2)}s` : 'START: 0.0s'}
        </div>
        <div className="absolute bottom-0.5 right-1 font-lcd text-[11px] pointer-events-none opacity-80 leading-none">
          {`DUR: ${(noteSample?.duration ?? assetDuration).toFixed(2)}s`}
        </div>
        {chopMode && (
          <div className="absolute top-0 right-1 bg-red-600 text-white font-mono text-[11px] font-bold px-1 rounded animate-pulse">
            CLICK TO SPLIT
          </div>
        )}
      </div>

      {/* 2.5 Beat Grid Chopping Buttons (as shown in media_1792972685143_a6164c82.png) */}
      <div className="flex items-center justify-between gap-1 shrink-0 font-label font-bold text-[11px]">
        <button
          type="button"
          onClick={() => splitNoteAt(hoverSec ?? undefined)}
          className="us-lcd-box px-1 py-0.5 hover:us-lcd-inverse rounded truncate flex-1 text-center cursor-pointer"
          title="Split note audio at cursor or midpoint"
        >
          ✂ SPLIT
        </button>
        <button
          type="button"
          onClick={() => chopBeat(16)}
          className="us-lcd-box px-1 py-0.5 hover:us-lcd-inverse rounded truncate flex-1 text-center cursor-pointer"
          title="Chop into 1/16 slices"
        >
          16TH
        </button>
        <button
          type="button"
          onClick={() => chopBeat(8)}
          className="us-lcd-box px-1 py-0.5 hover:us-lcd-inverse rounded truncate flex-1 text-center cursor-pointer"
          title="Chop into 1/8 slices"
        >
          8TH
        </button>
        <button
          type="button"
          onClick={() => chopBeat(4)}
          className="us-lcd-box px-1 py-0.5 hover:us-lcd-inverse rounded truncate flex-1 text-center cursor-pointer"
          title="Chop into 1/4 slices"
        >
          1/4
        </button>
        <button
          type="button"
          onClick={() => chopBeat(1)}
          className="us-lcd-box px-1 py-0.5 hover:us-lcd-inverse rounded truncate flex-1 text-center cursor-pointer"
          title="Chop into 1 bar slice"
        >
          1BAR
        </button>
        <button
          type="button"
          onClick={spreadToKeys}
          className="us-lcd-box px-1 py-0.5 hover:us-lcd-inverse rounded truncate flex-1 text-center cursor-pointer"
          title="Spread sliced notes across keyboard chromatic keys"
        >
          🎹 TO...
        </button>
      </div>

      {/* 3. Duration & Trim Controls Grid */}
      <div className="grid grid-cols-2 gap-1 shrink-0 font-label text-[11px]">
        {/* Duration Control */}
        <div className="flex items-center justify-between us-lcd-box px-1 py-0.5">
          <span className="font-bold opacity-80">DUR:</span>
          <span className="font-lcd text-[11px] leading-none font-bold">
            {(noteSample?.duration ?? assetDuration).toFixed(2)}s
          </span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => adjustDuration(-0.05)}
              className="font-bold px-1 hover:us-lcd-inverse rounded cursor-pointer"
              title="Decrease duration by 0.05s"
            >
              -
            </button>
            <button
              type="button"
              onClick={() => adjustDuration(0.05)}
              className="font-bold px-1 hover:us-lcd-inverse rounded cursor-pointer"
              title="Increase duration by 0.05s"
            >
              +
            </button>
            <button
              type="button"
              onClick={fitDuration}
              className="font-bold text-[11px] px-1 bg-lcd-ink/20 hover:us-lcd-inverse rounded cursor-pointer"
              title="Fit to entire sample duration"
            >
              FIT
            </button>
          </div>
        </div>

        {/* Start Offset / Attack Trim Control */}
        <div className="flex items-center justify-between us-lcd-box px-1 py-0.5">
          <span className="font-bold opacity-80">OFFSET:</span>
          <span className="font-lcd text-[11px] leading-none font-bold">
            {(noteSample?.offset ?? 0).toFixed(2)}s
          </span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => adjustOffset(-0.02)}
              className="font-bold px-1 hover:us-lcd-inverse rounded cursor-pointer"
              title="Shift offset earlier"
            >
              -
            </button>
            <button
              type="button"
              onClick={() => adjustOffset(0.02)}
              className="font-bold px-1 hover:us-lcd-inverse rounded cursor-pointer"
              title="Shift offset later (trim start)"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* 4. Action Row: Cut, Norm, Reverse, Loop, Rec, Reset (matches media_1792972685143_a6164c82.png) */}
      <div className="flex items-center justify-between gap-1 shrink-0 font-label font-bold text-[11px]">
        {/* Toggle Click-to-Split */}
        <button
          type="button"
          onClick={() => setChopMode((v) => !v)}
          className={`px-1 py-0.5 rounded truncate flex-1 text-center cursor-pointer ${
            chopMode ? 'us-lcd-inverse animate-pulse' : 'us-lcd-box hover:us-lcd-inverse'
          }`}
          title="Arm click-to-split: click anywhere on waveform to slice"
        >
          ✂ CUT…
        </button>

        {/* Normalize */}
        <button
          type="button"
          onClick={normalizeAudio}
          className="us-lcd-box px-1 py-0.5 hover:us-lcd-inverse rounded truncate flex-1 text-center cursor-pointer"
          title="Normalize the selected audio toward 0 dBFS, with up to 4× gain"
        >
          NORM
        </button>

        {/* Reverse Audio */}
        <button
          type="button"
          onClick={toggleReverse}
          className={`px-1 py-0.5 rounded truncate flex-1 text-center cursor-pointer ${
            noteSample?.reverse ? 'us-lcd-inverse' : 'us-lcd-box hover:us-lcd-inverse'
          }`}
          title="Play this note in reverse"
        >
          REV
        </button>

        {/* Loop Audio */}
        <button
          type="button"
          onClick={toggleLoop}
          className={`px-1 py-0.5 rounded truncate flex-1 text-center cursor-pointer ${
            noteSample?.loop ? 'us-lcd-inverse' : 'us-lcd-box hover:us-lcd-inverse'
          }`}
          title="Loop this note"
        >
          LOOP
        </button>

        {/* Reset Note */}
        <button
          type="button"
          onClick={() => {
            if (dev && asset) {
              setPadSample(dev.id, selectedNote, {
                audioId: asset.id,
                level: 1,
                offset: 0,
                duration: asset.buffer.duration,
                pitch: 0,
                tune: 0,
                reverse: false,
                loop: false,
                attack: 0.002,
                decay: 0.25,
                sustain: 1,
                release: 0.05,
              });
              onTouched?.({ label: 'Reset Note', value: `${selectedNote}` });
              onForce?.();
            }
          }}
          className="us-lcd-box px-1 py-0.5 hover:us-lcd-inverse rounded text-[11px] text-red-500/80 hover:text-white cursor-pointer"
          title="Reset note audio parameters to defaults"
        >
          ✕
        </button>
      </div>

      {/* 5. Fade In, Fade Out & Pitch Transpose (Row 6 from media_1792972685143_a6164c82.png) */}
      <div className="flex items-center justify-between us-lcd-box px-1 py-0.5 text-[11px] font-label font-bold shrink-0">
        {/* Fade In */}
        <div className="flex items-center gap-0.5">
          <span className="opacity-75">F-IN:</span>
          <button type="button" onClick={() => adjustFadeIn(-0.01)} className="px-0.5 hover:us-lcd-inverse rounded cursor-pointer">-</button>
          <span>{((noteSample?.attack ?? 0.002) * 1000).toFixed(0)}ms</span>
          <button type="button" onClick={() => adjustFadeIn(0.01)} className="px-0.5 hover:us-lcd-inverse rounded cursor-pointer">+</button>
        </div>

        {/* Fade Out */}
        <div className="flex items-center gap-0.5">
          <span className="opacity-75">F-OUT:</span>
          <button type="button" onClick={() => adjustFadeOut(-0.05)} className="px-0.5 hover:us-lcd-inverse rounded cursor-pointer">-</button>
          <span>{(noteSample?.release ?? 0.05).toFixed(2)}s</span>
          <button type="button" onClick={() => adjustFadeOut(0.05)} className="px-0.5 hover:us-lcd-inverse rounded cursor-pointer">+</button>
        </div>

        {/* Pitch Transpose */}
        <div className="flex items-center gap-0.5">
          <span className="opacity-75">PITCH:</span>
          <button type="button" onClick={() => adjustPitch(-1)} className="px-0.5 hover:us-lcd-inverse rounded cursor-pointer">-</button>
          <span className="font-lcd text-[11px]">{(noteSample?.pitch ?? 0) >= 0 ? `+${noteSample?.pitch ?? 0}` : noteSample?.pitch ?? 0}</span>
          <button type="button" onClick={() => adjustPitch(1)} className="px-0.5 hover:us-lcd-inverse rounded cursor-pointer">+</button>
        </div>
      </div>
      </fieldset>
    </div>
  );
};
