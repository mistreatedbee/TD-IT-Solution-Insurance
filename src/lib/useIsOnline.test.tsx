import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useIsOnline } from './useIsOnline';

function Probe() {
  const isOnline = useIsOnline();
  return <div>{isOnline ? 'online' : 'offline'}</div>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useIsOnline', () => {
  it('seeds from navigator.onLine', () => {
    vi.stubGlobal('navigator', { onLine: false });
    render(<Probe />);
    expect(screen.getByText('offline')).toBeInTheDocument();
  });

  it('defaults to true when navigator.onLine is true', () => {
    vi.stubGlobal('navigator', { onLine: true });
    render(<Probe />);
    expect(screen.getByText('online')).toBeInTheDocument();
  });

  it('updates when the browser fires offline/online events', () => {
    vi.stubGlobal('navigator', { onLine: true });
    render(<Probe />);
    expect(screen.getByText('online')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByText('offline')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByText('online')).toBeInTheDocument();
  });
});
