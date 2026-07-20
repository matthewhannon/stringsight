import type { AudioAnalysisSnapshot } from '../audio/analysis';
import type { MicrophoneCapture } from '../audio/capture';
import type {
  ChordAnalysisProfile,
  PolyphonicAnalysisController,
  PolyphonicAnalysisSnapshot,
} from '../audio/polyphonic';

type SnapshotSource<TSnapshot> = {
  readonly currentSnapshot: TSnapshot;
  subscribe(listener: () => void): () => void;
};

export class AnalysisDisplayController<TSnapshot> {
  private readonly capture: MicrophoneCapture;
  private readonly listeners = new Set<() => void>();
  private readonly monitoring: SnapshotSource<TSnapshot>;
  private readonly session: SnapshotSource<TSnapshot>;
  private readonly unsubscribers: readonly (() => void)[];

  constructor(
    capture: MicrophoneCapture,
    monitoring: SnapshotSource<TSnapshot>,
    session: SnapshotSource<TSnapshot>,
  ) {
    this.capture = capture;
    this.monitoring = monitoring;
    this.session = session;
    this.unsubscribers = [
      capture.subscribe(this.emit),
      monitoring.subscribe(this.emit),
      session.subscribe(this.emit),
    ];
  }

  get currentSnapshot(): TSnapshot {
    return this.showMonitoring ? this.monitoring.currentSnapshot : this.session.currentSnapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.listeners.clear();
  }

  private get showMonitoring(): boolean {
    const snapshot = this.capture.currentSnapshot;
    return (
      snapshot.connectionState === 'monitoring' &&
      ['failed', 'idle', 'paused'].includes(snapshot.operationState)
    );
  }

  private readonly emit = () => {
    for (const listener of this.listeners) listener();
  };
}

export type AudioAnalysisDisplayController = AnalysisDisplayController<AudioAnalysisSnapshot>;

export class PolyphonicAnalysisDisplayController extends AnalysisDisplayController<PolyphonicAnalysisSnapshot> {
  private readonly monitoringController: PolyphonicAnalysisController;
  private readonly sessionController: PolyphonicAnalysisController;

  constructor(
    capture: MicrophoneCapture,
    monitoring: PolyphonicAnalysisController,
    session: PolyphonicAnalysisController,
  ) {
    super(capture, monitoring, session);
    this.monitoringController = monitoring;
    this.sessionController = session;
  }

  setChordAnalysisProfile(profile: ChordAnalysisProfile): void {
    this.monitoringController.setChordAnalysisProfile(profile);
    this.sessionController.setChordAnalysisProfile(profile);
  }
}
