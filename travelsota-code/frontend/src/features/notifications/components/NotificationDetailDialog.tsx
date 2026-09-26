"use client";
import React from "react";
import Link from "next/link";
import type { NotificationItem } from "../api/notification-types";

interface NotificationDetailDialogProps {
  notification: NotificationItem;
  onClose: () => void;
  onMarkRead: (id: string) => void;
  onDismiss: (id: string) => void;
}

function getEntityLink(n: NotificationItem): string | null {
  if (!n.entityType || !n.entityId) return null;
  if (n.entityType === "FlightBooking") return `/admin/bookings/${n.entityId}`;
  if (n.entityType === "HotelBooking") return `/admin/bookings/${n.entityId}`;
  return null;
}

export default function NotificationDetailDialog({
  notification,
  onClose,
  onMarkRead,
  onDismiss,
}: NotificationDetailDialogProps) {
  const entityLink = getEntityLink(notification);
  const isUnread = !notification.readAt;

  const severityConfig = {
    critical: { bg: "bg-red-50 dark:bg-red-950/40", border: "border-red-200 dark:border-red-800", text: "text-red-700 dark:text-red-400", dot: "bg-red-500" },
    high: { bg: "bg-amber-50 dark:bg-amber-950/40", border: "border-amber-200 dark:border-amber-800", text: "text-amber-700 dark:text-amber-400", dot: "bg-amber-500" },
    info: { bg: "bg-blue-50 dark:bg-blue-950/40", border: "border-blue-200 dark:border-blue-800", text: "text-blue-700 dark:text-blue-400", dot: "bg-blue-500" },
  };

  const config = severityConfig[notification.severity] ?? severityConfig.info;
  const categoryLabel = notification.category
    ? notification.category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : notification.type;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full max-w-lg rounded-2xl border ${config.border} ${config.bg} bg-white dark:bg-gray-900 shadow-2xl`}>
        {/* Header accent */}
        <div className={`h-1 rounded-t-2xl ${config.dot}`} />

        <div className="p-6">
          {/* Top row: severity badge + close */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${config.dot}`} />
              <span className={`text-xs font-semibold uppercase tracking-wide ${config.text}`}>
                {notification.severity}
              </span>
              {isUnread && (
                <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold rounded bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400">
                  NEW
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-800 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Title + message */}
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            {notification.title}
          </h3>
          {notification.message && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-5 leading-relaxed">
              {notification.message}
            </p>
          )}

          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-3">
            <MetaRow label="Type" value={notification.type} />
            <MetaRow label="Category" value={categoryLabel} />
            <MetaRow label="Created" value={new Date(notification.createdAt).toLocaleString()} />
            <MetaRow label="Status" value={isUnread ? "Unread" : "Read"} />
            {notification.entityType && (
              <MetaRow label="Entity Type" value={notification.entityType} />
            )}
            {notification.entityId && (
              <MetaRow label="Entity ID" value={notification.entityId.slice(0, 8) + "..."} />
            )}
          </div>

          {/* Actor info */}
          {notification.actor && (
            <div className="mt-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
              <p className="text-[11px] text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Actor</p>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {notification.actor.name || notification.actor.email || "System"}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            {isUnread && (
              <button
                onClick={() => {
                  onMarkRead(notification.id);
                  onClose();
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 transition-all duration-150 active:scale-95"
              >
                Mark as Read
              </button>
            )}
            {entityLink && (
              <Link
                href={entityLink}
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-all duration-150 active:scale-95"
              >
                View Booking
              </Link>
            )}
            <button
              onClick={() => {
                onDismiss(notification.id);
                onClose();
              }}
              className="ml-auto px-4 py-2 text-sm font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-150 active:scale-95"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 px-3 py-2">
      <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="text-sm text-gray-700 dark:text-gray-300 font-medium truncate">{value}</p>
    </div>
  );
}
