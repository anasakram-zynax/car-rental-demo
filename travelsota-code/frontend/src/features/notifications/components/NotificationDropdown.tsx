"use client";
import React, { useState, useCallback } from "react";
import Link from "next/link";
import { Dropdown } from "@/components/ui/dropdown/Dropdown";
import { useNotificationBootstrap, useMarkNotificationsRead, useMarkAllNotificationsRead } from "../hooks";
import type { NotificationItem } from "../api/notification-types";

interface NotificationDropdownProps {
  isOpen: boolean;
  onClose: () => void;
}

function SeverityDot({ severity }: { severity: string }) {
  const color =
    severity === "critical"
      ? "bg-red-500"
      : severity === "high"
      ? "bg-amber-500"
      : "bg-blue-500";
  return <span className={`w-2 h-2 rounded-full shrink-0 ${color}`} />;
}

function getEntityLink(n: NotificationItem): string | null {
  if (!n.entityType || !n.entityId) return null;
  if (n.entityType === "FlightBooking") return `/admin/bookings/${n.entityId}`;
  if (n.entityType === "HotelBooking") return `/admin/bookings/${n.entityId}`;
  return null;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function NotificationItemRow({
  notification,
  onMarkRead,
  onClose,
}: {
  notification: NotificationItem;
  onMarkRead: (e: React.MouseEvent, id: string) => void;
  onClose: () => void;
}) {
  const [marking, setMarking] = useState(false);
  const [justMarked, setJustMarked] = useState(false);
  const entityLink = getEntityLink(notification);
  const isUnread = !notification.readAt;

  const handleMarkRead = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (marking) return;
      setMarking(true);
      setJustMarked(true);
      onMarkRead(e, notification.id);
    },
    [marking, onMarkRead, notification.id],
  );

  const rowClass = `
    group flex gap-3 px-4 py-3
    transition-all duration-200 ease-out cursor-pointer
    hover:bg-gray-50 dark:hover:bg-gray-800/60
    active:bg-gray-100 dark:active:bg-gray-800/80
    ${isUnread ? "bg-blue-50/40 dark:bg-blue-900/10" : ""}
  `;

  const content = (
    <>
      <div className="shrink-0 mt-0.5">
        <div
          className={`
            w-9 h-9 rounded-full flex items-center justify-center
            transition-transform duration-200 group-hover:scale-110
            ${notification.severity === "critical"
              ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
              : notification.severity === "high"
              ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
              : "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
            }
          `}
        >
          {notification.severity === "critical" ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
          )}
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className={`text-sm font-medium truncate ${isUnread ? "text-gray-900 dark:text-white" : "text-gray-600 dark:text-gray-400"}`}>
            {notification.title}
          </span>
          <SeverityDot severity={notification.severity} />
        </div>
        {notification.message && (
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mb-0.5">
            {notification.message}
          </p>
        )}
        <div className="flex items-center gap-2 text-[11px] text-gray-400 dark:text-gray-500">
          <span>{notification.category ?? notification.type}</span>
          <span className="w-0.5 h-0.5 rounded-full bg-gray-300 dark:bg-gray-600" />
          <span>{formatTime(notification.createdAt)}</span>
          {isUnread && (
            <>
              <span className="w-0.5 h-0.5 rounded-full bg-gray-300 dark:bg-gray-600" />
              <button
                onClick={handleMarkRead}
                disabled={marking}
                className={`
                  inline-flex items-center gap-1 text-brand-500 font-medium
                  transition-all duration-150
                  hover:text-brand-600 hover:underline
                  active:scale-95
                  disabled:opacity-60 disabled:cursor-not-allowed
                  ${justMarked ? "text-green-500" : ""}
                `}
              >
                {justMarked ? (
                  <>
                    <svg className="w-3 h-3 animate-[scale-in_0.2s_ease-out]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    Done
                  </>
                ) : (
                  "Mark read"
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );

  if (entityLink) {
    return (
      <li key={notification.id} className="border-b border-gray-100 dark:border-gray-800 last:border-b-0 transition-all duration-200">
        <Link href={entityLink} onClick={onClose} className={rowClass}>
          {content}
        </Link>
      </li>
    );
  }

  return (
    <li key={notification.id} className="border-b border-gray-100 dark:border-gray-800 last:border-b-0 transition-all duration-200">
      <div className={rowClass}>{content}</div>
    </li>
  );
}

export default function NotificationDropdown({ isOpen, onClose }: NotificationDropdownProps) {
  const { data: bootstrap } = useNotificationBootstrap();
  const data = bootstrap?.recent;
  const markRead = useMarkNotificationsRead();
  const markAllRead = useMarkAllNotificationsRead();
  const notifications = data?.data ?? [];

  const handleMarkRead = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    markRead.mutate([id]);
  };

  return (
    <Dropdown
      isOpen={isOpen}
      onClose={onClose}
      className="absolute right-0 mt-2 flex h-[440px] w-[360px] flex-col rounded-2xl border border-gray-200 bg-white p-0 shadow-2xl dark:border-gray-800 dark:bg-gray-900 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <div>
          <h5 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            Notifications
          </h5>
          {notifications.length > 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {notifications.length} unread
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {notifications.length > 0 && (
            <button
              onClick={() => markAllRead.mutate(undefined)}
              disabled={markAllRead.isPending}
              title="Mark all as read"
              aria-label="Mark all as read"
              className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:text-brand-400 dark:hover:bg-brand-900/20 transition-all duration-150 active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-800 transition-all duration-150 active:scale-90"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* List */}
      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-gray-400 dark:text-gray-500 px-4">
          <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
          </div>
          <p className="text-sm font-medium">All caught up</p>
          <p className="text-xs mt-0.5">No new notifications</p>
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {notifications.map((notification) => (
            <NotificationItemRow
              key={notification.id}
              notification={notification}
              onMarkRead={handleMarkRead}
              onClose={onClose}
            />
          ))}
        </ul>
      )}

      {/* Footer */}
      <div className="border-t border-gray-100 dark:border-gray-800 p-2">
        <Link
          href="/admin/notifications"
          onClick={onClose}
          className="flex items-center justify-center gap-2 text-center px-4 py-2.5 text-sm font-medium text-brand-600 dark:text-brand-400 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-all duration-150 active:scale-[0.98]"
        >
          View All Notifications
          <svg className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </Link>
      </div>
    </Dropdown>
  );
}
