/**
 * Clips & scenes: a launcher grid (rows = pattern slots, columns = instrument tracks) with launch
 * quantize, plus a tracker list of the selected track's edited pattern.
 */
import React, { useState } from 'react';
import { Grid, Play, Square, Sparkles } from 'lucide-react';
import type { AudioEngine } from '../../audio/AudioEngine.ts';
import { syncTrackPatterns } from '../../audio/sequencer/model.ts';
import type { SequencerNote, SequencerTrack } from '../../audio/types.ts';

interface Props {
  audioEngine: AudioEngine;
  /** Instrument tracks (audio tracks have no patterns). */
  tracks: SequencerTrack[];
  activeTrack: SequencerTrack | undefined;
  onSelectTrack: (trackId: string) => void;
}

type Quantize = 'bar' | 'beat' | 'now';
const QUANTIZE: { id: Quantize; label: string }[] = [
  { id: 'bar', label: '1 Bar' },
  { id: 'beat', label: '1 Beat' },
  { id: 'now', label: 'Immediate' },
];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (midi: number) => `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
const STYLES = ['bass', 'melody', 'arp', 'chords', 'acid', 'industrial'] as const;

export function ClipLauncherPanel({ audioEngine: engine, tracks, activeTrack, onSelectTrack }: Props) {
  const [layout, setLayout] = useState<'split' | 'launcher' | 'tracker'>('split');
  const [quantize, setQuantize] = useState<Quantize>('bar');

  const grid = quantize === 'bar' ? engine.stepsPerBar : quantize === 'beat' ? engine.stepsPerBar / Number(engine.timeSignature.split('/')[0]) : 1;
  const rows = Math.max(8, ...tracks.map((t) => (t.patternList?.length ?? 1) + 1));
  const launch = (key: string, ids: string[], run: () => void) => {
    engine.launchQuantized(key, grid, ids, () => {
      engine.setPlaybackMode('pattern_loop');
      run();
    });
    if (!engine.isPlaying) void engine.togglePlay();
  };
  const launchScene = (idx: number) => launch('scene', tracks.map((t) => t.id), () => engine.switchPatternBank(idx));
  const launchClip = (t: SequencerTrack, idx: number) => {
    onSelectTrack(t.id);
    launch(`clip:${t.id}`, [t.id], () => engine.sequencer.selectPatternAt(t.id, idx));
  };
  const queued = (key: string) => (engine.isLaunchQueued(key) ? ' animate-pulse ring-1 ring-amber-400' : '');

  const len = activeTrack ? syncTrackPatterns(activeTrack, engine.activePatternIndex).length : 16;
  const ph = activeTrack ? engine.playheadFor(activeTrack) : null;
  const trackerStep = ph && ph.patternId === activeTrack?.activePatternId ? ph.step : -1;
  const setStep = (i: number, n: SequencerNote | null) => activeTrack && engine.setTrackStep(activeTrack.id, i, n);

  const btn = (on: boolean) =>
    `px-2.5 py-1 rounded text-[11px] font-bold ${on ? 'bg-cyan-500 text-slate-950' : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'}`;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#060a12] text-xs font-mono" data-testid="clip-launcher">
      <div className="bg-[#0b111e] border-b border-cyan-500/25 px-3 py-2 flex flex-wrap items-center gap-2 flex-shrink-0">
        <span className="text-[11px] font-black text-cyan-300">VIEW:</span>
        {(['split', 'launcher', 'tracker'] as const).map((m) => (
          <button key={m} onClick={() => setLayout(m)} className={btn(layout === m)}>
            {m === 'split' ? 'Launcher + tracker' : m === 'launcher' ? 'Launcher' : 'Tracker'}
          </button>
        ))}
        <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded border border-slate-800 text-[11px]" title="When a launched clip or scene starts">
          <span className="text-slate-400">LAUNCH:</span>
          {QUANTIZE.map((q) => (
            <button
              key={q.id}
              onClick={() => setQuantize(q.id)}
              className={`px-1.5 py-0.5 rounded font-bold ${quantize === q.id ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
            >
              {q.label}
            </button>
          ))}
        </div>
        <button onClick={() => engine.stopTransport()} className="ml-auto px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-slate-200 hover:text-white flex items-center gap-1 text-[11px] font-bold">
          <Square className="w-3 h-3" /> Stop
        </button>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-slate-800">
        {layout !== 'tracker' && (
          <div className={`${layout === 'split' ? 'lg:w-1/2' : 'w-full'} flex flex-col overflow-auto p-3 space-y-2`}>
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <span className="text-cyan-300 font-black text-xs flex items-center gap-1.5">
                <Grid className="w-4 h-4" /> CLIP LAUNCHER
              </span>
              <span className="text-[11px] text-slate-400">Row = pattern slot of every track · click a scene to launch the whole row</span>
            </div>
            {tracks.length === 0 ? (
              <div className="text-slate-400 text-[11px] p-3">Add an instrument to get a column of clips.</div>
            ) : (
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="bg-[#0b111e] text-slate-300 border-b border-slate-800">
                    <th className="p-2 text-left w-28">SCENE</th>
                    {tracks.map((t) => (
                      <th
                        key={t.id}
                        onClick={() => onSelectTrack(t.id)}
                        className={`p-2 text-left cursor-pointer border-l border-slate-800 max-w-[140px] ${t.id === activeTrack?.id ? 'bg-cyan-950/60 text-cyan-300' : ''}`}
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: t.color }} />
                          <span className="truncate font-bold">{t.name}</span>
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {Array.from({ length: rows }, (_, idx) => (
                    <tr key={idx} className={engine.activePatternIndex === idx ? 'bg-cyan-500/10' : ''}>
                      <td className="p-1.5">
                        <button
                          onClick={() => launchScene(idx)}
                          className={`w-full px-2.5 py-2 rounded flex items-center justify-between font-black bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800${queued('scene')}`}
                          aria-label={`Launch scene ${idx + 1}`}
                        >
                          <span>Scene {idx + 1}</span>
                          <Play className="w-3 h-3 fill-current" />
                        </button>
                      </td>
                      {tracks.map((t) => {
                        const p = t.patternList?.[idx];
                        const notes = p ? p.steps.filter(Boolean).length : 0;
                        const playing = !!p && p.id === t.activePatternId;
                        return (
                          <td key={t.id} className="p-1.5 border-l border-slate-800/80">
                            <div className="flex items-stretch gap-1">
                              <button
                                onClick={() => launchClip(t, idx)}
                                style={{ borderColor: playing ? t.color : undefined }}
                                className={`flex-1 min-w-0 py-1.5 px-2 rounded border text-left flex items-center justify-between ${
                                  playing ? 'bg-slate-900 text-white' : 'bg-slate-950/90 text-slate-400 hover:text-white border-slate-800'
                                }${queued(`clip:${t.id}`)}`}
                                title={notes ? 'Launch this clip' : 'Empty slot — launching it silences this track'}
                              >
                                <span className="truncate">
                                  <span className="block font-bold text-[11px] truncate" style={{ color: p ? p.color ?? t.color : undefined }}>
                                    {p?.name ?? `Pattern ${idx + 1}`}
                                  </span>
                                  <span className="block text-[11px] text-slate-500">{notes ? `${notes} note${notes === 1 ? '' : 's'}` : 'empty'}</span>
                                </span>
                                <Play className="w-2.5 h-2.5 opacity-75 shrink-0" />
                              </button>
                              {!notes && (
                                <button
                                  onClick={() => {
                                    engine.sequencer.selectPatternAt(t.id, idx);
                                    engine.generateInstrumentPattern(t.id, STYLES[idx % STYLES.length]);
                                    onSelectTrack(t.id);
                                  }}
                                  className="px-1 rounded border border-slate-800 text-slate-500 hover:text-amber-300"
                                  title="Generate notes into this slot"
                                  aria-label={`Generate pattern ${idx + 1} for ${t.name}`}
                                >
                                  <Sparkles className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {layout !== 'launcher' && activeTrack && (
          <div className={`${layout === 'split' ? 'lg:w-1/2' : 'w-full'} flex flex-col overflow-hidden p-3 space-y-2 bg-[#050810]`}>
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 gap-2">
              <span className="text-emerald-400 font-black text-xs">
                TRACKER · {activeTrack.name} · {syncTrackPatterns(activeTrack, engine.activePatternIndex).name}
              </span>
              <button
                onClick={() => engine.autoAlignTrackMidi(activeTrack.id, 100)}
                className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black text-[11px]"
                title="Removes timing offsets and snaps pitches to the song key / scale"
              >
                Quantize + snap to scale
              </button>
            </div>
            <div className="flex-1 overflow-y-auto border border-slate-800 rounded-lg">
              <table className="w-full border-collapse text-[11px]">
                <thead className="bg-[#0b111e] text-cyan-300 sticky top-0 z-10 border-b border-slate-800">
                  <tr>
                    <th className="p-1.5 text-left">ROW</th>
                    <th className="p-1.5 text-left">NOTE</th>
                    <th className="p-1.5 text-left">LEN</th>
                    <th className="p-1.5 text-left">VEL %</th>
                    <th className="p-1.5 text-left">CHANCE %</th>
                    <th className="p-1.5 text-left">RATCHET</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900">
                  {Array.from({ length: len }, (_, i) => {
                    const n = activeTrack.steps[i];
                    const num = 'w-12 bg-slate-950 border border-slate-700 rounded px-1';
                    return (
                      <tr key={i} className={trackerStep === i ? 'bg-amber-500/25 text-amber-200 font-bold' : i % 4 === 0 ? 'bg-slate-900/70' : 'bg-[#070b13]'}>
                        <td className="p-1.5 text-slate-400">
                          {i.toString(16).toUpperCase().padStart(2, '0')} <span className="text-[11px] opacity-60">({i + 1})</span>
                        </td>
                        <td className="p-1.5">
                          <span className="inline-flex items-center gap-0.5">
                            <button
                              onClick={() => setStep(i, n ? null : { note: 60 + engine.rootKey, velocity: 0.85, length: 1 })}
                              className={`px-2 py-0.5 rounded font-bold w-12 ${n ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-slate-500 hover:text-slate-300'}`}
                              title={n ? 'Remove the note' : 'Add a note'}
                            >
                              {n ? noteName(n.note) : '---'}
                            </button>
                            {n && (
                              <>
                                <button onClick={() => setStep(i, { ...n, note: Math.max(0, n.note - 1) })} className="px-1 rounded bg-slate-900 border border-slate-700" aria-label="Semitone down">−</button>
                                <button onClick={() => setStep(i, { ...n, note: Math.min(127, n.note + 1) })} className="px-1 rounded bg-slate-900 border border-slate-700" aria-label="Semitone up">+</button>
                              </>
                            )}
                          </span>
                        </td>
                        <td className="p-1.5">
                          {n ? (
                            <input type="number" min={1} max={len} value={n.length || 1} onChange={(e) => setStep(i, { ...n, length: Math.max(1, Number(e.target.value) || 1) })} className={`${num} text-cyan-300`} />
                          ) : (
                            <span className="text-slate-600">..</span>
                          )}
                        </td>
                        <td className="p-1.5">
                          {n ? (
                            <input type="number" min={1} max={100} value={Math.round(n.velocity * 100)} onChange={(e) => setStep(i, { ...n, velocity: Math.max(0.01, Math.min(1, (Number(e.target.value) || 1) / 100)) })} className={`${num} text-emerald-300`} />
                          ) : (
                            <span className="text-slate-600">..</span>
                          )}
                        </td>
                        <td className="p-1.5">
                          {n ? (
                            <input
                              type="number"
                              min={5}
                              max={100}
                              step={5}
                              value={Math.round((n.probability ?? 1) * 100)}
                              onChange={(e) => {
                                const v = Math.max(5, Math.min(100, Number(e.target.value) || 100)) / 100;
                                setStep(i, { ...n, probability: v >= 1 ? undefined : v });
                              }}
                              className={`${num} text-purple-300`}
                            />
                          ) : (
                            <span className="text-slate-600">..</span>
                          )}
                        </td>
                        <td className="p-1.5">
                          {n ? (
                            <button onClick={() => setStep(i, { ...n, ratchet: ((n.ratchet || 1) % 4) + 1 })} className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-amber-300 font-bold" title="Repeats inside the step">
                              {n.ratchet || 1}x
                            </button>
                          ) : (
                            <span className="text-slate-600">..</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
