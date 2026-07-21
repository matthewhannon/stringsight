import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { VideoPanel } from './VideoPanel';

describe('VideoPanel', () => {
  it('renders the reference fit state and submits source and fit changes', async () => {
    const user = userEvent.setup();
    const onFitChange = vi.fn();
    const onSourceChange = vi.fn();
    render(
      <VideoPanel
        fit="fit"
        onFitChange={onFitChange}
        onSourceChange={onSourceChange}
        source="reference"
      />,
    );
    expect(screen.getByRole('heading', { name: 'Reference video' })).toBeVisible();
    expect(screen.getByText(/shown without cropping/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'My Take 04' }));
    await user.click(screen.getByRole('button', { name: 'Fill frame' }));
    expect(onSourceChange).toHaveBeenCalledWith('take');
    expect(onFitChange).toHaveBeenCalledWith('fill');
  });

  it('renders the take fill state and submits inverse changes', async () => {
    const user = userEvent.setup();
    const onFitChange = vi.fn();
    const onSourceChange = vi.fn();
    render(
      <VideoPanel
        fit="fill"
        onFitChange={onFitChange}
        onSourceChange={onSourceChange}
        source="take"
      />,
    );
    expect(screen.getByRole('heading', { name: 'My Take 04' })).toBeVisible();
    expect(screen.getByText(/crop edges/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Reference' }));
    await user.click(screen.getByRole('button', { name: 'Fit video' }));
    expect(onSourceChange).toHaveBeenCalledWith('reference');
    expect(onFitChange).toHaveBeenCalledWith('fit');
  });
});
