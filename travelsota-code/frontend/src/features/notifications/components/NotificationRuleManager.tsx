"use client";
import React, { useState } from "react";
import { useNotificationRules, useUpdateNotificationRule } from "../hooks";
import type { NotificationRule } from "../api/notification-types";

interface NotificationRuleManagerProps {
  availableRoles: { id: string; name: string }[];
}

function groupByCategory(rules: NotificationRule[]): Record<string, NotificationRule[]> {
  const groups: Record<string, NotificationRule[]> = {};
  for (const rule of rules) {
    const cat = rule.category ?? "other";
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(rule);
  }
  return groups;
}

const CATEGORY_LABELS: Record<string, string> = {
  booking: "Bookings",
  payment: "Payments",
  refund: "Refunds",
  agent_credit: "Agent Credit",
  user: "User Management",
  role: "Roles & Permissions",
  settings: "Settings",
  provider: "Providers",
  other: "Other",
};

export default function NotificationRuleManager({ availableRoles }: NotificationRuleManagerProps) {
  const { data: rules, isLoading } = useNotificationRules();
  const updateRule = useUpdateNotificationRule();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!rules || rules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-gray-400 dark:text-gray-500">
        <p className="text-sm">No notification rules configured.</p>
      </div>
    );
  }

  const filtered = searchQuery
    ? rules.filter((r) => r.type.toLowerCase().includes(searchQuery.toLowerCase()))
    : rules;
  const grouped = groupByCategory(filtered);
  const enabledCount = rules.filter((r) => r.enabled).length;

  return (
    <div className="space-y-4">
      {/* Search + summary */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Search rules..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 pl-8 pr-2.5 text-xs text-gray-600 dark:text-gray-400 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-brand-300 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
          />
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {enabledCount}/{rules.length} enabled
        </span>
      </div>

      {/* Grouped rules */}
      {Object.entries(grouped).map(([category, categoryRules]) => (
        <div key={category}>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 px-1">
            {CATEGORY_LABELS[category] ?? category}
          </h4>
          <div className="space-y-1">
            {categoryRules.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                isExpanded={expandedId === rule.id}
                onToggleExpand={() => setExpandedId(expandedId === rule.id ? null : rule.id)}
                onToggleEnabled={async () => {
                  await updateRule.mutateAsync({ id: rule.id, input: { enabled: !rule.enabled } });
                }}
                onSave={async (data) => {
                  await updateRule.mutateAsync({ id: rule.id, input: data });
                  setExpandedId(null);
                }}
                availableRoles={availableRoles}
                isPending={updateRule.isPending}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RuleRow({
  rule,
  isExpanded,
  onToggleExpand,
  onToggleEnabled,
  onSave,
  availableRoles,
  isPending,
}: {
  rule: NotificationRule;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleEnabled: () => void;
  onSave: (data: { enabled?: boolean; severity?: string; critical?: boolean; roleIds?: string[] }) => Promise<void>;
  availableRoles: { id: string; name: string }[];
  isPending: boolean;
}) {
  const [severity, setSeverity] = useState(rule.severity);
  const [critical, setCritical] = useState(rule.critical);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>(rule.roles?.map((r) => r.roleId) ?? []);

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]
    );
  };

  const severityBadgeColor =
    rule.severity === "critical"
      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
      : rule.severity === "high"
      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
      : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";

  const formatType = (type: string) =>
    type
      .replace(/\./g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className={`rounded-xl border transition-colors ${
      rule.enabled
        ? "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
        : "border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 opacity-60"
    }`}>
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Toggle */}
        <button
          onClick={onToggleEnabled}
          disabled={isPending}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-50 ${
            rule.enabled ? "bg-brand-500" : "bg-gray-300 dark:bg-gray-600"
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
              rule.enabled ? "translate-x-[18px]" : "translate-x-[3px]"
            }`}
          />
        </button>

        {/* Type name */}
        <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
          {formatType(rule.type)}
        </span>

        {/* Badges */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded ${severityBadgeColor}`}>
            {rule.severity}
          </span>
          {rule.critical && (
            <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
              Critical
            </span>
          )}
        </div>

        {/* Role count */}
        <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
          {rule.roles.length} role{rule.roles.length !== 1 ? "s" : ""}
        </span>

        {/* Expand */}
        <button
          onClick={onToggleExpand}
          className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-800 transition-colors shrink-0"
          aria-label={isExpanded ? "Collapse" : "Expand"}
        >
          <svg className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
      </div>

      {/* Expanded panel */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-100 dark:border-gray-800 space-y-3">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Severity select */}
            <div>
              <label className="text-[11px] text-gray-400 dark:text-gray-500 block mb-1">Severity</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="h-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 text-xs text-gray-600 dark:text-gray-400 focus:border-brand-300 focus:outline-none"
              >
                <option value="info">Info</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            {/* Critical toggle */}
            <div className="flex items-center gap-2 pt-4">
              <input
                type="checkbox"
                id={`critical-${rule.id}`}
                checked={critical}
                onChange={(e) => setCritical(e.target.checked)}
                className="rounded border-gray-300 text-brand-500 focus:ring-brand-500"
              />
              <label htmlFor={`critical-${rule.id}`} className="text-xs text-gray-600 dark:text-gray-400">
                Critical alert
              </label>
            </div>
          </div>

          {/* Role assignment */}
          {availableRoles.length > 0 && (
            <div>
              <label className="text-[11px] text-gray-400 dark:text-gray-500 block mb-1.5">Assign to roles</label>
              <div className="flex flex-wrap gap-1.5">
                {availableRoles.map((role) => (
                  <button
                    key={role.id}
                    onClick={() => toggleRole(role.id)}
                    className={`px-2.5 py-1 text-xs rounded-lg border transition-all ${
                      selectedRoleIds.includes(role.id)
                        ? "bg-brand-50 border-brand-300 text-brand-700 dark:bg-brand-900/20 dark:border-brand-700 dark:text-brand-400 font-medium"
                        : "bg-white border-gray-200 text-gray-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"
                    }`}
                  >
                    {role.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Save */}
          <button
            onClick={() => onSave({ severity, critical, roleIds: selectedRoleIds })}
            disabled={isPending}
            className="px-4 py-1.5 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Saving..." : "Save Changes"}
          </button>
        </div>
      )}
    </div>
  );
}
