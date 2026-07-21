import type {
  NotationInvalidation,
  NotationPresentation,
  NotationRenderFingerprint,
} from './contract';

const encode = (value: string): string => `${String(value.length)}:${value}`;

export function semanticFocusKey(
  focus: Readonly<{
    eventId?: string;
    kind: string;
    noteId?: string;
    trackId?: string;
    voiceId?: string;
  }> | null,
): string {
  if (focus === null) return 'none';
  return [
    focus.kind,
    focus.trackId ?? '',
    focus.voiceId ?? '',
    focus.eventId ?? '',
    focus.noteId ?? '',
  ]
    .map(encode)
    .join('|');
}

export function notationPresentationKey(presentation: Required<NotationPresentation>): string {
  return [
    presentation.view.flow,
    presentation.view.score,
    presentation.viewportHeight,
    presentation.viewportWidth,
    presentation.zoomPercent,
    presentation.targetBarsPerSystem,
  ].join('|');
}

export function determineNotationInvalidation(
  previous: NotationRenderFingerprint | null,
  next: NotationRenderFingerprint,
): NotationInvalidation {
  if (previous === null) {
    return Object.freeze({ kind: 'initial', reasons: ['initial-render'] as const });
  }
  if (previous.adapterId !== next.adapterId || previous.adapterVersion !== next.adapterVersion) {
    return Object.freeze({ kind: 'content', reasons: ['adapter-changed'] as const });
  }
  if (
    previous.documentId !== next.documentId ||
    previous.documentContentDigest !== next.documentContentDigest
  ) {
    return Object.freeze({ kind: 'content', reasons: ['document-changed'] as const });
  }
  if (previous.presentationKey !== next.presentationKey) {
    return Object.freeze({ kind: 'layout', reasons: ['presentation-changed'] as const });
  }
  if (previous.focusKey !== next.focusKey) {
    return Object.freeze({ kind: 'focus', reasons: ['focus-changed'] as const });
  }
  return Object.freeze({ kind: 'none', reasons: [] });
}
