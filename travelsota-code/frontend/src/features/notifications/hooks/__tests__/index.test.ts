import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

vi.mock('../../api/admin-notifications', () => ({
  listNotifications: vi.fn(),
  getUnreadNotificationCount: vi.fn(),
  getCriticalNotifications: vi.fn(),
  markNotificationsRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  dismissNotification: vi.fn(),
  getNotificationPreferences: vi.fn(),
  updateNotificationPreference: vi.fn(),
  getNotificationRules: vi.fn(),
  updateNotificationRule: vi.fn(),
  subscribeToNotificationEvents: vi.fn(),
  getNotificationsBySeverity: vi.fn(),
}));

vi.mock('@/components/admin/permission/usePermissions', () => ({
  usePermissions: () => ({
    permissions: ['notifications:read'],
    hasPermission: (code: string) => code === 'notifications:read',
    hasAnyPermission: (codes: string[]) => codes.includes('notifications:read'),
    hasAllPermissions: (codes: string[]) => codes.every((c) => c === 'notifications:read'),
    refreshPermissions: vi.fn(),
  }),
}));

import {
  listNotifications,
  getUnreadNotificationCount,
  getCriticalNotifications,
  markNotificationsRead,
  dismissNotification,
} from '../../api/admin-notifications';
import {
  useNotificationFeed,
  useUnreadNotificationCount,
  useCriticalNotifications,
  useMarkNotificationsRead,
  useDismissNotification,
} from '..';

function createQueryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

describe('notification hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useNotificationFeed', () => {
    it('fetches notification list', async () => {
      const mockResult = {
        data: [
          {
            id: 'n1',
            type: 'booking.confirmed',
            title: 'Booking Confirmed',
            severity: 'high',
            createdAt: '2026-01-01T00:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      };
      vi.mocked(listNotifications).mockResolvedValue(mockResult as any);

      const { wrapper } = createQueryWrapper();
      const { result } = renderHook(() => useNotificationFeed(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockResult);
      expect(listNotifications).toHaveBeenCalledWith(undefined);
    });
  });

  describe('useUnreadNotificationCount', () => {
    it('fetches unread counts', async () => {
      const mockResult = { total: 5, critical: 1, high: 2, info: 2 };
      vi.mocked(getUnreadNotificationCount).mockResolvedValue(mockResult as any);

      const { wrapper } = createQueryWrapper();
      const { result } = renderHook(() => useUnreadNotificationCount(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockResult);
    });
  });

  describe('useCriticalNotifications', () => {
    it('fetches critical notifications', async () => {
      const mockResult = [
        { id: 'n1', type: 'booking.failed', title: 'Booking Failed', severity: 'critical' },
      ];
      vi.mocked(getCriticalNotifications).mockResolvedValue(mockResult as any);

      const { wrapper } = createQueryWrapper();
      const { result } = renderHook(() => useCriticalNotifications(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockResult);
    });
  });

  describe('useMarkNotificationsRead', () => {
    it('calls markNotificationsRead and invalidates queries', async () => {
      vi.mocked(markNotificationsRead).mockResolvedValue({ count: 1 } as any);

      const { queryClient, wrapper } = createQueryWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useMarkNotificationsRead(), { wrapper });

      await result.current.mutateAsync(['n1', 'n2']);

      expect(markNotificationsRead).toHaveBeenCalledWith(['n1', 'n2']);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['notifications'] });
    });
  });

  describe('useDismissNotification', () => {
    it('calls dismissNotification and invalidates queries', async () => {
      vi.mocked(dismissNotification).mockResolvedValue({ dismissed: true } as any);

      const { queryClient, wrapper } = createQueryWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useDismissNotification(), { wrapper });

      await result.current.mutateAsync('n1');

      expect(dismissNotification).toHaveBeenCalledWith('n1');
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['notifications'] });
    });
  });
});
