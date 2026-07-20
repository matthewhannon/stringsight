import userEvent from '@testing-library/user-event';
import { fireEvent, render, screen } from '@testing-library/react';

import { App } from './App';

describe('App', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('opens into the tab-centered practice workspace', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: 'Neon River' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Tab + Video' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('heading', { name: 'Reference video' })).toBeVisible();
    expect(screen.getByText('Video playback placeholder')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Connect microphone to record' })).toBeDisabled();
    expect(screen.getByRole('meter', { name: 'Input level 0 percent' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
  });

  it('labels unfinished product areas and exposes real input controls', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText('Demo score')).toBeVisible();
    expect(screen.getByText('Document library placeholder')).toBeVisible();
    expect(screen.getByText('Practice history is not connected yet')).toBeVisible();
    expect(screen.getByText('Playback cursor preview')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Input settings' }));
    expect(screen.getByRole('heading', { name: 'Microphone and take controls' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Input device' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Connect microphone' })).toBeDisabled();
    expect(screen.getByText('Signal and transport diagnostics')).toBeVisible();
  });

  it('switches between edit, practice, and review modes', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('heading', { name: 'Edit selection' })).toBeVisible();
    expect(screen.getByText('Editor placeholder')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Review' }));
    expect(screen.getByRole('heading', { name: 'Session evidence review' })).toBeVisible();
    expect(screen.getByText('Assessment placeholder')).toBeVisible();
  });

  it('closes a settings drawer with Escape and restores trigger focus', async () => {
    const user = userEvent.setup();
    render(<App />);
    const trigger = screen.getByRole('button', { name: 'Input settings' });

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

    await user.click(screen.getByRole('button', { name: 'Input settings' }));
    expect(screen.getByRole('dialog', { name: 'Microphone and take controls' })).toHaveAttribute(
      'aria-modal',
      'false',
    );

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('heading', { name: 'Edit selection' })).toBeVisible();
  });

  it('does not use the playback shortcut while editing content', () => {
    render(<App />);
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    document.body.append(editable);
    editable.focus();

    fireEvent.keyDown(editable, { code: 'Space', key: ' ' });

    expect(screen.getByRole('button', { name: 'Play placeholder reference' })).toBeVisible();
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
