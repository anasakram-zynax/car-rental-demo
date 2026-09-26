"use client";

import React, { useEffect, useRef } from "react";

interface DialogOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
  title?: React.ReactNode;
  showCloseButton?: boolean;
}

/**
 * Native <dialog> overlay.
 *
 * showModal() renders in the browser TOP LAYER — above every z-index,
 * stacking context and composited (backdrop-filter) layer that exists.
 * This makes the class of bugs where an invisible backdrop intercepts
 * pointer events over the panel structurally impossible.
 *
 * Also locks body scroll while open AND compensates the removed scrollbar
 * width with padding so the page never shifts horizontally.
 */
export function DialogOverlay({
  isOpen,
  onClose,
  className,
  children,
  title,
  showCloseButton = true,
}: DialogOverlayProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (isOpen && !el.open) el.showModal();
    else if (!isOpen && el.open) el.close();
  }, [isOpen]);

  // Esc fires `cancel` before close — route it through onClose so parent state stays source of truth.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    el.addEventListener("cancel", onCancel);
    return () => el.removeEventListener("cancel", onCancel);
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    // Compensate scrollbar removal so content width never jumps.
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <dialog
      ref={ref}
      onClick={(e) => {
        // Clicks land on the <dialog> element itself only when hitting the ::backdrop area.
        if (e.target === ref.current) onClose();
      }}
      className={`
        m-auto w-full max-w-lg rounded-3xl bg-white p-0 text-left shadow-[0_24px_60px_rgba(3,61,74,0.25)]
        max-h-[85vh] overflow-y-auto
        backdrop:bg-black/45 backdrop:backdrop-blur-[6px]
        ${className ?? ""}
      `}
    >
      <div className="w-full" onClick={(e) => e.stopPropagation()}>
        {showCloseButton && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-zinc-700"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
        {title && (
          <div className="border-b border-zinc-100 px-6 py-4">
            <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </dialog>
  );
}
