import { describe, expect, it } from 'vitest';

import { ChordEventSchema, CONTRACT_SCHEMA_VERSION, type PitchClass } from '../../shared';
import { buildAcousticChordBoundaryRegions } from './boundary-region-decoder';
import type { AcousticChordHop, ChordBoundaryEvidence } from './chord-observations';
import { matchChordTemplates, scoreChordTemplates } from './chords';
import { fuseAcousticHopAndModelChordEvents } from './note-sets';

const C_MAJOR = [0.34, 0, 0, 0, 0.33, 0, 0, 0.33, 0, 0, 0, 0];
const G_MAJOR = [0, 0, 0.3, 0, 0, 0, 0, 0.36, 0, 0, 0, 0.34];
const A_SUS4 = [0, 0, 0.33, 0, 0.33, 0, 0, 0, 0, 0.34, 0, 0];
const D_DOMINANT_7 = [0.24, 0, 0.28, 0, 0, 0, 0.24, 0, 0, 0.24, 0, 0];
const A_MINOR = [0.33, 0, 0, 0, 0.33, 0, 0, 0, 0, 0.34, 0, 0];

const boundary = (atMs: number): ChordBoundaryEvidence => ({
  atMs,
  attackStrength: 0.9,
  candidateMargin: 0.2,
  harmonicDistance: 0.6,
  mode: 'attack-change',
  novelToneStrength: 0.5,
  persistenceMs: 240,
  score: 0.8,
});

const hop = (
  values: readonly number[],
  sequence: number,
  startMs: number,
  boundaryBefore?: ChordBoundaryEvidence,
): AcousticChordHop => {
  const acoustic = { bass: values, energy: 0.1, values };
  const candidates = matchChordTemplates(acoustic, 8);
  const scores = scoreChordTemplates(acoustic);
  return {
    activityEnergy: 0.1,
    attack: {
      energyRiseDb: boundaryBefore === undefined ? 0 : 4,
      peakTimeMs: boundaryBefore?.atMs ?? null,
      percussiveRatio: 0,
      spectralFluxZ: boundaryBefore === undefined ? 0 : 8,
      strength: boundaryBefore?.attackStrength ?? 0,
    },
    ...(boundaryBefore === undefined ? {} : { boundaryBefore }),
    discontinuity: false,
    featureTimeMs: startMs + 80,
    harmony: {
      activationTotal: values.reduce((sum, value) => sum + value, 0),
      bassChroma: Float32Array.from(values),
      longChroma: Float32Array.from(values),
      pitchClassActivations: Float32Array.from(values),
      shortCandidates: candidates,
      shortChroma: Float32Array.from(values),
      shortTemplateScores: scores,
      templateScores: scores,
      topCandidates: candidates,
      trebleChroma: Float32Array.from(values),
      tuningCents: 0,
    },
    sequence,
    support: {
      endMs: startMs + 80,
      longStartMs: Math.max(0, startMs - 304),
      shortStartMs: startMs,
    },
    time: { endMs: startMs + 80, startMs },
  };
};

const provisionalSpan = (endMs = 800) =>
  ChordEventSchema.parse({
    candidates: matchChordTemplates({ bass: C_MAJOR, energy: 0.1, values: C_MAJOR }),
    diagnostics: {},
    id: 'merged-live-span',
    kind: 'chord',
    lifecycle: 'provisional',
    observedPitchClasses: C_MAJOR.flatMap((weight, index) =>
      weight <= 0
        ? []
        : [
            {
              pitchClass:
                (['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as PitchClass[])[
                  index
                ] ?? 'C',
              weight,
            },
          ],
    ),
    provenance: {
      algorithm: 'test',
      generatedAtMs: endMs,
      runId: 'per-hop-run',
      subsystem: 'polyphonic-analysis',
      version: 'test',
    },
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    time: { endMs, startMs: 0 },
  });

describe('per-hop finalized chord fusion', () => {
  it('can split two supported harmonies that were merged into one live acoustic span', () => {
    const hops = [
      ...Array.from({ length: 5 }, (_, index) => hop(C_MAJOR, index + 1, index * 80)),
      ...Array.from({ length: 5 }, (_, index) =>
        hop(G_MAJOR, index + 6, (index + 5) * 80, index === 0 ? boundary(400) : undefined),
      ),
    ];

    const finalized = fuseAcousticHopAndModelChordEvents(
      [],
      hops,
      [provisionalSpan()],
      'per-hop-run',
      'accurate',
    );

    expect(finalized.map((event) => event.candidates[0]?.symbol)).toEqual(['C', 'G']);
    expect(finalized[0]?.time.endMs).toBe(400);
    expect(finalized[1]).toMatchObject({
      diagnostics: { boundaryMode: 'attack-change' },
      lifecycle: 'finalized',
      time: { startMs: 400 },
    });
  });

  it('keeps repeated same-harmony hops in one finalized chord', () => {
    const hops = Array.from({ length: 10 }, (_, index) => hop(C_MAJOR, index + 1, index * 80));

    const finalized = fuseAcousticHopAndModelChordEvents(
      [],
      hops,
      [provisionalSpan()],
      'same-hop-run',
      'accurate',
    );

    expect(finalized).toHaveLength(1);
    expect(finalized[0]?.candidates[0]?.symbol).toBe('C');
    expect(finalized[0]?.diagnostics.sourceHopCount).toBe(10);
  });

  it('pools a partial attack into the confirmed post-boundary region instead of publishing it', () => {
    const hops = [
      ...Array.from({ length: 5 }, (_, index) => hop(C_MAJOR, index + 1, index * 80)),
      hop(A_SUS4, 6, 400),
      ...Array.from({ length: 6 }, (_, index) =>
        hop(G_MAJOR, index + 7, 480 + index * 80, index === 0 ? boundary(400) : undefined),
      ),
    ];

    const finalized = fuseAcousticHopAndModelChordEvents(
      [],
      hops,
      [provisionalSpan(960)],
      'partial-attack-run',
      'accurate',
    );

    expect(finalized.map((event) => event.candidates[0]?.symbol)).toEqual(['C', 'G']);
    expect(finalized.every((event) => event.candidates[0]?.symbol !== 'Asus4')).toBe(true);
  });

  it('merges a false live boundary when pooled harmony remains unchanged', () => {
    const hops = [
      ...Array.from({ length: 5 }, (_, index) => hop(C_MAJOR, index + 1, index * 80)),
      ...Array.from({ length: 5 }, (_, index) =>
        hop(C_MAJOR, index + 6, 400 + index * 80, index === 0 ? boundary(400) : undefined),
      ),
    ];

    const finalized = fuseAcousticHopAndModelChordEvents(
      [],
      hops,
      [provisionalSpan()],
      'false-boundary-run',
      'accurate',
    );

    expect(finalized).toHaveLength(1);
    expect(finalized[0]?.candidates[0]?.symbol).toBe('C');
  });

  it('adds a missed live boundary only after sustained acoustic replacement', () => {
    const hops = [
      ...Array.from({ length: 6 }, (_, index) => hop(C_MAJOR, index + 1, index * 80)),
      ...Array.from({ length: 6 }, (_, index) => hop(G_MAJOR, index + 7, 480 + index * 80)),
    ];

    const regions = buildAcousticChordBoundaryRegions(hops, [{ endMs: 960, startMs: 0 }]);
    const finalized = fuseAcousticHopAndModelChordEvents(
      [],
      hops,
      [provisionalSpan(960)],
      'missed-boundary-run',
      'accurate',
    );

    expect(regions).toHaveLength(2);
    expect(regions[1]?.boundaryBefore?.mode).toBe('persistent-change');
    expect(finalized.map((event) => event.candidates[0]?.symbol)).toEqual(['C', 'G']);
  });

  it('does not create a region for a same-chord attack or a short-lived challenger', () => {
    const hops = [
      ...Array.from({ length: 4 }, (_, index) => hop(C_MAJOR, index + 1, index * 80)),
      hop(A_SUS4, 5, 320),
      ...Array.from({ length: 5 }, (_, index) => hop(C_MAJOR, index + 6, 400 + index * 80)),
    ];
    const sameChordAttack = hops[1];
    if (sameChordAttack !== undefined) {
      hops[1] = {
        ...sameChordAttack,
        attack: {
          energyRiseDb: 4,
          peakTimeMs: 100,
          percussiveRatio: 0.8,
          spectralFluxZ: 8,
          strength: 0.9,
        },
      };
    }

    const regions = buildAcousticChordBoundaryRegions(hops, [{ endMs: 800, startMs: 0 }]);

    expect(regions).toHaveLength(1);
    expect(regions[0]?.candidates[0]?.symbol).toBe('C');
  });

  it('does not infer an attack-free chord boundary from a decaying replacement hypothesis', () => {
    const stable = Array.from({ length: 6 }, (_, index) => hop(C_MAJOR, index + 1, index * 80));
    const decaying = Array.from({ length: 6 }, (_, index) => ({
      ...hop(G_MAJOR, index + 7, 480 + index * 80),
      activityEnergy: 0.05 - index * 0.004,
    }));

    const regions = buildAcousticChordBoundaryRegions(
      [...stable, ...decaying],
      [{ endMs: 960, startMs: 0 }],
    );

    expect(regions).toHaveLength(1);
  });

  it('resets missed-boundary inference at a confirmed boundary', () => {
    const firstChord = Array.from({ length: 6 }, (_, index) => hop(C_MAJOR, index + 1, index * 80));
    const establishedChord = Array.from({ length: 3 }, (_, index) =>
      hop(D_DOMINANT_7, index + 7, 480 + index * 80, index === 0 ? boundary(480) : undefined),
    );
    const decayHypothesis = Array.from({ length: 6 }, (_, index) => ({
      ...hop(A_MINOR, index + 10, 720 + index * 80),
      activityEnergy: 0.09 - index * 0.004,
    }));

    const regions = buildAcousticChordBoundaryRegions(
      [...firstChord, ...establishedChord, ...decayHypothesis],
      [{ endMs: 1_200, startMs: 0 }],
    );

    expect(regions).toHaveLength(2);
    expect(regions[1]?.boundaryBefore?.mode).toBe('attack-change');
  });
});
