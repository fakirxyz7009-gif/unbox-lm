/**
 * "Clip" tab of the Clip Editor: edits the clip selected in a song timeline — a note clip in a
 * large piano roll with velocity lane, an audio clip on its waveform — or, for a pattern clip,
 * opens its pattern in the pattern editors. Without a selection it lists the song's clips.
 */
import React from 'react';
import { AudioLines, Grid3x3, Music } from 'lucide-react';
import { audioEngine } from '../audio/AudioEngine.ts';
import type { ArrangementClip, SequencerTrack } from '../audio/types.ts';
import { findPattern } from '../audio/sequencer/model.ts';
import { NoteClipEditor } from '../components/sequencer/arrangement/NoteClipEditor.tsx';
import type { SequencerTabMode } from '../components/sequencer/SequencerView.tsx';
import { useEngineVersion, useSequencerVersion } from '../nexa/useEngine.ts';
import { focusClip, useClipFocus } from '../shell/clipFocus.ts';
import { AudioClipEditor } from './AudioClipEditor.tsx';

interface Props {
  onOpenEditor: (tab: SequencerTabMode) => void;
  onSelectPart: (deviceId: string) => void;
}

const kindIcon = (c: ArrangementClip) => (c.kind === 'audio' ? AudioLines : c.kind === 'notes' ? Music : Grid3x3);

function audition(t: SequencerTrack, note: number, vel: number): void {
  const dev = audioEngine.devices.get(t.deviceId);
  if (!dev?.noteOn) return;
  const now = audioEngine.ctx.currentTime;
  dev.noteOn(note, vel, now);
  dev.noteOff?.(note, now + 0.22);
}

function ClipPicker() {
  const tracks = audioEngine.tracks.filter((t) => (t.arrangementClips ?? []).length > 0);
  const total = tracks.reduce((n, t) => n + (t.arrangementClips?.length ?? 0), 0);
  return (
    <div className="flex-1 min-h-0 overflow-y-auto" data-testid="clip-picker">
      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-4 px-6 py-6">
        <header className="flex flex-wrap items-end gap-x-3 gap-y-1">
          <div>
            <div className="font-label text-[11px] font-bold uppercase tracking-[0.22em] text-sel">Clip editor</div>
            <h2 className="font-label text-[22px] font-bold leading-tight text-ink">Choose a clip</h2>
          </div>
          <div className="flex-1" />
          <span className="font-label text-[11px] uppercase tracking-[0.14em] text-[#8d9aa2]">
            {total} {total === 1 ? 'clip' : 'clips'} · {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
          </span>
        </header>
        <p className="max-w-[760px] font-label text-[13px] leading-relaxed text-chrome-ink">
          Select a clip in the song timeline (Workstation &amp; Sequencer) or pick one below. Note clips open in a piano roll with a velocity lane, audio clips on their waveform.
        </p>
        {tracks.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-[#39434a] px-6 py-14 text-center">
            <Music className="h-6 w-6 text-[#5f6d75]" />
            <div className="font-label text-[18px] font-bold text-ink">The song has no clips yet</div>
            <p className="max-w-[420px] font-label text-[13px] text-chrome-ink">
              Draw a clip with the pencil tool in the song sequencer, then open it here to edit its notes, pattern or waveform.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {tracks.map((t) => {
              const clips = (t.arrangementClips ?? []).slice().sort((a, b) => a.startBar - b.startBar);
              return (
                <div key={t.id} className="clip-card">
                  <div className="clip-card-head">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: t.color }} />
                    <span className="truncate font-label font-bold text-[13px] text-ink">{t.name}</span>
                    <span className="font-label text-[11px] text-[#8d9aa2]">{clips.length}</span>
                    <span className="flex-1" />
                  </div>
                  <div className="flex flex-wrap gap-1.5 p-2">
                    {clips.slice(0, 24).map((c) => {
                      const Icon = kindIcon(c);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className="clip-chip"
                          onClick={() => focusClip({ trackId: t.id, clipId: c.id })}
                          title={`${c.name || 'Clip'} — bar ${Math.floor(c.startBar) + 1}, ${+c.lengthBars.toFixed(2)} bars`}
                        >
                          <Icon className="h-3.5 w-3.5" style={{ color: t.color }} />
                          <span className="max-w-[180px] truncate">{c.name || 'Clip'}</span>
                          <span className="clip-chip-bar">{Math.floor(c.startBar) + 1}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function ClipFocusEditor({ onOpenEditor, onSelectPart }: Props) {
  useEngineVersion();
  useSequencerVersion();
  const focus = useClipFocus();
  const track = focus ? audioEngine.tracks.find((t) => t.id === focus.trackId) : undefined;
  const clip = track?.arrangementClips?.find((c) => c.id === focus?.clipId);
  if (!track || !clip) return <ClipPicker />;
  const close = () => focusClip(null);

  if (clip.kind === 'audio') return <AudioClipEditor key={clip.id} track={track} clip={clip} onClose={close} />;
  if (clip.kind === 'notes') return <NoteClipEditor key={clip.id} fill audioEngine={audioEngine} track={track} clip={clip} onClose={close} onAudition={(n, v) => audition(track, n, v)} />;

  const pattern = clip.patternId ? findPattern(track, clip.patternId) : undefined;
  const open = (tab: SequencerTabMode) => {
    if (pattern) audioEngine.sequencer.selectPattern(track.id, pattern.id);
    onSelectPart(track.deviceId);
    onOpenEditor(tab);
  };
  return (
    <div className="flex-1 min-h-0 p-3 flex flex-col gap-2" data-testid="pattern-clip-card">
      <div className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-sm" style={{ background: clip.color || track.color }} />
        <span className="font-label font-bold text-[18px] text-ink">{clip.name || 'Pattern clip'}</span>
        <span className="font-label text-[13px] text-chrome-ink">
          {track.name} · bar {Math.floor(clip.startBar) + 1} · {+clip.lengthBars.toFixed(2)} bars
        </span>
        <span className="flex-1" />
        <button type="button" className="rack-tool" onClick={close}>
          Close
        </button>
      </div>
      <p className="font-label text-[13px] text-chrome-ink">
        This clip plays the pattern <strong className="text-ink">{pattern?.name ?? 'of its track'}</strong>. Patterns are edited in the pattern editors (every clip that plays the pattern changes with it).
      </p>
      <div className="flex gap-2">
        <button type="button" className="rack-tool" onClick={() => open('piano_roll')}>
          <Music className="w-3.5 h-3.5" /> Edit in piano roll
        </button>
        <button type="button" className="rack-tool" onClick={() => open(track.group === 'Drums' ? 'drum_editor' : 'channel_rack')}>
          <Grid3x3 className="w-3.5 h-3.5" /> Edit in {track.group === 'Drums' ? 'drum editor' : 'step grid'}
        </button>
      </div>
    </div>
  );
}
