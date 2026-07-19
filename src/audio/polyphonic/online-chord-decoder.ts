import type { ChordCandidate } from '../../shared';
import { computeChordBoundaryEvidence, type BoundaryEvidenceOptions } from './boundary-evidence';
import {
  CHORD_ATTACK_EVIDENCE_THRESHOLD,
  type AcousticChordHop,
  type ChordBoundaryEvidence,
} from './chord-observations';
import type { ChordAnalysisProfile } from './contracts';

export type OnlineChordDecoderState =
  'change-pending' | 'establishing' | 'idle' | 'release-pending' | 'stable';

export type OnlineChordDecision = {
  readonly action: 'change' | 'close' | 'extend' | 'none' | 'start';
  readonly boundary?: ChordBoundaryEvidence;
  readonly candidates?: readonly ChordCandidate[];
  readonly eventStartMs?: number;
  readonly state: OnlineChordDecoderState;
};

type ActivityState = 'active' | 'holding' | 'inactive';

type ProfileConfiguration = {
  readonly attackConfirmationHops: number;
  readonly attackFreeConfirmationHops: number;
  readonly minimumCandidateConfidence: number;
  readonly minimumCandidateScore: number;
  readonly minimumScoreMargin: number;
  readonly postAttackWaitMs: number;
  readonly startupConfirmationHops: number;
};

const PROFILE_CONFIGURATION: Record<ChordAnalysisProfile, ProfileConfiguration> = {
  accurate: {
    attackConfirmationHops: 3,
    attackFreeConfirmationHops: 6,
    minimumCandidateConfidence: 0.3,
    minimumCandidateScore: 0.58,
    minimumScoreMargin: 0.04,
    postAttackWaitMs: 160,
    startupConfirmationHops: 2,
  },
  responsive: {
    attackConfirmationHops: 2,
    attackFreeConfirmationHops: 4,
    minimumCandidateConfidence: 0.3,
    minimumCandidateScore: 0.58,
    minimumScoreMargin: 0.025,
    postAttackWaitMs: 120,
    startupConfirmationHops: 2,
  },
};

const RECENT_ATTACK_RETENTION_MS = 600;

export class OnlineChordDecoder {
  private acceptedSymbol: string | null = null;
  private challengerCount = 0;
  private challengerSinceMs = 0;
  private challengerSymbol: string | null = null;
  private configuration: ProfileConfiguration;
  private establishingCandidates: readonly ChordCandidate[] | null = null;
  private establishingCount = 0;
  private establishingSinceMs = 0;
  private recentAttack: AcousticChordHop['attack'] | null = null;
  private reference: AcousticChordHop | null = null;
  private state: OnlineChordDecoderState = 'idle';

  constructor(profile: ChordAnalysisProfile = 'accurate') {
    this.configuration = PROFILE_CONFIGURATION[profile];
  }

  setProfile(profile: ChordAnalysisProfile): void {
    this.configuration = PROFILE_CONFIGURATION[profile];
    this.clearChallenger();
    this.clearEstablishing();
  }

  reset(): void {
    this.acceptedSymbol = null;
    this.clearChallenger();
    this.clearEstablishing();
    this.recentAttack = null;
    this.reference = null;
    this.state = 'idle';
  }

  push(
    observation: AcousticChordHop,
    activity: ActivityState,
    timing: {
      activityStartMs: number;
      changeActivitySupported: boolean;
      releaseAtMs: number;
    },
  ): OnlineChordDecision {
    this.updateRecentAttack(observation);
    if (activity === 'inactive') {
      const hadAcceptedChord = this.acceptedSymbol !== null;
      this.reset();
      return {
        action: hadAcceptedChord ? 'close' : 'none',
        ...(hadAcceptedChord ? { eventStartMs: timing.releaseAtMs } : {}),
        state: 'idle',
      };
    }
    if (activity === 'holding') {
      this.state = this.acceptedSymbol === null ? 'establishing' : 'release-pending';
      return {
        action: this.acceptedSymbol === null ? 'none' : 'extend',
        state: this.state,
      };
    }

    const identityCandidates = observation.harmony.topCandidates;
    const changeCandidates = observation.harmony.shortCandidates ?? identityCandidates;
    const candidates = this.acceptedSymbol === null ? identityCandidates : changeCandidates;
    const best = candidates[0];
    if (!this.isUsable(best)) {
      this.state = this.acceptedSymbol === null ? 'establishing' : 'stable';
      return {
        action: this.acceptedSymbol === null ? 'none' : 'extend',
        state: this.state,
      };
    }

    if (this.acceptedSymbol === null || this.reference === null) {
      return this.establish(observation, candidates, timing.activityStartMs);
    }

    if (best.symbol === this.acceptedSymbol) {
      this.clearChallenger();
      if (observation.attack.strength < CHORD_ATTACK_EVIDENCE_THRESHOLD) {
        this.reference = observation;
      }
      this.state = 'stable';
      return { action: 'extend', candidates, state: this.state };
    }

    if (!timing.changeActivitySupported) {
      this.clearChallenger();
      this.state = 'stable';
      return { action: 'extend', state: this.state };
    }

    if (this.challengerSymbol === best.symbol) {
      this.challengerCount += 1;
    } else {
      this.challengerSymbol = best.symbol;
      this.challengerCount = 1;
      this.challengerSinceMs = observation.featureTimeMs;
    }
    this.state = 'change-pending';
    const hopDurationMs = Math.max(1, observation.time.endMs - observation.time.startMs);
    const persistenceMs = Math.max(
      hopDurationMs,
      observation.featureTimeMs - this.challengerSinceMs + hopDurationMs,
    );
    const evidenceObservation = this.withRecentAttack(observation);
    const boundaryOptions: BoundaryEvidenceOptions = {
      persistentChangeMs:
        this.configuration.attackFreeConfirmationHops *
        Math.max(1, observation.time.endMs - observation.time.startMs),
    };
    const rawBoundary = computeChordBoundaryEvidence(
      this.reference,
      evidenceObservation,
      persistenceMs,
      boundaryOptions,
    );
    const boundary: ChordBoundaryEvidence = {
      ...rawBoundary,
      atMs: rawBoundary.mode === 'attack-change' ? rawBoundary.atMs : this.challengerSinceMs,
    };
    const attacked = boundary.mode === 'attack-change';
    const confirmationHops = attacked
      ? this.configuration.attackConfirmationHops
      : this.configuration.attackFreeConfirmationHops;
    const attackTime = evidenceObservation.attack.peakTimeMs;
    const postAttackReady =
      !attacked ||
      attackTime === null ||
      observation.featureTimeMs - attackTime >= this.configuration.postAttackWaitMs;
    const confirmed =
      boundary.mode !== 'none' &&
      boundary.candidateMargin >= this.configuration.minimumScoreMargin &&
      this.challengerCount >= confirmationHops &&
      postAttackReady;
    if (!confirmed) return { action: 'extend', boundary, state: this.state };

    this.acceptedSymbol = best.symbol;
    this.reference = observation;
    this.clearChallenger();
    this.clearEstablishing();
    this.state = 'stable';
    return {
      action: 'change',
      boundary,
      candidates,
      eventStartMs: boundary.atMs,
      state: this.state,
    };
  }

  private clearChallenger(): void {
    this.challengerCount = 0;
    this.challengerSinceMs = 0;
    this.challengerSymbol = null;
  }

  private clearEstablishing(): void {
    this.establishingCandidates = null;
    this.establishingCount = 0;
    this.establishingSinceMs = 0;
  }

  private establish(
    observation: AcousticChordHop,
    candidates: readonly ChordCandidate[],
    activityStartMs: number,
  ): OnlineChordDecision {
    const best = candidates[0];
    if (best === undefined) return { action: 'none', state: 'establishing' };
    if (this.establishingCandidates?.[0]?.symbol === best.symbol) {
      this.establishingCount += 1;
      this.establishingCandidates = candidates;
    } else {
      this.establishingCandidates = candidates;
      this.establishingCount = 1;
      this.establishingSinceMs =
        (this.recentAttack?.peakTimeMs ?? activityStartMs) || observation.time.startMs;
    }
    this.state = 'establishing';
    if (this.establishingCount < this.configuration.startupConfirmationHops) {
      return { action: 'none', state: this.state };
    }
    this.acceptedSymbol = best.symbol;
    this.reference = observation;
    this.state = 'stable';
    const eventStartMs = this.establishingSinceMs;
    this.clearEstablishing();
    return { action: 'start', candidates, eventStartMs, state: this.state };
  }

  private isUsable(candidate: ChordCandidate | undefined): candidate is ChordCandidate {
    return (
      candidate !== undefined &&
      candidate.confidence >= this.configuration.minimumCandidateConfidence &&
      candidate.score >= this.configuration.minimumCandidateScore
    );
  }

  private updateRecentAttack(observation: AcousticChordHop): void {
    if (
      this.recentAttack?.peakTimeMs !== null &&
      this.recentAttack?.peakTimeMs !== undefined &&
      observation.featureTimeMs - this.recentAttack.peakTimeMs > RECENT_ATTACK_RETENTION_MS
    ) {
      this.recentAttack = null;
    }
    if (
      observation.attack.strength >= CHORD_ATTACK_EVIDENCE_THRESHOLD &&
      observation.attack.peakTimeMs !== null &&
      (this.recentAttack === null || observation.attack.strength >= this.recentAttack.strength)
    ) {
      this.recentAttack = observation.attack;
    }
  }

  private withRecentAttack(observation: AcousticChordHop): AcousticChordHop {
    const recentAttack = this.recentAttack;
    if (
      observation.attack.strength >= CHORD_ATTACK_EVIDENCE_THRESHOLD ||
      recentAttack?.peakTimeMs === null ||
      recentAttack?.peakTimeMs === undefined
    ) {
      return observation;
    }
    return { ...observation, attack: recentAttack };
  }
}
