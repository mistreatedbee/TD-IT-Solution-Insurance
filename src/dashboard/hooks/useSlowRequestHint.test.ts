import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSlowRequestHint } from './useSlowRequestHint';
import { resetWarmUpForTests, warmUpApi } from '../api/warmup';

describe('useSlowRequestHint', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('stays false for a quick request and turns true only after the delay', () => {
    const { result, rerender } = renderHook(({ active }) => useSlowRequestHint(active, 4000), { initialProps: { active: true } });
    expect(result.current).toBe(false);
    act(() => void vi.advanceTimersByTime(3999));
    expect(result.current).toBe(false);
    act(() => void vi.advanceTimersByTime(2));
    expect(result.current).toBe(true);
    rerender({ active: false });
    expect(result.current).toBe(false);
  });

  it('never fires if the request finishes first', () => {
    const { result, rerender } = renderHook(({ active }) => useSlowRequestHint(active, 4000), { initialProps: { active: true } });
    act(() => void vi.advanceTimersByTime(1000));
    rerender({ active: false });
    act(() => void vi.advanceTimersByTime(10000));
    expect(result.current).toBe(false);
  });
});

describe('warmUpApi', () => {
  it('pings the health endpoint once per page load, without CORS, ignoring failures', () => {
    resetWarmUpForTests();
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);
    warmUpApi();
    warmUpApi();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toMatch(/\/api\/health\/ready$/);
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ mode: 'no-cors' });
    vi.unstubAllGlobals();
  });
});
