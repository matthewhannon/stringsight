import type { PracticeDocument, PracticeMeasure } from './types';

export const practiceDocuments: readonly PracticeDocument[] = [
  { detail: 'Lead study · 5 takes', id: 'neon-river', title: 'Neon River' },
  { detail: 'Verse rhythm · 2 takes', id: 'warm-static', title: 'Warm Static' },
  { detail: 'Solo · no takes', id: 'slow-bloom', title: 'Slow Bloom' },
  { detail: 'Bridge · 3 takes', id: 'glass-roads', title: 'Glass Roads' },
];

export const selectedMeasures: readonly PracticeMeasure[] = [
  {
    chord: 'Em7',
    frets: [
      { fret: '2', left: 10, string: 4 },
      { fret: '2', left: 32, string: 3 },
      { fret: '0', left: 54, string: 2 },
      { fret: '0', left: 76, string: 1 },
    ],
    notes: [
      { left: 12, top: 43 },
      { left: 34, top: 29 },
      { left: 56, top: 21 },
      { left: 78, top: 15 },
    ],
    number: 12,
  },
  {
    chord: 'Cmaj7',
    frets: [
      { fret: '2', left: 10, string: 3, technique: 'h' },
      { fret: '5', left: 29, string: 3 },
      { fret: '4', left: 51, string: 2 },
      { fret: '5', left: 74, string: 1 },
    ],
    notes: [
      { left: 12, top: 35 },
      { left: 31, top: 27 },
      { left: 53, top: 21 },
      { left: 76, top: 14 },
    ],
    number: 13,
  },
  {
    chord: 'G6',
    frets: [
      { fret: '5', left: 11, string: 4 },
      { fret: '5', left: 32, string: 3, technique: '/' },
      { fret: '7', left: 55, string: 2 },
      { fret: '7', left: 76, string: 0 },
    ],
    notes: [
      { left: 13, top: 42 },
      { left: 34, top: 32 },
      { left: 57, top: 20 },
      { left: 78, top: 9 },
    ],
    number: 14,
  },
  {
    chord: 'D/F♯',
    frets: [
      { fret: '2', left: 11, string: 5 },
      { fret: '4', left: 33, string: 3 },
      { fret: '2', left: 54, string: 2, technique: 'p' },
      { fret: '3', left: 76, string: 1 },
    ],
    notes: [
      { left: 13, top: 47 },
      { left: 35, top: 35 },
      { left: 56, top: 25 },
      { left: 78, top: 18 },
    ],
    number: 15,
  },
];

export const previewMeasures: readonly PracticeMeasure[] = [
  {
    chord: 'Em',
    frets: [
      { fret: '0', left: 16, string: 5 },
      { fret: '2', left: 53, string: 4 },
    ],
    notes: [
      { left: 18, top: 42 },
      { left: 55, top: 28 },
    ],
    number: 16,
  },
  {
    chord: 'Am7',
    frets: [
      { fret: '0', left: 20, string: 4 },
      { fret: '2', left: 64, string: 2 },
    ],
    notes: [
      { left: 22, top: 34 },
      { left: 66, top: 20 },
    ],
    number: 17,
  },
  {
    chord: 'C',
    frets: [
      { fret: '3', left: 15, string: 4 },
      { fret: '1', left: 58, string: 1 },
    ],
    notes: [
      { left: 17, top: 38 },
      { left: 60, top: 24 },
    ],
    number: 18,
  },
  {
    chord: 'B7',
    frets: [
      { fret: '2', left: 13, string: 4 },
      { fret: '0', left: 56, string: 1 },
    ],
    notes: [
      { left: 15, top: 45 },
      { left: 58, top: 18 },
    ],
    number: 19,
  },
];
