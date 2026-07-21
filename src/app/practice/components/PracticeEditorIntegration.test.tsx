import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { usePracticeEditor } from '../usePracticeEditor';
import { AppHeader } from './AppHeader';
import { EditInspector } from './EditInspector';
import { ScorePanel } from './ScorePanel';
import { SetlistSidebar } from './SetlistSidebar';

function EditorHarness() {
  const editor = usePracticeEditor();
  const title = editor.state?.history.document.metadata.title ?? 'Creating blank score…';
  return (
    <>
      <AppHeader
        canRedo={editor.canRedo}
        canUndo={editor.canUndo}
        documentStatus={editor.status}
        documentTitle={title}
        libraryOpen
        mode="edit"
        onModeChange={() => undefined}
        onRedo={() => void editor.redo()}
        onToggleLibrary={() => undefined}
        onUndo={() => void editor.undo()}
      />
      <SetlistSidebar
        documentTitle={title}
        hasAuthoredChanges={(editor.state?.history.past.length ?? 0) > 0}
        onClose={() => undefined}
        onCreateNew={() => void editor.createNew()}
        onExport={() => undefined}
        onImport={() => undefined}
      />
      <ScorePanel editor={editor} scoreView="combined" />
      <EditInspector editor={editor} />
    </>
  );
}

const renderReadyEditor = async () => {
  const user = userEvent.setup();
  render(<EditorHarness />);
  await screen.findByRole('heading', { level: 1, name: 'Untitled guitar tab' });
  return user;
};

describe('Practice Workspace editor integration', () => {
  it('creates a real blank score and labels unavailable persistence honestly', async () => {
    await renderReadyEditor();

    expect(screen.getByText('Your blank guitar tab is ready')).toBeVisible();
    expect(screen.getAllByText('Working copy — not saved')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /save unavailable/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import score' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Export MIDI' })).toBeEnabled();
    expect(screen.getByRole('heading', { name: 'Notation preview' })).toBeVisible();
    expect(screen.getByRole('treeitem', { name: 'Score: Untitled guitar tab' })).toHaveAttribute(
      'aria-level',
      '1',
    );
    expect(screen.getByRole('treeitem', { name: 'Track 1: Guitar' })).toHaveAttribute(
      'aria-level',
      '2',
    );
    expect(screen.getByRole('link', { name: 'Open-source notices' })).toHaveAttribute(
      'href',
      '/open-source/alphatab-1.8.4/ALPHATAB-NOTICE.md',
    );
  });

  it('authors canonical events and supports truthful undo and redo', async () => {
    const user = await renderReadyEditor();

    await user.click(screen.getByRole('button', { name: 'Add open E note' }));
    expect(await screen.findByText('1 authored event')).toBeVisible();
    expect(screen.getByRole('treeitem', { name: /string 1, fret 0/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getAllByText('Working copy — not saved')).toHaveLength(1);

    const undo = screen.getByRole('button', { name: 'Undo' });
    expect(undo).toBeEnabled();
    await user.click(undo);
    expect(await screen.findByText('Your blank guitar tab is ready')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(await screen.findByRole('treeitem', { name: /string 1, fret 0/ })).toBeVisible();
  });

  it('navigates semantic score rows by keyboard without renderer geometry', async () => {
    const user = await renderReadyEditor();
    await user.click(screen.getByRole('button', { name: 'Add open E note' }));
    const root = await screen.findByRole('treeitem', { name: 'Score: Untitled guitar tab' });

    root.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('treeitem', { name: 'Track 1: Guitar' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('treeitem', { name: 'Voice 1' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('treeitem', { name: /Guitar event 1/ })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('treeitem', { name: /string 1, fret 0/ })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(root).toHaveFocus();
  });

  it('edits title, tempo, duration, string, and fret through authored transactions', async () => {
    const user = await renderReadyEditor();

    const title = screen.getByRole('textbox', { name: 'Title' });
    await user.clear(title);
    await user.type(title, 'E minor study');
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'E minor study' })).toBeVisible();

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Authored tempo (BPM)' }), {
      target: { value: '90' },
    });
    await user.click(screen.getByRole('button', { name: 'Set tempo' }));
    expect(await screen.findByText(/90 BPM/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Add open E note' }));
    const note = await screen.findByRole('treeitem', { name: /string 1, fret 0/ });
    await user.click(note);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Duration (ticks)' }), {
      target: { value: '240' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'String' }), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Fret' }), {
      target: { value: '3' },
    });
    await user.click(screen.getByRole('button', { name: 'Apply changes' }));

    await waitFor(() => {
      expect(
        screen.getByRole('treeitem', { name: /string 2, fret 3, sounding duration 240/ }),
      ).toBeVisible();
      expect(screen.getByRole('treeitem', { name: /duration 240 ticks, 1 note/ })).toBeVisible();
    });
  });

  it('starts a distinct blank working document from the library action', async () => {
    const user = await renderReadyEditor();
    await user.click(screen.getByRole('button', { name: 'Add rest' }));
    expect(await screen.findByRole('treeitem', { name: /Rest 1/ })).toBeVisible();

    await user.click(screen.getByRole('button', { name: /New guitar tab/ }));
    expect(screen.getByRole('alertdialog', { name: 'Replace this working copy?' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Create blank score' }));
    await waitFor(() => {
      expect(screen.queryByRole('treeitem', { name: /Rest 1/ })).not.toBeInTheDocument();
      expect(screen.getByText('Your blank guitar tab is ready')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    });
  });
});
