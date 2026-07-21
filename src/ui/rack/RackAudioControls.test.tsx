import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import {
  RackDetailKey,
  RackRecordPunch,
  RackRockerSwitch,
  RackSegmentedMeter,
  RackSourceSelector,
  RackStatusLamp,
  RackUtilityKey,
} from './index';

describe('rack audio controls', () => {
  it('exposes controlled physical switches, lamps, keys, record state, and meter values', async () => {
    const user = userEvent.setup();
    const setInput = vi.fn();
    const record = vi.fn();
    const load = vi.fn();
    const openDetails = vi.fn();

    render(
      <div>
        <RackRockerSwitch label="Input" onPressedChange={setInput} pressed stateLabel="Active" />
        <RackStatusLamp active label="Signal" status="present" />
        <RackSegmentedMeter
          label="Input level"
          stops={['-48', '-24', '0']}
          value={50}
          valueText="-24 dBFS"
        />
        <RackUtilityKey engraving="Audio file" onClick={load}>
          Load
        </RackUtilityKey>
        <RackRecordPunch onClick={record} recording={false} stateLabel="Ready" />
        <RackDetailKey controls="details" label="Device" onClick={openDetails} open={false} />
      </div>,
    );

    expect(screen.getByRole('button', { name: 'Input' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status', { name: 'Signal: present' })).toBeVisible();
    expect(screen.getByRole('meter', { name: 'Input level' })).toHaveAttribute(
      'aria-valuetext',
      '-24 dBFS',
    );
    expect(screen.getByText('Ready')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Input' }));
    await user.click(screen.getByRole('button', { name: 'Load' }));
    await user.click(screen.getByRole('button', { name: 'Record' }));
    await user.click(screen.getByRole('button', { name: 'Device details' }));
    expect(setInput).toHaveBeenCalledWith(false);
    expect(load).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledOnce();
    expect(openDetails).toHaveBeenCalledOnce();
  });

  it('operates the source listbox with arrows, Home, End, Escape, and focus return', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <RackSourceSelector
        label="Source"
        onChange={onChange}
        options={[
          { label: 'System default', value: '' },
          { label: 'Interface input', value: 'interface' },
          { label: 'Webcam microphone', value: 'webcam' },
        ]}
        value="interface"
      />,
    );

    const source = screen.getByRole('combobox', { name: 'Source' });
    await user.click(source);
    expect(screen.getByRole('option', { name: 'Interface input' })).toHaveFocus();
    await user.keyboard('{End}{Enter}');
    expect(onChange).toHaveBeenCalledWith('webcam');

    await user.click(source);
    await user.keyboard('{Home}{ArrowDown}{Escape}');
    expect(source).toHaveFocus();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opens the source list above when the viewport has more room there', async () => {
    const user = userEvent.setup();
    const bounds = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 574,
      height: 54,
      left: 0,
      right: 320,
      top: 520,
      width: 320,
      x: 0,
      y: 520,
      toJSON: () => ({}),
    });
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });

    render(
      <RackSourceSelector
        label="Source"
        onChange={vi.fn()}
        options={[
          { label: 'System default', value: '' },
          { label: 'Interface input', value: 'interface' },
        ]}
        value=""
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Source' }));
    expect(screen.getByRole('listbox')).toHaveClass('ss-rack-source-menu--above');
    expect(screen.getByRole('listbox')).toHaveStyle({ maxHeight: '420px' });

    bounds.mockRestore();
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: originalInnerHeight,
    });
  });

  it('exposes the active record punch as the stop action', async () => {
    const user = userEvent.setup();
    const stop = vi.fn();
    render(
      <RackRecordPunch
        actionLabel="Stop recording"
        onClick={stop}
        pressed
        recording
        stateLabel="Recording"
      />,
    );

    const punch = screen.getByRole('button', { name: 'Stop recording' });
    expect(punch).toHaveAttribute('aria-pressed', 'true');
    await user.click(punch);
    expect(stop).toHaveBeenCalledOnce();
  });
});
