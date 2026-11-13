import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { useProtectionChecklistQuery } from '../useProtectionChecklist';

const mockGet = jest.fn();
let mockFlag = true;
jest.mock('../../../config/features', () => ({
  get FEATURE_PROTECTION_CHECKLIST_ENABLED() {
    return mockFlag;
  },
}));
jest.mock('../../protectionChecklist', () => ({
  getProtectionChecklist: () => mockGet(),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useProtectionChecklistQuery', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockFlag = true;
  });

  it('returns the server view', async () => {
    mockGet.mockResolvedValue({ doneCount: 2 });
    const { result } = await renderHook(() => useProtectionChecklistQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ doneCount: 2 });
  });

  it('surfaces errors', async () => {
    mockGet.mockRejectedValue(new Error('boom'));
    const { result } = await renderHook(() => useProtectionChecklistQuery(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('flag off', () => {
  it('does not fetch when the flag is off', async () => {
    mockFlag = false;
    mockGet.mockClear();
    const { result } = await renderHook(() => useProtectionChecklistQuery(), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });
});
