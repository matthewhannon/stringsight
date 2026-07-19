export type RankedName = {
  readonly name: string;
  readonly score: number;
};

export type InterpretationSummary = {
  readonly ambiguous: boolean;
  readonly value: string;
};

export const AMBIGUOUS_INTERPRETATION_SCORE_MARGIN = 0.075;

export function summarizeInterpretations(
  interpretations: readonly RankedName[],
): InterpretationSummary {
  const first = interpretations[0];
  if (first === undefined) return { ambiguous: false, value: 'UNRESOLVED' };
  const second = interpretations[1];
  const ambiguous =
    second !== undefined &&
    Math.abs(first.score - second.score) <= AMBIGUOUS_INTERPRETATION_SCORE_MARGIN;
  return {
    ambiguous,
    value: (ambiguous ? `${first.name} / ${second.name}` : first.name).toUpperCase(),
  };
}
