import { useEffect, useRef, useState } from 'react';

import {
  AUTHORED_MIDI_EXPORT_PURPOSE,
  exportAuthoredDocumentMidi,
  importAuthoredMidi,
  importBoundedScore,
  type AuthoredMidiExportResult,
  type BoundedScoreFixtureId,
} from '../../../importing';
import type {
  PracticeImportReport,
  PracticeImportReviewBundle,
} from '../../../shared/contracts/practice-import';
import type { PracticeImportDisposition } from '../../../shared/contracts/practice-support';
import type { PracticeEditorController } from '../usePracticeEditor';
import { Icon } from './Icon';

type ImportProfileId = BoundedScoreFixtureId | 'smf-type1-declared';

type SemanticDisposition = Readonly<{
  affectedCount: number;
  detail: string;
  disposition: PracticeImportDisposition;
  id: string;
}>;

type ImportReview = Readonly<{
  bundle: PracticeImportReviewBundle | null;
  parserSummary: string | null;
  report: PracticeImportReport;
  semanticDispositions: readonly SemanticDisposition[];
  status: 'rejected' | 'reviewable';
}>;

type ImportExportDialogProps = {
  editor: PracticeEditorController;
  initialSection: 'export' | 'import';
  onAccepted: () => void;
  onClose: () => void;
};

const profiles: readonly Readonly<{
  id: ImportProfileId;
  label: string;
}>[] = [
  { id: 'gp8-basic', label: 'Exact GP8 basic fixture — reviewable' },
  { id: 'gp5-effects', label: 'Exact GP5 effects fixture — parsing only, rejected' },
  { id: 'gp7-effects', label: 'Exact GP7 effects fixture — fidelity rejected' },
  {
    id: 'musicxml-d4-supported',
    label: 'Exact MusicXML D4 fixture — broad fidelity rejected',
  },
  {
    id: 'musicxml-explicit-loss',
    label: 'Exact MusicXML explicit-loss fixture — rejected',
  },
  { id: 'smf-type1-declared', label: 'Exact declared Type-1 SMF fixture — reviewable with loss' },
];

const acceptForProfile = (profile: ImportProfileId): string => {
  if (profile === 'smf-type1-declared') return '.mid,.midi,audio/midi,audio/x-midi';
  if (profile.startsWith('musicxml'))
    return '.xml,.musicxml,application/vnd.recordare.musicxml+xml';
  return '.gp,.gp5,.gpx,application/octet-stream';
};

const safeMidiName = (title: string): string => {
  const base = title
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 80);
  return `${base || 'stringsight-score'}.mid`;
};

function downloadMidiBytes(bytes: Uint8Array, fileName: string): void {
  const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: 'audio/midi' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ImportExportDialog({
  editor,
  initialSection,
  onAccepted,
  onClose,
}: ImportExportDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<AuthoredMidiExportResult | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [profile, setProfile] = useState<ImportProfileId>('gp8-basic');
  const [replaceConfirm, setReplaceConfirm] = useState(false);
  const [review, setReview] = useState<ImportReview | null>(null);
  const [section, setSection] = useState(initialSection);
  const abortRef = useRef<AbortController | null>(null);
  const requestSequence = useRef(0);
  const returnFocus = useRef(
    typeof document === 'undefined' || !(document.activeElement instanceof HTMLElement)
      ? null
      : document.activeElement,
  );

  useEffect(
    () => () => {
      requestSequence.current += 1;
      abortRef.current?.abort();
      returnFocus.current?.focus();
    },
    [],
  );

  const cancelImport = (): void => {
    requestSequence.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setImporting(false);
    setError(null);
  };

  const runImport = async (): Promise<void> => {
    if (file === null) {
      setError('Choose the exact fixture file for the selected profile.');
      return;
    }
    requestSequence.current += 1;
    const request = requestSequence.current;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setImporting(true);
    setError(null);
    setReview(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (request !== requestSequence.current) return;
      const importedAt = new Date().toISOString();
      if (profile === 'smf-type1-declared') {
        const result = await importAuthoredMidi({ bytes, fileName: file.name, importedAt });
        if (request !== requestSequence.current) return;
        if (result.report === null) {
          throw new Error(
            result.semanticDispositions[0]?.detail ?? 'MIDI review ended without a report.',
          );
        }
        const report = result.report;
        const bundle =
          result.draft === null || report.outcome !== 'reviewable'
            ? null
            : ({ bundleVersion: 1, draft: result.draft, report } as const);
        setReview({
          bundle,
          parserSummary:
            result.preflight === null
              ? null
              : `SMF Type ${String(result.preflight.format)}, ${String(result.preflight.tracks.length)} tracks, ${String(result.preflight.events.length)} raw events`,
          report,
          semanticDispositions: result.semanticDispositions,
          status: bundle === null ? 'rejected' : 'reviewable',
        });
      } else {
        const result = await importBoundedScore({
          bytes,
          fileName: file.name,
          fixtureId: profile,
          importedAt,
          signal: controller.signal,
        });
        if (request !== requestSequence.current || result.status === 'cancelled') return;
        if (result.report === null) throw new Error('Import ended without a review report.');
        const bundle =
          result.status === 'reviewable' && result.draft !== null
            ? ({ bundleVersion: 1, draft: result.draft, report: result.report } as const)
            : null;
        setReview({
          bundle,
          parserSummary:
            result.parserSummary === null
              ? null
              : `${String(result.parserSummary.trackCount)} tracks, ${String(result.parserSummary.noteCount)} parsed notes; playback not included`,
          report: result.report,
          semanticDispositions: result.semanticDispositions,
          status: result.status,
        });
      }
    } catch (caught) {
      if (request !== requestSequence.current) return;
      setError(
        caught instanceof Error ? caught.message : 'The selected file could not be reviewed.',
      );
    } finally {
      if (request === requestSequence.current) {
        setImporting(false);
        abortRef.current = null;
      }
    }
  };

  const acceptDraft = async (): Promise<void> => {
    if (review?.bundle === null || review?.bundle === undefined) return;
    setReplaceConfirm(false);
    const accepted = await editor.acceptImport(review.bundle);
    if (accepted) onAccepted();
    else setError('The draft failed acceptance verification. The current score is unchanged.');
  };

  const exportMidi = (): void => {
    const document = editor.state?.history.document;
    if (document === undefined) return;
    setError(null);
    try {
      const result = exportAuthoredDocumentMidi({
        document,
        purpose: AUTHORED_MIDI_EXPORT_PURPOSE,
      });
      setExportResult(result);
      downloadMidiBytes(result.bytes, safeMidiName(document.metadata.title));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Authored MIDI export failed.');
    }
  };

  return (
    <div
      aria-labelledby="import-export-heading"
      aria-busy={importing}
      aria-modal="true"
      className="practice-import-overlay"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          if (replaceConfirm) setReplaceConfirm(false);
          else if (importing) cancelImport();
          else onClose();
          return;
        }
        if (event.key !== 'Tab') return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
          ),
        ).filter((control) => control.offsetParent !== null || control === document.activeElement);
        const first = controls[0];
        const last = controls.at(-1);
        if (first === undefined || last === undefined) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      role="dialog"
    >
      <div className="practice-import-dialog">
        <header>
          <div>
            <h2 id="import-export-heading">
              {section === 'import' ? 'Import score' : 'Export MIDI'}
            </h2>
            <p>
              {section === 'import'
                ? 'Review a supported score before replacing your current working copy.'
                : 'Download MIDI created from the notes in your current score.'}
            </p>
          </div>
          <button
            aria-label="Close import and export"
            autoFocus
            className="practice-control is-icon"
            onClick={onClose}
            title="Close import and export"
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        <nav aria-label="Score file action" className="practice-transfer-switch">
          <button
            aria-pressed={section === 'import'}
            className="practice-control is-toggle"
            onClick={() => setSection('import')}
            type="button"
          >
            <Icon name="import" />
            Import score
          </button>
          <button
            aria-pressed={section === 'export'}
            className="practice-control is-toggle"
            onClick={() => setSection('export')}
            type="button"
          >
            <Icon name="export" />
            Export MIDI
          </button>
        </nav>

        {section === 'import' && (
          <section aria-labelledby="score-import-heading">
            <h3 id="score-import-heading">Review a score file</h3>
            <p>
              Choose the profile that exactly matches the fixture. Files outside its reviewed digest
              are rejected; no broad Guitar Pro, MusicXML, or MIDI support is claimed.
            </p>
            <label>
              Import profile
              <select
                disabled={importing}
                onChange={(event) => {
                  setProfile(event.target.value as ImportProfileId);
                  setFile(null);
                  setReview(null);
                  setError(null);
                }}
                value={profile}
              >
                {profiles.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Exact fixture file
              <input
                accept={acceptForProfile(profile)}
                disabled={importing}
                key={profile}
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setReview(null);
                  setError(null);
                }}
                type="file"
              />
            </label>
            <div className="practice-import-actions">
              <button
                disabled={file === null || importing}
                onClick={() => void runImport()}
                type="button"
              >
                {importing ? 'Reviewing file…' : 'Review selected file'}
              </button>
              {importing && (
                <button onClick={cancelImport} type="button">
                  Cancel review
                </button>
              )}
            </div>

            {review !== null && (
              <article aria-live="polite" className="practice-import-review">
                <header>
                  <strong>
                    {review.status === 'reviewable' ? 'Draft ready for review' : 'Import rejected'}
                  </strong>
                  <span>{review.report.route}</span>
                </header>
                <p>
                  Current score preserved: {editor.state?.history.document.metadata.title}. Nothing
                  is replaced unless you choose “Use imported draft”.
                </p>
                {review.bundle !== null && (
                  <p>
                    Draft: <strong>{review.bundle.draft.candidateDocument.metadata.title}</strong> ·{' '}
                    {review.report.resources.usage.outputEventCount.toLocaleString()} score events
                  </p>
                )}
                {review.parserSummary !== null && <p>{review.parserSummary}</p>}
                <dl>
                  <div>
                    <dt>Outcome</dt>
                    <dd>{review.report.outcome}</dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>
                      {review.report.resources.usage.sourceBytes.toLocaleString()} /{' '}
                      {review.report.resources.budget.maximumSourceBytes.toLocaleString()} bytes
                    </dd>
                  </div>
                  <div>
                    <dt>Source events</dt>
                    <dd>
                      {review.report.resources.usage.sourceEventCount.toLocaleString()} /{' '}
                      {review.report.resources.budget.maximumSourceEvents.toLocaleString()}
                    </dd>
                  </div>
                  <div>
                    <dt>Draft events</dt>
                    <dd>
                      {review.report.resources.usage.outputEventCount.toLocaleString()} /{' '}
                      {review.report.resources.budget.maximumOutputEvents.toLocaleString()}
                    </dd>
                  </div>
                  <div>
                    <dt>Wall clock</dt>
                    <dd>
                      {review.report.resources.usage.wallClockMs.toLocaleString()} /{' '}
                      {review.report.resources.budget.maximumWallClockMs.toLocaleString()} ms
                    </dd>
                  </div>
                </dl>
                <h4>Conversion details</h4>
                <ul>
                  {review.semanticDispositions.map((item) => (
                    <li key={item.id}>
                      <strong>{item.disposition}</strong> · {String(item.affectedCount)} —{' '}
                      {item.detail}
                    </li>
                  ))}
                </ul>
                <h4>Import findings</h4>
                <ul>
                  {review.report.findings.map((finding) => (
                    <li key={finding.code}>
                      <strong>{finding.disposition}</strong> — {finding.detail}
                    </li>
                  ))}
                  {review.report.diagnostics.map((diagnostic) => (
                    <li key={`${diagnostic.code}-${diagnostic.detail}`}>
                      <strong>{diagnostic.severity}</strong> — {diagnostic.detail}
                    </li>
                  ))}
                </ul>
                {review.bundle !== null && (
                  <button
                    disabled={editor.busy}
                    onClick={() => {
                      if (editor.state?.history.isDirty === true) setReplaceConfirm(true);
                      else void acceptDraft();
                    }}
                    type="button"
                  >
                    Use imported draft
                  </button>
                )}
              </article>
            )}
          </section>
        )}

        {section === 'export' && (
          <section aria-labelledby="authored-midi-export-heading">
            <h3 id="authored-midi-export-heading">Export score as MIDI</h3>
            <p>
              Downloads the notes in this score as a standard MIDI file. It does not include your
              microphone recordings or live performance.
            </p>
            <button disabled={editor.state === null} onClick={exportMidi} type="button">
              Download MIDI (.mid)
            </button>
            {exportResult !== null && (
              <div aria-live="polite" className="practice-midi-export-summary">
                <strong>
                  Downloaded {exportResult.bytes.length.toLocaleString()} bytes ·{' '}
                  {String(exportResult.preflight.events.length)} MIDI events
                </strong>
                <h4>Export loss summary</h4>
                <ul>
                  {exportResult.semanticDispositions.map((item) => (
                    <li key={item.id}>
                      <strong>{item.disposition}</strong> — {item.detail}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {error !== null && (
          <p className="practice-import-error" role="alert">
            {error}
          </p>
        )}

        {replaceConfirm && (
          <div aria-labelledby="replace-import-heading" role="alertdialog">
            <h3 id="replace-import-heading">Replace this unsaved working copy?</h3>
            <p>The current document is not saved. This replacement cannot be undone.</p>
            <button autoFocus onClick={() => setReplaceConfirm(false)} type="button">
              Keep current score
            </button>
            <button onClick={() => void acceptDraft()} type="button">
              Replace with verified draft
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
