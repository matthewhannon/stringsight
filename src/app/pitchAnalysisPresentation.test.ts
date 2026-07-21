import { describe, expect, it } from 'vitest';

import {
  pitchConfidenceLevel,
  pitchCorrectionInstruction,
  pitchSignalLabel,
} from './pitchAnalysisPresentation';

describe('pitch analysis presentation', () => {
  it('maps detector confidence to compact qualitative labels', () => {
    expect(pitchConfidenceLevel(0.8)).toBe('High');
    expect(pitchConfidenceLevel(0.5)).toBe('Medium');
    expect(pitchConfidenceLevel(0.2)).toBe('Low');
  });

  it('turns cents offset into direct tuning guidance', () => {
    expect(pitchCorrectionInstruction(18.3)).toBe('Lower pitch slightly');
    expect(pitchCorrectionInstruction(-18.3)).toBe('Raise pitch slightly');
    expect(pitchCorrectionInstruction(1.5)).toBe('Hold this pitch');
    expect(pitchCorrectionInstruction(40)).toBe('Lower pitch');
  });

  it('does not report a waiting state while a note is present', () => {
    expect(pitchSignalLabel('tracking', true)).toBe('Stable signal');
    expect(pitchSignalLabel('uncertain', false)).toBe('Signal lost');
    expect(pitchSignalLabel('silence', false)).toBe('Listening');
  });
});
