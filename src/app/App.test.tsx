import { render, screen } from '@testing-library/react';

import { App } from './App';

describe('App', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('opens directly into the realistic rack workspace', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { level: 1, name: /stringsight rack workspace/i }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: /session control/i })).toBeVisible();
    expect(screen.getByRole('heading', { name: /audio input/i })).toBeVisible();
    expect(screen.getByRole('heading', { name: /pitch analysis/i })).toBeVisible();
    expect(screen.getByRole('heading', { name: /evaluation bench/i })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Input' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('combobox', { name: 'Source' })).toBeEnabled();
    expect(screen.queryByText(/rack stack concepts/i)).not.toBeInTheDocument();
  });
});
