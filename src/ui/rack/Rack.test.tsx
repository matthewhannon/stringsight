import { render, screen } from '@testing-library/react';

import { Rack, RackButton, RackModule, RackStatus, RackValue } from './index';

describe('rack component library', () => {
  it('composes a labeled rack from reusable module primitives', () => {
    render(
      <Rack ariaLabel="Test rack">
        <RackModule
          actions={<RackButton>Configure</RackButton>}
          description="A testable module"
          moduleId="test-module"
          status="Online"
          statusTone="active"
          title="Signal tool"
          unit="TEST · 01"
        >
          <RackValue label="VALUE" value="42" />
        </RackModule>
      </Rack>,
    );

    expect(screen.getByRole('group', { name: 'Test rack' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Signal tool' })).toBeVisible();
    expect(screen.getByText('Online')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Configure' })).toBeEnabled();
    expect(screen.getByText('42')).toBeVisible();
  });

  it('supports standalone status and primary control primitives', () => {
    render(
      <div>
        <RackStatus tone="warning">Check input</RackStatus>
        <RackButton variant="primary">Record</RackButton>
      </div>,
    );

    expect(screen.getByText('Check input')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Record' })).toBeEnabled();
  });
});
