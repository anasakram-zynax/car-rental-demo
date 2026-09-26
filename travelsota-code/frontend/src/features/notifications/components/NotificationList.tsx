"use client";
import React, { useState } from "react";
import {
  useNotificationFeed,
  useMarkNotificationsRead,
  useDismissNotification,
  useMarkAllNotificationsRead,
  useDeleteNotifications,
} from "../hooks";
import type { NotificationItem, NotificationFilters } from "../api/notification-types";
import NotificationFiltersBar from "./NotificationFilters";
import NotificationDetailDialog from "./NotificationDetailDialog";
import { ConfirmDialog } from "@/components/admin/shared/ConfirmDialog";
import { useToast } from "@/hooks/useToast";

function getSeverityBadge(severity: string) {
  switch (severity) {
    case "critical":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          Critical
        </span>
      );
    case "high":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          High
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          Info
        </span>
      );
  }
}

function getCategoryBadge(category: string | null | undefined, type: string) {
  const label = category ? category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : type;
  return (
    <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
      {label}
    </span>
  );
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export default function NotificationList() {
  const toasts = useToast();
  const [filters, setFilters] = useState<NotificationFilters>({ read: "all", limit: 20 });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailNotification, setDetailNotification] = useState<NotificationItem | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<string[] | null>(null);

  const { data, isLoading, isError } = useNotificationFeed(filters);
  const markRead = useMarkNotificationsRead();
  const markAllRead = useMarkAllNotificationsRead();
  const dismiss = useDismissNotification();
  const deleteNotifs = useDeleteNotifications();

  const notifications = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / (filters.limit ?? 20));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === notifications.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(notifications.map((n) => n.id)));
    }
  };

  const handleBulkMarkRead = () => {
    if (selectedIds.size === 0) return;
    markRead.mutate(Array.from(selectedIds), {
      onSuccess: () => setSelectedIds(new Set()),
    });
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate(filters);
  };

  const handleMarkRead = (id: string) => {
    if (markingId) return;
    setMarkingId(id);
    markRead.mutate([id], {
      onSettled: () => setMarkingId(null),
    });
  };

  const handleDismiss = (id: string) => {
    if (dismissingId) return;
    setDismissingId(id);
    dismiss.mutate(id, {
      onSettled: () => setDismissingId(null),
    });
  };

  const handleDelete = () => {
    if (!deleteTargets?.length) return;
    const count = deleteTargets.length;
    deleteNotifs.mutate(deleteTargets, {
      onSuccess: () => {
        setSelectedIds(new Set());
        setDeleteTargets(null);
        toasts.success(
          count === 1 ? "Notification deleted" : "Notifications deleted",
          `${count} ${count === 1 ? "notification" : "notifications"} permanently removed.`,
        );
      },
      onError: () => {
        toasts.error("Delete failed", "Unable to delete notifications.");
      },
    });
  };

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-9 w-32 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 animate-pulse border-b border-border bg-muted/30" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <p className="text-lg font-medium">Failed to load notifications</p>
        <p className="text-sm mt-1">Please try again later</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <NotificationFiltersBar filters={filters} onChange={setFilters} />

      {/* Bulk actions */}
      {notifications.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <label className="group flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={selectedIds.size === notifications.length && notifications.length > 0}
              onChange={toggleSelectAll}
              className="rounded border-border text-primary focus:ring-primary transition-colors"
            />
            <span className="transition-colors group-hover:text-foreground">Select all</span>
          </label>
          {selectedIds.size > 0 && (
            <>
              <button
                onClick={handleBulkMarkRead}
                disabled={markRead.isPending}
                className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 disabled:opacity-50 transition-all duration-150 hover:underline active:scale-95"
              >
                Mark {selectedIds.size} read
              </button>
              <button
                onClick={() => setDeleteTargets(Array.from(selectedIds))}
                disabled={deleteNotifs.isPending}
                className="inline-flex items-center gap-1 text-sm font-medium text-error-500 hover:text-error-600 disabled:opacity-50 transition-all duration-150 hover:underline active:scale-95 cursor-pointer"
              >
                Delete {selectedIds.size}
              </button>
            </>
          )}
          <button
            onClick={handleMarkAllRead}
            disabled={markAllRead.isPending}              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-all duration-150 hover:underline active:scale-95 disabled:opacity-50"
          >
            Mark all read
          </button>
        </div>
      )}

      {/* Empty state */}
      {notifications.length === 0 && (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
          </div>
          <p className="text-lg font-medium">No notifications</p>
          <p className="text-sm mt-1">You&apos;re all caught up!</p>
        </div>
      )}

      {/* Table */}
      {notifications.length > 0 && (
        <div className="admin-table-card overflow-hidden rounded-xl border border-border">
          {/* Table Header */}
          <div className="grid grid-cols-[36px_1fr_120px_120px_100px_90px] gap-3 border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <div className="flex items-center justify-center">
              <input
                type="checkbox"
                checked={selectedIds.size === notifications.length && notifications.length > 0}
                onChange={toggleSelectAll}
                className="rounded border-border text-primary focus:ring-primary transition-colors"
              />
            </div>
            <div>Notification</div>
            <div>Severity</div>
            <div>Category</div>
            <div>Time</div>
            <div className="text-right">Actions</div>
          </div>

          {/* Table Body */}
          {notifications.map((notification, index) => {
            const isUnread = !notification.readAt;
            const isMarking = markingId === notification.id;
            const isDismissing = dismissingId === notification.id;

            return (
              <div
                key={notification.id}
                onClick={() => !isMarking && !isDismissing && setDetailNotification(notification)}
                className={`
                  group grid grid-cols-[36px_1fr_120px_120px_100px_90px] gap-3 items-center
                  px-4 py-3 border-b border-border/60 last:border-b-0
                  transition-all duration-200 ease-out cursor-pointer
                  ${isDismissing ? "opacity-40 scale-[0.98]" : ""}
                  ${isUnread
                    ? "bg-primary/5 hover:bg-primary/10"
                    : "hover:bg-muted/40"
                  }
                `}
                style={{ animationDelay: `${index * 30}ms` }}
              >
                {/* Checkbox */}
                <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(notification.id)}
                    onChange={() => toggleSelect(notification.id)}
                    className="rounded border-border text-primary focus:ring-primary transition-colors"
                  />
                </div>

                {/* Notification info */}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-sm font-medium truncate transition-colors duration-150 ${isUnread ? "text-foreground" : "text-muted-foreground"}`}>
                      {notification.title}
                    </span>
                    {isUnread && (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    )}
                  </div>
                  {notification.message && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {notification.message}
                    </p>
                  )}
                </div>

                {/* Severity */}
                <div onClick={(e) => e.stopPropagation()}>
                  {getSeverityBadge(notification.severity)}
                </div>

                {/* Category */}
                <div onClick={(e) => e.stopPropagation()}>
                  {getCategoryBadge(notification.category, notification.type)}
                </div>

                {/* Time */}
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatTime(notification.createdAt)}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  {isUnread && (
                    <button
                      onClick={() => handleMarkRead(notification.id)}
                      disabled={isMarking}
                      className={`
                        group/btn inline-flex items-center gap-1
                        px-2 py-1 text-xs font-medium rounded-md
                        transition-all duration-150 ease-out
                        active:scale-95
                        disabled:opacity-60 disabled:cursor-not-allowed
                        ${isMarking
                          ? "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20"
                          : "text-primary hover:text-primary/80 hover:bg-primary/5"
                        }
                      `}
                    >
                      {isMarking ? (
                        <>
                          <svg className="w-3 h-3 animate-[scaleIn_0.2s_ease-out]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                          Done
                        </>
                      ) : (
                        <>
                          <svg className="w-3 h-3 transition-transform duration-150 group-hover/btn:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                          Read
                        </>
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => setDeleteTargets([notification.id])}
                    disabled={deleteNotifs.isPending}
                    aria-label="Delete notification"
                    className="group/btn inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md text-gray-400 hover:text-error-500 hover:bg-error-50 dark:hover:bg-error-900/20 transition-all duration-150 ease-out active:scale-95 cursor-pointer"
                  >
                    <svg className="w-3 h-3 transition-transform duration-150 group-hover/btn:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDismiss(notification.id)}
                    disabled={isDismissing}
                    className={`
                      group/btn inline-flex items-center gap-1
                      px-2 py-1 text-xs font-medium rounded-md
                      transition-all duration-150 ease-out
                      active:scale-95
                      disabled:opacity-60 disabled:cursor-not-allowed
                      ${isDismissing
                        ? "text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800"
                        : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                        }
                    `}
                  >
                    {isDismissing ? (
                      <span className="animate-pulse">Removing...</span>
                    ) : (
                      <>
                        <svg className="w-3 h-3 transition-transform duration-150 group-hover/btn:rotate-45" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Dismiss
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            Showing {(filters.page ?? 1) * (filters.limit ?? 20) - (filters.limit ?? 20) + 1}
            {" - "}
            {Math.min((filters.page ?? 1) * (filters.limit ?? 20), total)} of {total}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => handlePageChange((filters.page ?? 1) - 1)}
              disabled={(filters.page ?? 1) <= 1}
              className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40 hover:bg-muted transition-all duration-150 active:scale-95"
            >
              Prev
            </button>
            {(() => {
              const current = filters.page ?? 1;
              const pages: (number | 'dots')[] = [];
              if (totalPages <= 7) {
                for (let i = 1; i <= totalPages; i++) pages.push(i);
              } else {
                pages.push(1);
                if (current > 3) pages.push('dots');
                const start = Math.max(2, current - 1);
                const end = Math.min(totalPages - 1, current + 1);
                for (let i = start; i <= end; i++) pages.push(i);
                if (current < totalPages - 2) pages.push('dots');
                pages.push(totalPages);
              }
              return pages.map((page, i) =>
                page === 'dots' ? (
                  <span key={`dots-${i}`} className="px-1 text-sm text-muted-foreground">...</span>
                ) : (
                  <button
                    key={page}
                    onClick={() => handlePageChange(page)}
                    className={`min-w-[32px] rounded-lg px-2 py-1.5 text-sm transition-all duration-150 active:scale-95 ${
                      page === current
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "border border-border hover:bg-muted"
                    }`}
                  >
                    {page}
                  </button>
                )
              );
            })()}
            <button
              onClick={() => handlePageChange((filters.page ?? 1) + 1)}
              disabled={(filters.page ?? 1) >= totalPages}
              className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40 hover:bg-muted transition-all duration-150 active:scale-95"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Detail dialog */}
      {detailNotification && (
        <NotificationDetailDialog
          notification={detailNotification}
          onClose={() => setDetailNotification(null)}
          onMarkRead={handleMarkRead}
          onDismiss={handleDismiss}
        />
      )}

      {/* Delete confirm */}
      {deleteTargets && (
        <ConfirmDialog
          open
          count={deleteTargets.length}
          noun="notification"
          loading={deleteNotifs.isPending}
          onCancel={() => setDeleteTargets(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}
