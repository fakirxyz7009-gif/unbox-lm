/**
 * Transport bar docked under every tab: go to start / bar back / bar forward, play, stop, record
 * (+ record settings), loop with L/R, click with level, count-in, song position and time, tempo
 * (type or tap), time signature, MIDI status, master meter and the computer-keyboard piano switch.
 */
import React, { useEffect, useReducer, useRef, useState } from 'react';
import { Repeat, Keyboard as KeyboardIcon, SkipBack, Rewind, FastForward, Play, Pause, Square } from 'lucide-react';
import { audioEngine } from '../audio/AudioEngine.ts';
import { useBarTick, useEngineVersion, useFrame, useMeterFrame } from '../nexa/useEngine.ts';
import { RecordPanel } from '../components/transport/RecordPanel.tsx';
import { gainToDb, meterPos } from '../studio/ui/levels.ts';
import { setText, setWidth } from '../ui/skin/dom.ts';
import { RingKnob } from '../ui/skin/RingKnob.tsx';
import { setUi, useUi } from './uiStore.ts';
import { MIDI_NO_INPUT_GUIDANCE } from '../audio/midi/MidiInput.ts';

const Readout: React.FC<{ label: string; children: React.ReactNode; className?: string; title?: string }> = ({ label, children, className = '', title }) => (
  <div className={`us-lcd px-2 h-[40px] flex flex-col justify-center leading-none ${className}`} title={title}>
    <div className="font-lcd text-[18px] leading-[20px] tracking-wide text-lcd-ink">{children}</div>
    <div className="font-label text-[11px] font-bold leading-[12px] tracking-wider text-lcd-dim">{label}</div>
  </div>
);

function TempoField() {
  const [text, setText] = useState<string | null>(null);
  // a tempo lane changes the BPM while playing
  useBarTick(audioEngine.isPlaying);
  const taps = useRef<number[]>([]);
  const commit = () => {
    if (text !== null) {
      const n = Number(text);
      if (Number.isFinite(n) && n >= 20 && n <= 999) audioEngine.setBpm(n);
      setText(null);
    }
  };
  const tap = () => {
    const now = performance.now();
    const t = taps.current.filter((x) => now - x < 2500);
    t.push(now);
    taps.current = t.slice(-8);
    if (t.length >= 2) {
      const span = (t[t.length - 1] - t[0]) / (t.length - 1);
      audioEngine.setBpm(Math.round((60000 / span) * 10) / 10);
    }
  };
  return (
    <div className="flex items-stretch gap-1">
      <div className="us-lcd px-2 h-[38px] flex flex-col justify-center leading-none w-[78px]">
        <input
          aria-label="Tempo (BPM)"
          inputMode="decimal"
          value={text ?? String(Math.round(audioEngine.bpm * 10) / 10)}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setText(null);
              e.currentTarget.blur();
            }
          }}
          className="w-full bg-transparent font-lcd text-[18px] leading-[17px] text-lcd-ink outline-none"
        />
        <div className="font-label text-[11px] font-bold tracking-wider text-lcd-dim">TEMPO</div>
      </div>
      <button type="button" onClick={tap} className="us-btn rounded px-1.5 font-label font-bold text-[11px]" title="Tap tempo (tap 2+ times)">
        TAP
      </button>
    </div>
  );
}

function MasterMeter() {
  const l = useRef<HTMLDivElement>(null);
  const r = useRef<HTMLDivElement>(null);
  const dbRef = useRef<HTMLSpanElement>(null);
  const clipRef = useRef<HTMLSpanElement>(null);
  const clipUntil = useRef(0);
  const buf = useRef(new Float32Array(audioEngine.analyserL.fftSize));
  useMeterFrame(() => {
    const peak = (an: AnalyserNode) => {
      an.getFloatTimeDomainData(buf.current);
      let p = 0;
      for (let i = 0; i < buf.current.length; i++) p = Math.max(p, Math.abs(buf.current[i]));
      return p;
    };
    const pl = peak(audioEngine.analyserL);
    const pr = peak(audioEngine.analyserR);
    setWidth(l.current, meterPos(gainToDb(pl)) * 100);
    setWidth(r.current, meterPos(gainToDb(pr)) * 100);
    const top = Math.max(pl, pr);
    if (top > 0.999) clipUntil.current = performance.now() + 1500;
    setText(dbRef.current, top <= 0.0001 ? '−∞' : (20 * Math.log10(top)).toFixed(1));
    const clipped = performance.now() < clipUntil.current;
    if (clipRef.current && (clipRef.current.dataset.on === 'true') !== clipped) clipRef.current.dataset.on = String(clipped);
  });
  return (
    <div className="unbox-meter-bank flex items-center gap-2" title="Master output peak (L / R), peak dBFS and clip hold">
      <div className="w-[104px] flex flex-col gap-[3px]">
        {[l, r].map((ref, i) => (
          <div key={i} className="h-[7px] rounded-sm bg-black/80 overflow-hidden shadow-inner">
            <div ref={ref} className="h-full bg-gradient-to-r from-emerald-400 via-yellow-300 to-red-500 will-change-transform" style={{ width: 0 }} />
          </div>
        ))}
      </div>
      <div className="flex flex-col items-end leading-none">
        <span ref={dbRef} className="font-mono text-[11px] text-[#c2c6ca]">−∞</span>
        <span
          ref={clipRef}
          data-on="false"
          className="mt-0.5 rounded px-1 text-[11px] font-bold tracking-wider text-[#6e3a36] data-[on=true]:bg-red-500 data-[on=true]:text-black"
        >
          CLIP
        </span>
      </div>
    </div>
  );
}

/** MIDI status: controller name, an LED that blinks on incoming notes / knobs, blocked / busy. */
function MidiLed({ onOpenSettings }: { onOpenSettings: () => void }) {
  const midi = audioEngine.midi;
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => midi.subscribe(force), [midi]);
  const led = useRef<HTMLSpanElement>(null);
  useFrame(() => {
    const on = performance.now() - midi.lastActivity < 140;
    const el = led.current;
    if (el && (el.dataset.on === 'true') !== on) el.dataset.on = String(on);
  });
  // "MIDIIN2 (Novation Impulse)" is the same controller's second port
  const names = [...new Set(midi.ports.map((p) => p.name.replace(/^MIDIIN\d+ \((.*)\)$/, '$1')))];
  const busy = midi.ports.some((p) => p.error);
  const target = audioEngine.midiTarget();
  let label: string;
  let title: string;
  let color = 'bg-emerald-400';
  if (midi.status === 'blocked') {
    [label, title, color] = ['MIDI blocked', 'MIDI access was refused. Click to ask again (allow MIDI for this site).', 'bg-red-500'];
  } else if (midi.status === 'unsupported') {
    [label, title, color] = ['No MIDI', 'This browser has no Web MIDI — use Chrome / Edge or the desktop app.', 'bg-slate-500'];
  } else if (midi.status === 'off') {
    [label, title, color] = ['Connect MIDI', 'Click to request MIDI access and connect a keyboard.', 'bg-slate-500'];
  } else if (midi.status !== 'ready') {
    [label, title, color] = ['MIDI…', 'Requesting MIDI access…', 'bg-slate-500'];
  } else if (!names.length) {
    [label, title, color] = ['No MIDI', `${MIDI_NO_INPUT_GUIDANCE} Click for MIDI settings and a manual rescan.`, 'bg-slate-500'];
  } else {
    label = names.join(' + ');
    title = `${label}${busy ? ' — a port is in use by another program' : ''}: plays ${target ? target.name : 'the selected part'}. Click: MIDI settings & knob mapping.`;
    if (busy) color = 'bg-amber-400';
  }
  return (
    <button
      type="button"
      onClick={() => (midi.status === 'blocked' || midi.status === 'off' ? void midi.enable() : onOpenSettings())}
      title={title}
      aria-label={title}
      className="us-btn h-[34px] max-w-[170px] px-2 rounded-[6px] flex items-center gap-1.5 font-label font-bold text-[13px]"
      data-testid="transport-midi"
    >
      <span ref={led} data-on="false" className={`w-2 h-2 shrink-0 rounded-full ${color} opacity-40 data-[on=true]:opacity-100 data-[on=true]:shadow-[0_0_6px_rgba(255,255,255,0.75)]`} />
      <span className="truncate">{label}</span>
    </button>
  );
}

const TBtn: React.FC<{ onClick: () => void; title: string; active?: boolean; color?: string; children: React.ReactNode; testId?: string; disabled?: boolean }> = ({ onClick, title, active, color = '#d69b50', children, testId, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-label={title}
    aria-pressed={active}
    data-testid={testId}
    className="us-btn h-[34px] min-w-[34px] px-2 rounded-[6px] grid place-items-center disabled:opacity-45"
    style={active ? { background: `linear-gradient(180deg, ${color}, ${color}aa)`, color: '#111', boxShadow: `0 0 10px ${color}88` } : undefined}
  >
    {children}
  </button>
);

export function TransportBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  useEngineVersion();
  const ui = useUi();
  const [, force] = useState(0);
  const [recOpen, setRecOpen] = useState(false);
  const posRef = useRef<HTMLSpanElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const rec = audioEngine.recorder;
  const loop = audioEngine.getLoopRange();
  // readouts on the shared meter frames, so the frames in between paint nothing (see meterDue)
  useMeterFrame(() => {
    const pos = audioEngine.getPlayheadPosition();
    const m = audioEngine.timeMap.tickToMusical(pos * 12);
    setText(posRef.current, `${String(m.bar).padStart(3, ' ')}.${m.beat}.${m.sixteenth}`);
    const sec = audioEngine.timeMap.sixteenthToSeconds(pos);
    setText(timeRef.current, `${String(Math.floor(sec / 60)).padStart(2, '0')}:${(sec % 60).toFixed(1).padStart(4, '0')}`);
  });
  const rerender = () => force((n) => n + 1);
  return (
    <div className="us-chrome unbox-transport h-[50px] shrink-0 flex items-center gap-1.5 px-3 text-chrome-ink relative" data-testid="transport-bar" onClick={() => void audioEngine.resumeContext()}>
      <span className="us-screw shrink-0 mr-1.5" aria-hidden />
      <TBtn onClick={() => audioEngine.rewindToStart()} title="Go to start">
        <SkipBack className="w-4 h-4" />
      </TBtn>
      <TBtn onClick={() => audioEngine.rewindTransport(audioEngine.stepsPerBar)} title="One bar back">
        <Rewind className="w-4 h-4" />
      </TBtn>
      <TBtn onClick={() => audioEngine.nextBar()} title="One bar forward">
        <FastForward className="w-4 h-4" />
      </TBtn>
      <TBtn onClick={() => void audioEngine.togglePlay()} title={audioEngine.isPlaying ? 'Pause (Space)' : 'Play (Space)'} active={audioEngine.isPlaying} color="#3ee07a" testId="transport-play">
        {audioEngine.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </TBtn>
      <TBtn onClick={() => audioEngine.stopTransport()} title="Stop (back to start)">
        <Square className="w-3.5 h-3.5" />
      </TBtn>
      <div className="relative flex" onClick={(e) => e.stopPropagation()}>
        <TBtn
          onClick={() => void rec.toggle().then(() => rec.message && setRecOpen(true))}
          title={rec.isFinalizing ? 'Finishing the recorded take…' : rec.state === 'arming' ? 'Cancel recording preparation' : 'Record armed tracks'}
          active={rec.state !== 'idle'}
          color="#ff4d4d"
          disabled={rec.isFinalizing}
        >
          <span className={`w-3 h-3 rounded-full ${rec.isFinalizing ? 'bg-amber-300 animate-pulse' : rec.state !== 'idle' ? 'bg-black' : 'bg-red-500'}`} />
        </TBtn>
        <button type="button" className="us-btn h-[34px] w-4 rounded-r text-[11px]" title="Record settings: count-in, punch, input…" aria-label="Record settings" onClick={() => setRecOpen((v) => !v)}>
          ▾
        </button>
        {recOpen && <RecordPanel onClose={() => setRecOpen(false)} />}
      </div>
      {rec.isFinalizing && <span className="text-[11px] text-amber-200 max-w-40 leading-tight" role="status">Finishing take…</span>}
      {!rec.isFinalizing && rec.message && <span className="text-[11px] text-red-300 max-w-40 leading-tight" role="status">{rec.message}</span>}

      <div className="w-px h-8 bg-chrome-line mx-1" />
      <TBtn onClick={() => audioEngine.toggleLoop()} title="Loop between L and R (L)" active={audioEngine.loopEnabled} color="#d7ad6f" testId="transport-loop">
        <span className="flex items-center gap-1 font-label font-bold text-[13px]">
          <Repeat className="w-3.5 h-3.5" />
          <span className="hidden min-[1400px]:inline">
            L {+(loop.start + 1).toFixed(2)} · R {+(loop.end + 1).toFixed(2)}
          </span>
        </span>
      </TBtn>
      <TBtn
        onClick={() => {
          audioEngine.metronomeEnabled = !audioEngine.metronomeEnabled;
          rerender();
        }}
        title="Click / metronome (M)"
        active={audioEngine.metronomeEnabled}
      >
        <span className="font-label font-bold text-[13px]">CLICK</span>
      </TBtn>
      <div className="-my-1 scale-[0.8]">
        <RingKnob
          value={audioEngine.metronomeLevel}
          min={0}
          max={1}
          size={30}
          defaultValue={0.7}
          title="Click level"
          onChange={(v) => {
            audioEngine.metronomeLevel = v;
            rerender();
          }}
        />
      </div>
      <span className="hidden min-[1360px]:contents">
        <TBtn
          onClick={() => {
            rec.settings.countInBars = (rec.settings.countInBars + 1) % 3;
            rerender();
          }}
          title="Count-in before recording: off / 1 bar / 2 bars"
          active={rec.settings.countInBars > 0}
        >
          <span className="font-label font-bold text-[13px]">PRE {rec.settings.countInBars || '–'}</span>
        </TBtn>
      </span>

      <div className="w-px h-8 bg-chrome-line mx-1" />
      <Readout label="BAR.BEAT.16" className="w-[132px]">
        <span ref={posRef} className="whitespace-pre">  1.1.1</span>
      </Readout>
      <Readout label="TIME" className="w-[88px]">
        <span ref={timeRef}>00:00.0</span>
      </Readout>
      <TempoField />
      <Readout label="SIGNATURE" className="hidden min-[1360px]:flex w-[86px]">
        {audioEngine.timeSignature}
      </Readout>

      <div className="flex-1" />
      <MidiLed onOpenSettings={onOpenSettings} />
      <MasterMeter />
      <TBtn
        onClick={() => setUi({ qwertyPiano: !ui.qwertyPiano })}
        title={ui.qwertyPiano ? 'Computer keys play notes (A W S E D …). Click: keys become commands (Q–U tools, B, L, C)' : 'Computer keys are commands. Click: keys play notes'}
        active={ui.qwertyPiano}
        color="#d7ad6f"
        testId="transport-keys"
      >
        <span className="flex items-center gap-1 font-label font-bold text-[13px]">
          <KeyboardIcon className="w-4 h-4" /> KEYS
        </span>
      </TBtn>
      <span className="us-screw shrink-0 ml-1.5" aria-hidden />
    </div>
  );
}
