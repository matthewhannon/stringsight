import {
  InitialCaptureSnapshot,
  type CaptureOperationState,
  type MicrophoneConnectionState,
} from '../../audio/capture';

import { capabilitiesFor } from './usePracticeAudio';

const connectionStates: readonly MicrophoneConnectionState[] = [
  'unsupported',
  'disconnected',
  'connecting',
  'monitoring',
  'failed',
];
const operationStates: readonly CaptureOperationState[] = [
  'idle',
  'recording',
  'paused',
  'finalizing',
  'replaying',
  'failed',
];
const recoverableOperations: readonly CaptureOperationState[] = ['idle', 'failed'];

describe('practice audio capabilities', () => {
  it.each(
    connectionStates.flatMap((connectionState) =>
      operationStates.map((operationState) => ({ connectionState, operationState })),
    ),
  )('maps $connectionState + $operationState to controller-supported actions', (state) => {
    const capabilities = capabilitiesFor({
      ...InitialCaptureSnapshot,
      ...state,
      bufferedDurationMs: 800,
    });
    const recoverable = recoverableOperations.includes(state.operationState);
    const monitoring = state.connectionState === 'monitoring';

    expect(capabilities).toEqual({
      canConnect: recoverable && ['disconnected', 'failed'].includes(state.connectionState),
      canDisconnect: monitoring,
      canPause: state.operationState === 'recording',
      canRecord: monitoring && recoverable,
      canReplay: recoverable,
      canResume: state.operationState === 'paused',
      canStop: ['recording', 'paused'].includes(state.operationState),
      canStopReplay: state.operationState === 'replaying',
    });
  });

  it('requires buffered audio before replay is offered', () => {
    const capabilities = capabilitiesFor({
      ...InitialCaptureSnapshot,
      connectionState: 'monitoring',
      operationState: 'failed',
    });

    expect(capabilities).toMatchObject({
      canDisconnect: true,
      canRecord: true,
      canReplay: false,
    });
  });
});
