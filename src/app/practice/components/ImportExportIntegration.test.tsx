import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import declaredMidiHex from '../../../importing/midi/__fixtures__/declared-type1.hex?raw';
import gp5Base64 from '../../../importing/score/__fixtures__/gp5-effects.gp5.base64?raw';
import gp7Base64 from '../../../importing/score/__fixtures__/gp7-effects.gp.base64?raw';
import gp8Base64 from '../../../importing/score/__fixtures__/gp8-basic.gp.base64?raw';
import musicXmlD4 from '../../../importing/score/__fixtures__/musicxml-d4-supported.xml?raw';
import musicXmlLoss from '../../../importing/score/__fixtures__/musicxml-explicit-loss.xml?raw';
import { PracticeApp } from '../PracticeApp';

const binaryFixture = (base64: string, name: string): File =>
  new File([Uint8Array.from(atob(base64.trim()), (character) => character.charCodeAt(0))], name, {
    type: 'application/octet-stream',
  });

const textFixture = (contents: string, name: string): File =>
  new File([contents.replaceAll('\r\n', '\n').replace(/\n\n$/u, '\n')], name, {
    type: 'application/xml',
  });

const midiFixture = (): File => {
  const bytes = Uint8Array.from(
    declaredMidiHex
      .replace(/#.*$/gmu, '')
      .split(/\s+/u)
      .filter(Boolean)
      .map((byte) => Number.parseInt(byte, 16)),
  );
  return new File([bytes], 'declared-type1.mid', { type: 'audio/midi' });
};

const openDialog = async () => {
  const user = userEvent.setup();
  render(<PracticeApp />);
  await screen.findByRole('heading', { level: 1, name: 'Untitled guitar tab' });
  await user.click(screen.getByRole('button', { name: 'Import score' }));
  expect(screen.getByRole('dialog', { name: 'Import score' })).toBeVisible();
  return user;
};

describe('Practice authored import/export integration', () => {
  it('reviews exact GP8 without replacing the current score, then explicitly accepts it', async () => {
    const user = await openDialog();
    await user.upload(
      screen.getByLabelText('Exact fixture file'),
      binaryFixture(gp8Base64, 'gp8-basic.gp'),
    );
    await user.click(screen.getByRole('button', { name: 'Review selected file' }));

    expect(await screen.findByText('Draft ready for review')).toBeVisible();
    expect(screen.getByText('gp8-basic-fixture-v1')).toBeVisible();
    expect(screen.getByText(/4 parsed notes; playback not included/)).toBeVisible();
    expect(screen.getByText(/Current score preserved: Untitled guitar tab/)).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'Untitled guitar tab' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Use imported draft' }));
    expect(
      screen.getByRole('alertdialog', { name: 'Replace this unsaved working copy?' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Replace with verified draft' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'gp8-basic' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  it.each([
    ['gp5-effects', () => binaryFixture(gp5Base64, 'gp5-effects.gp5'), /121 parsed notes/],
    ['gp7-effects', () => binaryFixture(gp7Base64, 'gp7-effects.gp'), /121 parsed notes/],
    [
      'musicxml-d4-supported',
      () => textFixture(musicXmlD4, 'musicxml-d4-supported.xml'),
      /19 parsed notes/,
    ],
    [
      'musicxml-explicit-loss',
      () => textFixture(musicXmlLoss, 'musicxml-explicit-loss.xml'),
      /4 parsed notes/,
    ],
  ] as const)(
    'shows the exact %s profile as rejected without a draft',
    async (profile, file, summary) => {
      const user = await openDialog();
      await user.selectOptions(screen.getByLabelText('Import profile'), profile);
      await user.upload(screen.getByLabelText('Exact fixture file'), file());
      await user.click(screen.getByRole('button', { name: 'Review selected file' }));

      expect(await screen.findByText('Import rejected')).toBeVisible();
      expect(screen.getByText(summary)).toBeVisible();
      expect(screen.getByLabelText('Import profile')).toHaveValue(profile);
      expect(screen.queryByRole('button', { name: 'Use imported draft' })).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1, name: 'Untitled guitar tab' })).toBeVisible();
    },
  );

  it('reviews only the declared Type-1 SMF and exposes its guitar/notation losses', async () => {
    const user = await openDialog();
    await user.selectOptions(screen.getByLabelText('Import profile'), 'smf-type1-declared');
    await user.upload(screen.getByLabelText('Exact fixture file'), midiFixture());
    await user.click(screen.getByRole('button', { name: 'Review selected file' }));

    expect(await screen.findByText('Draft ready for review')).toBeVisible();
    expect(screen.getByText('smf-type1-declared-fixtures-v1')).toBeVisible();
    expect(screen.getByText(/SMF Type 1, 2 tracks/)).toBeVisible();
    expect(screen.getByText(/MIDI contains no original string\/fret/)).toBeVisible();
    expect(screen.getByText(/Current score preserved: Untitled guitar tab/)).toBeVisible();
  });

  it('downloads authored-document MIDI and shows loss separately from observed MIDI', async () => {
    const createObjectUrl = vi.fn(() => 'blob:authored-midi');
    const revokeObjectUrl = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: createObjectUrl, revokeObjectURL: revokeObjectUrl });
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(<PracticeApp />);
    await screen.findByRole('heading', { level: 1, name: 'Untitled guitar tab' });
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Add open E note' }));
    await user.click(screen.getByRole('button', { name: 'Export MIDI' }));
    expect(screen.getByRole('dialog', { name: 'Export MIDI' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Download MIDI (.mid)' }));

    expect(screen.getByText(/Downloaded .* bytes/)).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Export loss summary' })).toBeVisible();
    expect(
      screen.getByText(/does not include your microphone recordings or live performance/),
    ).toBeVisible();
    expect(screen.getByText(/string 1\/fret 0 is not representable in SMF/)).toBeVisible();
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(anchorClick).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:authored-midi');
    anchorClick.mockRestore();
    vi.unstubAllGlobals();
  });

  it('cancels an in-flight file read and ignores its stale completion', async () => {
    const user = await openDialog();
    let resolveRead: ((value: ArrayBuffer) => void) | undefined;
    const deferred = new Promise<ArrayBuffer>((resolve) => {
      resolveRead = resolve;
    });
    const file = binaryFixture(gp8Base64, 'slow-gp8.gp');
    Object.defineProperty(file, 'arrayBuffer', { value: () => deferred });
    fireEvent.change(screen.getByLabelText('Exact fixture file'), { target: { files: [file] } });
    await user.click(screen.getByRole('button', { name: 'Review selected file' }));
    await user.click(screen.getByRole('button', { name: 'Cancel review' }));
    resolveRead?.(
      Uint8Array.from(atob(gp8Base64.trim()), (character) => character.charCodeAt(0)).buffer,
    );

    await waitFor(() => {
      expect(screen.queryByText('Draft ready for review')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1, name: 'Untitled guitar tab' })).toBeVisible();
    });
  });
});
