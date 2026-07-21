import { assertCanonicalJsonDataDomain } from '../shared/canonical-json';
import {
  PracticeDocumentSchema,
  type PracticeDocument,
  type PracticeVoiceEvent,
} from '../shared/contracts/practice';

export type PracticeInspectionNodeKind = 'document' | 'event' | 'note' | 'rest' | 'track' | 'voice';

export type PracticeSemanticFocusTarget = Readonly<{
  documentId: string;
  eventId: string | null;
  kind: PracticeInspectionNodeKind;
  noteId: string | null;
  trackId: string | null;
  voiceId: string | null;
}>;

export type PracticeInspectionNode = Readonly<{
  ariaLevel: number;
  children: readonly PracticeInspectionNode[];
  focusTarget: PracticeSemanticFocusTarget;
  kind: PracticeInspectionNodeKind;
  label: string;
  parentRowId: string | null;
  rowId: string;
  semanticId: string;
}>;

export type PracticeInspectionRow = Readonly<{
  ariaLevel: number;
  focusTarget: PracticeSemanticFocusTarget;
  kind: PracticeInspectionNodeKind;
  label: string;
  navigationIndex: number;
  nextRowId: string | null;
  parentRowId: string | null;
  previousRowId: string | null;
  rowId: string;
  semanticId: string;
}>;

export type PracticeDocumentInspection = Readonly<{
  documentId: string;
  rows: readonly PracticeInspectionRow[];
  tree: PracticeInspectionNode;
}>;

type DeepReadonly<T> = T extends (...arguments_: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

type GuitarNoteSemantic = Extract<
  PracticeVoiceEvent,
  { kind: 'guitar-event' }
>['notes'][number]['semantics'][number];

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value as DeepReadonly<T>;
  }
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[key]);
  }
  return Object.freeze(value) as DeepReadonly<T>;
}

const accidentalLabel = (accidental: number): string => {
  if (accidental === 0) return '';
  if (accidental === 1) return ' sharp';
  if (accidental === 2) return ' double sharp';
  if (accidental === -1) return ' flat';
  return ' double flat';
};

const eventDuration = (event: PracticeVoiceEvent): number =>
  event.kind === 'rest' ? event.durationTicks : event.notatedDurationTicks;

const encodeInspectionIdSegment = (id: string): string => {
  let encoded = '';
  for (let index = 0; index < id.length; index += 1) {
    const codeUnit = id.charCodeAt(index);
    const character = id[index] ?? '';
    encoded += /^[A-Za-z0-9_.~-]$/.test(character)
      ? character
      : codeUnit <= 0xff
        ? `%${codeUnit.toString(16).toUpperCase().padStart(2, '0')}`
        : `%u${codeUnit.toString(16).toUpperCase().padStart(4, '0')}`;
  }
  return encoded;
};

const inspectionRowId = (kind: PracticeInspectionNodeKind, ...ids: readonly string[]): string =>
  `${kind}:${ids.map(encodeInspectionIdSegment).join(':')}`;

const tupletLabel = (tuplet: Readonly<{ actualNotes: number; normalNotes: number }> | undefined) =>
  tuplet === undefined
    ? ''
    : `, tuplet ${String(tuplet.actualNotes)} in the time of ${String(tuplet.normalNotes)}`;

const noteSemanticLabel = (semantic: GuitarNoteSemantic): string => {
  if ('semitones' in semantic) {
    return `bend ${String(semantic.semitones)} ${semantic.semitones === 1 ? 'semitone' : 'semitones'}`;
  }
  const name = semantic.semantic.replaceAll('-', ' ');
  return 'direction' in semantic
    ? `${name} ${semantic.direction}, related note ${semantic.targetNoteId}`
    : name;
};

const musicalLocation = (document: PracticeDocument, tick: number): string => {
  let bar = 1;
  const firstMeter = document.meterMap[0];
  if (firstMeter === undefined) throw new RangeError('Practice Document meter map is empty.');
  let active = firstMeter;
  for (let index = 0; index < document.meterMap.length; index += 1) {
    const entry = document.meterMap[index];
    if (entry === undefined) continue;
    const nextTick = document.meterMap[index + 1]?.tick ?? tick + 1;
    if (tick < nextTick) {
      active = entry;
      break;
    }
    const ticksPerBeat = (document.ppq * 4) / entry.denominator;
    const ticksPerBar = ticksPerBeat * entry.numerator;
    bar += Math.ceil((nextTick - entry.tick) / ticksPerBar);
  }
  const ticksPerBeat = (document.ppq * 4) / active.denominator;
  const ticksPerBar = ticksPerBeat * active.numerator;
  const offset = tick - active.tick;
  bar += Math.floor(offset / ticksPerBar);
  const withinBar = offset % ticksPerBar;
  const beat = Math.floor(withinBar / ticksPerBeat) + 1;
  const tickWithinBeat = withinBar % ticksPerBeat;
  return `bar ${String(bar)}, beat ${String(beat)}${tickWithinBeat === 0 ? '' : ` plus ${String(tickWithinBeat)} ticks`}`;
};

function focusTarget(
  documentId: string,
  kind: PracticeInspectionNodeKind,
  trackId: string | null = null,
  voiceId: string | null = null,
  eventId: string | null = null,
  noteId: string | null = null,
): PracticeSemanticFocusTarget {
  return { documentId, eventId, kind, noteId, trackId, voiceId };
}

function node(
  input: Omit<PracticeInspectionNode, 'children'> & {
    children?: readonly PracticeInspectionNode[];
  },
): PracticeInspectionNode {
  return { ...input, children: input.children ?? [] };
}

function eventNode(
  documentId: string,
  trackId: string,
  voiceId: string,
  event: PracticeVoiceEvent,
  eventIndex: number,
  parentRowId: string,
  location: string,
): PracticeInspectionNode {
  const eventRowId = inspectionRowId('event', trackId, voiceId, event.id);
  if (event.kind === 'rest') {
    return node({
      ariaLevel: 4,
      focusTarget: focusTarget(documentId, 'rest', trackId, voiceId, event.id),
      kind: 'rest',
      label: `Rest ${String(eventIndex + 1)}, ${location}, tick ${String(event.tick)}, duration ${String(event.durationTicks)} ticks${tupletLabel(event.tuplet)}`,
      parentRowId,
      rowId: eventRowId,
      semanticId: event.id,
    });
  }

  const children = event.notes.map((note, noteIndex) => {
    const semantics = note.semantics.map(noteSemanticLabel).join(', ');
    const semanticSuffix = semantics.length === 0 ? '' : `, techniques ${semantics}`;
    return node({
      ariaLevel: 5,
      focusTarget: focusTarget(documentId, 'note', trackId, voiceId, event.id, note.id),
      kind: 'note',
      label: `Note ${String(noteIndex + 1)}, ${note.writtenPitch.step}${accidentalLabel(note.writtenPitch.accidental)} ${String(note.writtenPitch.octave)}, string ${String(note.position.stringNumber)}, fret ${String(note.position.tabFret)}, sounding duration ${String(note.soundingDurationTicks)} ticks${semanticSuffix}`,
      parentRowId: eventRowId,
      rowId: inspectionRowId('note', trackId, voiceId, event.id, note.id),
      semanticId: note.id,
    });
  });
  return node({
    ariaLevel: 4,
    children,
    focusTarget: focusTarget(documentId, 'event', trackId, voiceId, event.id),
    kind: 'event',
    label: `Guitar event ${String(eventIndex + 1)}, ${location}, tick ${String(event.tick)}, duration ${String(eventDuration(event))} ticks${tupletLabel(event.tuplet)}, ${String(event.notes.length)} ${event.notes.length === 1 ? 'note' : 'notes'}${event.dynamic === undefined ? '' : `, dynamic ${event.dynamic.value}`}${event.articulations.length === 0 ? '' : `, articulations ${event.articulations.map(({ articulation }) => articulation).join(', ')}`}`,
    parentRowId,
    rowId: eventRowId,
    semanticId: event.id,
  });
}

function buildTree(document: PracticeDocument): PracticeInspectionNode {
  const documentId = document.revision.documentId;
  const documentRowId = inspectionRowId('document', documentId);
  const tracks = document.tracks.map((track, trackIndex) => {
    const trackRowId = inspectionRowId('track', track.id);
    const voices = track.voices.map((voice, voiceIndex) => {
      const voiceRowId = inspectionRowId('voice', track.id, voice.id);
      return node({
        ariaLevel: 3,
        children: voice.events.map((event, eventIndex) =>
          eventNode(
            documentId,
            track.id,
            voice.id,
            event,
            eventIndex,
            voiceRowId,
            musicalLocation(document, event.tick),
          ),
        ),
        focusTarget: focusTarget(documentId, 'voice', track.id, voice.id),
        kind: 'voice',
        label: voice.name ?? `Voice ${String(voiceIndex + 1)}`,
        parentRowId: trackRowId,
        rowId: voiceRowId,
        semanticId: voice.id,
      });
    });
    return node({
      ariaLevel: 2,
      children: voices,
      focusTarget: focusTarget(documentId, 'track', track.id),
      kind: 'track',
      label: `Track ${String(trackIndex + 1)}: ${track.name}`,
      parentRowId: documentRowId,
      rowId: trackRowId,
      semanticId: track.id,
    });
  });
  return node({
    ariaLevel: 1,
    children: tracks,
    focusTarget: focusTarget(documentId, 'document'),
    kind: 'document',
    label: `Score: ${document.metadata.title}`,
    parentRowId: null,
    rowId: documentRowId,
    semanticId: documentId,
  });
}

function flattenTree(root: PracticeInspectionNode): readonly PracticeInspectionRow[] {
  const nodes: PracticeInspectionNode[] = [];
  const visit = (current: PracticeInspectionNode): void => {
    nodes.push(current);
    current.children.forEach(visit);
  };
  visit(root);
  return nodes.map((current, navigationIndex) => ({
    ariaLevel: current.ariaLevel,
    focusTarget: current.focusTarget,
    kind: current.kind,
    label: current.label,
    navigationIndex,
    nextRowId: nodes[navigationIndex + 1]?.rowId ?? null,
    parentRowId: current.parentRowId,
    previousRowId: nodes[navigationIndex - 1]?.rowId ?? null,
    rowId: current.rowId,
    semanticId: current.semanticId,
  }));
}

/** Creates a semantic tree and depth-first keyboard order without renderer or layout state. */
export function inspectPracticeDocument(input: unknown): PracticeDocumentInspection {
  assertCanonicalJsonDataDomain(input);
  const document = PracticeDocumentSchema.parse(input);
  const tree = buildTree(document);
  return deepFreeze({ documentId: document.revision.documentId, rows: flattenTree(tree), tree });
}
