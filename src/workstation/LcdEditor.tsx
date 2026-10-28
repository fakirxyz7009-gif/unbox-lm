/**
 * Workstation LCD: the selected part's name and info on the left; on the right the page chosen
 * by the tabs (Easy, then one page per parameter section) or by the side buttons (MIX, FX, MIDI,
 * COMBI). Every control drives the real device / mixer channel; the last touched value is shown.
 */
import React, { useEffect, useReducer, useRef, useState } from 'react';
import { audioEngine } from '../audio/AudioEngine.ts';
import type { BaseDevice } from '../audio/BaseDevice.ts';
import type { SequencerTrack } from '../audio/types.ts';
import { deviceParams, type DeviceParam } from '../audio/deviceParams.ts';
import { isLinked, setLinked } from '../audio/liveLink.ts';
import { syncTrackPatterns } from '../audio/sequencer/model.ts';
import { EFFECT_CATALOG } from '../audio/effectCatalog.ts';
import { useFrame } from '../nexa/useEngine.ts';
import { RingKnob } from '../ui/skin/RingKnob.tsx';
import { automateMenuAt } from '../components/AutomateMenu.tsx';
import type { ChannelParam } from '../audio/automation/model.ts';
import { Lcd } from '../ui/skin/panel.tsx';
import { gainToDb } from '../studio/ui/levels.ts';
import { capturePointer } from '../ui/skin/pointer.ts';
import { setText } from '../ui/skin/dom.ts';
import { formatParam as fmt } from './paramFormat.ts';
import { midiControlChanges } from './midiControls.ts';
import { useClipFocus } from '../shell/clipFocus.ts';
import { LcdAudioClipBox } from './LcdAudioClipBox.tsx';
import { deviceSample, type PadSample } from '../audio/deviceSamples.ts';
import { editCapturedPadSample } from '../audio/deviceSampleEdits.ts';
import { drumLanesFor } from '../audio/drumLanes.ts';

export type LcdPage = 'easy' | 'clip' | 'mix' | 'fx' | 'midi' | 'combi' | `sec:${string}`;

interface Props {
  dev: BaseDevice | null;
  track: SequencerTrack | null;
  parts: SequencerTrack[];
  page: LcdPage;
  onPage: (p: LcdPage) => void;
}

const pick = (params: DeviceParam[], ...res: RegExp[]) => {
  for (const re of res) {
    const hit = params.find((p) => !p.options && re.test(p.key));
    if (hit) return hit;
  }
  return null;
};

/** Pages: Easy first, then the device's own sections (or chunks of 8 for older devices). */
function sectionsOf(params: DeviceParam[]): { id: string; label: string; params: DeviceParam[] }[] {
  const useful = params.filter((p) => !/^p\d+/.test(p.key));
  if (useful.some((p) => p.section)) {
    const map = new Map<string, DeviceParam[]>();
    for (const p of useful) {
      const s = p.section ?? 'Main';
      if (!map.has(s)) map.set(s, []);
      map.get(s)!.push(p);
    }
    return [...map].map(([label, ps]) => ({ id: label, label, params: ps }));
  }
  const out: { id: string; label: string; params: DeviceParam[] }[] = [];
  for (let i = 0; i < useful.length; i += 8) out.push({ id: `Page ${i / 8 + 1}`, label: `Page ${i / 8 + 1}`, params: useful.slice(i, i + 8) });
  return out;
}

export const LcdEditor: React.FC<Props> = ({ dev, track, parts, page, onPage }) => {
  const [, force] = useReducer((n: number) => n + 1, 0);
  const [touched, setTouched] = useState<{ label: string; value: string } | null>(null);
  const [rightBoxMode, setRightBoxMode] = useState<'clip' | 'adsr'>('clip');
  const voicesRef = useRef<HTMLSpanElement>(null);
  const midiSeen = useRef(midiControlChanges.version);

  useEffect(() => audioEngine.midi.subscribe(force), [force]);

  const focus = useClipFocus();
  const focusedTrack = focus ? audioEngine.tracks.find((t) => t.id === focus.trackId) : null;
  const focusedClip = focusedTrack?.arrangementClips?.find((c) => c.id === focus?.clipId);
  const isAudioClipFocused = focusedClip?.kind === 'audio' || !!focusedClip?.audioId;

  // Whenever an audio clip is selected in the grey MIDI interface, automatically activate 'clip' mode!
  useEffect(() => {
    if (isAudioClipFocused) {
      setRightBoxMode('clip');
    }
  }, [isAudioClipFocused, focus?.clipId]);

  useFrame(() => {
    const m = (dev as { meter?: () => Record<string, number> } | null)?.meter?.();
    setText(voicesRef.current, String(Math.round(m?.voices ?? 0)).padStart(2, '0'));
    // a hardware knob moved: show it like a touched control (at most one render per frame)
    if (midiControlChanges.version !== midiSeen.current) {
      midiSeen.current = midiControlChanges.version;
      setTouched(midiControlChanges.touched);
      force();
    }
  });

  if (!dev || !track) {
    return (
      <Lcd className="h-full" innerClassName="grid place-items-center font-lcd text-[22px]">
        NO PART SELECTED
      </Lcd>
    );
  }
  const params = deviceParams(dev);
  const sections = sectionsOf(params);
  const chan = audioEngine.mixer.settingsOf(dev.id);
  const setParam = (p: DeviceParam, v: number) => {
    dev.setParam(p.key, v);
    setTouched({ label: p.label, value: fmt(p, v) });
    force();
  };
  const knob = (p: DeviceParam | null, label: string, size = 40) =>
    p ? (
      <RingKnob
        key={p.key + label}
        value={p.value}
        min={p.min}
        max={p.max}
        curve={p.curve}
        step={p.step}
        defaultValue={p.defaultValue}
        bipolar={p.min < 0 && p.max > 0}
        label={label}
        size={size}
        tone="lcd"
        format={(v) => fmt(p, v)}
        onChange={(v) => setParam(p, v)}
        onContextMenu={(e) => automateMenuAt(e, `${dev.name} · ${p.label}`, { kind: 'device', deviceId: dev.id, param: p.key })}
      />
    ) : (
      <RingKnob key={label} value={0} min={0} max={1} label={label} size={size} tone="lcd" disabled title={`${label}: not on this instrument`} onChange={() => undefined} />
    );
  /** A channel control of this part (level, pan, width, trim, sends); `auto` = the lane it can create. */
  const chanKnob = (label: string, value: number, min: number, max: number, def: number, set: (v: number) => void, show: (v: number) => string, bipolar = false, auto?: ChannelParam) => (
    <RingKnob
      key={label}
      value={value}
      min={min}
      max={max}
      defaultValue={def}
      bipolar={bipolar}
      label={label}
      size={40}
      tone="lcd"
      format={show}
      onContextMenu={auto ? (e) => automateMenuAt(e, `${dev.name} · ${label}`, { kind: 'channel', channelId: dev.id, param: auto }) : undefined}
      onChange={(v) => {
        set(v);
        setTouched({ label, value: show(v) });
        force();
      }}
    />
  );
  const levelKnob = chanKnob('Level', chan?.volume ?? 0.85, 0, 1.5, 0.85, (v) => audioEngine.mixer.setVolume(dev.id, v), (v) => `${gainToDb(v).toFixed(1)}dB`, false, 'volume');
  const panKnob = chanKnob('Pan', chan?.pan ?? 0, -1, 1, 0, (v) => audioEngine.mixer.setPan(dev.id, v), (v) => (Math.abs(v) < 0.01 ? 'C' : `${v < 0 ? 'L' : 'R'}${Math.round(Math.abs(v) * 100)}`), true, 'pan');

  const pattern = syncTrackPatterns(track, audioEngine.activePatternIndex);
  const inserts = audioEngine.mixer.insertsOf(dev.id);
  const out = chan?.output && chan.output !== 'master' ? audioEngine.devices.get(chan.output)?.name ?? 'Bus' : 'Master';
  const partNo = Math.max(1, (parts.findIndex((p) => p.id === track.id) + 1) || (audioEngine.tracks.findIndex((p) => p.id === track.id) + 1) || 1);

  // ---------------------------------------------------------------- right-hand page
  let body: React.ReactNode;
  if (page === 'easy') {
    const adsr = (['attack', 'decay', 'sustain', 'release'] as const).map((k) => pick(params, new RegExp(`^${k}$`), new RegExp(`^amp${k}$`, 'i')));
    body = (
      <div className="flex gap-3 h-full">
        {/* Wider knob columns from 1500 px: "Resonance" needs ~70 px and must not run into "Cutoff". */}
        <div className="grid grid-cols-3 min-[1500px]:grid-cols-[repeat(3,minmax(60px,1fr))] gap-x-2 gap-y-1 content-start">
          {knob(pick(params, /^cutoff$/i, /cutoff/i, /^tone$/i), 'Cutoff')}
          {knob(pick(params, /^resonance$/i, /^res/i, /reso/i), 'Resonance')}
          {knob(pick(params, /^envAmount$/i, /env.*(amt|amount|depth)/i, /^punch$/i), 'Env')}
          {levelKnob}
          {panKnob}
          {knob(pick(params, /^velSens$/i, /velToFilter/i, /vel/i), 'Vel Sens')}
        </div>
        <div className="flex-1 flex flex-col min-w-0 h-full">
          <div className="flex items-center justify-between w-full mb-1">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setRightBoxMode('clip')}
                className={`font-label font-bold text-[11px] px-1.5 py-0.5 rounded transition-all ${
                  rightBoxMode === 'clip' ? 'us-lcd-inverse' : 'us-lcd-box'
                }`}
                title="Edit and control audio clip played in piano roll / arrangement"
              >
                ∿ CLIP
              </button>
              <button
                type="button"
                onClick={() => setRightBoxMode('adsr')}
                className={`font-label font-bold text-[11px] px-1.5 py-0.5 rounded transition-all ${
                  rightBoxMode === 'adsr' ? 'us-lcd-inverse' : 'us-lcd-box'
                }`}
                title="Synthesizer ADSR envelopes"
              >
                ⊓ ADSR
              </button>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-label font-bold text-[11px]">Voices:</span>
              <div className="us-lcd-box px-1 font-lcd text-[18px] leading-[16px]">
                <span ref={voicesRef}>00</span>
              </div>
            </div>
          </div>
          <div className="us-lcd-box flex-1 w-full min-h-0 flex flex-col p-1.5 overflow-hidden">
            {rightBoxMode === 'clip' ? (
              <LcdAudioClipBox track={track} onTouched={setTouched} onForce={force} />
            ) : (
              <div className="flex-1 w-full flex justify-around items-end px-1 pb-1 pt-2">
                {adsr.some((p) => p !== null) ? (
                  adsr.map((p, i) => (
                    <AdsrSlider key={i} label={'ADSR'[i]} p={p} onChange={(v) => p && setParam(p, v)} />
                  ))
                ) : (
                  (() => {
                    const lanes = drumLanesFor(dev);
                    const note = lanes && lanes.length > 0 ? lanes[0].note : 60;
                    const st = deviceSample(dev.id);
                    const pad = st?.pads?.[note];
                    const a = pad?.attack ?? 0.002;
                    const d = pad?.decay ?? 0.25;
                    const s = pad?.sustain ?? 1.0;
                    const r = pad?.release ?? 0.05;

                    const updateSampleAdsr = (patch: Partial<PadSample>): boolean => {
                      // ADSR controls alter an already-captured note. Creating a fake empty
                      // assignment here used to persist an audioId of "", which cannot play and
                      // bypassed the common undo path.
                      if (!editCapturedPadSample(audioEngine, dev.id, note, patch)) {
                        setTouched({ label: 'Capture note audio', value: 'Capture a note first' });
                        return false;
                      }
                      force();
                      return true;
                    };

                    return [
                      <AdsrSlider key="A" label="A" val={a} min={0.001} max={1.5} onChange={(v) => { if (updateSampleAdsr({ attack: v })) setTouched({ label: 'Attack', value: `${(v * 1000).toFixed(0)}ms` }); }} />,
                      <AdsrSlider key="D" label="D" val={d} min={0.01} max={2.0} onChange={(v) => { if (updateSampleAdsr({ decay: v })) setTouched({ label: 'Decay', value: `${v.toFixed(2)}s` }); }} />,
                      <AdsrSlider key="S" label="S" val={s} min={0} max={1.0} onChange={(v) => { if (updateSampleAdsr({ sustain: v })) setTouched({ label: 'Sustain', value: `${Math.round(v * 100)}%` }); }} />,
                      <AdsrSlider key="R" label="R" val={r} min={0.01} max={3.0} onChange={(v) => { if (updateSampleAdsr({ release: v })) setTouched({ label: 'Release', value: `${v.toFixed(2)}s` }); }} />,
                    ];
                  })()
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  } else if (page === 'clip') {
    body = (
      <div className="h-full flex flex-col p-1">
        <LcdAudioClipBox track={track} onTouched={setTouched} onForce={force} />
      </div>
    );
  } else if (page === 'mix') {
    const buses = audioEngine.mixer.buses();
    body = (
      <div className="flex flex-wrap gap-x-2 gap-y-1 content-start">
        {levelKnob}
        {panKnob}
        {chanKnob('Width', chan?.width ?? 1, 0, 2, 1, (v) => audioEngine.mixer.setWidth(dev.id, v), (v) => `${Math.round(v * 100)}%`, false, 'width')}
        {chanKnob('Trim', chan?.trimDb ?? 0, -24, 24, 0, (v) => audioEngine.mixer.setTrim(dev.id, v), (v) => `${v.toFixed(1)}dB`, true, 'trim')}
        {buses.map((b) => {
          const send = chan?.sends?.find((s) => s.busId === b.id);
          return chanKnob(`→ ${b.name}`.slice(0, 12), send?.level ?? 0, 0, 1, 0, (v) => audioEngine.mixer.setSend(dev.id, b.id, v), (v) => `${Math.round(v * 100)}%`, false, `send:${b.id}`);
        })}
        {buses.length === 0 && <div className="font-label text-[13px] self-center">No send buses yet (Mixer → + Return).</div>}
      </div>
    );
  } else if (page === 'fx') {
    body = (
      <div className="flex flex-col gap-1 h-full min-h-0">
        <div className="font-label font-bold text-[13px]">INSERT EFFECTS ({inserts.length})</div>
        <div className="flex-1 min-h-0 overflow-y-auto space-y-1">
          {inserts.length === 0 && <div className="font-lcd text-[18px]">— none —</div>}
          {inserts.map((fx, i) => (
            <div key={fx.id} className="flex items-center gap-2 us-lcd-box px-1.5 py-0.5">
              <span className="font-lcd text-[18px] w-5">{i + 1}.</span>
              <span className="font-lcd text-[18px] flex-1 truncate">{fx.name}</span>
              <button
                type="button"
                className={`font-label font-bold text-[11px] px-1.5 rounded ${fx.isBypassed ? 'us-lcd-inverse' : 'us-lcd-box'}`}
                onClick={() => {
                  fx.isBypassed = !fx.isBypassed;
                  force();
                }}
                title="Bypass this effect"
              >
                {fx.isBypassed ? 'BYPASSED' : 'ON'}
              </button>
              <button type="button" className="font-label font-bold text-[11px] px-1.5 rounded us-lcd-box" onClick={() => audioEngine.removeDevice(fx.id)} title="Remove this effect">
                ✕
              </button>
            </div>
          ))}
        </div>
        <select
          value=""
          onChange={(e) => {
            const fx = EFFECT_CATALOG.find((x) => `${x.type}::${x.name}` === e.target.value);
            if (!fx) return;
            const d = audioEngine.createDevice(fx.type, fx.name);
            audioEngine.insertEffectOnTrack(d.id, dev.id);
          }}
          className="us-lcd-box bg-transparent font-label font-bold text-[13px] px-1"
          aria-label="Add an insert effect"
        >
          <option value="">+ Add insert effect…</option>
          {EFFECT_CATALOG.map((x) => (
            <option key={`${x.type}::${x.name}`} value={`${x.type}::${x.name}`}>
              {x.group} · {x.name}
            </option>
          ))}
        </select>
      </div>
    );
  } else if (page === 'midi') {
    const rec = audioEngine.recorder.settings;
    const midiStatus = audioEngine.midi.status;
    const midiPorts = audioEngine.midi.ports;
    const midiStatusText = midiPorts.some((port) => port.error)
      ? midiPorts.filter((port) => port.error).map((port) => `${port.name}: ${port.error}`).join(' · ')
      : midiStatus === 'ready'
        ? midiPorts.length ? `Connected: ${midiPorts.map((port) => port.name).join(', ')}` : 'MIDI access ready; no connected input found.'
        : midiStatus === 'connecting'
          ? 'Requesting MIDI access…'
          : midiStatus === 'blocked'
            ? 'MIDI access blocked. Allow MIDI in browser permissions, then retry.'
            : midiStatus === 'unsupported'
              ? 'This browser does not support Web MIDI.'
              : midiStatus === 'off'
                ? 'MIDI is not connected. Use Connect / retry to authorize the controller.'
              : 'No MIDI keyboard connected yet.';
    body = (
      <div className="flex flex-col gap-1.5 font-label text-[13px]">
        <div>The on-screen keyboard, the computer keys and MIDI keyboards play <b>part {partNo}</b>{parts.some((p) => audioEngine.devices.get(p.deviceId) && isLinked(p.deviceId) && p.id !== track.id) ? ' and its linked parts' : ''}.</div>
        <div role="status" aria-live="polite" className="us-lcd-box px-1.5 py-1">MIDI input: {midiStatusText}</div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!track.armed}
            onChange={() => {
              audioEngine.setTrackArmed(track.id, !track.armed);
              force();
            }}
          />
          Arm this part for transport recording
        </label>
        <div className="us-lcd-box px-1.5 py-1">
          Piano-roll take: choose Song mode, arm this part, press Record on the bottom transport (it asks for MIDI access if needed), play, then Stop. Pattern mode writes into the active pattern instead.
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={audioEngine.noteRecordArmed}
            onChange={() => {
              audioEngine.noteRecordArmed = !audioEngine.noteRecordArmed;
              force();
            }}
          />
          Step-write: notes played while the song runs go into the current pattern
        </label>
        <label className="flex items-center gap-2">
          Input quantize
          <select
            value={rec.midiQuantize}
            onChange={(e) => {
              rec.midiQuantize = Number(e.target.value);
              force();
            }}
            className="us-lcd-box bg-transparent px-1"
          >
            <option value={0}>Off</option>
            <option value={4}>1/4</option>
            <option value={2}>1/8</option>
            <option value={1}>1/16</option>
          </select>
        </label>
        <button type="button" className="self-start us-lcd-box px-2 font-bold" onClick={() => void audioEngine.enableMidiInput().then((ok) => { setTouched({ label: 'MIDI input', value: ok ? 'ready' : 'not available' }); force(); })}>
          Connect / retry MIDI keyboard
        </button>
      </div>
    );
  } else if (page === 'combi') {
    body = (
      <div className="flex flex-col gap-1 h-full min-h-0">
        <div className="font-label text-[13px]">Linked parts play together from the keyboard. Combine them to control them as one rack unit.</div>
        <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-2 gap-x-3 gap-y-0.5 content-start">
          {parts.map((p, i) => {
            const on = p.id === track.id || isLinked(p.deviceId);
            return (
              <label key={p.id} className="flex items-center gap-1.5 font-lcd text-[18px] leading-none">
                <input type="checkbox" disabled={p.id === track.id} checked={on} onChange={() => setLinked(p.deviceId, !on)} />
                {i + 1}. <span className="truncate">{p.name}</span>
              </label>
            );
          })}
        </div>
        <button
          type="button"
          className="self-start us-lcd-box px-2 font-label font-bold text-[13px]"
          onClick={() => {
            const ids = parts.filter((p) => p.id === track.id || isLinked(p.deviceId)).map((p) => p.deviceId);
            if (ids.length < 2) return setTouched({ label: 'Combine', value: 'link 2+ parts first' });
            audioEngine.addRackGroup({ name: `Combi: ${ids.map((id) => audioEngine.devices.get(id)?.name ?? '').join(' + ')}`.slice(0, 48), deviceIds: ids, macros: [], source: 'user' });
            setTouched({ label: 'Combine', value: `${ids.length} parts grouped in the rack` });
          }}
        >
          Combine linked parts in the rack
        </button>
      </div>
    );
  } else {
    const sec = sections.find((s) => `sec:${s.id}` === page) ?? sections[0];
    body = (
      <div className="flex flex-wrap gap-x-2 gap-y-1 content-start overflow-y-auto h-full">
        {sec?.params.map((p) =>
          p.options ? (
            <div key={p.key} className="flex flex-col items-center w-[96px]">
              <div className="flex items-center gap-1 us-lcd-box px-1 w-full justify-between">
                <button type="button" className="font-bold" onClick={() => setParam(p, Math.max(p.min, Math.round(p.value) - 1))} aria-label={`Previous ${p.label}`}>
                  ◀
                </button>
                <span className="font-lcd text-[18px] leading-none truncate">{fmt(p, p.value)}</span>
                <button type="button" className="font-bold" onClick={() => setParam(p, Math.min(p.max, Math.round(p.value) + 1))} aria-label={`Next ${p.label}`}>
                  ▶
                </button>
              </div>
              <span className="font-label font-semibold text-[13px] text-lcd-ink">{p.label}</span>
            </div>
          ) : (
            knob(p, p.label, 38)
          )
        )}
      </div>
    );
  }

  const tabs: { id: LcdPage; label: string }[] = [
    { id: 'easy', label: 'Easy' },
    { id: 'clip', label: 'Audio Clip' },
    ...sections.slice(0, 5).map((s) => ({ id: `sec:${s.id}` as LcdPage, label: s.label })),
  ];
  return (
    <Lcd className="h-full" innerClassName="flex flex-col p-2 gap-1.5 min-h-0">
      <div className="flex-1 min-h-0 flex gap-2">
        {/* left: part display */}
        <div className="w-[44%] min-w-0 flex flex-col gap-1 overflow-hidden">
          <div className="us-lcd-inverse rounded-[3px] px-2 font-lcd text-[22px] leading-[32px] truncate text-center" data-testid="lcd-title">
            {track.name}
          </div>
          <div className="us-lcd-box px-2 py-0.5 font-lcd text-[18px] leading-[17px]">
            <div className="flex justify-between">
              <span className="us-lcd-inverse px-1 text-[13px] font-label font-bold leading-[16px]">EDIT TARGET</span>
              <span>PART {String(partNo).padStart(2, '0')}</span>
            </div>
            <div className="truncate">{dev.name}</div>
            <div className="truncate">{touched ? `${touched.label}  ${touched.value}` : `${params.length} parameters`}</div>
          </div>
          <div className="flex-1 min-h-0 font-lcd text-[18px] leading-[16px] grid grid-cols-[auto_1fr] gap-x-2 content-start">
            <span>{isAudioClipFocused && focusedClip ? '1. CLIP' : '1. PATTERN'}</span>
            <span className="truncate">
              {isAudioClipFocused && focusedClip ? `${focusedClip.name} · ${focusedClip.lengthBars.toFixed(1)}b` : `${pattern.name} · ${pattern.length}×${pattern.division}`}
            </span>
            <span>2. OUTPUT</span>
            <span className="truncate">{out}</span>
            <span>3. FX</span>
            <span className="truncate">{inserts.length ? inserts.map((f) => f.name).join(', ') : '—'}</span>
          </div>
        </div>
        {/* right: page */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-label font-bold text-[18px]">Edit:</span>
            <span className="us-lcd-box flex-1 px-2 font-lcd text-[22px] leading-[22px] truncate text-center">{page.startsWith('sec:') ? page.slice(4) : page === 'easy' ? track.name : page.toUpperCase()}</span>
          </div>
          <div className="flex-1 min-h-0">{body}</div>
        </div>
      </div>
      <div className="flex gap-1" role="tablist" aria-label="LCD pages">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={page === t.id}
            onClick={() => onPage(t.id)}
            className={`px-2 rounded-t-[3px] font-label font-bold text-[13px] leading-[18px] ${page === t.id ? 'us-lcd-inverse' : 'us-lcd-box'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </Lcd>
  );
};

const AdsrSlider: React.FC<{
  label: string;
  p?: DeviceParam | null;
  val?: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}> = ({ label, p, val, min = 0, max = 1, onChange }) => {
  const drag = useRef<{ y: number; n: number } | null>(null);
  const curVal = p ? p.value : (val ?? min);
  const cMin = p ? p.min : min;
  const cMax = p ? p.max : max;
  const isLog = p?.curve === 'log';
  const norm = isLog && cMin > 0 ? Math.log(curVal / cMin) / Math.log(cMax / cMin) : (curVal - cMin) / (cMax - cMin || 1);
  const fromNorm = (n: number) => {
    const x = Math.max(0, Math.min(1, n));
    return isLog && cMin > 0 ? cMin * Math.pow(cMax / cMin, x) : cMin + x * (cMax - cMin);
  };
  const active = p !== null || val !== undefined;
  return (
    <div className={`flex flex-col items-center gap-0.5 ${active ? '' : 'opacity-40'}`} title={p ? `${p.label}: ${fmt(p, p.value)}` : `${label}: ${curVal.toFixed(2)}`}>
      <div
        className="relative w-[18px] h-[84px] cursor-ns-resize"
        role="slider"
        aria-label={p?.label ?? label}
        aria-valuenow={curVal}
        onPointerDown={(e) => {
          if (!active) return;
          capturePointer(e.currentTarget, e.pointerId);
          drag.current = { y: e.clientY, n: norm };
        }}
        onPointerMove={(e) => drag.current && onChange(fromNorm(drag.current.n + (drag.current.y - e.clientY) / 84))}
        onPointerUp={() => (drag.current = null)}
        onDoubleClick={() => p ? onChange(p.defaultValue) : onChange(cMin + (cMax - cMin) * 0.5)}
      >
        <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-[3px] bg-lcd-ink/70 rounded" />
        <div className="absolute left-0 right-0 h-[9px] rounded-[2px] bg-lcd-ink border border-lcd-1/60" style={{ bottom: `calc(${Math.max(0, Math.min(1, norm)) * 100}% - 4px)` }} />
      </div>
      <span className="font-label font-bold text-[13px] leading-none">{label}</span>
    </div>
  );
};
