"use client";
import React from "react";
import type { NotificationFilters } from "../api/notification-types";

interface NotificationFiltersBarProps {
  filters: NotificationFilters;
  onChange: (filters: NotificationFilters) => void;
}

const CATEGORIES = [
  { value: "", label: "All Categories" },
  { value: "booking", label: "Booking" },
  { value: "payment", label: "Payment" },
  { value: "refund", label: "Refund" },
  { value: "agent_credit", label: "Agent Credit" },
  { value: "user", label: "User" },
  { value: "role", label: "Role" },
  { value: "settings", label: "Settings" },
  { value: "provider", label: "Provider" },
];

const SEVERITIES = [
  { value: "", label: "All Severities", color: "" },
  { value: "critical", label: "Critical", color: "text-red-600 dark:text-red-400" },
  { value: "high", label: "High", color: "text-amber-600 dark:text-amber-400" },
  { value: "info", label: "Info", color: "text-blue-600 dark:text-blue-400" },
];

const READ_STATES = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "read", label: "Read" },
];

export default function NotificationFiltersBar({ filters, onChange }: NotificationFiltersBarProps) {
  const updateFilter = (key: keyof NotificationFilters, value: string | undefined) => {
    onChange({ ...filters, [key]: value || undefined, page: 1 });
  };

  const activeCount = [filters.severity, filters.category, filters.type, filters.q, filters.from, filters.to].filter(Boolean).length;

  const clearAll = () => {
    onChange({ read: filters.read, limit: filters.limit });
  };

  return (
    <div className="space-y-3">
      {/* Filter chips for severity + read state */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Read state segmented control */}
        <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          {READ_STATES.map((opt) => (
            <button
              key={opt.value}
              onClick={() => updateFilter("read", opt.value === "all" ? undefined : opt.value)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                (filters.read ?? "all") === opt.value
                  ? "bg-brand-500 text-white"
                  : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Severity quick chips */}
        {SEVERITIES.slice(1).map((sev) => (
          <button
            key={sev.value}
            onClick={() => updateFilter("severity", filters.severity === sev.value ? undefined : sev.value)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
              filters.severity === sev.value
                ? sev.value === "critical"
                  ? "border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-400"
                  : sev.value === "high"
                  ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
                  : "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${
              sev.value === "critical" ? "bg-red-500" : sev.value === "high" ? "bg-amber-500" : "bg-blue-500"
            }`} />
            {sev.label}
          </button>
        ))}

        {/* Category select */}
        <select
          value={filters.category ?? ""}
          onChange={(e) => updateFilter("category", e.target.value)}
          className="h-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 text-xs text-gray-600 dark:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
        >
          {CATEGORIES.map((cat) => (
            <option key={cat.value} value={cat.value}>{cat.label}</option>
          ))}
        </select>

        {/* Search */}
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Search..."
            value={filters.q ?? ""}
            onChange={(e) => updateFilter("q", e.target.value)}
            className="h-8 w-44 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 pl-8 pr-2.5 text-xs text-gray-600 dark:text-gray-400 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-brand-300 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
          />
        </div>

        {/* Clear filters */}
        {activeCount > 0 && (
          <button
            onClick={clearAll}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            Clear ({activeCount})
          </button>
        )}
      </div>

      {/* Date range (second row) */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 dark:text-gray-500">From</span>
        <input
          type="date"
          value={filters.from ?? ""}
          onChange={(e) => updateFilter("from", e.target.value)}
          className="h-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 text-xs text-gray-600 dark:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
        />
        <span className="text-xs text-gray-400 dark:text-gray-500">to</span>
        <input
          type="date"
          value={filters.to ?? ""}
          onChange={(e) => updateFilter("to", e.target.value)}
          className="h-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 text-xs text-gray-600 dark:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
        />
      </div>
    </div>
  );
}
