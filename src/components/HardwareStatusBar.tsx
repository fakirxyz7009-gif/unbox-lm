/**
 * System status strip: the real audio facts a player needs, and nothing else.
 *
 * Sample rate, buffer and output latency come from the live AudioContext; the MIDI line comes
 * from the engine's MidiInput. There is no DSP-load or frame-rate readout here: the browser does
 * not expose a trustworthy one, and a made-up number is worse than no number.
 */
import React, { useEffect, useState } from 'react';
import { Activity, Radio, Cpu } from 'lucide-react';
import { audioEngine } from '../audio/AudioEngine.ts';
import { localHardwareAi } from '../ai/hardware/localHardwareAiEngine.ts';

function ms(v: number): string {
  return v >= 10 ? `${v.toFixed(0)} ms` : `${v.toFixed(1)} ms`;
}

export const HardwareStatusBar: React.FC = () => {
  const [, force] = useState(0);
  const [ctxState, setCtxState] = useState(audioEngine.ctx.state);
  const [hwState, setHwState] = useState(() => localHardwareAi.state);
  const midi = audioEngine.midi;

  useEffect(() => {
    const unsubHw = localHardwareAi.subscribe(() => {
      setHwState({ ...localHardwareAi.state });
    });
    return unsubHw;
  }, []);

  useEffect(() => {
    const ctx = audioEngine.ctx;
    const onState = () => setCtxState(ctx.state);
    ctx.addEventListener('statechange', onState);
    const unsub = midi.subscribe(() => force((n) => n + 1));
    return () => {
      ctx.removeEventListener('statechange', onState);
      unsub();
    };
  }, [midi]);

  const ctx = audioEngine.ctx;
  const bufferMs = (ctx.baseLatency || 0) * 1000;
  const outputMs = ((ctx as AudioContext & { outputLatency?: number }).outputLatency || 0) * 1000;
  const names = [...new Set(midi.ports.map((p) => p.name.replace(/^MIDIIN\d+ \((.*)\)$/, '$1')))];
  const midiLabel =
    midi.status === 'blocked'
      ? 'blocked (click Settings)'
      : midi.status === 'unsupported'
        ? 'no Web MIDI'
        : names.length
          ? names.join(' + ')
          : 'no input';
  const midiBusy = midi.ports.some((p) => p.error);

  return (
    <div className="w-full h-[22px] shrink-0 bg-[#141210] border-b border-black/60 px-3 flex items-center gap-4 text-[11px] font-label tracking-wide text-[#8f9296] select-none z-30" data-testid="status-bar">
      <div className="flex items-center gap-1.5">
        <Activity className="w-3 h-3 text-[#6f7a63]" />
        <span className="uppercase">Audio</span>
        <span className="font-mono text-[#c2c6ca]">{ctx.sampleRate / 1000} kHz</span>
        <span className="text-[#8a9096]">·</span>
        <span className="font-mono text-[#c2c6ca]">buffer {ms(bufferMs)}</span>
        <span className="text-[#8a9096]">·</span>
        <span className="font-mono text-[#c2c6ca]">output {outputMs ? ms(outputMs) : 'unknown'}</span>
        {outputMs > 30 && (
          <span className="text-[#a3936c]" title="Web Audio adds the browser's output latency. For live monitoring, use your interface's direct-monitor path.">
            (monitor direct)
          </span>
        )}
      </div>

      <span className="text-[#8a9096]">|</span>

      <button
        type="button"
        onClick={() => void audioEngine.resumeContext()}
        className="flex items-center gap-1.5 hover:text-[#d7dadd]"
        title={ctxState === 'running' ? 'The audio engine is running' : 'Click to start the audio engine'}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${ctxState === 'running' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
        <span className="uppercase">{ctxState === 'running' ? 'Engine running' : 'Engine suspended — click to start'}</span>
      </button>

      <span className="text-[#8a9096]">|</span>

      <button
        type="button"
        onClick={() => {
          window.dispatchEvent(new CustomEvent('unbox:open-ai'));
        }}
        className="flex items-center gap-1.5 hover:text-[#d7dadd] cursor-pointer"
        title={`On-device AI: ${hwState.backend.toUpperCase()} (${hwState.gpu.vendor}) · runs on this computer · no cloud request on this path`}
        data-testid="status-local-ai"
      >
        <Cpu className="w-3 h-3 text-cyan-400" />
        <span className="uppercase text-cyan-300">Local AI</span>
        <span className="font-mono text-[#c2c6ca]">
          {hwState.backend === 'webgpu'
            ? `GPU (${hwState.gpu.vendor.slice(0, 16)})`
            : hwState.backend === 'ollama'
            ? `Ollama (${hwState.selectedModel})`
            : 'Neural CPU'}
        </span>
        <span className="text-emerald-400 font-mono text-[9px] px-1 bg-emerald-950/60 border border-emerald-500/30 rounded">
          ON-DEVICE
        </span>
      </button>

      <div className="flex-1" />

      <span className={midiBusy ? 'text-amber-400' : ''} title={midiBusy ? 'A MIDI port is in use by another program' : undefined}>
        <Radio className="w-3 h-3 inline mr-1 text-[#6f7a63]" />
        <span className="uppercase">MIDI</span>{' '}
        <span className="font-mono text-[#c2c6ca]">{midiLabel}</span>
      </span>
    </div>
  );
};
