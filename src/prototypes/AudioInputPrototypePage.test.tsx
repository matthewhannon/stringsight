import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AudioInputPrototypePage } from './AudioInputPrototypePage';

describe('AudioInputPrototypePage', () => {
  it('starts with one clear input action and keeps the device selector visible', () => {
    render(<AudioInputPrototypePage />);

    expect(screen.getByRole('button', { name: 'Input' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Load audio' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Record' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Source' })).toBeEnabled();
    expect(screen.getByRole('img', { name: 'Input waveform, no active signal' })).toBeVisible();
    expect(screen.queryByText(/multiple audio inputs detected/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no clear input is reaching/i)).not.toBeInTheDocument();
  });

  it('keeps listening separate from recording with stable hardware labels', async () => {
    const user = userEvent.setup();
    render(<AudioInputPrototypePage />);

    const inputButton = screen.getByRole('button', { name: 'Input' });
    const recordButton = screen.getByRole('button', { name: 'Record' });

    await user.click(inputButton);

    expect(inputButton).toHaveAttribute('aria-pressed', 'true');
    expect(recordButton).toBeEnabled();
    expect(recordButton).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('img', { name: 'Simulated live input waveform' })).toBeVisible();

    await user.click(recordButton);

    expect(recordButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Recording duration')).toHaveTextContent('00:12.4');
    expect(screen.getByRole('combobox', { name: 'Source' })).toBeEnabled();

    await user.click(inputButton);

    expect(inputButton).toHaveAttribute('aria-pressed', 'false');
    expect(recordButton).toBeDisabled();
  });

  it('keeps device and privacy details mutually exclusive', async () => {
    const user = userEvent.setup();
    render(<AudioInputPrototypePage />);

    const devicePanel = screen.getByRole('complementary', {
      name: 'Input device and details',
    });
    const deviceDetails = within(devicePanel).getByRole('button', { name: 'Device details' });
    const privacyDetails = within(devicePanel).getByRole('button', { name: 'Privacy details' });
    const detailViewport = within(devicePanel).getByLabelText('Expanded input information');

    expect(within(devicePanel).getByRole('combobox', { name: 'Source' })).toBeEnabled();
    expect(within(devicePanel).queryByRole('button', { name: 'Input' })).not.toBeInTheDocument();
    expect(detailViewport).toBeVisible();
    expect(deviceDetails).toHaveAttribute('aria-expanded', 'false');
    expect(privacyDetails).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Actual sample rate')).not.toBeInTheDocument();
    expect(
      within(devicePanel).queryByText(/open device or privacy details/i),
    ).not.toBeInTheDocument();

    await user.click(deviceDetails);

    expect(deviceDetails).toHaveAttribute('aria-expanded', 'true');
    expect(privacyDetails).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Actual sample rate')).toBeVisible();
    expect(screen.queryByText(/listening is not saved/i)).not.toBeInTheDocument();

    await user.click(privacyDetails);

    expect(deviceDetails).toHaveAttribute('aria-expanded', 'false');
    expect(privacyDetails).toHaveAttribute('aria-expanded', 'true');
    expect(detailViewport).toBeVisible();
    expect(screen.queryByText('Actual sample rate')).not.toBeInTheDocument();
    expect(screen.getByText(/listening is not saved/i)).toBeVisible();
  });
});
