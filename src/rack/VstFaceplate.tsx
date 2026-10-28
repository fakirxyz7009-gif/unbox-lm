import React, { useRef, useState } from 'react';
import { Music2, Play, Square } from 'lucide-react';
import { Knob } from '../components/Knob.tsx';
import { useFrame } from '../nexa/useEngine.ts';
import { setWidth } from '../ui/skin/dom.ts';
import { describeMacro } from '../vst/proxyDsp.ts';
import type { VstPluginDevice } from '../vst/VstPluginDevice.ts';
import { CATEGORY_LABELS } from '../../shared/vst/categories.ts';

interface VstFaceplateProps {
  device: VstPluginDevice;
  onUpdate: () => void;
  onMessage: (message: string, type: 'success' | 'error' | 'info') => void;
}

function OutputMeter({ device }: { device: VstPluginDevice }) {
  const bar = useRef<HTMLDivElement>(null);
  const buf = useRef(new Float32Array(device.analyser.fftSize));
  const level = useRef(0);
  useFrame(() => {
    if (!bar.current) return;
    device.analyser.getFloatTimeDomainData(buf.current);
    let peak = 0;
    for (let i = 0; i < buf.current.length; i++) peak = Math.max(peak, Math.abs(buf.current[i]));
    level.current = Math.max(peak, level.current * 0.9);
    setWidth(bar.current, level.current * 100);
  });
  return (
    <div className="h-1.5 w-full rounded-full bg-black/60 overflow-hidden" aria-hidden="true">
      <div ref={bar} className="h-full bg-gradient-to-r from-emerald-500 via-yellow-400 to-red-500" style={{ width: '0%' }} />
    </div>
  );
}

export const VstFaceplate: React.FC<VstFaceplateProps> = ({ device, onUpdate, onMessage }) => {
  const s = device.snapshot;
  const [previewing, setPreviewing] = useState(device.isPreviewing);
  const groups = new Map<string, typeof s.presets>();
  s.presets.forEach((p) => groups.set(p.group ?? 'Presets', [...(groups.get(p.group ?? 'Presets') ?? []), p]));

  const proxyNote =
    `Native ${s.format} code can't run inside the browser audio engine, so this unit plays a Web Audio stand-in ` +
    `(${device.proxyLabel}) matched to its category. The cables, CV and automation are real; the sound is an approximation.` +
    (s.hostIssue ? ` ${s.hostIssue}.` : '');

  const togglePreview = async () => {
    try {
      const playing = await device.togglePreview();
      setPreviewing(playing);
      if (playing) {
        const timer = window.setInterval(() => {
          if (!device.isPreviewing) {
            setPreviewing(false);
            window.clearInterval(timer);
          }
        }, 250);
      }
    } catch (e) {
      onMessage(`Preview failed: ${(e as Error).message}`, 'error');
      setPreviewing(false);
    }
  };

  return (
    <div className="flex flex-wrap items-stretch gap-3" onClick={(e) => e.stopPropagation()}>
      <div className="w-[200px] shrink-0 flex flex-col gap-1.5">
        <div>
          <div className="text-base font-black leading-tight truncate" title={s.name}>{s.name}</div>
          <div className="text-[11px] opacity-70 truncate">{s.vendor ?? 'Unknown vendor'}{s.engine ? ` · ${s.engine}` : ''}</div>
        </div>
        <div className="flex flex-wrap gap-1">
          <span className="vst-badge">{s.format}{s.arch && s.arch !== 'unknown' ? ` ${s.arch}` : ''}</span>
          <span className="vst-badge">{CATEGORY_LABELS[s.category]}</span>
          <span className="vst-badge">{device.role}</span>
        </div>
        <div className="proxy-badge" title={proxyNote}>PROXY DSP · {device.proxyLabel}</div>
        <OutputMeter device={device} />
      </div>

      <div className="flex-1 min-w-[260px] flex flex-wrap items-center gap-x-3 gap-y-2">
        {device.macroSpecs.map((m, i) => (
          <Knob
            key={m.id}
            label={m.label}
            value={Number(device.params[m.id])}
            min={0}
            max={1}
            step={0.005}
            size="sm"
            variant="dark"
            defaultValue={m.default}
            formatValue={(v) => describeMacro(s.category, i, v)}
            onChange={(v) => {
              device.setParam(m.id, v);
              onUpdate();
            }}
          />
        ))}
        {device.role === 'effect' && (
          <Knob
            label="Mix"
            value={Number(device.params.mix)}
            min={0}
            max={1}
            step={0.005}
            size="sm"
            variant="amber"
            formatValue={(v) => `${Math.round(v * 100)}% wet`}
            onChange={(v) => {
              device.setParam('mix', v);
              onUpdate();
            }}
          />
        )}
        <label className="vst-fader" title="Output level (double-click to reset)">
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.005}
            value={Number(device.params.output)}
            aria-label={`${s.name} output level`}
            onChange={(e) => {
              device.setParam('output', Number(e.target.value));
              onUpdate();
            }}
            onDoubleClick={() => {
              device.setParam('output', 0.9);
              onUpdate();
            }}
          />
          <span>{Number(device.params.output) <= 0.0001 ? '-∞' : (20 * Math.log10(Number(device.params.output))).toFixed(1)} dB</span>
          <span className="opacity-60">OUT</span>
        </label>
      </div>

      {(s.presets.length > 0 || device.previewId || device.role === 'instrument') && (
        <div className="w-[190px] shrink-0 flex flex-col gap-1.5 justify-center">
          {s.presets.length > 0 && (
            <label className="flex flex-col gap-0.5 text-[11px] font-mono uppercase tracking-wider opacity-80">
              Preset ({s.presets.length})
              <select
                value={String(device.params.presetId ?? '')}
                onChange={(e) => {
                  device.setParam('presetId', e.target.value);
                  onUpdate();
                }}
                className="bg-black/60 border border-white/15 rounded px-1.5 py-1 text-[11px] normal-case tracking-normal text-slate-100"
              >
                <option value="">Default</option>
                {Array.from(groups.entries()).map(([group, items]) => (
                  <optgroup key={group} label={group}>
                    {items.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.previewId ? ' ♪' : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          )}
          {device.previewId && (
            <button
              type="button"
              onClick={() => void togglePreview()}
              className="flex items-center justify-center gap-1.5 rounded px-2 py-1 text-[11px] font-bold bg-emerald-600/80 hover:bg-emerald-500 text-black"
              title="Plays the library's recorded preview through this unit's output and its cables"
            >
              {previewing ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              {previewing ? 'Stop preview' : `Audition ${device.currentPreset ? device.currentPreset.name : 'preview'}`}
            </button>
          )}
          {device.role === 'instrument' && (
            <button
              type="button"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                device.noteOn(60, 0.85);
              }}
              onPointerUp={() => device.noteOff(60)}
              onPointerCancel={() => device.noteOff(60)}
              className="flex items-center justify-center gap-1.5 rounded px-2 py-1 text-[11px] font-bold bg-black/40 hover:bg-black/60 border border-white/15"
              title="Hold to play middle C on the proxy voice"
            >
              <Music2 className="w-3 h-3" /> Hold for test note (C4)
            </button>
          )}
        </div>
      )}
    </div>
  );
};
