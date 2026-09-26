"use client";
import React from "react";
import { useCriticalNotifications, useMarkNotificationsRead, useDismissNotification } from "../hooks";
import type { NotificationItem } from "../api/notification-types";

export default function CriticalNotificationsPanel() {
  const { data, isLoading } = useCriticalNotifications();
  const markRead = useMarkNotificationsRead();
  const dismiss = useDismissNotification();

  const notifications = (data ?? []).slice(0, 5);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-5">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
          Critical Alerts
        </h3>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-5">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
          Critical Alerts
        </h3>
        <div className="flex flex-col items-center justify-center py-6 text-gray-400 dark:text-gray-500">
          <svg className="w-10 h-10 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm font-medium">No critical alerts</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-red-200 bg-white dark:border-red-800 dark:bg-gray-900 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          Critical Alerts
        </h3>
        <span className="text-sm text-gray-400 dark:text-gray-500">
          {notifications.length} unread
        </span>
      </div>
      <div className="space-y-3">
        {notifications.map((notification) => (
          <NotificationCard
            key={notification.id}
            notification={notification}
            onMarkRead={() => markRead.mutateAsync([notification.id])}
            onDismiss={() => dismiss.mutateAsync(notification.id)}
          />
        ))}
      </div>
    </div>
  );
}

function NotificationCard({
  notification,
  onMarkRead,
  onDismiss,
}: {
  notification: NotificationItem;
  onMarkRead: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-red-100 bg-red-50/50 dark:border-red-800 dark:bg-red-900/10 p-3">
      <div className="shrink-0 mt-0.5">
        <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">
          {notification.title}
        </p>
        {notification.message && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {notification.message}
          </p>
        )}
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          {new Date(notification.createdAt).toLocaleString()}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onMarkRead}
          className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
        >
          Mark Read
        </button>
        <button
          onClick={onDismiss}
          className="text-xs font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}