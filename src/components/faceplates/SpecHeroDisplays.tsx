/**
 * Hardware-inspired hero front-panel visual displays for Unbox Studios.
 * Inspired directly by classic studio hardware:
 *  - Waldorf Iridium (Quantum Core): Dual screens (Oscilloscope + FFT Spectrum) + 3 ring knobs (Wave, Filter, Mix)
 *  - Masterline Tube Compressor: Triple vintage backlit analog VU meters (Input, Gain Reduction, Output)
 *  - Arturia MatrixBrute (Gridbeast): 16x16 illuminated modulation matrix button grid
 *  - Erica Synths Pērkons HD-01 (Ironworks HD-4): 4 independent percussion engines with trigger flash lamps & 16-step industrial sequencer
 *  - Make Noise Shared System (Black & Gold): Obsidian & gold PCB traces, wavefolder oscilloscope & gold capacitive touchplates
 *  - Akai MPC X SE (Beatcenter XL): Touchscreen waveform display + 4x4 velocity-sensitive RGB pads
 *  - Empirical Labs Distressor: 16-segment curved gain reduction LED ladder + ratio selector LEDs
 *  - Manley Variable Mu / Neve Portico II: Dual backlit analog VU meters
 *  - Masterline Stereo Imager: Real-time Lissajous stereo vectorscope / goniometer
 *  - Clockwork / Synchronous: Tempo-synced modulation curves with moving playhead
 */
import React, { useEffect, useRef, useState } from 'react';
import { audioEngine } from '../../audio/AudioEngine.ts';
import type { SpecDevice } from '../../audio/spec/SpecDevice.ts';
import type { PanelDisplay } from '../../../shared/rack/devices/types.ts';
import { RingKnob } from '../../ui/skin/RingKnob.tsx';
import { meterDue } from '../../nexa/useEngine.ts';

export const isHeroDisplay = (kind: PanelDisplay | undefined): boolean =>
  kind === 'dual_quantum' ||
  kind === 'triple_vu' ||
  kind === 'dual_vu' ||
  kind === 'distressor_leds' ||
  kind === 'matrix_grid' ||
  kind === 'industrial_step' ||
  kind === 'touchscreen_pads' ||
  kind === 'westcoast_gold' ||
  kind === 'vectorscope' ||
  kind === 'curve_mod';

export const HeaderBadge: React.FC<{ kind: PanelDisplay; accent: string }> = ({ kind, accent }) => {
  if (kind === 'dual_quantum') {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-950/80 border border-emerald-500/60 shadow-[0_0_10px_rgba(16,185,129,0.3)]">
        <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse" />
        <span className="text-[11px] font-mono font-black text-emerald-300 tracking-wider">ON</span>
      </div>
    );
  }
  if (kind === 'triple_vu') {
    return (
      <div className="px-2.5 py-1 rounded border border-amber-500/50 bg-amber-950/40 text-amber-300 font-mono font-bold text-[11px] shadow-[0_0_8px_rgba(217,119,6,0.3)]">
        ANALOG MODE
      </div>
    );
  }
  if (kind === 'matrix_grid') {
    return (
      <div className="px-2 py-0.5 rounded border border-orange-500/50 bg-orange-950/40 text-orange-300 font-mono font-bold text-[11px]">
        16x16 MOD MATRIX
      </div>
    );
  }
  if (kind === 'industrial_step') {
    return (
      <div className="px-2 py-0.5 rounded border border-red-500/50 bg-red-950/40 text-red-300 font-mono font-bold text-[11px]">
        4-ENGINE HD DRUMS
      </div>
    );
  }
  if (kind === 'westcoast_gold') {
    return (
      <div className="px-2 py-0.5 rounded border border-yellow-500/50 bg-yellow-950/40 text-yellow-300 font-mono font-bold text-[11px]">
        WEST-COAST MODULAR
      </div>
    );
  }
  if (kind === 'touchscreen_pads') {
    return (
      <div className="px-2 py-0.5 rounded border border-rose-500/50 bg-rose-950/40 text-rose-300 font-mono font-bold text-[11px]">
        STANDALONE SAMPLER
      </div>
    );
  }
  if (kind === 'distressor_leds') {
    return (
      <div className="px-2 py-0.5 rounded border border-red-500/50 bg-red-950/40 text-red-300 font-mono font-bold text-[11px]">
        BRITISH MODE READY
      </div>
    );
  }
  return (
    <span className="text-[11px] font-bold px-1.5 py-0.5 rounded border" style={{ borderColor: `${accent}88`, color: accent }}>
      HARDWARE DSP
    </span>
  );
};

// ------------------------------------------------------------------ 1. Dual Quantum (Waldorf Iridium / Quantum Core)
export const DualQuantumHero: React.FC<{
  device: SpecDevice;
  val: (k: string) => number;
  set: (k: string, v: number) => void;
}> = ({ device, val, set }) => {
  const scopeRef = useRef<HTMLCanvasElement | null>(null);
  const fftRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let raf = 0;
    const timeBuf = new Float32Array(device.analyser.fftSize);
    const freqBuf = new Uint8Array(device.analyser.frequencyBinCount);
    let peakHold = new Array(20).fill(0);
    let phase = 0;

    const tick = (t: number) => {
      if (!meterDue(t)) {
        raf = requestAnimationFrame(tick);
        return;
      }

      device.analyser.getFloatTimeDomainData(timeBuf);
      device.analyser.getByteFrequencyData(freqBuf);

      // Check if audio is active
      let loud = false;
      for (let i = 0; i < timeBuf.length; i += 16) {
        if (Math.abs(timeBuf[i]) > 0.002) {
          loud = true;
          break;
        }
      }

      // Left Screen: Dual Oscilloscope
      if (scopeRef.current) {
        const ctx = scopeRef.current.getContext('2d');
        if (ctx) {
          const w = scopeRef.current.width;
          const h = scopeRef.current.height;
          ctx.fillStyle = '#060b12';
          ctx.fillRect(0, 0, w, h);

          // Grid lines
          ctx.strokeStyle = 'rgba(15, 42, 66, 0.45)';
          ctx.lineWidth = 1;
          for (let x = 0; x < w; x += 16) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
          }
          for (let y = 0; y < h; y += 14) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
          }

          const posA = val('posA');
          phase += 0.04;

          // Waveform 1: Real-time time domain (Cyan #00f0ff)
          ctx.strokeStyle = '#00f0ff';
          ctx.shadowColor = '#00f0ff';
          ctx.shadowBlur = 6;
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let i = 0; i < timeBuf.length; i += 4) {
            const x = (i / timeBuf.length) * w;
            const signal = loud ? timeBuf[i] : Math.sin(x * 0.05 + phase) * 0.4;
            const y = h / 2 - signal * h * 0.42;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();

          // Waveform 2: Morph wavetable trace (Magenta/Purple #c084fc)
          ctx.strokeStyle = '#c084fc';
          ctx.shadowColor = '#c084fc';
          ctx.shadowBlur = 5;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          for (let i = 0; i < timeBuf.length; i += 4) {
            const x = (i / timeBuf.length) * w;
            const morphSignal = loud
              ? timeBuf[i] * 0.8 + Math.sin(x * 0.08 + phase * 1.5) * (0.15 + posA * 0.25)
              : Math.sin(x * 0.05 + phase + 0.8) * 0.35 + Math.sin(x * 0.15 + phase) * (posA * 0.2);
            const y = h / 2 - morphSignal * h * 0.38;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }

      // Right Screen: Real-Time FFT Frequency Spectrum
      if (fftRef.current) {
        const ctx = fftRef.current.getContext('2d');
        if (ctx) {
          const w = fftRef.current.width;
          const h = fftRef.current.height;
          ctx.fillStyle = '#060b12';
          ctx.fillRect(0, 0, w, h);

          // Grid lines
          ctx.strokeStyle = 'rgba(15, 42, 66, 0.4)';
          ctx.lineWidth = 1;
          for (let y = 10; y < h; y += 16) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
          }

          const bands = 20;
          const barWidth = Math.floor(w / bands) - 2;
          const step = Math.floor(freqBuf.length / bands);

          for (let b = 0; b < bands; b++) {
            let sum = 0;
            for (let j = 0; j < step; j++) {
              sum += freqBuf[b * step + j] || 0;
            }
            const avg = loud ? sum / step / 255 : Math.max(0.04, Math.sin(b * 0.4 + phase) * 0.12);
            const barH = Math.max(2, avg * (h - 6));
            const x = b * (barWidth + 2) + 2;
            const y = h - barH;

            // Decay peak hold
            if (barH > peakHold[b]) peakHold[b] = barH;
            else peakHold[b] = Math.max(0, peakHold[b] - 0.8);

            // Bar gradient (Teal -> Amber)
            const grad = ctx.createLinearGradient(0, h, 0, y);
            grad.addColorStop(0, '#00e5ff');
            grad.addColorStop(0.7, '#10b981');
            grad.addColorStop(1, '#f59e0b');
            ctx.fillStyle = grad;
            ctx.fillRect(x, y, barWidth, barH);

            // Peak cap
            if (peakHold[b] > 2) {
              ctx.fillStyle = '#fbbf24';
              ctx.fillRect(x, h - peakHold[b] - 2, barWidth, 2);
            }
          }
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [device, val]);

  return (
    <div className="flex items-center justify-between gap-4 p-3 rounded-lg border border-cyan-800/50 bg-gradient-to-b from-[#09101a] via-[#05080e] to-[#04060b] shadow-[inset_0_2px_12px_rgba(0,0,0,0.8)]">
      {/* Left Screen: Dual Oscilloscope */}
      <div className="flex flex-col items-center">
        <div className="relative rounded-md border border-cyan-700/60 overflow-hidden shadow-[0_0_12px_rgba(0,229,255,0.18)]">
          <canvas ref={scopeRef} width={220} height={80} className="block" />
          <div className="absolute top-1 left-2 flex items-center gap-1.5 text-[9px] font-mono font-bold text-cyan-300">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span>WT-1 SCOPE</span>
          </div>
          <div className="absolute bottom-1 right-2 text-[9px] font-mono text-purple-300">
            INDEX {(val('posA') * 100).toFixed(0)}%
          </div>
        </div>
        <span className="text-[10px] font-mono font-bold text-cyan-400 mt-1 uppercase tracking-wider">
          Dual Oscilloscope
        </span>
      </div>

      {/* Center: 3 Macro Ring Knobs (Wave, Filter, Mix) */}
      <div className="flex items-center gap-4 px-4 py-2 rounded-lg bg-black/60 border border-cyan-900/40 shadow-inner">
        <RingKnob
          label="WAVE"
          value={val('posA')}
          min={0}
          max={1}
          step={0.01}
          size={50}
          color="#00f0ff"
          tone="dark"
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => set('posA', v)}
        />
        <RingKnob
          label="FILTER"
          value={val('cutoff')}
          min={60}
          max={16000}
          curve="log"
          step={10}
          size={50}
          color="#00f0ff"
          tone="dark"
          format={(v) => `${Math.round(v)} Hz`}
          onChange={(v) => set('cutoff', v)}
        />
        <RingKnob
          label="MIX"
          value={val('mixAB')}
          min={0}
          max={1}
          step={0.01}
          size={50}
          color="#00f0ff"
          tone="dark"
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => set('mixAB', v)}
        />
      </div>

      {/* Right Screen: Real-Time FFT Spectrum */}
      <div className="flex flex-col items-center">
        <div className="relative rounded-md border border-cyan-700/60 overflow-hidden shadow-[0_0_12px_rgba(0,229,255,0.18)]">
          <canvas ref={fftRef} width={220} height={80} className="block" />
          <div className="absolute top-1 left-2 flex items-center gap-1.5 text-[9px] font-mono font-bold text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>FFT DENSITY</span>
          </div>
          <div className="absolute bottom-1 right-2 text-[9px] font-mono text-amber-300">
            20Hz - 20kHz
          </div>
        </div>
        <span className="text-[10px] font-mono font-bold text-cyan-400 mt-1 uppercase tracking-wider">
          Spectral Analyzer
        </span>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ 2. Triple Vintage Backlit Analog VU Meter
export const TripleVuHero: React.FC<{ device: SpecDevice }> = ({ device }) => {
  const needleIn = useRef<SVGLineElement | null>(null);
  const needleGr = useRef<SVGLineElement | null>(null);
  const needleOut = useRef<SVGLineElement | null>(null);

  useEffect(() => {
    let raf = 0;
    const buf = new Float32Array(device.analyser.fftSize);
    let vuIn = 0;
    let vuGr = 0;
    let vuOut = 0;

    const tick = (t: number) => {
      if (!meterDue(t)) {
        raf = requestAnimationFrame(tick);
        return;
      }

      device.analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const db = 20 * Math.log10(rms + 1e-6);

      const m = device.meter();
      const gr = Math.min(24, Math.abs(m.gr ?? 0));

      // Input level: -45 to +45 deg
      const targetIn = Math.max(0, Math.min(1, (db + 32) / 34));
      vuIn += (targetIn - vuIn) * 0.22;
      const angleIn = `rotate(${(-45 + vuIn * 90).toFixed(1)} 65 62)`;
      if (needleIn.current) needleIn.current.setAttribute('transform', angleIn);

      // Gain reduction: in hardware, needle rests on 0 dB (+36 deg) and sweeps back to left on compression
      const targetGr = Math.max(0, Math.min(1, gr / 20));
      vuGr += (targetGr - vuGr) * 0.25;
      const angleGr = `rotate(${(36 - vuGr * 78).toFixed(1)} 65 62)`;
      if (needleGr.current) needleGr.current.setAttribute('transform', angleGr);

      // Output level: -45 to +45 deg
      const targetOut = Math.max(0, Math.min(1, (db + 30) / 33));
      vuOut += (targetOut - vuOut) * 0.22;
      const angleOut = `rotate(${(-45 + vuOut * 90).toFixed(1)} 65 62)`;
      if (needleOut.current) needleOut.current.setAttribute('transform', angleOut);

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [device]);

  const renderMeter = (
    label: string,
    needleRef: React.RefObject<SVGLineElement | null>,
    isGr = false
  ) => (
    <div className="flex flex-col items-center">
      <div
        className="relative rounded-md border-2 border-[#54432d] overflow-hidden shadow-[inset_0_2px_8px_rgba(0,0,0,0.6),0_2px_6px_rgba(0,0,0,0.5)]"
        style={{
          background: 'linear-gradient(180deg, #faf0d2 0%, #ebd49d 70%, #d8be82 100%)',
          width: 146,
          height: 82,
        }}
      >
        <svg viewBox="0 0 130 72" className="w-full h-full">
          {/* Subtle paper grain / glow */}
          <radialGradient id="paperGlow" cx="50%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#fff8e7" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#ebd49d" stopOpacity="0" />
          </radialGradient>
          <rect width="130" height="72" fill="url(#paperGlow)" />

          {/* Scale Arch */}
          <path d="M 18 52 A 52 52 0 0 1 112 52" fill="none" stroke="#3d3020" strokeWidth="1.2" />
          {/* Overload red zone */}
          <path d="M 88 20 A 52 52 0 0 1 112 52" fill="none" stroke="#dc2626" strokeWidth="2.5" />

          {/* Scale ticks */}
          {[-40, -30, -20, -10, 0, 10, 20, 30, 40].map((deg) => (
            <line
              key={deg}
              x1={65}
              y1={13}
              x2={65}
              y2={17}
              stroke={deg > 20 ? '#dc2626' : '#3d3020'}
              strokeWidth={deg % 20 === 0 ? 1.5 : 0.8}
              transform={`rotate(${deg} 65 62)`}
            />
          ))}

          {/* Decibel markings */}
          <text x={26} y={42} fontSize={6.5} fill="#3d3020" fontFamily="sans-serif" fontWeight="bold">
            -20
          </text>
          <text x={42} y={30} fontSize={6.5} fill="#3d3020" fontFamily="sans-serif" fontWeight="bold">
            -10
          </text>
          <text x={65} y={24} fontSize={6.5} fill="#3d3020" textAnchor="middle" fontFamily="sans-serif" fontWeight="bold">
            {isGr ? '-6' : '0'}
          </text>
          <text x={88} y={30} fontSize={6.5} fill="#3d3020" fontFamily="sans-serif" fontWeight="bold">
            {isGr ? '0' : '+1'}
          </text>
          <text x={104} y={42} fontSize={6.5} fill="#dc2626" fontFamily="sans-serif" fontWeight="bold">
            +3
          </text>

          {/* Meter Label */}
          <text
            x={65}
            y={50}
            fontSize={7}
            fill="#3d3020"
            textAnchor="middle"
            fontFamily="monospace"
            fontWeight="bold"
            letterSpacing={0.5}
          >
            {label}
          </text>

          {/* Needle */}
          <line
            ref={needleRef}
            x1={65}
            y1={62}
            x2={65}
            y2={11}
            stroke="#1c1917"
            strokeWidth={1.5}
            strokeLinecap="round"
            transform={isGr ? 'rotate(36 65 62)' : 'rotate(-45 65 62)'}
          />

          {/* Pivot cap */}
          <circle cx={65} cy={62} r={6} fill="#292524" />
          <circle cx={65} cy={62} r={2} fill="#d97706" />
        </svg>
      </div>
    </div>
  );

  return (
    <div className="flex items-center justify-around gap-3 p-3 rounded-lg border border-amber-900/50 bg-gradient-to-b from-[#1c1813] via-[#120f0c] to-[#0a0806] shadow-inner">
      {renderMeter('INPUT', needleIn)}
      {renderMeter('GAIN REDUCTION', needleGr, true)}
      {renderMeter('OUTPUT', needleOut)}
    </div>
  );
};

// ------------------------------------------------------------------ 3. Dual Backlit Analog VU Meter
export const DualVuHero: React.FC<{ device: SpecDevice }> = ({ device }) => {
  const needleL = useRef<SVGLineElement | null>(null);
  const needleR = useRef<SVGLineElement | null>(null);

  useEffect(() => {
    let raf = 0;
    const buf = new Float32Array(device.analyser.fftSize);
    let vuL = 0;
    let vuR = 0;

    const tick = (t: number) => {
      if (!meterDue(t)) {
        raf = requestAnimationFrame(tick);
        return;
      }

      device.analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const db = 20 * Math.log10(rms + 1e-6);

      const m = device.meter();
      const gr = Math.min(24, Math.abs(m.gr ?? 0));

      // Left Channel / Output
      const targetL = Math.max(0, Math.min(1, (db + 32) / 34));
      vuL += (targetL - vuL) * 0.22;
      const angleL = `rotate(${(-45 + vuL * 90).toFixed(1)} 65 62)`;
      if (needleL.current) needleL.current.setAttribute('transform', angleL);

      // Right Channel / GR
      const targetR = gr > 0.1 ? Math.max(0, Math.min(1, gr / 20)) : targetL;
      vuR += (targetR - vuR) * 0.22;
      const angleR = gr > 0.1 ? `rotate(${(36 - vuR * 78).toFixed(1)} 65 62)` : `rotate(${(-45 + vuR * 90).toFixed(1)} 65 62)`;
      if (needleR.current) needleR.current.setAttribute('transform', angleR);

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [device]);

  return (
    <div className="flex items-center justify-center gap-6 p-3 rounded-lg border border-neutral-700/50 bg-gradient-to-b from-[#181a1d] to-[#0c0d0f] shadow-inner">
      <div className="flex flex-col items-center">
        <div
          className="relative rounded-md border-2 border-[#54432d] overflow-hidden shadow-md"
          style={{
            background: 'linear-gradient(180deg, #faf0d2 0%, #ebd49d 70%, #d8be82 100%)',
            width: 170,
            height: 90,
          }}
        >
          <svg viewBox="0 0 130 72" className="w-full h-full">
            <path d="M 18 52 A 52 52 0 0 1 112 52" fill="none" stroke="#3d3020" strokeWidth="1.2" />
            <path d="M 88 20 A 52 52 0 0 1 112 52" fill="none" stroke="#dc2626" strokeWidth="2.5" />
            <text x={65} y={50} fontSize={7} fill="#3d3020" textAnchor="middle" fontFamily="monospace" fontWeight="bold">
              CHANNEL A (LEFT)
            </text>
            <line ref={needleL} x1={65} y1={62} x2={65} y2={11} stroke="#1c1917" strokeWidth={1.5} strokeLinecap="round" transform="rotate(-45 65 62)" />
            <circle cx={65} cy={62} r={6} fill="#292524" />
            <circle cx={65} cy={62} r={2} fill="#d97706" />
          </svg>
        </div>
      </div>
      <div className="flex flex-col items-center">
        <div
          className="relative rounded-md border-2 border-[#54432d] overflow-hidden shadow-md"
          style={{
            background: 'linear-gradient(180deg, #faf0d2 0%, #ebd49d 70%, #d8be82 100%)',
            width: 170,
            height: 90,
          }}
        >
          <svg viewBox="0 0 130 72" className="w-full h-full">
            <path d="M 18 52 A 52 52 0 0 1 112 52" fill="none" stroke="#3d3020" strokeWidth="1.2" />
            <path d="M 88 20 A 52 52 0 0 1 112 52" fill="none" stroke="#dc2626" strokeWidth="2.5" />
            <text x={65} y={50} fontSize={7} fill="#3d3020" textAnchor="middle" fontFamily="monospace" fontWeight="bold">
              CHANNEL B (RIGHT)
            </text>
            <line ref={needleR} x1={65} y1={62} x2={65} y2={11} stroke="#1c1917" strokeWidth={1.5} strokeLinecap="round" transform="rotate(-45 65 62)" />
            <circle cx={65} cy={62} r={6} fill="#292524" />
            <circle cx={65} cy={62} r={2} fill="#d97706" />
          </svg>
        </div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ 4. Empirical Labs Distressor LED Ladder & Ratio
export const DistressorLedsHero: React.FC<{
  device: SpecDevice;
  val: (k: string) => number;
  set: (k: string, v: number) => void;
}> = ({ device, val, set }) => {
  const [grDb, setGrDb] = useState(0);

  useEffect(() => {
    let raf = 0;
    const tick = (t: number) => {
      if (!meterDue(t)) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const m = device.meter();
      setGrDb(Math.min(24, Math.abs(m.gr ?? 0)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [device]);

  const ratios = ['1:1', '2:1', '3:1', '4:1', '6:1', '10:1', '20:1', 'Nuke'];
  const curRatio = Math.round(val('ratio'));
  const leds = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 18, 20, 22, 24];

  return (
    <div className="flex items-center justify-between gap-4 p-3 rounded-lg border border-red-900/40 bg-gradient-to-b from-[#1c1c1f] to-[#0a0a0c] shadow-inner">
      {/* 16-Segment Curved LED Gain Reduction Ladder */}
      <div className="flex flex-col gap-1.5 flex-1">
        <span className="text-[10px] font-mono font-black text-neutral-300 tracking-wider">
          GAIN REDUCTION (dB)
        </span>
        <div className="flex items-center gap-1.5 bg-black/70 p-2 rounded-md border border-neutral-800">
          {leds.map((threshold, i) => {
            const active = grDb >= threshold;
            const isRed = threshold >= 16;
            const isYellow = threshold >= 7 && threshold < 16;
            const activeColor = isRed ? '#ef4444' : isYellow ? '#eab308' : '#22c55e';
            return (
              <div key={threshold} className="flex flex-col items-center gap-1">
                <span
                  className="w-2.5 h-6 rounded-sm border border-black transition-all duration-75"
                  style={{
                    background: active ? activeColor : 'rgba(255,255,255,0.06)',
                    boxShadow: active ? `0 0 8px ${activeColor}` : 'none',
                  }}
                />
                <span className="text-[8px] font-mono text-neutral-400 font-bold">{threshold}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Ratio Selector Bank with Glowing Red LEDs */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-mono font-black text-neutral-300 tracking-wider">
          RATIO SELECT
        </span>
        <div className="flex items-center gap-1 bg-black/70 p-1.5 rounded-md border border-neutral-800">
          {ratios.map((r, i) => {
            const active = curRatio === i;
            return (
              <button
                key={r}
                type="button"
                onClick={() => set('ratio', i)}
                className={`px-2 py-1 rounded text-[10px] font-mono font-bold flex flex-col items-center gap-1 border transition-all ${
                  active
                    ? 'border-red-500 bg-red-950/60 text-white shadow-[0_0_8px_rgba(239,68,68,0.4)]'
                    : 'border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:text-white'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    active ? 'bg-red-500 shadow-[0_0_6px_#ef4444]' : 'bg-neutral-700'
                  }`}
                />
                <span>{r}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ 5. Arturia MatrixBrute 16x16 Modulation Matrix
export const MatrixGridHero: React.FC<{ device: SpecDevice }> = ({ device }) => {
  const sources = ['ENV1', 'ENV2', 'ENV3', 'LFO1', 'LFO2', 'LFO3', 'MOD', 'VEL', 'AFTER', 'KEY', 'BEND', 'EXPR', 'RND', 'SEQ', 'M1', 'M2'];
  const dests = ['PITCH', 'CUTOFF', 'RESO', 'DRIVE', 'VCO1', 'VCO2', 'VCO3', 'NOISE', 'ATK', 'DEC', 'LFOr', 'PAN', 'SYNC', 'FX1', 'FX2', 'VCA'];

  const [activeMatrix, setActiveMatrix] = useState<Set<string>>(() => new Set(['0-1', '3-1', '6-3', '7-0', '13-0']));

  const togglePoint = (r: number, c: number) => {
    const key = `${r}-${c}`;
    setActiveMatrix((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-1.5 p-3 rounded-lg border border-orange-900/40 bg-gradient-to-b from-[#1c1d22] to-[#0e0f12] shadow-inner overflow-x-auto">
      <div className="flex items-center justify-between pb-1 border-b border-neutral-800 text-[10px] font-mono">
        <span className="font-bold text-orange-400 tracking-wider uppercase">
          16×16 Illuminated Modulation Matrix
        </span>
        <span className="text-neutral-400">CLICK TO ROUTE MODULATION</span>
      </div>

      <div className="grid gap-0.5" style={{ gridTemplateColumns: '50px repeat(16, 24px)' }}>
        {/* Header row: sources */}
        <div className="text-[8px] font-mono text-neutral-500 flex items-center justify-end pr-1">SRC →</div>
        {sources.map((s, c) => (
          <div key={s} className="text-[8px] font-mono text-orange-300 font-bold text-center truncate" title={`Source: ${s}`}>
            {s.slice(0, 3)}
          </div>
        ))}

        {/* 16 Destination Rows */}
        {dests.map((d, r) => (
          <React.Fragment key={d}>
            <div className="text-[8px] font-mono text-neutral-400 font-bold truncate pr-1 text-right flex items-center justify-end" title={`Dest: ${d}`}>
              {d.slice(0, 5)}
            </div>
            {sources.map((_, c) => {
              const active = activeMatrix.has(`${r}-${c}`);
              return (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  onClick={() => togglePoint(r, c)}
                  className={`w-5 h-5 rounded-sm border transition-all flex items-center justify-center ${
                    active
                      ? 'border-orange-500 bg-orange-600 shadow-[0_0_8px_#f97316]'
                      : 'border-neutral-800 bg-neutral-900/90 hover:border-neutral-600'
                  }`}
                  title={`${sources[c]} → ${d}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-amber-100' : 'bg-neutral-800'}`} />
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ 6. Erica Synths Pērkons HD-01 4-Engine Industrial Step
export const IndustrialStepHero: React.FC<{ device: SpecDevice }> = ({ device }) => {
  const [activePad, setActivePad] = useState(-1);
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    let raf = 0;
    const tick = (t: number) => {
      if (!meterDue(t)) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const m = device.meter();
      if (m.lastPad !== undefined) setActivePad(m.lastPad);
      if (m.step !== undefined) setActiveStep(m.step);
      else if (audioEngine.isPlaying) setActiveStep(audioEngine.songPosition % 16);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [device]);

  const voices = [
    { name: 'VOICE 1: KICK', note: 36, color: '#f97316' },
    { name: 'VOICE 2: SNARE', note: 38, color: '#06b6d4' },
    { name: 'VOICE 3: METAL', note: 42, color: '#eab308' },
    { name: 'VOICE 4: FM PERC', note: 45, color: '#a855f7' },
  ];

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg border border-red-900/40 bg-gradient-to-b from-[#141517] to-[#08080a] shadow-inner">
      {/* 4 Engine Voice Strips with Trigger Flash Lamps */}
      <div className="grid grid-cols-4 gap-2">
        {voices.map((v, i) => {
          const isFiring = activePad === i;
          return (
            <div key={v.name} className="flex flex-col gap-1.5 p-2 rounded-md bg-black/60 border border-neutral-800">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono font-black text-neutral-300">{v.name}</span>
                <span
                  className="w-2.5 h-2.5 rounded-full border border-black transition-all duration-75"
                  style={{
                    background: isFiring ? '#ffffff' : v.color,
                    boxShadow: isFiring ? `0 0 12px #ffffff, 0 0 20px ${v.color}` : `0 0 4px ${v.color}44`,
                  }}
                />
              </div>
              <button
                type="button"
                className="w-full py-2 rounded border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-[10px] font-mono font-bold text-white transition-all active:scale-95 shadow"
                onPointerDown={() => {
                  void audioEngine.resumeContext();
                  audioEngine.liveNoteOn(device, v.note, 0.95);
                  setActivePad(i);
                }}
                onPointerUp={() => audioEngine.liveNoteOff(device, v.note)}
              >
                TRIG {i + 1}
              </button>
            </div>
          );
        })}
      </div>

      {/* 16-Step Heavy Industrial Sequencer Trigger Buttons */}
      <div className="flex items-center gap-1 bg-black/80 p-2 rounded-md border border-neutral-800 overflow-x-auto">
        {Array.from({ length: 16 }, (_, s) => {
          const isCurrent = activeStep === s;
          return (
            <div key={s} className="flex-1 flex flex-col items-center gap-1">
              <span
                className={`w-full h-1.5 rounded-full transition-all ${
                  isCurrent ? 'bg-red-500 shadow-[0_0_8px_#ef4444]' : 'bg-neutral-800'
                }`}
              />
              <button
                type="button"
                className={`w-full py-2 rounded text-[9px] font-mono font-bold border transition-all ${
                  isCurrent
                    ? 'border-red-500 bg-red-950/70 text-white shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                    : s % 4 === 0
                    ? 'border-neutral-700 bg-neutral-800/80 text-neutral-300'
                    : 'border-neutral-800 bg-neutral-900/60 text-neutral-500'
                }`}
              >
                {s + 1}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ 7. Akai MPC X SE Touchscreen & 4x4 Pads
export const TouchscreenPadsHero: React.FC<{ device: SpecDevice }> = ({ device }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [activePad, setActivePad] = useState(-1);

  useEffect(() => {
    let raf = 0;
    const buf = new Float32Array(device.analyser.fftSize);
    const tick = (t: number) => {
      if (!meterDue(t)) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const m = device.meter();
      if (m.lastPad !== undefined) setActivePad(m.lastPad);

      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          const w = canvasRef.current.width;
          const h = canvasRef.current.height;
          ctx.fillStyle = '#0a0d14';
          ctx.fillRect(0, 0, w, h);

          // Grid lines
          ctx.strokeStyle = 'rgba(30, 58, 138, 0.35)';
          ctx.lineWidth = 1;
          for (let x = 0; x < w; x += 20) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
          }

          // Waveform
          device.analyser.getFloatTimeDomainData(buf);
          ctx.strokeStyle = '#38bdf8';
          ctx.shadowColor = '#38bdf8';
          ctx.shadowBlur = 4;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          for (let i = 0; i < buf.length; i += 4) {
            const x = (i / buf.length) * w;
            const y = h / 2 - buf[i] * h * 0.42;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [device]);

  const pads = device.spec.pads ?? [];

  return (
    <div className="flex items-center gap-4 p-3 rounded-lg border border-neutral-700 bg-gradient-to-b from-[#1c1d22] to-[#0e0f12] shadow-inner">
      {/* Touchscreen Waveform Display */}
      <div className="flex-1 flex flex-col gap-1">
        <div className="flex items-center justify-between text-[10px] font-mono text-cyan-300">
          <span className="font-bold uppercase tracking-wider">TOUCHSCREEN SAMPLE WAVEFORM</span>
          <span>16-BIT 44.1kHz • STEREO</span>
        </div>
        <div className="relative rounded-md border border-cyan-800 overflow-hidden shadow-inner">
          <canvas ref={canvasRef} width={260} height={100} className="w-full h-full block" />
        </div>
      </div>

      {/* 4x4 Velocity-Sensitive RGB Rubber Pads */}
      <div className="grid grid-cols-4 gap-1.5 p-2 rounded-lg bg-black/70 border border-neutral-800">
        {Array.from({ length: 16 }, (_, i) => {
          const pad = pads[i];
          const isTriggered = activePad === i;
          return (
            <button
              key={i}
              type="button"
              className={`w-12 h-10 rounded-md border font-mono text-[9px] font-black flex flex-col items-center justify-center transition-all ${
                isTriggered
                  ? 'border-red-500 bg-red-600 text-white shadow-[0_0_12px_#ef4444]'
                  : 'border-neutral-700 bg-neutral-900/90 text-neutral-300 hover:border-neutral-500'
              }`}
              onPointerDown={() => {
                void audioEngine.resumeContext();
                if (pad) audioEngine.liveNoteOn(device, pad.note, 0.95);
                setActivePad(i);
              }}
              onPointerUp={() => {
                if (pad) audioEngine.liveNoteOff(device, pad.note);
              }}
            >
              <span>{pad ? pad.name.slice(0, 5) : `P${i + 1}`}</span>
              <span className="text-[8px] opacity-60">{i + 1}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ 8. Make Noise Shared System (Black & Gold Modular)
export const WestcoastGoldHero: React.FC<{ device: SpecDevice; set: (k: string, v: number) => void }> = ({
  device,
  set,
}) => {
  const scopeRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let raf = 0;
    const buf = new Float32Array(device.analyser.fftSize);
    let phase = 0;

    const tick = (t: number) => {
      if (!meterDue(t)) {
        raf = requestAnimationFrame(tick);
        return;
      }
      device.analyser.getFloatTimeDomainData(buf);
      phase += 0.05;

      if (scopeRef.current) {
        const ctx = scopeRef.current.getContext('2d');
        if (ctx) {
          const w = scopeRef.current.width;
          const h = scopeRef.current.height;
          ctx.fillStyle = '#08080a';
          ctx.fillRect(0, 0, w, h);

          // Golden circular runes / sacred geometry background
          ctx.strokeStyle = 'rgba(212, 175, 55, 0.2)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(w / 2, h / 2, 32, 0, Math.PI * 2);
          ctx.stroke();

          // Golden Wavefolder Oscilloscope Trace
          ctx.strokeStyle = '#ffd700';
          ctx.shadowColor = '#ffd700';
          ctx.shadowBlur = 6;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          for (let i = 0; i < buf.length; i += 4) {
            const x = (i / buf.length) * w;
            const signal = buf[i] || Math.sin(x * 0.06 + phase) * 0.4;
            const y = h / 2 - signal * h * 0.42;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [device]);

  return (
    <div className="flex items-center justify-between gap-4 p-3 rounded-lg border-2 border-yellow-700/60 bg-gradient-to-b from-[#121216] via-[#09090c] to-[#040405] shadow-[0_0_15px_rgba(212,175,55,0.15)]">
      {/* Golden Wavefolder Scope */}
      <div className="flex flex-col items-center">
        <div className="relative rounded-md border border-yellow-600/70 overflow-hidden shadow-[0_0_10px_rgba(255,215,0,0.2)]">
          <canvas ref={scopeRef} width={220} height={80} className="block" />
          <div className="absolute top-1 left-2 text-[9px] font-mono font-bold text-yellow-300">
            TIMBRE WAVEFOLDER
          </div>
        </div>
      </div>

      {/* Gold Capacitive Touchplates */}
      <div className="flex items-center gap-2">
        {['PULSE 1', 'PULSE 2', 'CYCLE', 'SLEW', 'MATHS'].map((plate) => (
          <button
            key={plate}
            type="button"
            className="w-14 h-18 rounded border-2 border-yellow-500/80 bg-gradient-to-b from-yellow-700/40 via-yellow-900/30 to-black text-yellow-300 font-mono text-[9px] font-bold flex flex-col items-center justify-between p-1.5 shadow-[0_0_10px_rgba(255,215,0,0.15)] active:scale-95 active:border-yellow-200 transition-all"
            onPointerDown={() => {
              void audioEngine.resumeContext();
              audioEngine.liveNoteOn(device, 48, 0.95);
            }}
            onPointerUp={() => audioEngine.liveNoteOff(device, 48)}
          >
            <div className="w-full h-1 bg-yellow-400/80 rounded" />
            <span>{plate}</span>
            <div className="w-full h-1 bg-yellow-400/80 rounded" />
          </button>
        ))}
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ 9. Stereo Goniometer Vectorscope
export const VectorscopeHero: React.FC<{ device: SpecDevice }> = ({ device }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let raf = 0;
    const buf = new Float32Array(device.analyser.fftSize);
    let phase = 0;

    const tick = (t: number) => {
      if (!meterDue(t)) {
        raf = requestAnimationFrame(tick);
        return;
      }
      device.analyser.getFloatTimeDomainData(buf);
      phase += 0.05;

      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          const w = canvasRef.current.width;
          const h = canvasRef.current.height;
          ctx.fillStyle = '#060a08';
          ctx.fillRect(0, 0, w, h);

          // Circular phosphorescent grid
          ctx.strokeStyle = 'rgba(34, 197, 94, 0.25)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(w / 2, h / 2, 40, 0, Math.PI * 2);
          ctx.moveTo(w / 2, 0);
          ctx.lineTo(w / 2, h);
          ctx.moveTo(0, h / 2);
          ctx.lineTo(w, h / 2);
          ctx.stroke();

          // Lissajous Stereo Field Plot
          ctx.strokeStyle = '#4ade80';
          ctx.shadowColor = '#4ade80';
          ctx.shadowBlur = 6;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          for (let i = 0; i < buf.length - 2; i += 2) {
            const l = buf[i] || Math.sin(i * 0.04 + phase) * 0.35;
            const r = buf[i + 1] || Math.cos(i * 0.04 + phase) * 0.35;
            const x = w / 2 + (l - r) * w * 0.45;
            const y = h / 2 - (l + r) * h * 0.45;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [device]);

  return (
    <div className="flex items-center justify-center p-3 rounded-lg border border-emerald-900/40 bg-gradient-to-b from-[#0c140e] to-[#040805] shadow-inner">
      <div className="flex flex-col items-center">
        <canvas ref={canvasRef} width={260} height={90} className="rounded-md border border-emerald-800/60 block shadow" />
        <span className="text-[10px] font-mono font-bold text-emerald-400 mt-1 uppercase tracking-wider">
          Stereo Lissajous Vectorscope
        </span>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ 10. Tempo-Synced Modulation Curve Editor
export const CurveModHero: React.FC<{ device: SpecDevice }> = ({ device }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let raf = 0;
    const tick = (t: number) => {
      if (!meterDue(t)) {
        raf = requestAnimationFrame(tick);
        return;
      }
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          const w = canvasRef.current.width;
          const h = canvasRef.current.height;
          ctx.fillStyle = '#0f0e17';
          ctx.fillRect(0, 0, w, h);

          // Grid
          ctx.strokeStyle = 'rgba(168, 85, 247, 0.2)';
          ctx.lineWidth = 1;
          for (let x = 0; x < w; x += 32) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
          }

          // Modulation Curve
          ctx.strokeStyle = '#c084fc';
          ctx.shadowColor = '#c084fc';
          ctx.shadowBlur = 6;
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let x = 0; x < w; x++) {
            const n = x / w;
            const y = h - (Math.sin(n * Math.PI * 4) * 0.4 + 0.5) * (h - 10);
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.shadowBlur = 0;

          // Animated Playhead cursor
          const pos = audioEngine.isPlaying ? (audioEngine.songPosition % 16) / 16 : 0;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(pos * w, 0);
          ctx.lineTo(pos * w, h);
          ctx.stroke();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [device]);

  return (
    <div className="flex flex-col gap-1 p-3 rounded-lg border border-purple-900/40 bg-gradient-to-b from-[#191426] to-[#0c0914] shadow-inner">
      <span className="text-[10px] font-mono font-bold text-purple-300 uppercase tracking-wider">
        Tempo-Synced Modulation Curve & Playhead
      </span>
      <canvas ref={canvasRef} width={420} height={80} className="rounded-md border border-purple-800/60 block w-full" />
    </div>
  );
};
