import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { VideoPanel } from './VideoPanel';

describe('VideoPanel', () => {
  it('renders one truthful still-image reference and changes its fit', async () => {
    const user = userEvent.setup();
    const onFitChange = vi.fn();
    render(<VideoPanel fit="fit" onFitChange={onFitChange} />);

    expect(screen.getByRole('heading', { name: 'Technique reference' })).toBeVisible();
    expect(screen.getByText('Still image')).toBeVisible();
    expect(screen.queryByRole('button', { name: /reference|take/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fill frame' }));
    expect(onFitChange).toHaveBeenCalledWith('fill');
  });

  it('offers the inverse fit action from the fill state', async () => {
    const user = userEvent.setup();
    const onFitChange = vi.fn();
    render(<VideoPanel fit="fill" onFitChange={onFitChange} />);

    await user.click(screen.getByRole('button', { name: 'Show full image' }));
    expect(onFitChange).toHaveBeenCalledWith('fit');
  });
});
