import { describe, expect, it } from 'vitest';

import type { AcousticChordHop } from './chord-observations';
import { matchChordTemplates, scoreChordTemplates } from './chords';
import { OnlineChordDecoder } from './online-chord-decoder';

const C_MAJOR = [0.34, 0, 0, 0, 0.33, 0, 0, 0.33, 0, 0, 0, 0];
const G_MAJOR = [0, 0, 0.3, 0, 0, 0, 0, 0.36, 0, 0, 0, 0.34];

const hop = (
  values: readonly number[],
  sequence: number,
  endMs: number,
  attack = 0,
): AcousticChordHop => {
  const observation = { bass: values, energy: 0.1, values };
  return {
    activityEnergy: 0.1,
    attack: {
      energyRiseDb: attack > 0 ? 4 : 0,
      peakTimeMs: attack > 0 ? endMs - 40 : null,
      percussiveRatio: attack,
      spectralFluxZ: attack > 0 ? 8 : 0,
      strength: attack,
    },
    discontinuity: false,
    featureTimeMs: endMs,
    harmony: {
      activationTotal: values.reduce((sum, value) => sum + value, 0),
      bassChroma: Float32Array.from(values),
      longChroma: Float32Array.from(values),
      pitchClassActivations: Float32Array.from(values),
      shortChroma: Float32Array.from(values),
      templateScores: scoreChordTemplates(observation),
      topCandidates: matchChordTemplates(observation),
      trebleChroma: Float32Array.from(values),
      tuningCents: 0,
    },
    sequence,
    support: { endMs, longStartMs: endMs - 384, shortStartMs: endMs - 320 },
    time: { endMs, startMs: endMs - 80 },
  };
};

const activeTiming = { activityStartMs: 0, changeActivitySupported: true, releaseAtMs: 0 };

describe('online chord decoder', () => {
  it('establishes a chord and keeps same-chord re-strums in the same span', () => {
    const decoder = new OnlineChordDecoder('responsive');

    expect(decoder.push(hop(C_MAJOR, 1, 400), 'active', activeTiming).action).toBe('none');
    expect(decoder.push(hop(C_MAJOR, 2, 480), 'active', activeTiming)).toMatchObject({
      action: 'start',
      state: 'stable',
    });
    expect(decoder.push(hop(C_MAJOR, 3, 560, 0.9), 'active', activeTiming)).toMatchObject({
      action: 'extend',
      state: 'stable',
    });
  });

  it('confirms an attacked harmonic change but backdates it to the attack', () => {
    const decoder = new OnlineChordDecoder('responsive');
    decoder.push(hop(C_MAJOR, 1, 400), 'active', activeTiming);
    decoder.push(hop(C_MAJOR, 2, 480), 'active', activeTiming);

    expect(decoder.push(hop(G_MAJOR, 3, 800, 0.9), 'active', activeTiming).action).toBe('extend');
    const changed = decoder.push(hop(G_MAJOR, 4, 960), 'active', activeTiming);

    expect(changed).toMatchObject({ action: 'change', state: 'stable' });
    expect(changed.eventStartMs).toBe(760);
    expect(changed.boundary?.mode).toBe('attack-change');
  });

  it('requires longer confirmation for a persistent attack-free change', () => {
    const decoder = new OnlineChordDecoder('responsive');
    decoder.push(hop(C_MAJOR, 1, 400), 'active', activeTiming);
    decoder.push(hop(C_MAJOR, 2, 480), 'active', activeTiming);

    expect(decoder.push(hop(G_MAJOR, 3, 800), 'active', activeTiming).action).toBe('extend');
    expect(decoder.push(hop(G_MAJOR, 4, 880), 'active', activeTiming).action).toBe('extend');
    expect(decoder.push(hop(G_MAJOR, 5, 960), 'active', activeTiming).action).toBe('extend');
    const changed = decoder.push(hop(G_MAJOR, 6, 1_040), 'active', activeTiming);

    expect(changed).toMatchObject({ action: 'change', eventStartMs: 800 });
    expect(changed.boundary?.mode).toBe('persistent-change');
  });

  it('does not split for an attack without harmonic change and closes only after release', () => {
    const decoder = new OnlineChordDecoder('responsive');
    decoder.push(hop(C_MAJOR, 1, 400), 'active', activeTiming);
    decoder.push(hop(C_MAJOR, 2, 480), 'active', activeTiming);

    expect(decoder.push(hop(C_MAJOR, 3, 560, 0.8), 'active', activeTiming).action).toBe('extend');
    expect(
      decoder.push(hop(C_MAJOR, 4, 640), 'holding', {
        activityStartMs: 0,
        changeActivitySupported: false,
        releaseAtMs: 620,
      }),
    ).toMatchObject({ action: 'extend', state: 'release-pending' });
    expect(
      decoder.push(hop(C_MAJOR, 5, 720), 'inactive', {
        activityStartMs: 0,
        changeActivitySupported: false,
        releaseAtMs: 620,
      }),
    ).toMatchObject({ action: 'close', eventStartMs: 620, state: 'idle' });
  });
});
