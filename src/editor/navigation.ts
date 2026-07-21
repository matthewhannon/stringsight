import type { SemanticFocus, SemanticPosition } from './history';
import type {
  PracticeDocumentInspection,
  PracticeInspectionRow,
  PracticeSemanticFocusTarget,
} from './inspection';

export type PracticeInspectionNavigationIntent =
  'first' | 'first-child' | 'last' | 'next' | 'parent' | 'previous';

export type PracticeInspectionNavigationKey =
  'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'End' | 'Home';

const rowById = (
  inspection: PracticeDocumentInspection,
  rowId: string | null,
): PracticeInspectionRow | null =>
  rowId === null ? null : (inspection.rows.find((row) => row.rowId === rowId) ?? null);

const requiredTargetId = (value: string | null, label: string): string => {
  if (value === null) throw new RangeError(`Inspection ${label} is required for this focus kind.`);
  return value;
};

/** Maps ordinary tree keyboard keys to semantic navigation without consulting renderer geometry. */
export function practiceInspectionIntentForKey(
  key: string,
): PracticeInspectionNavigationIntent | null {
  const intents: Readonly<
    Record<PracticeInspectionNavigationKey, PracticeInspectionNavigationIntent>
  > = {
    ArrowDown: 'next',
    ArrowLeft: 'parent',
    ArrowRight: 'first-child',
    ArrowUp: 'previous',
    End: 'last',
    Home: 'first',
  };
  return Object.hasOwn(intents, key) ? intents[key as PracticeInspectionNavigationKey] : null;
}

/** Resolves the next semantic tree row for keyboard focus. Unknown rows safely restart at root. */
export function navigatePracticeInspection(
  inspection: PracticeDocumentInspection,
  currentRowId: string | null,
  intent: PracticeInspectionNavigationIntent,
): PracticeInspectionRow | null {
  const first = inspection.rows[0] ?? null;
  if (intent === 'first') return first;
  if (intent === 'last') return inspection.rows.at(-1) ?? null;

  const current = rowById(inspection, currentRowId);
  if (current === null) return first;
  if (intent === 'next') return rowById(inspection, current.nextRowId) ?? current;
  if (intent === 'previous') return rowById(inspection, current.previousRowId) ?? current;
  if (intent === 'parent') return rowById(inspection, current.parentRowId) ?? current;

  return inspection.rows.find((row) => row.parentRowId === current.rowId) ?? current;
}

/** Converts inspection focus into the editor's stable semantic focus vocabulary. */
export function editorFocusFromInspectionTarget(
  target: PracticeSemanticFocusTarget,
): SemanticFocus {
  if (target.kind === 'document') return { kind: 'document' };
  if (target.kind === 'track') {
    return { kind: 'track', trackId: requiredTargetId(target.trackId, 'trackId') };
  }
  if (target.kind === 'voice') {
    return {
      kind: 'voice',
      trackId: requiredTargetId(target.trackId, 'trackId'),
      voiceId: requiredTargetId(target.voiceId, 'voiceId'),
    };
  }
  if (target.kind === 'note') {
    return {
      eventId: requiredTargetId(target.eventId, 'eventId'),
      kind: 'note',
      noteId: requiredTargetId(target.noteId, 'noteId'),
      trackId: requiredTargetId(target.trackId, 'trackId'),
      voiceId: requiredTargetId(target.voiceId, 'voiceId'),
    };
  }
  return {
    eventId: requiredTargetId(target.eventId, 'eventId'),
    kind: 'event',
    trackId: requiredTargetId(target.trackId, 'trackId'),
    voiceId: requiredTargetId(target.voiceId, 'voiceId'),
  };
}

/** Returns a caret-capable position for event, rest, or note rows. */
export function editorPositionFromInspectionTarget(
  target: PracticeSemanticFocusTarget,
): SemanticPosition | null {
  if (target.eventId === null || target.trackId === null || target.voiceId === null) return null;
  return {
    eventId: target.eventId,
    noteId: target.noteId,
    trackId: target.trackId,
    voiceId: target.voiceId,
  };
}
