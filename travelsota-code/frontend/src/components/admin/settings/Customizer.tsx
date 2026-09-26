"use client";

import React from "react";
import {
  AlignStartHorizontal,
  AlignStartVertical,
  RotateCcw,
  Settings,
} from "lucide-react";
import { useAdminSettings } from "@/context/AdminSettingsContext";
import {
  radii,
  type LayoutType,
} from "@/config/admin-theme-presets";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/cn";

// ─── Customizer (Reference-2 full-kit port) ────────────────────────────────
// Floating bottom-right settings button + end-side Sheet. Mirrors
// dashboard-refference-2/full-kit/src/components/layout/customizer.tsx
// (minus the locale/Direction section — our app has no i18n routing).
// The Sheet content is portaled to <body>, so it carries the scoped
// theme/radius classes itself to inherit the admin palette.

const layoutOptions: { value: LayoutType; label: string; icon: React.ReactNode }[] = [
  {
    value: "horizontal",
    label: "Horizontal",
    icon: <AlignStartHorizontal className="shrink-0 h-4 w-4 me-2" />,
  },
  {
    value: "vertical",
    label: "Vertical",
    icon: <AlignStartVertical className="shrink-0 h-4 w-4 me-2" />,
  },
];

export function Customizer() {
  const { settings, updateSettings, resetSettings, shellClass } = useAdminSettings();
  return (
    <Sheet>
      <SheetTrigger className="admin-customizer-launcher fixed bottom-10 end-0 z-50" asChild>
        <button
          type="button"
          aria-label="Customizer"
          className="flex h-9 w-9 items-center justify-center rounded-e-none bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <Settings className="shrink-0 h-4 w-4" />
        </button>
      </SheetTrigger>
      <SheetContent className={cn("admin-sheet-content p-0", shellClass)} side="end">
        <ScrollArea className="h-full p-4">
          <div className="flex flex-1 flex-col space-y-4">
            <SheetHeader>
              <SheetTitle>Customizer</SheetTitle>
              <SheetDescription>
                Adjust the admin workspace without changing business behavior.
              </SheetDescription>
            </SheetHeader>

            {/* ── Color ── */}
            <div className="space-y-1.5">
              <p className="text-sm">Color</p>
              <div className="rounded-md border border-input bg-secondary px-3 py-2.5 text-sm font-medium text-secondary-foreground">
                Zinc · Reference-2 dashboard palette
              </div>
              <p className="text-xs text-muted-foreground">
                The admin workspace uses one unified color system across every tab.
              </p>
            </div>

            {/* ── Radius ── */}
            <div className="space-y-1.5">
              <p className="text-sm">Radius</p>
              <div className="grid grid-cols-5 gap-2">
                {radii.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={cn(
                      "inline-flex h-9 items-center justify-center rounded-md text-sm font-medium transition-colors",
                      settings.radius === value
                        ? "bg-secondary text-secondary-foreground"
                        : "border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                    )}
                    onClick={() => updateSettings({ radius: value })}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>


            {/* ── Layout ── */}
            <div className="space-y-1.5">
              <p className="text-sm">Layout</p>
              <div className="grid grid-cols-2 gap-2">
                {layoutOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(
                      "inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors",
                      settings.layout === option.value
                        ? "bg-secondary text-secondary-foreground"
                        : "border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                    )}
                    onClick={() => updateSettings({ layout: option.value })}
                  >
                    {option.icon}
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Reset ── */}
            <button
              type="button"
              className="inline-flex h-9 w-full items-center justify-center rounded-md border border-input bg-background text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              onClick={resetSettings}
            >
              <RotateCcw className="shrink-0 h-4 w-4 me-2" />
              Reset
            </button>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
