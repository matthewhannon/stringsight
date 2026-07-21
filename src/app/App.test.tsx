import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { App } from './App';

describe('App', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    window.localStorage.clear();
  });

  it('opens with the required rack modules and compact module management', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { level: 1, name: /stringsight rack workspace/i }),
    ).toBeVisible();
    expect(screen.queryByRole('heading', { name: /session control/i })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /audio input/i })).toBeVisible();
    expect(screen.getByText('MODE')).toBeVisible();
    expect(screen.getByText('LOCAL')).toBeVisible();
    expect(screen.getByText('AUDIO')).toBeVisible();
    expect(screen.getByText('NOT ACTIVE')).toBeVisible();
    expect(screen.getByText('ANALYZER')).toBeVisible();
    expect(screen.getByText('MONO v0.2.1')).toBeVisible();
    expect(screen.queryByRole('heading', { name: /pitch analysis/i })).not.toBeInTheDocument();
    expect(screen.getByText('00 installed')).toBeVisible();
    expect(screen.getByRole('button', { name: '+ Add module' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Edit rack' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Input' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('combobox', { name: 'Source' })).toBeEnabled();
    expect(screen.queryByText(/rack stack concepts/i)).not.toBeInTheDocument();
  });

  it('adds, reorders, removes, re-adds, and persists optional modules', async () => {
    const user = userEvent.setup();
    const view = render(<App />);

    await user.click(screen.getByRole('button', { name: '+ Add module' }));
    expect(screen.getByRole('region', { name: 'Module library' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Add Pitch analysis' }));
    await user.click(screen.getByRole('button', { name: 'Add Chord analysis' }));
    await user.click(screen.getByRole('button', { name: 'Close library' }));

    let pitch = screen.getByRole('heading', { name: 'Pitch analysis' });
    let chord = screen.getByRole('heading', { name: 'Chord analysis' });
    expect(pitch.compareDocumentPosition(chord) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Edit rack' }));
    expect(screen.getAllByText('Required')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Move Chord analysis up' }));
    pitch = screen.getByRole('heading', { name: 'Pitch analysis' });
    chord = screen.getByRole('heading', { name: 'Chord analysis' });
    expect(chord.compareDocumentPosition(pitch) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Remove Pitch analysis from rack' }));
    expect(screen.queryByRole('heading', { name: 'Pitch analysis' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await user.click(screen.getByRole('button', { name: '+ Add module' }));
    await user.click(screen.getByRole('button', { name: 'Add Pitch analysis' }));
    await user.click(screen.getByRole('button', { name: 'Close library' }));
    expect(screen.getByRole('heading', { name: 'Pitch analysis' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Move .* up/ })).not.toBeInTheDocument();

    view.unmount();
    render(<App />);
    chord = screen.getByRole('heading', { name: 'Chord analysis' });
    pitch = screen.getByRole('heading', { name: 'Pitch analysis' });
    expect(chord.compareDocumentPosition(pitch) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('reorders optional modules with the drag handle', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '+ Add module' }));
    await user.click(screen.getByRole('button', { name: 'Add Pitch analysis' }));
    await user.click(screen.getByRole('button', { name: 'Add Chord analysis' }));
    await user.click(screen.getByRole('button', { name: 'Close library' }));
    await user.click(screen.getByRole('button', { name: 'Edit rack' }));

    const pitchHandle = screen.getByRole('button', { name: 'Drag Pitch analysis to reorder' });
    const pitchWrapper = document.querySelector('[data-rack-module="analysis"]')?.parentElement;
    const chordWrapper = document.querySelector(
      '[data-rack-module="polyphonic-analysis"]',
    )?.parentElement;
    if (
      pitchWrapper === undefined ||
      pitchWrapper === null ||
      chordWrapper === undefined ||
      chordWrapper === null
    ) {
      throw new Error('Expected optional module wrappers');
    }

    const dataTransfer = {
      dropEffect: 'none',
      effectAllowed: 'none',
      setData: vi.fn(),
    };
    fireEvent.dragStart(pitchHandle, { dataTransfer });
    fireEvent.dragOver(pitchWrapper, { clientY: 1, dataTransfer });
    fireEvent.dragOver(chordWrapper, { clientY: 1, dataTransfer });
    fireEvent.drop(chordWrapper, { clientY: 1, dataTransfer });
    fireEvent.dragEnd(pitchHandle, { dataTransfer });

    const pitch = screen.getByRole('heading', { name: 'Pitch analysis' });
    const chord = screen.getByRole('heading', { name: 'Chord analysis' });
    expect(chord.compareDocumentPosition(pitch) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('exits edit mode when the final optional module is removed', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '+ Add module' }));
    await user.click(screen.getByRole('button', { name: 'Add Pitch analysis' }));
    await user.click(screen.getByRole('button', { name: 'Close library' }));
    await user.click(screen.getByRole('button', { name: 'Edit rack' }));
    await user.click(screen.getByRole('button', { name: 'Remove Pitch analysis from rack' }));

    expect(screen.queryByRole('heading', { name: 'Pitch analysis' })).not.toBeInTheDocument();
    expect(screen.getByText('00 installed')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Edit rack' })).toBeDisabled();
    expect(screen.queryByText('Open rack bay')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });
});
