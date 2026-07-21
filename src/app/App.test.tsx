import userEvent from '@testing-library/user-event';
import { fireEvent, render, screen } from '@testing-library/react';

import { App } from './App';

describe('App', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('opens into the tab-centered practice workspace', async () => {
    render(<App />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Untitled guitar tab' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Tab + Video' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('heading', { name: 'Technique reference' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Microphone disconnected — Connect' })).toBeVisible();
    expect(screen.getByText('Recording starts from the microphone controls')).toBeVisible();
    expect(screen.queryByRole('button', { name: /play/i })).not.toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Input level 0 percent' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
  });

  it('presents a single document state and exposes real input controls', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText('Working copy — not saved')).toBeVisible();
    expect(screen.queryByRole('button', { name: /save unavailable/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import score' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Export MIDI' })).toBeEnabled();
    expect(screen.queryByText(/timeline placeholder/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Input and recording' }));
    expect(screen.getByRole('heading', { name: 'Microphone and recording' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Input device' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Connect microphone' })).not.toBeInTheDocument();
    expect(screen.getByText('Signal and transport diagnostics')).toBeVisible();
  });

  it('switches between edit, practice, and review modes', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('heading', { name: 'Edit score' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add open E note' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Review' }));
    expect(screen.getByRole('heading', { name: 'Recording review' })).toBeVisible();
    expect(screen.getByText('Nothing to review yet')).toBeVisible();
  });

  it('closes a settings drawer with Escape and restores trigger focus', async () => {
    const user = userEvent.setup();
    render(<App />);
    const trigger = screen.getByRole('button', { name: 'Input and recording' });

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Close audio input' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('exposes drawers as nonmodal side panels and keeps the workspace interactive', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Input and recording' }));
    expect(screen.getByRole('dialog', { name: 'Microphone and recording' })).toHaveAttribute(
      'aria-modal',
      'false',
    );

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('heading', { name: 'Edit score' })).toBeVisible();
  });

  it('keeps live analysis, advanced analysis, and input in one mutually exclusive drawer slot', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Live analysis' }));
    expect(screen.getByRole('dialog', { name: 'What StringSight hears' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Advanced analysis' }));
    expect(
      screen.queryByRole('dialog', { name: 'What StringSight hears' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Evidence and interpretations' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Input and recording' }));
    expect(
      screen.queryByRole('dialog', { name: 'Evidence and interpretations' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Microphone and recording' })).toBeVisible();
  });

  it('does not expose or trigger placeholder playback from the Space key', () => {
    render(<App />);
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    document.body.append(editable);
    editable.focus();

    fireEvent.keyDown(editable, { code: 'Space', key: ' ' });

    expect(screen.queryByRole('button', { name: /play/i })).not.toBeInTheDocument();
    editable.remove();
  });

  it('resizes the tab and video split with the keyboard', async () => {
    const user = userEvent.setup();
    render(<App />);
    const splitter = screen.getByRole('separator', { name: 'Resize tab and video panels' });

    splitter.focus();
    await user.keyboard('{ArrowRight}');

    expect(splitter).toHaveAttribute('aria-valuenow', '60');
  });

  it('removes the splitter from every non-split composition', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Video Focus' }));
    expect(screen.queryByRole('separator', { name: 'Resize tab and video panels' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Tab Focus' }));
    expect(screen.queryByRole('separator', { name: 'Resize tab and video panels' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.queryByRole('separator', { name: 'Resize tab and video panels' })).toBeNull();
  });
});
