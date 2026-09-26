"use client";
import React, { useState, useRef, useEffect } from "react";
import { useNotificationBootstrap } from "@/features/notifications/hooks";
import { usePermissions } from "@/components/admin/permission/usePermissions";
import { PermissionCode } from "@/lib/permissions";
import NotificationDropdown from "./NotificationDropdown";

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const { hasPermission } = usePermissions();
  const { data: bootstrap } = useNotificationBootstrap();
  const counts = bootstrap?.unread;
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [isOpen]);

  // Toast summaries dispatched by the notification→toast bridge open the bell.
  useEffect(() => {
    function handleOpenEvent() {
      setIsOpen(true);
    }
    window.addEventListener("travalq:open-notifications", handleOpenEvent);
    return () => {
      window.removeEventListener("travalq:open-notifications", handleOpenEvent);
    };
  }, []);

  const canRead = hasPermission(PermissionCode.NOTIFICATIONS_READ);
  if (!canRead) return null;

  const unreadTotal = counts?.total ?? 0;
  const hasCritical = (counts?.critical ?? 0) > 0;

  return (
    <div className="relative" ref={containerRef} data-notification-bell="">
      <button
        onClick={() => setIsOpen((p) => !p)}
        className={`
          relative flex items-center justify-center w-10 h-10 rounded-xl
          transition-all duration-200 ease-out
          ${isOpen
            ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white"
            : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200"
          }
          ${hasCritical ? "text-red-500 dark:text-red-400" : ""}
        `}
        aria-label={`Notifications${unreadTotal > 0 ? ` (${unreadTotal} unread)` : ""}`}
      >
        {/* Bell SVG */}
        <svg
          className={`w-5 h-5 transition-transform duration-200 ${isOpen ? "rotate-12" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
          />
        </svg>

        {/* Unread badge */}
        {unreadTotal > 0 && (
          <span
            className={`
              absolute -top-0.5 -right-0.5 flex items-center justify-center
              min-w-[18px] h-[18px] px-1
              text-[10px] font-bold text-white rounded-full
              ring-2 ring-white dark:ring-gray-900
              transition-transform duration-200
              ${hasCritical
                ? "bg-red-500 animate-pulse"
                : "bg-brand-500"
              }
            `}
          >
            {unreadTotal > 99 ? "99+" : unreadTotal}
          </span>
        )}
      </button>

      <NotificationDropdown isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </div>
  );
}
