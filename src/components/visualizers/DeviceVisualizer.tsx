import React, { useRef, useEffect } from 'react';
import { BaseDevice } from '../../audio/BaseDevice.ts';
import { PulsarDevice } from '../../audio/devices/PulsarDevice.ts';
import { MClassMasterSuite } from '../../audio/devices/MClassMasterSuite.ts';

interface DeviceVisualizerProps {
  device: BaseDevice;
  width?: number;
  height?: number;
}

export const DeviceVisualizer: React.FC<DeviceVisualizerProps> = ({
  device,
  width = 160,
  height = 58,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const analyser = device.analyser;
    const bufferLength = analyser.frequencyBinCount;
    const timeData = new Uint8Array(bufferLength);
    const freqData = new Uint8Array(bufferLength);

    const render = () => {
      analyser.getByteTimeDomainData(timeData);
      analyser.getByteFrequencyData(freqData);

      const w = canvas.width;
      const h = canvas.height;

      // Dark CRT screen background with subtle scanlines
      ctx.fillStyle = '#060a0f';
      ctx.fillRect(0, 0, w, h);

      // Grid reticle lines (oscilloscope / spectrum graticule)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 20) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += 15) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Specialized Visualizers tailored per device type:
      switch (device.type) {
        // 1. SUBTRACTOR: Phosphor CRT Oscilloscope + Filter Peak Indicator
        case 'subtractor': {
          ctx.beginPath();
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2;
          ctx.shadowBlur = 8;
          ctx.shadowColor = '#38bdf8';

          const sliceWidth = w / bufferLength;
          let x = 0;
          for (let i = 0; i < bufferLength; i++) {
            const v = timeData[i] / 128.0;
            const y = (v * h) / 2;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
            x += sliceWidth;
          }
          ctx.stroke();
          ctx.shadowBlur = 0;

          // Filter Cutoff cursor
          const cutoffNorm = Math.min(1, Math.max(0, (device.params.cutoff - 40) / 16000));
          ctx.strokeStyle = '#f59e0b';
          ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.moveTo(cutoffNorm * w, 0);
          ctx.lineTo(cutoffNorm * w, h);
          ctx.stroke();
          ctx.setLineDash([]);
          break;
        }

        // 2. THOR: Triple-Oscillator Multi-Color Spectral Bars
        case 'thor': {
          const numBars = 24;
          const barWidth = (w - (numBars - 1) * 2) / numBars;
          for (let i = 0; i < numBars; i++) {
            const bin = Math.floor(Math.pow(i / numBars, 1.8) * (bufferLength / 2));
            const val = freqData[bin] || 0;
            const barH = (val / 255) * (h - 4);
            const x = i * (barWidth + 2);
            const y = h - barH;

            // Gradient from studio blue to amber
            const grad = ctx.createLinearGradient(x, h, x, y);
            grad.addColorStop(0, '#1d4ed8');
            grad.addColorStop(0.7, '#38bdf8');
            grad.addColorStop(1, '#f59e0b');

            ctx.fillStyle = grad;
            ctx.fillRect(x, y, barWidth, barH);
          }
          break;
        }

        // 3. EUROPA: Morphing Wavetable / Spectral Water Wave
        case 'europa': {
          ctx.beginPath();
          ctx.strokeStyle = '#22d3ee';
          ctx.lineWidth = 1.8;
          ctx.shadowBlur = 6;
          ctx.shadowColor = '#06b6d4';

          const morph = device.params.morph || 0.5;
          const step = w / 40;
          ctx.moveTo(0, h / 2);
          for (let i = 0; i <= 40; i++) {
            const freqVal = (freqData[i * 2] || 0) / 255;
            const timeVal = (timeData[i * 4] || 128) / 128 - 1;
            const y = h / 2 + timeVal * (h * 0.4) + Math.sin(i * 0.4 + morph * Math.PI) * (freqVal * 12);
            ctx.lineTo(i * step, y);
          }
          ctx.stroke();
          ctx.shadowBlur = 0;
          break;
        }

        // 4. MONOTONE: 24dB Resonant Ladder Filter Curve + Sub Oscilloscope
        case 'monotone': {
          // Time domain sub wave
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
          ctx.lineWidth = 2;
          for (let i = 0; i < bufferLength; i += 4) {
            const v = timeData[i] / 128.0;
            const y = (v * h) / 2;
            const x = (i / bufferLength) * w;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();

          // Resonant Lowpass ladder filter envelope curve
          const cutoff = device.params.cutoff || 480;
          const res = device.params.resonance || 4;
          const cutoffX = Math.min(w - 10, Math.max(10, Math.log10(cutoff / 30) / Math.log10(8000 / 30) * w));

          ctx.beginPath();
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 2;
          ctx.moveTo(0, h * 0.3);
          ctx.lineTo(cutoffX - 12, h * 0.3);
          // Resonance peak
          ctx.quadraticCurveTo(cutoffX, h * 0.3 - res * 2.5, cutoffX + 16, h * 0.85);
          ctx.lineTo(w, h * 0.95);
          ctx.stroke();
          break;
        }

        // 5. REDRUM: 8-Channel Transient Hit Meters
        case 'redrum': {
          const channels = 8;
          const colW = (w - (channels - 1) * 3) / channels;
          const avgLevel = (freqData[2] || 0) / 255;

          for (let c = 0; c < channels; c++) {
            const x = c * (colW + 3);
            const voice = (device as any).voices?.[c];
            const isHit = voice?.pattern?.[(device as any).currentStep];
            const meterHeight = isHit ? Math.max(h * 0.7, avgLevel * h) : Math.random() * (avgLevel * 10);

            ctx.fillStyle = '#1c1f24';
            ctx.fillRect(x, 2, colW, h - 4);

            // LED segments
            const segments = 6;
            for (let s = 0; s < segments; s++) {
              const segY = h - (s + 1) * (h / segments);
              const isActive = (h - segY) <= meterHeight;
              ctx.fillStyle = isActive
                ? s > 4 ? '#ef4444' : s > 3 ? '#f59e0b' : '#22c55e'
                : '#121418';
              ctx.fillRect(x + 1, segY + 1, colW - 2, (h / segments) - 2);
            }
          }
          break;
        }

        // 6. MIMIC SAMPLER: Sample Playhead and Waveform
        case 'mimic': {
          ctx.beginPath();
          ctx.strokeStyle = '#06b6d4';
          ctx.lineWidth = 1.5;
          const sliceW = w / 64;
          for (let i = 0; i < 64; i++) {
            const v = (timeData[i * 4] || 128) / 128 - 1;
            const y = h / 2 + v * (h * 0.45);
            ctx.moveTo(i * sliceW, h / 2 - Math.abs(v) * (h * 0.4));
            ctx.lineTo(i * sliceW, h / 2 + Math.abs(v) * (h * 0.4));
          }
          ctx.stroke();
          break;
        }

        // 7. MATRIX SEQUENCER: 16-Step Pitch / Curve Radar
        case 'matrix': {
          const curStep = (device as any).currentStep || 0;
          const pattern = (device as any).currentPattern;
          const stepW = w / 16;

          for (let s = 0; s < 16; s++) {
            const isCur = s === curStep;
            const note = pattern?.notes?.[s] || 0;
            const gate = pattern?.gates?.[s];
            const noteNorm = (note + 12) / 24;
            const y = h - noteNorm * (h - 8) - 4;

            if (isCur) {
              ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
              ctx.fillRect(s * stepW, 0, stepW, h);
            }

            if (gate) {
              ctx.fillStyle = isCur ? '#ffffff' : '#38bdf8';
              ctx.fillRect(s * stepW + 1, y - 2, stepW - 2, 4);
            }
          }
          break;
        }

        // 8. PULSAR DUAL LFO: 2D Lissajous Phase Loop
        case 'pulsar': {
          const pDev = device as PulsarDevice;
          ctx.beginPath();
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 2;
          ctx.shadowBlur = 8;
          ctx.shadowColor = '#f59e0b';

          // Plot Lissajous curve
          const cx = w / 2;
          const cy = h / 2;
          const rX = w * 0.38;
          const rY = h * 0.38;

          for (let theta = 0; theta < Math.PI * 2; theta += 0.1) {
            const lx = cx + Math.sin(theta * (pDev.params.rate1 || 1)) * rX;
            const ly = cy + Math.sin(theta * (pDev.params.rate2 || 2) + Math.PI / 4) * rY;
            if (theta === 0) ctx.moveTo(lx, ly);
            else ctx.lineTo(lx, ly);
          }
          ctx.closePath();
          ctx.stroke();
          ctx.shadowBlur = 0;

          // Live spot
          const liveX = cx + pDev.lfo1Val * rX;
          const liveY = cy + pDev.lfo2Val * rY;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(liveX, liveY, 3.5, 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        // 9. SCREAM 4: Saturation Transfer Curve & Dynamic Operating Point
        case 'scream4': {
          const drive = device.params.drive || 5;
          const warmth = device.params.warmth || 0.7;

          // Non-linear transfer function curve
          ctx.beginPath();
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2;
          for (let px = 0; px < w; px += 2) {
            const xVal = (px / w) * 2 - 1;
            const yVal = Math.tanh(xVal * (drive * 0.4)) + warmth * 0.2 * (xVal * xVal - 0.5);
            const py = h / 2 - yVal * (h * 0.42);
            if (px === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.stroke();

          // Input audio dynamic bounce dot
          const audioPeak = (timeData[0] || 128) / 128 - 1;
          const dotX = (audioPeak + 1) * (w / 2);
          const dotY = h / 2 - Math.tanh(audioPeak * (drive * 0.4)) * (h * 0.42);
          ctx.fillStyle = '#ffffff';
          ctx.shadowBlur = 6;
          ctx.shadowColor = '#ffffff';
          ctx.beginPath();
          ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          break;
        }

        // 10. THE ECHO: Delay Buffer Reflections
        case 'echo': {
          const time = device.params.time || 0.35;
          const fb = device.params.feedback || 0.45;
          const taps = 6;
          const tapSpacing = (w * 0.75) / taps;

          ctx.strokeStyle = '#38bdf8';
          for (let t = 0; t < taps; t++) {
            const tapX = 15 + t * tapSpacing;
            const tapAmp = Math.pow(fb, t) * (h * 0.7);
            ctx.beginPath();
            ctx.moveTo(tapX, h);
            ctx.lineTo(tapX, h - tapAmp);
            ctx.stroke();

            // Reflection cap dot
            ctx.fillStyle = t === 0 ? '#ffffff' : '#38bdf8';
            ctx.beginPath();
            ctx.arc(tapX, h - tapAmp, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }

        // 11. RV7000: Exponential Decay Reverb Impulse Cloud
        case 'rv7000': {
          const decay = device.params.decay || 3.2;
          ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';

          for (let i = 0; i < 40; i++) {
            const rx = (i / 40) * w;
            const maxAmp = Math.exp((-i / 40) * (6 / decay)) * (h * 0.8);
            const amp = Math.random() * maxAmp;
            ctx.fillRect(rx, h / 2 - amp / 2, 2, amp);
          }
          break;
        }

        // 12. MCLASS MASTER SUITE: 4-Band EQ Bode Curve + Real-time FFT
        case 'mclass_master': {
          const mclass = device as MClassMasterSuite;

          // FFT fill
          ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
          ctx.beginPath();
          ctx.moveTo(0, h);
          for (let i = 0; i < bufferLength / 2; i += 2) {
            const binX = (i / (bufferLength / 2)) * w;
            const binY = h - (freqData[i] / 255) * h;
            ctx.lineTo(binX, binY);
          }
          ctx.lineTo(w, h);
          ctx.closePath();
          ctx.fill();

          // 4-Band EQ Composite Curve
          ctx.beginPath();
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 2;

          const lowGain = mclass.params.eqLowGain || 0;
          const lMidGain = mclass.params.eqLowMidGain || 0;
          const hMidGain = mclass.params.eqHighMidGain || 0;
          const highGain = mclass.params.eqHighGain || 0;

          for (let px = 0; px < w; px += 3) {
            const normX = px / w;
            let dbOffset = 0;
            // Low shelf (0 to 0.2)
            if (normX < 0.25) dbOffset += lowGain * (1 - normX / 0.25);
            // Low Mid Bell (around 0.35)
            const dLMid = Math.abs(normX - 0.35);
            dbOffset += lMidGain * Math.exp(-dLMid * dLMid * 80);
            // High Mid Bell (around 0.65)
            const dHMid = Math.abs(normX - 0.65);
            dbOffset += hMidGain * Math.exp(-dHMid * dHMid * 80);
            // High Shelf (> 0.75)
            if (normX > 0.75) dbOffset += highGain * ((normX - 0.75) / 0.25);

            const py = h / 2 - (dbOffset / 15) * (h * 0.4);
            if (px === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.stroke();
          break;
        }

        // 13. SPIDER AUDIO: Stereo Phase Scope / Lissajous Vector Field
        case 'spider_audio': {
          ctx.beginPath();
          ctx.strokeStyle = '#22d3ee';
          ctx.lineWidth = 1.5;
          ctx.shadowBlur = 4;
          ctx.shadowColor = '#06b6d4';

          const cx = w / 2;
          const cy = h / 2;
          const scale = Math.min(w, h) * 0.42;

          // Draw crosshair axes
          ctx.strokeStyle = 'rgba(34, 211, 238, 0.2)';
          ctx.beginPath();
          ctx.moveTo(cx - scale, cy);
          ctx.lineTo(cx + scale, cy);
          ctx.moveTo(cx, cy - scale);
          ctx.lineTo(cx, cy + scale);
          ctx.stroke();

          // Plot Lissajous stereo phase scatter
          ctx.beginPath();
          ctx.strokeStyle = '#38bdf8';
          for (let i = 0; i < bufferLength - 2; i += 4) {
            const chL = (timeData[i] - 128) / 128.0;
            const chR = (timeData[i + 1] - 128) / 128.0;
            // 45-degree rotation for M/S goniometer projection
            const px = cx + (chL - chR) * 0.707 * scale;
            const py = cy - (chL + chR) * 0.707 * scale;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.stroke();
          ctx.shadowBlur = 0;
          break;
        }

        // 14. SPIDER CV: Voltage Deflection Scope & Bipolar CV Meter
        case 'spider_cv': {
          const cvDev = device as any;
          const inVal = cvDev.splitInputVal || 0;
          const outVal = cvDev.mergedVal || 0;

          // Center zero line
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.3)';
          ctx.beginPath();
          ctx.moveTo(0, h / 2);
          ctx.lineTo(w, h / 2);
          ctx.stroke();

          // Voltage bar L (In)
          const barW = w * 0.4;
          const inH = inVal * (h * 0.42);
          ctx.fillStyle = inVal >= 0 ? '#f59e0b' : '#ef4444';
          ctx.fillRect(w * 0.1, h / 2, barW, -inH);

          // Voltage bar R (Out)
          const outH = outVal * (h * 0.42);
          ctx.fillStyle = outVal >= 0 ? '#10b981' : '#ec4899';
          ctx.fillRect(w * 0.52, h / 2, barW, -outH);

          // Text labels for In & Out voltages
          ctx.fillStyle = '#e2e8f0';
          ctx.font = '8px monospace';
          ctx.fillText(`IN: ${inVal.toFixed(2)}V`, 6, 10);
          ctx.fillText(`OUT: ${outVal.toFixed(2)}V`, w / 2 + 4, 10);
          break;
        }

        // 15. 3X OSC: Triple-Oscillator Vector Scope (Emerald & Amber Phosphor)
        case 'three_osc': {
          ctx.beginPath();
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 2;
          ctx.shadowBlur = 8;
          ctx.shadowColor = '#10b981';

          const sliceWidth = w / bufferLength;
          let x = 0;
          for (let i = 0; i < bufferLength; i++) {
            const v = timeData[i] / 128.0;
            const y = (v * h) / 2;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
            x += sliceWidth;
          }
          ctx.stroke();
          ctx.shadowBlur = 0;

          // Osc 3 Sub marker
          ctx.fillStyle = '#34d399';
          ctx.font = '7px monospace';
          ctx.fillText('3x OSC // FAT ANALOG', 4, 10);
          break;
        }

        // 16. SYTRUS: FM Algorithmic Harmonic Spectral Display
        case 'sytrus': {
          const numBars = 16;
          const barWidth = (w - (numBars - 1) * 2) / numBars;
          for (let i = 0; i < numBars; i++) {
            const bin = Math.floor(Math.pow(i / numBars, 1.5) * (bufferLength / 2));
            const val = freqData[bin] || 0;
            const barH = (val / 255) * (h - 6);
            const x = i * (barWidth + 2);
            const y = h - barH;

            const grad = ctx.createLinearGradient(x, h, x, y);
            grad.addColorStop(0, '#064e3b');
            grad.addColorStop(0.7, '#10b981');
            grad.addColorStop(1, '#6ee7b7');

            ctx.fillStyle = grad;
            ctx.fillRect(x, y, barWidth, barH);
          }
          ctx.fillStyle = '#10b981';
          ctx.font = '7px monospace';
          ctx.fillText('FM OPERATORS 1-2', 4, 10);
          break;
        }

        // 17. FLEX: Multi-Engine Rompler Macro Envelope
        case 'flex': {
          ctx.beginPath();
          ctx.strokeStyle = '#34d399';
          ctx.lineWidth = 2;
          ctx.shadowBlur = 6;
          ctx.shadowColor = '#34d399';
          const sliceWidth = w / bufferLength;
          let x = 0;
          for (let i = 0; i < bufferLength; i++) {
            const v = timeData[i] / 128.0;
            const y = (v * h) / 2;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
            x += sliceWidth;
          }
          ctx.stroke();
          ctx.shadowBlur = 0;

          ctx.fillStyle = '#f59e0b';
          ctx.font = '7px monospace';
          ctx.fillText(device.params.preset?.toUpperCase() || 'FLEX ROMPLER', 4, 10);
          break;
        }

        // 18. AUTOMATION CLIP: LFO & Parameter Modulation Wave
        case 'automation_clip': {
          ctx.beginPath();
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 2;
          ctx.shadowBlur = 6;
          ctx.shadowColor = '#f59e0b';
          const sliceWidth = w / bufferLength;
          let x = 0;
          for (let i = 0; i < bufferLength; i++) {
            const v = timeData[i] / 128.0;
            const y = (v * h) / 2;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
            x += sliceWidth;
          }
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#f59e0b';
          ctx.font = '7px monospace';
          ctx.fillText('LFO AUTO // MOD', 4, 10);
          break;
        }

        default: {
          // Standard audio oscilloscope fallback with emerald glow
          ctx.beginPath();
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 1.8;
          ctx.shadowBlur = 6;
          ctx.shadowColor = '#10b981';
          const sliceWidth = w / bufferLength;
          let x = 0;
          for (let i = 0; i < bufferLength; i++) {
            const v = timeData[i] / 128.0;
            const y = (v * h) / 2;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
            x += sliceWidth;
          }
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }

      // Outer bezel vignette
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, w, h);

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [device]);

  return (
    <div
      className="relative rounded overflow-hidden border border-neutral-700/80 shadow-inner flex flex-col items-center bg-black select-none"
      style={{ width, height }}
      title={`${device.name} Real-time DSP Analytics`}
    >
      <canvas ref={canvasRef} width={width} height={height} className="block w-full h-full" />
      <span className="absolute bottom-0.5 right-1.5 text-[7px] font-mono font-bold text-neutral-500 uppercase tracking-widest pointer-events-none">
        DSP LIVE
      </span>
    </div>
  );
};
