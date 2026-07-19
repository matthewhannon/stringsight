import { describe, expect, it } from 'vitest';

import { confidence, type ChordCandidate, type ChordQuality, type PitchClass } from '../../shared';
import { decodeChordSequence, type ChordObservation } from './temporal-decoder';

const candidate = (
  symbol: string,
  score: number,
  quality: ChordQuality = 'major',
): ChordCandidate => ({
  confidence: confidence(0.7),
  pitchClasses: ['G', 'B', 'D'],
  quality,
  rank: 1,
  root: symbol.startsWith('E') ? 'E' : ((symbol[0] ?? 'G') as PitchClass),
  score,
  symbol,
});

const observation = (
  index: number,
  scores: { Em7: number; G: number; G7: number; Gmaj7: number },
): ChordObservation => ({
  candidates: [
    candidate('G', scores.G),
    candidate('G7', scores.G7, 'dominant-7'),
    candidate('Gmaj7', scores.Gmaj7, 'major-7'),
    candidate('Em7', scores.Em7, 'minor-7'),
  ],
  endMs: (index + 1) * 100,
  evidenceConfidence: 0.55,
  startMs: index * 100,
});

describe('temporal chord decoding', () => {
  it('handles empty and disjoint candidate observations without inventing candidates', () => {
    expect(decodeChordSequence([])).toEqual([]);
    expect(decodeChordSequence([{ candidates: [], endMs: 100, startMs: 0 }])).toEqual([]);

    const disjoint = decodeChordSequence([
      { candidates: [candidate('G', 0.9)], endMs: 100, startMs: 0 },
      { candidates: [candidate('C', 0.9)], endMs: 200, startMs: 100 },
    ]);
    expect(disjoint.map(({ selected }) => selected.symbol)).toEqual(['G', 'C']);
  });

  it('collapses alternating weak seventh and relative-minor evidence into one held G', () => {
    const sequence = Array.from({ length: 20 }, (_, index) =>
      observation(index, {
        Em7: index % 5 === 4 ? 0.99 : 0.7,
        G: 0.93,
        G7: index % 2 === 0 ? 0.99 : 0.73,
        Gmaj7: index % 2 === 1 ? 0.99 : 0.73,
      }),
    );

    expect(
      decodeChordSequence(sequence, 'accurate').map(({ selected }) => selected.symbol),
    ).toEqual(Array.from({ length: sequence.length }, () => 'G'));
  });

  it('keeps a sustained real chord change while allowing the responsive profile to follow a short change', () => {
    const stableChange = Array.from({ length: 16 }, (_, index) => ({
      candidates: [
        candidate('G', index < 8 ? 0.99 : 0.55),
        candidate('C', index < 8 ? 0.55 : 0.99),
      ],
      endMs: (index + 1) * 100,
      evidenceConfidence: 0.9,
      startMs: index * 100,
    }));
    const accurate = decodeChordSequence(stableChange, 'accurate').map(
      ({ selected }) => selected.symbol,
    );
    expect(accurate.slice(0, 8)).toEqual(Array.from({ length: 8 }, () => 'G'));
    expect(accurate.slice(8)).toEqual(Array.from({ length: 8 }, () => 'C'));

    const shortChange = stableChange.slice(0, 5).map((item, index) => ({
      ...item,
      candidates: [
        candidate('G', index === 2 || index === 3 ? 0.55 : 0.99),
        candidate('C', index === 2 || index === 3 ? 0.99 : 0.55),
      ],
    }));
    expect(
      decodeChordSequence(shortChange, 'accurate').map(({ selected }) => selected.symbol),
    ).toEqual(Array.from({ length: 5 }, () => 'G'));
    expect(
      decodeChordSequence(shortChange, 'responsive')
        .slice(2, 4)
        .map(({ selected }) => selected.symbol),
    ).toEqual(['C', 'C']);
  });

  it('does not swallow a long stable middle chord between repeated neighbors', () => {
    const sequence = [
      {
        candidates: [candidate('G', 0.93), candidate('C', 0.7)],
        endMs: 1_500,
        startMs: 0,
      },
      {
        candidates: [candidate('C', 0.85), candidate('G', 0.74)],
        endMs: 3_000,
        startMs: 1_500,
      },
      {
        candidates: [candidate('G', 0.93), candidate('C', 0.7)],
        endMs: 4_500,
        startMs: 3_000,
      },
    ];

    expect(
      decodeChordSequence(sequence, 'accurate').map(({ selected }) => selected.symbol),
    ).toEqual(['G', 'C', 'G']);
  });
});
