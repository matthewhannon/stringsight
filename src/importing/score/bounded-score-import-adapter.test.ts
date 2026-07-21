import { describe, expect, it } from 'vitest';

import { verifyPracticeImportReviewBundle } from '../../shared/practice-import-integrity';
import gp5Base64 from './__fixtures__/gp5-effects.gp5.base64?raw';
import gp7Base64 from './__fixtures__/gp7-effects.gp.base64?raw';
import gp8Base64 from './__fixtures__/gp8-basic.gp.base64?raw';
import musicXmlD4 from './__fixtures__/musicxml-d4-supported.xml?raw';
import musicXmlLoss from './__fixtures__/musicxml-explicit-loss.xml?raw';
import {
  BOUNDED_SCORE_IMPORT_FIXTURES,
  BOUNDED_SCORE_PARSER_EXECUTION_PROFILE,
  PINNED_ALPHATAB_VERSION,
  importBoundedScore,
  type BoundedScoreFixtureId,
} from './bounded-score-import-adapter';

function decodeBase64(source: string): Uint8Array {
  const binary = atob(source.replaceAll(/\s/gu, ''));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function utf8(source: string): Uint8Array {
  return new TextEncoder().encode(source);
}

const importedAt = '2026-07-20T12:00:00Z';

function fixtureBytes(id: BoundedScoreFixtureId): Uint8Array {
  switch (id) {
    case 'gp5-effects':
      return decodeBase64(gp5Base64);
    case 'gp7-effects':
      return decodeBase64(gp7Base64);
    case 'gp8-basic':
      return decodeBase64(gp8Base64);
    case 'musicxml-d4-supported':
      return utf8(musicXmlD4.replaceAll('\r\n', '\n').replace(/\n\n$/u, '\n'));
    case 'musicxml-explicit-loss':
      return utf8(musicXmlLoss.replaceAll('\r\n', '\n').replace(/\n\n$/u, '\n'));
  }
}

function fileName(id: BoundedScoreFixtureId): string {
  if (id === 'gp5-effects') return 'effects.gp5';
  if (id === 'gp7-effects' || id === 'gp8-basic') return `${id}.gp`;
  return `${id}.musicxml`;
}

describe('bounded lazy score import adapter', () => {
  it('pins the exact fixture hashes and does not advertise rejected or parsing-only routes', () => {
    expect(PINNED_ALPHATAB_VERSION).toBe('1.8.4');
    expect(BOUNDED_SCORE_PARSER_EXECUTION_PROFILE).toMatchObject({
      exactFileParserStage:
        'ScoreLoader.loadScoreFromBytes is synchronous and elapsed time is checked immediately before and after it',
      interruptible: false,
      wallClockEnforcement: 'pre-and-post-stage',
    });
    expect(Object.isFrozen(BOUNDED_SCORE_IMPORT_FIXTURES)).toBe(true);
    expect(BOUNDED_SCORE_IMPORT_FIXTURES).toMatchObject({
      'gp5-effects': { advertised: false, status: 'approximate' },
      'gp7-effects': { advertised: false, status: 'rejected' },
      'gp8-basic': { advertised: true, status: 'supported' },
      'musicxml-d4-supported': { advertised: false, status: 'rejected' },
      'musicxml-explicit-loss': { advertised: false, status: 'rejected' },
    });
    expect(
      Object.values(BOUNDED_SCORE_IMPORT_FIXTURES).every(({ sha256Hex }) =>
        /^[0-9a-f]{64}$/u.test(sha256Hex),
      ),
    ).toBe(true);
  });

  it('parses the exact GP8 fixture lazily into an integrity-verified four-row draft', async () => {
    const result = await importBoundedScore({
      bytes: fixtureBytes('gp8-basic'),
      fileName: fileName('gp8-basic'),
      fixtureId: 'gp8-basic',
      importedAt,
      title: 'GP8 basic',
    });
    expect(result).toMatchObject({
      currentDocumentPreserved: true,
      parserInvoked: true,
      parserSummary: {
        masterBarCount: 1,
        noteCount: 4,
        playerEnabled: false,
        soundFont: null,
        trackCount: 1,
      },
      status: 'reviewable',
    });
    expect(result.report).toMatchObject({
      outcome: 'reviewable',
      reportAction: 'review-losses',
      route: 'gp8-basic-fixture-v1',
      source: { sha256Hex: BOUNDED_SCORE_IMPORT_FIXTURES['gp8-basic'].sha256Hex },
    });
    expect(result.report?.findings.map(({ code, disposition }) => ({ code, disposition }))).toEqual(
      [
        { code: 'import.gp8-basic.fixture-backed', disposition: 'preserved' },
        { code: 'import.non-native.lossless-roundtrip-unavailable', disposition: 'unsupported' },
      ],
    );
    expect(result.draft).not.toBeNull();
    if (result.draft === null || result.report === null) throw new Error('Expected review bundle.');
    await expect(
      verifyPracticeImportReviewBundle({
        bundleVersion: 1,
        draft: result.draft,
        report: result.report,
      }),
    ).resolves.toBeDefined();
    expect(
      result.draft.candidateDocument.tracks[0]?.voices[0]?.events.map((event) =>
        event.kind === 'guitar-event'
          ? {
              durationTicks: event.notatedDurationTicks,
              position: event.notes[0]?.position,
              tick: event.tick,
              writtenPitch: event.notes[0]?.writtenPitch,
            }
          : null,
      ),
    ).toEqual([
      {
        durationTicks: 960,
        position: { stringNumber: 2, tabFret: 1 },
        tick: 0,
        writtenPitch: { accidental: 0, octave: 4, step: 'C' },
      },
      {
        durationTicks: 960,
        position: { stringNumber: 2, tabFret: 2 },
        tick: 960,
        writtenPitch: { accidental: 1, octave: 4, step: 'C' },
      },
      {
        durationTicks: 960,
        position: { stringNumber: 2, tabFret: 3 },
        tick: 1920,
        writtenPitch: { accidental: 0, octave: 4, step: 'D' },
      },
      {
        durationTicks: 960,
        position: { stringNumber: 2, tabFret: 4 },
        tick: 2880,
        writtenPitch: { accidental: 1, octave: 4, step: 'D' },
      },
    ]);
    expect(result.semanticDispositions.map(({ disposition }) => disposition)).toEqual([
      'preserved',
      'unsupported',
    ]);
    const repeated = await importBoundedScore({
      bytes: fixtureBytes('gp8-basic'),
      clock: { now: () => 0 },
      fileName: fileName('gp8-basic'),
      fixtureId: 'gp8-basic',
      importedAt,
      title: 'GP8 basic',
    });
    const deterministicFirst = await importBoundedScore({
      bytes: fixtureBytes('gp8-basic'),
      clock: { now: () => 0 },
      fileName: fileName('gp8-basic'),
      fixtureId: 'gp8-basic',
      importedAt,
      title: 'GP8 basic',
    });
    expect(deterministicFirst).toEqual(repeated);
  });

  it.each([
    {
      code: 'import.gp5-effects.parsing-only-approximate',
      disposition: 'approximated',
      id: 'gp5-effects' as const,
      noteCount: 121,
      route: 'gp5-effects-fixture-v1',
    },
    {
      code: 'import.gp7-effects.fidelity-rejected',
      disposition: 'blocking',
      id: 'gp7-effects' as const,
      noteCount: 121,
      route: 'gp7-effects-fixture-v1',
    },
    {
      code: 'import.musicxml.d4-broad-fidelity-rejected',
      disposition: 'blocking',
      id: 'musicxml-d4-supported' as const,
      noteCount: 19,
      route: 'musicxml-d4-broad-v1',
    },
    {
      code: 'import.musicxml.d4-broad-fidelity-rejected',
      disposition: 'blocking',
      id: 'musicxml-explicit-loss' as const,
      noteCount: 4,
      route: 'musicxml-d4-broad-v1',
    },
  ])('parses but returns no draft for exact $id evidence', async (entry) => {
    const result = await importBoundedScore({
      bytes: fixtureBytes(entry.id),
      fileName: fileName(entry.id),
      fixtureId: entry.id,
      importedAt,
    });
    expect(result).toMatchObject({
      currentDocumentPreserved: true,
      draft: null,
      parserInvoked: true,
      parserSummary: { noteCount: entry.noteCount, playerEnabled: false, soundFont: null },
      status: 'rejected',
    });
    expect(result.report).toMatchObject({
      outcome: 'rejected',
      reportAction: entry.id.startsWith('musicxml') ? 'reject-import' : 'choose-supported-format',
      route: entry.route,
    });
    expect(result.report?.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: entry.code, disposition: entry.disposition }),
      ]),
    );
    for (const disposition of result.semanticDispositions) {
      expect(disposition.sourceEventIds).toHaveLength(disposition.affectedCount);
    }
    if (entry.id === 'musicxml-d4-supported') {
      expect(result.report?.findings.map(({ code }) => code)).toEqual(
        expect.arrayContaining([
          'musicxml.hammer-on.candidate-dropped',
          'musicxml.natural-harmonic.candidate-dropped',
          'musicxml.pull-off.candidate-dropped',
        ]),
      );
    }
    if (entry.id === 'musicxml-explicit-loss') {
      expect(result.report?.findings.map(({ code }) => code)).toEqual(
        expect.arrayContaining([
          'musicxml.artificial-harmonic.native-v1-unsupported',
          'musicxml.ending.expansion-not-implemented',
          'musicxml.grace-note.native-v1-unsupported',
          'musicxml.let-ring.candidate-dropped',
          'musicxml.palm-mute.candidate-dropped',
          'musicxml.repeat.expansion-not-implemented',
        ]),
      );
    }
  });

  it('rejects changed identity and byte overage before loading the third-party parser', async () => {
    const changed = fixtureBytes('gp8-basic');
    changed[changed.length - 1] = (changed[changed.length - 1] ?? 0) ^ 1;
    const identityRejected = await importBoundedScore({
      bytes: changed,
      fileName: fileName('gp8-basic'),
      fixtureId: 'gp8-basic',
      importedAt,
    });
    expect(identityRejected).toMatchObject({
      currentDocumentPreserved: true,
      draft: null,
      parserInvoked: false,
      parserSummary: null,
      status: 'rejected',
    });
    expect(identityRejected.report?.diagnostics.map(({ code }) => code)).toEqual([
      'import.source.security-rejected',
    ]);

    const bytes = fixtureBytes('gp5-effects');
    const resourceRejected = await importBoundedScore({
      bytes,
      fileName: fileName('gp5-effects'),
      fixtureId: 'gp5-effects',
      importedAt,
      resourceBudget: { maximumSourceBytes: bytes.length - 1 },
    });
    expect(resourceRejected).toMatchObject({
      draft: null,
      parserInvoked: false,
      status: 'rejected',
    });
    expect(resourceRejected.report).toBeNull();
    expect(resourceRejected.semanticDispositions).toEqual([
      expect.objectContaining({ id: 'score.resource.source-bytes.blocking' }),
    ]);
  });

  it('enforces parsed-source and candidate-output ceilings with blocking reports', async () => {
    const sourceLimited = await importBoundedScore({
      bytes: fixtureBytes('gp5-effects'),
      fileName: fileName('gp5-effects'),
      fixtureId: 'gp5-effects',
      importedAt,
      resourceBudget: { maximumSourceEvents: 120 },
    });
    expect(sourceLimited).toMatchObject({ draft: null, parserInvoked: true, status: 'rejected' });
    expect(sourceLimited.report?.diagnostics.map(({ code }) => code)).toEqual([
      'import.resource.source-events-exceeded',
    ]);
    expect(sourceLimited.report?.resources.usage.sourceEventCount).toBe(121);

    const outputLimited = await importBoundedScore({
      bytes: fixtureBytes('gp8-basic'),
      fileName: fileName('gp8-basic'),
      fixtureId: 'gp8-basic',
      importedAt,
      resourceBudget: { maximumOutputEvents: 3 },
    });
    expect(outputLimited).toMatchObject({ draft: null, parserInvoked: true, status: 'rejected' });
    expect(outputLimited.report?.diagnostics.map(({ code }) => code)).toEqual([
      'import.resource.output-events-exceeded',
    ]);
    expect(outputLimited.report?.resources.usage.outputEventCount).toBe(4);

    const values = [0, 0, 0, 0, 11];
    let clockIndex = 0;
    const bothLimited = await importBoundedScore({
      bytes: fixtureBytes('gp8-basic'),
      clock: {
        now: () => values[Math.min(clockIndex++, values.length - 1)] ?? 11,
      },
      fileName: fileName('gp8-basic'),
      fixtureId: 'gp8-basic',
      importedAt,
      resourceBudget: { maximumOutputEvents: 3, maximumWallClockMs: 10 },
    });
    expect(bothLimited).toMatchObject({ draft: null, parserInvoked: true, status: 'rejected' });
    expect(bothLimited.report?.diagnostics.map(({ code }) => code)).toEqual([
      'import.resource.output-events-exceeded',
      'import.resource.wall-clock-exceeded',
    ]);
    expect(bothLimited.report?.resources.usage).toMatchObject({
      outputEventCount: 4,
      wallClockMs: 11,
    });
    expect(bothLimited.semanticDispositions.map(({ id }) => id)).toEqual([
      'score.output-events.blocking',
      'score.candidate.wall-clock.blocking',
    ]);
  });

  it('uses one private byte snapshot and derives all draft identities from request metadata', async () => {
    const original = fixtureBytes('gp8-basic');
    const pending = importBoundedScore({
      bytes: original,
      clock: { now: () => 0 },
      fileName: fileName('gp8-basic'),
      fixtureId: 'gp8-basic',
      importedAt,
    });
    original.fill(0);
    const snapshotted = await pending;
    const expected = await importBoundedScore({
      bytes: fixtureBytes('gp8-basic'),
      clock: { now: () => 0 },
      fileName: fileName('gp8-basic'),
      fixtureId: 'gp8-basic',
      importedAt,
    });
    expect(snapshotted).toEqual(expected);

    const explicitDefaultTitle = await importBoundedScore({
      bytes: fixtureBytes('gp8-basic'),
      clock: { now: () => 0 },
      fileName: fileName('gp8-basic'),
      fixtureId: 'gp8-basic',
      importedAt,
      title: 'gp8-basic',
    });
    expect(expected.draft?.draftId).not.toBe(explicitDefaultTitle.draft?.draftId);
    expect(expected.report?.reportId).not.toBe(explicitDefaultTitle.report?.reportId);
    expect(expected.draft?.candidateDocument.revision.documentId).not.toBe(
      explicitDefaultTitle.draft?.candidateDocument.revision.documentId,
    );
    expect(expected.draft?.candidateDocument.revision.revisionId).not.toBe(
      explicitDefaultTitle.draft?.candidateDocument.revision.revisionId,
    );
  });

  it('checks the injected monotonic clock immediately before and after the synchronous parser', async () => {
    const clock = (values: readonly number[]) => {
      let index = 0;
      return {
        now: () => values[Math.min(index++, values.length - 1)] ?? 0,
      };
    };
    const before = await importBoundedScore({
      bytes: fixtureBytes('gp8-basic'),
      clock: clock([0, 1, 30_001]),
      fileName: fileName('gp8-basic'),
      fixtureId: 'gp8-basic',
      importedAt,
    });
    expect(before).toMatchObject({ parserInvoked: false, status: 'rejected' });
    expect(before.report?.diagnostics.map(({ code }) => code)).toEqual([
      'import.resource.wall-clock-exceeded',
    ]);

    const after = await importBoundedScore({
      bytes: fixtureBytes('gp8-basic'),
      clock: clock([0, 1, 2, 30_001]),
      fileName: fileName('gp8-basic'),
      fixtureId: 'gp8-basic',
      importedAt,
    });
    expect(after).toMatchObject({ parserInvoked: true, status: 'rejected' });
    expect(after.report?.diagnostics.map(({ code }) => code)).toEqual([
      'import.resource.wall-clock-exceeded',
    ]);
  });

  it('cancels without parser work, report commitment, or current-document mutation', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await importBoundedScore({
      bytes: fixtureBytes('gp8-basic'),
      fileName: fileName('gp8-basic'),
      fixtureId: 'gp8-basic',
      importedAt,
      signal: controller.signal,
    });
    expect(result).toEqual({
      currentDocumentPreserved: true,
      direction: 'score-to-draft',
      draft: null,
      parserInvoked: false,
      parserSummary: null,
      report: null,
      semanticDispositions: [
        {
          affectedCount: 1,
          detail: 'Import was cancelled before commit; the current document is unchanged.',
          disposition: 'blocking',
          id: 'score.import.cancelled',
        },
      ],
      status: 'cancelled',
    });
  });

  it('rechecks cancellation after lazy module loading and before synchronous parser invocation', async () => {
    let abortedReads = 0;
    const signal = {
      get aborted() {
        abortedReads += 1;
        // The third read is the post-module-load boundary.
        return abortedReads >= 3;
      },
    } as AbortSignal;
    const result = await importBoundedScore({
      bytes: fixtureBytes('gp8-basic'),
      fileName: fileName('gp8-basic'),
      fixtureId: 'gp8-basic',
      importedAt,
      signal,
    });
    expect(abortedReads).toBe(3);
    expect(result).toMatchObject({
      currentDocumentPreserved: true,
      draft: null,
      parserInvoked: false,
      parserSummary: null,
      report: null,
      status: 'cancelled',
    });
  });
});
