import { useEffect, useMemo, useRef, useState } from 'react';

import {
  createAlphaTabNotationAdapter,
  type MountedNotationAdapter,
  type NotationRenderFingerprint,
  type NotationView,
} from '../../../notation';
import type { PracticeDocument } from '../../../shared/contracts/practice';
import type { SemanticFocus } from '../../../editor';
import type { ScoreView } from '../types';

type NotationSurfaceProps = {
  document: PracticeDocument;
  focus: SemanticFocus | null;
  scoreView: ScoreView;
};

type SurfaceStatus =
  | Readonly<{ kind: 'blocked'; message: string }>
  | Readonly<{
      eventCount: number;
      kind: 'ready';
      pageCount: number;
      systemCount: number;
    }>
  | Readonly<{ kind: 'rendering' }>
  | Readonly<{ kind: 'unavailable' }>;

const viewFor = (scoreView: ScoreView): NotationView => {
  switch (scoreView) {
    case 'combined':
      return { flow: 'page', score: 'combined' };
    case 'tab':
      return { flow: 'page', score: 'tab-only' };
    case 'fit-range':
      return { flow: 'continuous', score: 'expanded' };
  }
};

export function NotationSurface({ document, focus, scoreView }: NotationSurfaceProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<MountedNotationAdapter | null>(null);
  const fingerprintRef = useRef<NotationRenderFingerprint | null>(null);
  const renderGeneration = useRef(0);
  const [viewport, setViewport] = useState({ height: 360, width: 960 });
  const [status, setStatus] = useState<SurfaceStatus>({ kind: 'rendering' });
  const view = useMemo(() => viewFor(scoreView), [scoreView]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (wrapper === null || typeof ResizeObserver === 'undefined') {
      setStatus({ kind: 'unavailable' });
      return;
    }
    const updateViewport = (): void => {
      const bounds = wrapper.getBoundingClientRect();
      setViewport({
        height: Math.max(240, Math.min(16_384, Math.round(bounds.height || 360))),
        width: Math.max(240, Math.min(16_384, Math.round(bounds.width || 960))),
      });
    };
    updateViewport();
    const observer = new ResizeObserver(updateViewport);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null || typeof ResizeObserver === 'undefined') return;
    const adapter = createAlphaTabNotationAdapter(host);
    adapterRef.current = adapter;
    return () => {
      adapter.dispose();
      adapterRef.current = null;
      fingerprintRef.current = null;
    };
  }, []);

  useEffect(() => {
    const adapter = adapterRef.current;
    if (adapter === null) return;
    renderGeneration.current += 1;
    const generation = renderGeneration.current;
    setStatus({ kind: 'rendering' });
    void adapter
      .render({
        document,
        focus,
        presentation: {
          targetBarsPerSystem: 4,
          view,
          viewportHeight: viewport.height,
          viewportWidth: viewport.width,
          zoomPercent: 100,
        },
        previousRender: fingerprintRef.current,
      })
      .then((result) => {
        if (generation !== renderGeneration.current || adapter.disposed) return;
        fingerprintRef.current = result.fingerprint;
        const blocking = result.diagnostics.find(({ severity }) => severity === 'error');
        setStatus(
          blocking === undefined
            ? {
                eventCount: result.eventMappings.length,
                kind: 'ready',
                pageCount: result.presentationLayout.pages.length,
                systemCount: result.presentationLayout.systems.length,
              }
            : { kind: 'blocked', message: blocking.message },
        );
      })
      .catch((error: unknown) => {
        if (generation !== renderGeneration.current || adapter.disposed) return;
        setStatus({
          kind: 'blocked',
          message: error instanceof Error ? error.message : 'Notation rendering failed safely.',
        });
      });
  }, [document, focus, view, viewport.height, viewport.width]);

  const statusText =
    status.kind === 'ready'
      ? `Score ready · ${String(status.eventCount)} ${status.eventCount === 1 ? 'event' : 'events'} · ${String(status.systemCount)} ${status.systemCount === 1 ? 'line' : 'lines'} · ${status.pageCount === 0 ? 'continuous view' : `${String(status.pageCount)} ${status.pageCount === 1 ? 'page' : 'pages'}`}`
      : status.kind === 'rendering'
        ? 'Rendering notation…'
        : status.kind === 'unavailable'
          ? 'Notation preview requires browser layout support.'
          : `Notation unavailable: ${status.message}`;

  return (
    <section aria-labelledby="notation-preview-heading" className="practice-notation-preview">
      <header>
        <div>
          <h2 id="notation-preview-heading">Notation preview</h2>
          <p>Your guitar notation</p>
        </div>
        <span aria-live="polite" role="status">
          {statusText}
        </span>
      </header>
      <div
        className="practice-notation-viewport"
        data-notation-flow={view.flow}
        data-notation-score={view.score}
        ref={wrapperRef}
      >
        <div className="practice-notation-host" ref={hostRef} />
      </div>
    </section>
  );
}
