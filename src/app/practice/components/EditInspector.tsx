import { useMemo, type SyntheticEvent } from 'react';

import type { EditorCommand, PracticeInspectionRow, SemanticFocus } from '../../../editor';
import { EditorCommandSchema } from '../../../editor';
import type { PracticeEditorController } from '../usePracticeEditor';

type EditInspectorProps = {
  editor: PracticeEditorController;
};

type WrittenPitch = Readonly<{
  accidental: -2 | -1 | 0 | 1 | 2;
  octave: number;
  step: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
}>;

const editorCommand = (input: unknown): EditorCommand => EditorCommandSchema.parse(input);

const pitchClasses: readonly Readonly<{
  accidental: WrittenPitch['accidental'];
  step: WrittenPitch['step'];
}>[] = [
  { accidental: 0, step: 'C' },
  { accidental: 1, step: 'C' },
  { accidental: 0, step: 'D' },
  { accidental: 1, step: 'D' },
  { accidental: 0, step: 'E' },
  { accidental: 0, step: 'F' },
  { accidental: 1, step: 'F' },
  { accidental: 0, step: 'G' },
  { accidental: 1, step: 'G' },
  { accidental: 0, step: 'A' },
  { accidental: 1, step: 'A' },
  { accidental: 0, step: 'B' },
];

const pitchForMidi = (midi: number): WrittenPitch => ({
  ...(pitchClasses[midi % 12] ?? { accidental: 0 as const, step: 'C' as const }),
  octave: Math.floor(midi / 12) - 1,
});

const eventDuration = (
  event: Readonly<{ durationTicks?: number; notatedDurationTicks?: number }>,
) => event.durationTicks ?? event.notatedDurationTicks ?? 480;

const selectedInspectionRow = (
  rows: readonly PracticeInspectionRow[],
  focus: SemanticFocus | null,
): PracticeInspectionRow | null => {
  if (typeof focus !== 'object' || focus === null || !('kind' in focus)) return null;
  const candidate = focus as Record<string, unknown>;
  return (
    rows.find(({ focusTarget }) => {
      if (candidate.kind === 'document') return focusTarget.kind === 'document';
      if (candidate.kind === 'track') {
        return focusTarget.kind === 'track' && focusTarget.trackId === candidate.trackId;
      }
      if (candidate.kind === 'voice') {
        return (
          focusTarget.kind === 'voice' &&
          focusTarget.trackId === candidate.trackId &&
          focusTarget.voiceId === candidate.voiceId
        );
      }
      if (candidate.kind === 'event') {
        return (
          ['event', 'rest'].includes(focusTarget.kind) &&
          focusTarget.eventId === candidate.eventId &&
          focusTarget.trackId === candidate.trackId &&
          focusTarget.voiceId === candidate.voiceId
        );
      }
      return (
        candidate.kind === 'note' &&
        focusTarget.kind === 'note' &&
        focusTarget.eventId === candidate.eventId &&
        focusTarget.noteId === candidate.noteId &&
        focusTarget.trackId === candidate.trackId &&
        focusTarget.voiceId === candidate.voiceId
      );
    }) ?? null
  );
};

export function EditInspector({ editor }: EditInspectorProps) {
  const state = editor.state;
  const document = state?.history.document;

  const selectedRow = useMemo(
    () =>
      state === null
        ? null
        : selectedInspectionRow(state.inspection.rows, state.history.workspace.focus),
    [state],
  );
  const selectedTarget = selectedRow?.focusTarget;
  const selectedEvent =
    selectedTarget?.eventId === null || selectedTarget?.eventId === undefined
      ? undefined
      : document?.tracks
          .find(({ id }) => id === selectedTarget.trackId)
          ?.voices.find(({ id }) => id === selectedTarget.voiceId)
          ?.events.find(({ id }) => id === selectedTarget.eventId);
  const selectedNote =
    selectedEvent?.kind === 'guitar-event'
      ? selectedEvent.notes.find(({ id }) => id === selectedTarget?.noteId)
      : undefined;

  if (state === null || document === undefined) {
    return (
      <aside className="practice-edit-inspector" aria-busy="true" aria-label="Score editor">
        <h2>Edit score</h2>
        <p>Preparing the authored score…</p>
      </aside>
    );
  }

  const firstTrack = document.tracks[0];
  const firstVoice = firstTrack?.voices[0];

  const insertEvent = async (kind: 'guitar-event' | 'rest'): Promise<void> => {
    if (firstTrack === undefined || firstVoice === undefined) return;
    const tick = firstVoice.events.reduce(
      (latest, event) => Math.max(latest, event.tick + eventDuration(event)),
      0,
    );
    const eventId = editor.nextId(kind === 'rest' ? 'rest' : 'event');
    const noteId = editor.nextId('note');
    const commands: EditorCommand[] = [
      editorCommand({
        event:
          kind === 'rest'
            ? { durationTicks: 480, id: eventId, kind: 'rest', tick }
            : {
                articulations: [],
                id: eventId,
                kind: 'guitar-event',
                notatedDurationTicks: 480,
                notes: [
                  {
                    id: noteId,
                    position: { stringNumber: 1, tabFret: 0 },
                    semantics: [],
                    soundingDurationTicks: 480,
                    writtenPitch: pitchForMidi(document.guitar.tuning[0]?.openMidi ?? 64),
                  },
                ],
                tick,
              },
        kind: 'insert-event',
        target: { trackId: firstTrack.id, voiceId: firstVoice.id },
      }),
    ];
    if (tick + 480 > document.durationTicks) {
      commands.push(editorCommand({ durationTicks: tick + 480, kind: 'set-document-duration' }));
    }
    const position = {
      eventId,
      noteId: kind === 'rest' ? null : noteId,
      trackId: firstTrack.id,
      voiceId: firstVoice.id,
    };
    await editor.transact(
      commands,
      kind === 'rest' ? 'Insert quarter-note rest' : 'Insert open high E quarter note',
      kind === 'rest' ? { ...position, kind: 'event' } : { ...position, kind: 'note', noteId },
      { kind: 'caret', position },
    );
  };

  const updateTitle = async (event: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const titleEntry = new FormData(event.currentTarget).get('title');
    const nextTitle = typeof titleEntry === 'string' ? titleEntry.trim() : '';
    if (nextTitle === '' || nextTitle === document.metadata.title) return;
    await editor.transact(
      [editorCommand({ kind: 'set-metadata', title: nextTitle })],
      `Rename score to ${nextTitle}`,
      { kind: 'document' },
      null,
    );
  };

  const updateTempo = async (event: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const input = Number(new FormData(event.currentTarget).get('tempo'));
    const bpm = Math.min(300, Math.max(20, Math.round(input)));
    await editor.transact(
      [
        editorCommand({
          entries: [{ microsecondsPerQuarter: Math.round(60_000_000 / bpm), tick: 0 }],
          kind: 'set-tempo-map',
        }),
      ],
      `Set authored tempo to ${String(bpm)} BPM`,
      { kind: 'document' },
      null,
    );
  };

  const updateSelection = async (event: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (selectedTarget?.eventId === null || selectedTarget?.eventId === undefined) return;
    const form = new FormData(event.currentTarget);
    const duration = Number(form.get('duration'));
    const stringNumber = Number(form.get('string'));
    const fret = Number(form.get('fret'));
    const target = {
      eventId: selectedTarget.eventId,
      trackId: selectedTarget.trackId ?? '',
      voiceId: selectedTarget.voiceId ?? '',
    };
    const commands: EditorCommand[] = [
      editorCommand({ durationTicks: duration, kind: 'set-event-duration', target }),
    ];
    if (selectedNote !== undefined && selectedTarget.noteId !== null) {
      const openMidi = document.guitar.tuning[stringNumber - 1]?.openMidi;
      if (openMidi === undefined) return;
      commands.push(
        editorCommand({
          kind: 'set-note-position',
          position: { stringNumber, tabFret: fret },
          target: { ...target, noteId: selectedTarget.noteId },
          writtenPitch: pitchForMidi(openMidi + fret + document.guitar.capoFret),
        }),
        editorCommand({
          kind: 'set-note-sounding-duration',
          soundingDurationTicks: duration,
          target: { ...target, noteId: selectedTarget.noteId },
        }),
      );
    }
    await editor.transact(commands, 'Update selected score event');
  };

  const deleteSelection = async (): Promise<void> => {
    if (
      selectedTarget?.eventId === null ||
      selectedTarget?.eventId === undefined ||
      selectedTarget.trackId === null ||
      selectedTarget.voiceId === null
    ) {
      return;
    }
    await editor.transact(
      [
        editorCommand({
          kind: 'delete-event',
          target: {
            eventId: selectedTarget.eventId,
            trackId: selectedTarget.trackId,
            voiceId: selectedTarget.voiceId,
          },
        }),
      ],
      'Delete selected score event',
      { kind: 'voice', trackId: selectedTarget.trackId, voiceId: selectedTarget.voiceId },
      null,
    );
  };

  return (
    <aside className="practice-edit-inspector" aria-label="Score editor">
      <div className="practice-edit-heading">
        <h2>Edit score</h2>
      </div>
      <p>
        Changes update this working copy immediately. Imported scores use a separate review step
        before they replace your work.
      </p>

      {editor.error !== null && (
        <p className="practice-editor-error" role="alert">
          {editor.error}
        </p>
      )}

      <section>
        <h3>Document</h3>
        <form key={document.metadata.title} onSubmit={(event) => void updateTitle(event)}>
          <label htmlFor="practice-score-title-input">Title</label>
          <div className="practice-editor-field-row">
            <input
              disabled={editor.busy}
              defaultValue={document.metadata.title}
              id="practice-score-title-input"
              maxLength={120}
              name="title"
              required
            />
            <button disabled={editor.busy} type="submit">
              Rename
            </button>
          </div>
        </form>
        <form
          key={document.tempoMap[0]?.microsecondsPerQuarter}
          onSubmit={(event) => void updateTempo(event)}
        >
          <label htmlFor="practice-authored-tempo">Authored tempo (BPM)</label>
          <div className="practice-editor-field-row">
            <input
              disabled={editor.busy}
              defaultValue={Math.round(
                60_000_000 / (document.tempoMap[0]?.microsecondsPerQuarter ?? 500_000),
              )}
              id="practice-authored-tempo"
              max={300}
              min={20}
              name="tempo"
              type="number"
            />
            <button disabled={editor.busy} type="submit">
              Set tempo
            </button>
          </div>
        </form>
      </section>

      <section>
        <h3>Add at end of Guitar</h3>
        <div className="practice-editor-actions">
          <button
            disabled={editor.busy}
            onClick={() => void insertEvent('guitar-event')}
            type="button"
          >
            Add open E note
          </button>
          <button disabled={editor.busy} onClick={() => void insertEvent('rest')} type="button">
            Add rest
          </button>
        </div>
      </section>

      <section>
        <h3>Selection</h3>
        <p>{selectedRow?.label ?? 'Choose an event or note in Score contents to edit it.'}</p>
        {selectedEvent !== undefined ? (
          <form
            key={`${selectedEvent.id}-${String(eventDuration(selectedEvent))}-${String(selectedNote?.position.stringNumber ?? 0)}-${String(selectedNote?.position.tabFret ?? 0)}`}
            onSubmit={(event) => void updateSelection(event)}
          >
            <label htmlFor="practice-event-duration">Duration (ticks)</label>
            <input
              disabled={editor.busy}
              defaultValue={eventDuration(selectedEvent)}
              id="practice-event-duration"
              min={1}
              name="duration"
              required
              type="number"
            />
            {selectedNote !== undefined && (
              <div className="practice-editor-position-fields">
                <label htmlFor="practice-note-string">String</label>
                <input
                  disabled={editor.busy}
                  defaultValue={selectedNote.position.stringNumber}
                  id="practice-note-string"
                  max={document.guitar.tuning.length}
                  min={1}
                  name="string"
                  required
                  type="number"
                />
                <label htmlFor="practice-note-fret">Fret</label>
                <input
                  disabled={editor.busy}
                  defaultValue={selectedNote.position.tabFret}
                  id="practice-note-fret"
                  max={document.guitar.maxPhysicalFret}
                  min={0}
                  name="fret"
                  required
                  type="number"
                />
              </div>
            )}
            <div className="practice-editor-actions">
              <button disabled={editor.busy} type="submit">
                Apply changes
              </button>
              <button
                className="is-danger"
                disabled={editor.busy}
                onClick={() => void deleteSelection()}
                type="button"
              >
                Delete event
              </button>
            </div>
          </form>
        ) : (
          <small>Event controls appear when an authored event or note is selected.</small>
        )}
      </section>
    </aside>
  );
}
