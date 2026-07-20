export type WorkspaceMode = 'edit' | 'practice' | 'review';

export type PracticeLayout = 'score' | 'split' | 'video';

export type ScoreView = 'combined' | 'fit-range' | 'tab';

export type VideoSource = 'reference' | 'take';

export type PracticeMeasure = {
  chord: string;
  frets: readonly {
    fret: string;
    left: number;
    string: number;
    technique?: string;
  }[];
  notes: readonly {
    left: number;
    top: number;
  }[];
  number: number;
};

export type PracticeDocument = {
  detail: string;
  id: string;
  title: string;
};
