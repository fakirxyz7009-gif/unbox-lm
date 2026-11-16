/**
 * MIDI health: why hardware notes may not sound. One row per link in the chain — browser, permission,
 * port, arriving messages, sounding part, audio engine — read from the running engine rather than
 * guessed. Shown as the checklist in Settings · MIDI and as one status line beside the workstation
 * keyboard, so the keyboard itself can say what is missing.
 */
import React, { useEffect, useReducer, useRef, useState } from 'react';
import { audioEngine } from '../audio/AudioEngine.ts';
import { MIDI_NO_INPUT_GUIDANCE } from '../audio/midi/MidiInput.ts';
import { useFrame } from '../nexa/useEngine.ts';
import { setText } from '../ui/skin/dom.ts';

const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** One incoming message as plain text (also used by the Settings activity log). */
export function describeMidi(d: Uint8Array): string {
  const cmd = d[0] & 0xf0;
  const ch = (d[0] & 0x0f) + 1;
  if (cmd === 0x90 && d[2] > 0) return `ch${ch} Note on ${NOTE[d[1] % 12]}${Math.floor(d[1] / 12) - 1} vel ${d[2]}`;
  if (cmd === 0x80 || cmd === 0x90) return `ch${ch} Note off ${NOTE[d[1] % 12]}${Math.floor(d[1] / 12) - 1}`;
  if (cmd === 0xb0) return `ch${ch} CC${d[1]} = ${d[2]}${d[1] === 1 ? ' (mod wheel)' : d[1] === 64 ? ' (sustain)' : d[1] === 123 ? ' (all notes off)' : ''}`;
  if (cmd === 0xd0) return `ch${ch} Aftertouch ${d[1]}`;
  if (cmd === 0xe0) return `ch${ch} Pitch bend ${((d[2] << 7) | d[1]) - 8192}`;
  return `0x${Array.from(d).map((b) => b.toString(16).padStart(2, '0')).join(' ')}`;
}

interface HealthRow {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
  fix?: string;
}

/** The take a lost controller closed, offered back once it returns. */
const ResumeTake: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const take = audioEngine.resumableTake;
  if (!take) return null;
  const bar = Math.floor(take.endPos / audioEngine.stepsPerBar) + 1;
  return (
    <span className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        className="us-btn shrink-0 rounded px-1.5 text-[11px] font-bold"
        onClick={() => void audioEngine.resumeClosedTake()}
        title={`Arm ${take.label} and record again from bar ${bar}, where the lost take ended`}
      >
        ⟲ Resume{compact ? '' : ` take — bar ${bar}`}
      </button>
      <button
        type="button"
        className="us-btn shrink-0 rounded px-1 text-[11px]"
        onClick={() => audioEngine.dismissResumableTake()}
        title="Do not continue the closed take"
        aria-label="Dismiss the resume offer"
      >
        ✕
      </button>
    </span>
  );
};

export const MidiHealth: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const midi = audioEngine.midi;
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => midi.subscribe(force), [midi]);
  const [permission, setPermission] = useState('unknown');
  useEffect(() => {
    const query = navigator.permissions?.query?.({ name: 'midi' as PermissionName });
    if (!query) return;
    let live = true;
    query.then(
      (state) => { if (live) setPermission(state.state); },
      () => { if (live) setPermission('unavailable'); }
    );
    return () => { live = false; };
  }, [midi.status]);

  // Messages are counted per frame instead of in state: a busy controller must not re-render the page.
  const seen = useRef(0);
  const lastMessage = useRef('');
  const countRef = useRef<HTMLSpanElement>(null);
  const lastRef = useRef<HTMLSpanElement>(null);
  const liveRow = useRef<HTMLDivElement>(null);
  useEffect(
    () =>
      midi.monitor((data, port) => {
        seen.current += 1;
        lastMessage.current = `${port} · ${describeMidi(data)}`;
      }),
    [midi]
  );
  useFrame(() => {
    setText(countRef.current, String(seen.current));
    setText(lastRef.current, lastMessage.current || 'nothing yet');
    liveRow.current?.setAttribute('data-ok', String(seen.current > 0));
  });

  const target = audioEngine.midiTarget();
  const armedTrack = target ? audioEngine.tracks.find((t) => t.deviceId === target.id && t.kind !== 'audio') : undefined;
  const silent = !!target && (!target.isPowered || target.isBypassed);
  // A kit answers only on its pad notes; every other key is handed to a melodic part.
  const kitPads = armedTrack ? audioEngine.padNotesOf(armedTrack) : null;
  const ctxState = audioEngine.ctx.state;

  const link: HealthRow[] = [
    {
      key: 'web-midi',
      label: 'Web MIDI',
      ok: midi.status !== 'unsupported',
      detail: midi.status === 'unsupported' ? 'This browser has no Web MIDI' : 'Available in this browser',
      fix: midi.status === 'unsupported' ? 'Open the app in Chrome or Edge, or in the desktop app.' : undefined,
    },
    {
      key: 'permission',
      label: 'Permission',
      ok: midi.status === 'ready',
      detail:
        midi.status === 'ready' ? `Allowed — the browser reports “${permission}”`
          : midi.status === 'connecting' ? 'Waiting for the browser’s answer…'
            : midi.status === 'blocked' ? 'The browser refused MIDI access'
              : midi.status === 'unsupported' ? 'Not applicable'
                : 'Not requested yet',
      fix:
        midi.status === 'blocked'
          ? permission === 'denied'
            ? 'This site is blocked: open the padlock icon → Site settings → allow MIDI, reload, then press Ask again.'
            : 'Press Connect MIDI and choose Allow in the browser prompt.'
          : midi.status === 'off' ? 'Press Connect MIDI — the browser only asks from that click.' : undefined,
    },
    {
      key: 'port',
      label: 'Controller',
      ok: midi.ports.length > 0,
      detail: midi.ports.length
        ? midi.ports.map((p) => `${p.name}${p.error ? ` — ${p.error}` : ''}`).join(', ')
        : midi.status === 'ready' ? 'No input port is visible to the browser' : 'Checked once MIDI access is allowed',
      fix: midi.status === 'ready' && !midi.ports.length ? MIDI_NO_INPUT_GUIDANCE : undefined,
    },
  ];
  const sound: HealthRow[] = [
    {
      key: 'part',
      label: 'Plays',
      ok: !!target && !silent,
      detail: !target
        ? 'No instrument part in the project'
        : `${target.name}${target.isBypassed ? ' — bypassed, so notes are captured but stay silent' : !target.isPowered ? ' — powered off' : ''}${kitPads?.length ? ' — a drum kit, so keys that are not pad notes go to the first melodic part' : ''}`,
      fix: !target
        ? 'Hardware plays the selected part: add an instrument to the rack and select it.'
        : silent
          ? 'Power the unit on and switch its bypass off to hear the keyboard.'
          : armedTrack && !armedTrack.armed ? 'To record these notes, arm this part’s track before pressing Record.' : undefined,
    },
    {
      key: 'engine',
      label: 'Audio engine',
      ok: ctxState === 'running',
      detail: ctxState === 'running' ? 'Running' : `${ctxState} — audio is stopped`,
      fix: ctxState === 'running' ? undefined : 'Click anywhere in the app (or press Play) to start the audio engine.',
    },
  ];

  if (compact) {
    // Beside the keyboard: the first blocking link, else who plays and what has arrived.
    const problem = link.concat(sound).find((r) => !r.ok);
    const names = [...new Set(midi.ports.map((p) => p.name.replace(/^MIDIIN\d+ \((.*)\)$/, '$1')))];
    const summary = problem
      ? `${problem.label}: ${problem.detail}`
      : `${names.join(' + ') || 'Controller'} · plays ${target?.name ?? 'nothing'}`;
    return (
      <div
        className="flex h-[20px] shrink-0 items-center gap-1.5 rounded border border-white/10 bg-black/40 px-2 font-label text-[11px]"
        title={problem?.fix ?? 'MIDI input is connected and every link in the chain is ready'}
        data-testid="midi-health-strip"
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${problem ? 'bg-amber-400' : 'bg-emerald-400'}`} />
        <span className={`min-w-0 truncate ${problem ? 'text-amber-200' : 'text-slate-300'}`}>{summary}</span>
        <span className="ml-auto shrink-0 font-mono text-slate-500">
          <span ref={countRef}>0</span> msg
        </span>
        <ResumeTake compact />
        {midi.status === 'off' && (
          <button
            type="button"
            className="us-btn shrink-0 rounded px-1.5 text-[11px] font-bold"
            onClick={() => void midi.enable()}
            title="Request MIDI access from this click"
          >
            Connect MIDI
          </button>
        )}
      </div>
    );
  }

  const row = (r: HealthRow) => (
    <div key={r.key} className="rounded border border-slate-800 bg-black/25 px-2 py-1">
      <div className="flex items-start gap-2">
        <span className={`mt-[3px] h-2 w-2 shrink-0 rounded-full ${r.ok ? 'bg-emerald-400' : 'bg-amber-400'}`} />
        <span className="w-[72px] shrink-0 text-slate-400">{r.label}</span>
        <span className={r.ok ? 'text-slate-200' : 'text-amber-200'}>{r.detail}</span>
      </div>
      {r.fix && <div className="pl-[80px] text-slate-500">{r.fix}</div>}
    </div>
  );
  return (
    <div className="space-y-1" data-testid="midi-health">
      <div className="text-slate-300 font-bold">Why a key may not play</div>
      {link.map(row)}
      <div ref={liveRow} data-ok="false" className="group rounded border border-slate-800 bg-black/25 px-2 py-1">
        <div className="flex items-start gap-2">
          <span className="mt-[3px] h-2 w-2 shrink-0 rounded-full bg-amber-400 group-data-[ok=true]:bg-emerald-400" />
          <span className="w-[72px] shrink-0 text-slate-400">Messages</span>
          <span className="text-slate-200">
            <span ref={countRef}>0</span> received · <span ref={lastRef}>nothing yet</span>
          </span>
        </div>
        <div className="pl-[80px] text-slate-500">Play a key: this line counts what the app actually receives from the controller.</div>
      </div>
      {sound.map(row)}
      {audioEngine.resumableTake && (
        <div className="flex items-center gap-2 rounded border border-slate-800 bg-black/25 px-2 py-1">
          <span className="w-[72px] shrink-0 text-slate-400">Closed take</span>
          <span className="min-w-0 truncate text-slate-200">{audioEngine.resumableTake.label}</span>
          <ResumeTake />
        </div>
      )}
    </div>
  );
};
