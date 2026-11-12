/**
 * Console inspector: the selected channel's EQ (editable curve + knobs) and dynamics (compressor,
 * gate, live gain-reduction meter). Values live in the channel settings, so they are saved with
 * the project and rendered into exports by the same strip graph.
 */
import React, { useReducer, useRef } from 'react';
import { X } from 'lucide-react';
import { audioEngine } from '../../audio/AudioEngine.ts';
import { DYN_RANGE, EQ_RANGE, dynOf, eqOf } from '../../audio/mixer/channelStrip.ts';
import type { ChannelDyn, ChannelEq } from '../../audio/types.ts';
import { useEngineVersion, useMeterFrame } from '../../nexa/useEngine.ts';
import { RingKnob } from '../../ui/skin/RingKnob.tsx';
import { LedButton } from '../../ui/skin/panel.tsx';
import { EqCurve } from './EqCurve.tsx';
import { NumField } from '../../studio/ui/controls.tsx';
import { setText, setWidth } from '../../ui/skin/dom.ts';

const fmtHz =(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 1 : 2)} kHz` : `${Math.round(v)} Hz`);
const fmtDb = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;
const fmtMs = (v: number) => (v < 1 ? `${(v * 1000).toFixed(v < 0.01 ? 1 : 0)} ms` : `${v.toFixed(2)} s`);
const save = () => audioEngine.changed();

function GrMeter({ channelId }: { channelId: string }) {
  const bar = useRef<HTMLDivElement>(null);
  const txt = useRef<HTMLSpanElement>(null);
  useMeterFrame(() => {
    const gr = audioEngine.mixer.gainReduction(channelId);
    setWidth(bar.current, (-gr / 24) * 100);
    setText(txt.current, gr < -0.05 ? `${gr.toFixed(1)} dB` : '0.0 dB');
  });
  return (
    <div className="flex items-center gap-2" title="Gain reduction of the compressor / gate">
      <span className="font-label font-bold text-[11px] text-chrome-ink w-6">GR</span>
      <div className="flex-1 h-2.5 rounded-sm bg-black/80 border border-black overflow-hidden flex justify-end">
        <div ref={bar} className="h-full bg-gradient-to-l from-amber-300 to-orange-600" style={{ width: 0 }} />
      </div>
      <span ref={txt} className="font-mono text-[11px] text-amber-200 w-12 text-right">
        0.0 dB
      </span>
    </div>
  );
}

const Section: React.FC<{ title: string; toggle?: { on: boolean; onToggle: () => void; title: string }; children: React.ReactNode }> = ({ title, toggle, children }) => (
  <section className="rounded-md bg-black/25 border border-black/60 p-2 flex flex-col gap-2">
    <header className="flex items-center gap-2 min-h-[20px]">
      <span className="font-label font-bold text-[13px] tracking-[0.18em] text-[#d5dae0]">{title}</span>
      <span className="flex-1" />
      {toggle && (
        <LedButton on={toggle.on} onClick={toggle.onToggle} title={toggle.title} className="w-[40px] h-[20px]" color="#7ff0ff">
          {toggle.on ? 'ON' : 'OFF'}
        </LedButton>
      )}
    </header>
    {children}
  </section>
);

export function ChannelInspector({ channelId, onClose }: { channelId: string | null; onClose: () => void }) {
  useEngineVersion();
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const m = audioEngine.mixer;
  const ch = channelId ? m.channel(channelId) : undefined;

  if (!ch) {
    return (
      <aside className="w-[300px] shrink-0 us-chrome border-r border-black p-3 flex flex-col gap-2" data-testid="channel-inspector">
        <div className="font-label font-bold text-[13px] tracking-[0.18em] text-[#d5dae0]">CHANNEL</div>
        <p className="font-label text-[13px] text-chrome-ink leading-snug">Click a channel's name, EQ or DYN area to edit its EQ and dynamics here.</p>
      </aside>
    );
  }

  const eq = eqOf(ch.settings.eq);
  const dyn = dynOf(ch.settings.dyn);
  const setEq = (patch: Partial<ChannelEq>) => {
    m.setEq(ch.id, patch);
    bump();
  };
  const setDyn = (patch: Partial<ChannelDyn>) => {
    m.setDyn(ch.id, patch);
    bump();
  };
  const knob = (label: string, value: number, range: readonly [number, number], onChange: (v: number) => void, o: { log?: boolean; fmt: (v: number) => string; def: number; bipolar?: boolean; color?: string; disabled?: boolean }) => (
    <RingKnob
      label={label}
      value={value}
      min={range[0]}
      max={range[1]}
      curve={o.log ? 'log' : 'lin'}
      size={30}
      tone="dark"
      bipolar={o.bipolar}
      color={o.color}
      defaultValue={o.def}
      format={o.fmt}
      disabled={o.disabled}
      onChange={onChange}
      onCommit={save}
    />
  );

  return (
    <aside className="w-[300px] shrink-0 us-chrome border-r border-black flex flex-col min-h-0" data-testid="channel-inspector" aria-label={`${ch.settings.name} EQ and dynamics`}>
      <div className="h-1.5 shrink-0" style={{ background: ch.settings.color }} />
      <header className="flex items-center gap-2 px-3 pt-2 pb-1">
        <span className="font-label font-bold text-[18px] text-white truncate">{ch.settings.name}</span>
        <span className="font-mono text-[11px] text-chrome-ink">{ch.kind.toUpperCase()}</span>
        <span className="flex-1" />
        <button type="button" onClick={onClose} className="text-chrome-ink hover:text-white" title="Hide the channel inspector" aria-label="Hide the channel inspector">
          <X className="w-4 h-4" />
        </button>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 flex flex-col gap-2">
        <Section title="EQ" toggle={{ on: eq.on, onToggle: () => (setEq({ on: !eq.on }), save()), title: eq.on ? 'EQ in (click to bypass)' : 'EQ bypassed (click to switch in)' }}>
          <EqCurve eq={eq} width={268} height={118} color={ch.settings.color || '#20d3ee'} onChange={setEq} onCommit={save} />
          <div className="grid grid-cols-6 gap-y-1 justify-items-center">
            <LedButton on={eq.hpOn} onClick={() => (setEq({ hpOn: !eq.hpOn }), save())} title="High-pass filter on / off" className="w-[38px] h-[18px] self-center text-[11px]" color="#cbd5e1">
              HP
            </LedButton>
            {knob('Freq', eq.hpHz, EQ_RANGE.hpHz, (v) => setEq({ hpHz: v }), { log: true, fmt: fmtHz, def: 80, disabled: !eq.hpOn })}
            {knob('Lo', eq.lowDb, EQ_RANGE.db, (v) => setEq({ lowDb: v }), { fmt: fmtDb, def: 0, bipolar: true, color: '#f59e0b' })}
            {knob('Hz', eq.lowHz, EQ_RANGE.lowHz, (v) => setEq({ lowHz: v }), { log: true, fmt: fmtHz, def: 100, color: '#f59e0b' })}
            {knob('Hi', eq.highDb, EQ_RANGE.db, (v) => setEq({ highDb: v }), { fmt: fmtDb, def: 0, bipolar: true, color: '#a78bfa' })}
            {knob('Hz', eq.highHz, EQ_RANGE.highHz, (v) => setEq({ highHz: v }), { log: true, fmt: fmtHz, def: 8000, color: '#a78bfa' })}

            {knob('LM', eq.lmDb, EQ_RANGE.db, (v) => setEq({ lmDb: v }), { fmt: fmtDb, def: 0, bipolar: true, color: '#22c55e' })}
            {knob('Hz', eq.lmHz, EQ_RANGE.lmHz, (v) => setEq({ lmHz: v }), { log: true, fmt: fmtHz, def: 500, color: '#22c55e' })}
            {knob('Q', eq.lmQ, EQ_RANGE.q, (v) => setEq({ lmQ: v }), { log: true, fmt: (v) => v.toFixed(2), def: 1, color: '#22c55e' })}
            {knob('HM', eq.hmDb, EQ_RANGE.db, (v) => setEq({ hmDb: v }), { fmt: fmtDb, def: 0, bipolar: true, color: '#38bdf8' })}
            {knob('Hz', eq.hmHz, EQ_RANGE.hmHz, (v) => setEq({ hmHz: v }), { log: true, fmt: fmtHz, def: 2500, color: '#38bdf8' })}
            {knob('Q', eq.hmQ, EQ_RANGE.q, (v) => setEq({ hmQ: v }), { log: true, fmt: (v) => v.toFixed(2), def: 1, color: '#38bdf8' })}

            <LedButton on={eq.lpOn} onClick={() => (setEq({ lpOn: !eq.lpOn }), save())} title="Low-pass filter on / off" className="w-[38px] h-[18px] self-center text-[11px]" color="#cbd5e1">
              LP
            </LedButton>
            {knob('Freq', eq.lpHz, EQ_RANGE.lpHz, (v) => setEq({ lpHz: v }), { log: true, fmt: fmtHz, def: 16000, disabled: !eq.lpOn })}
          </div>
        </Section>

        <Section title="DYNAMICS">
          <GrMeter channelId={ch.id} />
          <div className="flex items-center gap-2">
            <LedButton on={dyn.compOn} onClick={() => (setDyn({ compOn: !dyn.compOn }), save())} title="Compressor on / off" className="w-[52px] h-[18px] text-[11px]" color="#ffb347">
              COMP
            </LedButton>
            <span className="font-mono text-[11px] text-chrome-ink">feed-forward, soft knee</span>
          </div>
          <div className="grid grid-cols-5 justify-items-center">
            {knob('Thresh', dyn.threshold, DYN_RANGE.threshold, (v) => setDyn({ threshold: v }), { fmt: fmtDb, def: -18, color: '#ffb347', disabled: !dyn.compOn })}
            {knob('Ratio', dyn.ratio, DYN_RANGE.ratio, (v) => setDyn({ ratio: v }), { log: true, fmt: (v) => `${v.toFixed(1)}:1`, def: 3, color: '#ffb347', disabled: !dyn.compOn })}
            {knob('Attack', dyn.attack, DYN_RANGE.attack, (v) => setDyn({ attack: v }), { log: true, fmt: fmtMs, def: 0.01, color: '#ffb347', disabled: !dyn.compOn })}
            {knob('Release', dyn.release, DYN_RANGE.release, (v) => setDyn({ release: v }), { log: true, fmt: fmtMs, def: 0.15, color: '#ffb347', disabled: !dyn.compOn })}
            {knob('Makeup', dyn.makeup, DYN_RANGE.makeup, (v) => setDyn({ makeup: v }), { fmt: fmtDb, def: 0, color: '#ffb347', disabled: !dyn.compOn })}
          </div>
          <div className="flex items-center gap-2">
            <LedButton on={dyn.gateOn} onClick={() => (setDyn({ gateOn: !dyn.gateOn }), save())} title="Gate on / off" className="w-[52px] h-[18px] text-[11px]" color="#7dd3fc">
              GATE
            </LedButton>
            <span className="font-mono text-[11px] text-chrome-ink">closes below the threshold</span>
          </div>
          <div className="grid grid-cols-5 justify-items-center">
            {knob('Thresh', dyn.gateThreshold, DYN_RANGE.gateThreshold, (v) => setDyn({ gateThreshold: v }), { fmt: fmtDb, def: -50, color: '#7dd3fc', disabled: !dyn.gateOn })}
            {knob('Range', dyn.gateRange, DYN_RANGE.gateRange, (v) => setDyn({ gateRange: v }), { fmt: fmtDb, def: -40, color: '#7dd3fc', disabled: !dyn.gateOn })}
            {knob('Release', dyn.gateRelease, DYN_RANGE.gateRelease, (v) => setDyn({ gateRelease: v }), { log: true, fmt: fmtMs, def: 0.2, color: '#7dd3fc', disabled: !dyn.gateOn })}
          </div>
        </Section>

        <Section title="TIMING">
          {(() => {
            const track = audioEngine.tracks.find((t) => t.deviceId === ch.id);
            if (!track) return <p className="font-mono text-[11px] text-chrome-ink">Only track channels carry a timing offset.</p>;
            return (
              <div className="flex items-center gap-2">
                <NumField
                  title="Track offset in milliseconds: + plays later, − plays earlier"
                  value={track.offsetMs ?? 0}
                  min={-500}
                  max={500}
                  step={1}
                  width={72}
                  suffix="ms"
                  onChange={(v) => {
                    audioEngine.setTrackOffset(track.id, v);
                    bump();
                  }}
                />
                <span className="font-mono text-[11px] leading-snug text-chrome-ink">
                  + later · − earlier
                  <br />
                  delay-compensation slot (also in exports)
                </span>
              </div>
            );
          })()}
        </Section>
      </div>
    </aside>
  );
}
