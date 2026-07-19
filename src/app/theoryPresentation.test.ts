import { describe, expect, it } from 'vitest';

import { summarizeInterpretations } from './theoryPresentation';

describe('theory interpretation presentation', () => {
  it('shows close key candidates as ambiguous instead of asserting a winner', () => {
    expect(
      summarizeInterpretations([
        { name: 'D major', score: 0.899 },
        { name: 'G major', score: 0.889 },
      ]),
    ).toEqual({ ambiguous: true, value: 'D MAJOR / G MAJOR' });
  });

  it('shows one result when its score is materially ahead', () => {
    expect(
      summarizeInterpretations([
        { name: 'C major', score: 0.94 },
        { name: 'F major', score: 0.8 },
      ]),
    ).toEqual({ ambiguous: false, value: 'C MAJOR' });
    expect(summarizeInterpretations([])).toEqual({
      ambiguous: false,
      value: 'UNRESOLVED',
    });
  });
});
