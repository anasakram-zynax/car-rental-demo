import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePermissions } from '@/components/admin/permission/usePermissions';
import { PermissionCode } from '@/lib/permissions';
import {
  listNotifications,
  getUnreadNotificationCount,
  getCriticalNotifications,
  getNotificationBootstrap,
  markNotificationsRead,
  markAllNotificationsRead,
  dismissNotification,
  deleteNotifications,
  getNotificationPreferences,
  updateNotificationPreference,
  getNotificationRules,
  updateNotificationRule,
} from '../api/admin-notifications';
import type { NotificationFilters } from '../api/notification-types';
import type { NotificationListResult, UnreadCountResult, NotificationItem } from '../api/notification-types';
import type { NotificationBootstrap } from '../api/admin-notifications';

export function useNotificationFeed(filters?: NotificationFilters) {
  const { hasPermission } = usePermissions();
  const enabled = hasPermission(PermissionCode.NOTIFICATIONS_READ);

  return useQuery({
    queryKey: ['notifications', filters ?? {}],
    queryFn: () => listNotifications(filters),
    staleTime: 15 * 1000,
    refetchInterval: enabled ? 60 * 1000 : false,
    refetchOnWindowFocus: enabled,
    enabled,
  });
}

export function useUnreadNotificationCount() {
  const { hasPermission } = usePermissions();
  const enabled = hasPermission(PermissionCode.NOTIFICATIONS_READ);

  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: getUnreadNotificationCount,
    staleTime: 30 * 1000,
    refetchInterval: enabled ? 60 * 1000 : false,
    refetchOnWindowFocus: enabled,
    enabled,
  });
}

export function useCriticalNotifications() {
  const { hasPermission } = usePermissions();
  const enabled = hasPermission(PermissionCode.NOTIFICATIONS_READ);

  return useQuery({
    queryKey: ['notifications', 'critical'],
    queryFn: getCriticalNotifications,
    staleTime: 15 * 1000,
    refetchInterval: enabled ? 60 * 1000 : false,
    refetchOnWindowFocus: enabled,
    enabled,
  });
}

/**
 * Header bootstrap: unread + critical + recent + high in ONE request.
 * Used by the bell + dropdown so every tab doesn't fan out 4 calls.
 * Keyed under the ['notifications'] prefix so existing mutations
 * (cancel/invalidate/optimistic) keep working; the bootstrap shape has no
 * `data` array, so feed-specific optimistic edits skip it safely.
 */
export function useNotificationBootstrap() {
  const { hasPermission } = usePermissions();
  const enabled = hasPermission(PermissionCode.NOTIFICATIONS_READ);

  return useQuery({
    queryKey: ['notifications', 'bootstrap'],
    queryFn: getNotificationBootstrap,
    staleTime: 30 * 1000,
    refetchInterval: enabled ? 60 * 1000 : false,
    refetchOnWindowFocus: enabled,
    enabled,
  });
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => markNotificationsRead(ids),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] });

      const previousFeeds = queryClient.getQueriesData({ queryKey: ['notifications'] });
      const previousCount = queryClient.getQueryData<UnreadCountResult>(['notifications', 'unread-count']);

      previousFeeds.forEach(([key, data]) => {
        if (data && typeof data === 'object' && 'data' in data && Array.isArray((data as NotificationListResult).data)) {
          const feedData = data as NotificationListResult;
          const isUnreadFeed = typeof key[1] === 'object' && key[1] !== null && (key[1] as NotificationFilters).read === 'unread';
          if (isUnreadFeed) {
            queryClient.setQueryData(key, {
              ...feedData,
              data: feedData.data.filter((n) => !ids.includes(n.id)),
              total: Math.max(0, feedData.total - ids.length),
            });
          } else {
            queryClient.setQueryData(key, {
              ...feedData,
              data: feedData.data.map((n) =>
                ids.includes(n.id) ? { ...n, readAt: new Date().toISOString() } : n,
              ),
            });
          }
        }
      });

      if (previousCount) {
        // Only decrement for IDs that were actually unread, grouped by
        // severity so the bell's critical styling stays accurate.
        const unreadSeverities = new Map<string, string>();
        previousFeeds.forEach(([, data]) => {
          if (data && typeof data === 'object' && 'data' in data) {
            for (const n of (data as NotificationListResult).data) {
              if (ids.includes(n.id) && !n.readAt) unreadSeverities.set(n.id, n.severity);
            }
          }
        });
        let { total, critical, high, info } = previousCount;
        for (const sev of unreadSeverities.values()) {
          total -= 1;
          if (sev === 'critical') critical -= 1;
          else if (sev === 'high') high -= 1;
          else info -= 1;
        }
        queryClient.setQueryData<UnreadCountResult>(['notifications', 'unread-count'], {
          total: Math.max(0, total),
          critical: Math.max(0, critical),
          high: Math.max(0, high),
          info: Math.max(0, info),
        });
      }

      // Same optimistic patch for the header bootstrap cache.
      const previousBootstrap =
        queryClient.getQueryData<NotificationBootstrap>(['notifications', 'bootstrap']);
      if (previousBootstrap) {
        const dropIds = (list: NotificationItem[]) =>
          list.filter((n) => !ids.includes(n.id));
        const unreadDelta = previousBootstrap.recent.data.filter(
          (n) => ids.includes(n.id) && !n.readAt,
        ).length;
        queryClient.setQueryData<NotificationBootstrap>(['notifications', 'bootstrap'], {
          ...previousBootstrap,
          unread: {
            ...previousBootstrap.unread,
            total: Math.max(0, previousBootstrap.unread.total - unreadDelta),
          },
          recent: {
            ...previousBootstrap.recent,
            data: dropIds(previousBootstrap.recent.data),
            total: Math.max(0, previousBootstrap.recent.total - unreadDelta),
          },
          high: {
            ...previousBootstrap.high,
            data: dropIds(previousBootstrap.high.data),
          },
          critical: previousBootstrap.critical.filter((n) => !ids.includes(n.id)),
        });
      }

      return { previousFeeds, previousCount, previousBootstrap };
    },
    onError: (_err, _ids, context) => {
      context?.previousFeeds.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      if (context?.previousCount) {
        queryClient.setQueryData(['notifications', 'unread-count'], context.previousCount);
      }
      if (context?.previousBootstrap) {
        queryClient.setQueryData(['notifications', 'bootstrap'], context.previousBootstrap);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (filters?: NotificationFilters) => markAllNotificationsRead(filters),
    onMutate: async (filters) => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] });

      const previousFeeds = queryClient.getQueriesData({ queryKey: ['notifications'] });
      const previousCount = queryClient.getQueryData<UnreadCountResult>(['notifications', 'unread-count']);

      previousFeeds.forEach(([key, data]) => {
        if (data && typeof data === 'object' && 'data' in data) {
          const feedData = data as NotificationListResult;
          const isUnreadFeed = typeof key[1] === 'object' && key[1] !== null && (key[1] as NotificationFilters).read === 'unread';
          if (isUnreadFeed) {
            queryClient.setQueryData(key, { ...feedData, data: [], total: 0 });
          } else {
            queryClient.setQueryData(key, {
              ...feedData,
              data: feedData.data.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
            });
          }
        }
      });

      // Only zero the badge for an unfiltered "mark all" — filtered variants
      // keep the last known counts until the server-confirmed refetch.
      if (previousCount && !filters) {
        queryClient.setQueryData<UnreadCountResult>(['notifications', 'unread-count'], {
          total: 0,
          critical: 0,
          high: 0,
          info: 0,
        });
      }

      return { previousFeeds, previousCount };
    },
    onError: (_err, _filters, context) => {
      context?.previousFeeds.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      if (context?.previousCount) {
        queryClient.setQueryData(['notifications', 'unread-count'], context.previousCount);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useDismissNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dismissNotification(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] });

      const previousFeeds = queryClient.getQueriesData({ queryKey: ['notifications'] });
      const previousCount = queryClient.getQueryData<UnreadCountResult>(['notifications', 'unread-count']);

      let wasUnread = false;

      previousFeeds.forEach(([key, data]) => {
        if (data && typeof data === 'object' && 'data' in data && Array.isArray((data as NotificationListResult).data)) {
          const feedData = data as NotificationListResult;
          const item = feedData.data.find((n) => n.id === id);
          if (item && !item.readAt) wasUnread = true;

          queryClient.setQueryData(key, {
            ...feedData,
            data: feedData.data.filter((n) => n.id !== id),
            total: Math.max(0, feedData.total - 1),
          });
        }
      });

      if (wasUnread && previousCount) {
        queryClient.setQueryData<UnreadCountResult>(['notifications', 'unread-count'], {
          ...previousCount,
          total: Math.max(0, previousCount.total - 1),
          critical: previousCount.critical,
          high: previousCount.high,
          info: previousCount.info,
        });
      }

      return { previousFeeds, previousCount };
    },
    onError: (_err, _id, context) => {
      context?.previousFeeds.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      if (context?.previousCount) {
        queryClient.setQueryData(['notifications', 'unread-count'], context.previousCount);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useDeleteNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => deleteNotifications(ids),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] });
      const previousFeeds = queryClient.getQueriesData({ queryKey: ['notifications'] });
      previousFeeds.forEach(([key, data]) => {
        if (data && typeof data === 'object' && 'data' in data && Array.isArray((data as NotificationListResult).data)) {
          const feedData = data as NotificationListResult;
          queryClient.setQueryData(key, {
            ...feedData,
            data: feedData.data.filter((n) => !ids.includes(n.id)),
            total: Math.max(0, feedData.total - ids.length),
          });
        }
      });
      return { previousFeeds };
    },
    onError: (_err, _ids, context) => {
      context?.previousFeeds.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: ['notifications', 'preferences'],
    queryFn: getNotificationPreferences,
    staleTime: 60 * 1000,
  });
}

export function useUpdateNotificationPreference() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { type: string; channel: string; enabled: boolean }) =>
      updateNotificationPreference(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'preferences'] });
    },
  });
}

export function useNotificationRules() {
  return useQuery({
    queryKey: ['notifications', 'rules'],
    queryFn: getNotificationRules,
    staleTime: 30 * 1000,
  });
}

export function useUpdateNotificationRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: {
        enabled?: boolean;
        severity?: string;
        critical?: boolean;
        roleIds?: string[];
      };
    }) => updateNotificationRule(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'rules'] });
    },
  });
}
