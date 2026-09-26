'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
  children: ReactNode;
  align?: 'left' | 'right';
  matchWidth?: boolean;
  /** Anchor width becomes a minimum — panel may grow wider via its own classes. */
  matchMinWidth?: boolean;
  className?: string;
  /** Offset from anchor bottom (px). Default 4. */
  gap?: number;
  /** Outer panel scrolls when taller than the viewport (default). Set false if children scroll themselves. */
  scroll?: boolean;
}

export function Popover({
  open,
  onClose,
  anchorEl,
  children,
  align = 'left',
  matchWidth = false,
  matchMinWidth = false,
  className = '',
  gap = 4,
  scroll = true,
}: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    transform?: string;
    width?: number;
    minWidth?: number;
    maxWidth?: string;
    maxHeight?: number;
  } | null>(null);

  useEffect(() => {
    if (!open || !anchorEl) return;

    function calc() {
      if (!anchorEl) return;
      const r = anchorEl.getBoundingClientRect();
      const popoverWidth = ref.current?.offsetWidth || 240;
      const popoverHeight = ref.current?.offsetHeight || 260;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const margin = 12;

      let left = align === 'right' ? r.right : r.left;
      let transform: string | undefined = align === 'right' ? 'translateX(-100%)' : undefined;

      if (align === 'right') {
        if (r.right - popoverWidth < margin) {
          if (r.left + popoverWidth <= vw - margin) {
            left = Math.max(margin, r.left);
            transform = undefined;
          } else {
            left = margin;
            transform = undefined;
          }
        }
      } else {
        if (r.left + popoverWidth > vw - margin) {
          if (r.right - popoverWidth >= margin) {
            left = Math.min(vw - margin, r.right);
            transform = 'translateX(-100%)';
          } else {
            left = Math.max(margin, vw - popoverWidth - margin);
          }
        } else {
          left = Math.max(margin, left);
        }
      }

      let top = r.bottom + gap;
      const spaceBelow = vh - margin - (r.bottom + gap);
      const spaceAbove = r.top - margin - gap;

      if (spaceBelow < popoverHeight && spaceAbove > spaceBelow) {
        // Position above anchor if there is more space above
        const h = Math.min(popoverHeight, spaceAbove);
        top = Math.max(margin, r.top - gap - h);
      }

      const availableHeight = spaceAbove > spaceBelow ? spaceAbove : spaceBelow;
      const maxHeight = Math.max(120, Math.min(popoverHeight, availableHeight, vh - margin * 2));

      setPos({
        top,
        left,
        transform,
        width: matchWidth ? r.width : undefined,
        minWidth: matchMinWidth ? r.width : undefined,
        maxWidth: `calc(100vw - ${margin * 2}px)`,
        maxHeight,
      });
    }

    calc();
    // Second-pass measurement once children mount and ref dimensions are available
    const raf = requestAnimationFrame(calc);
    window.addEventListener('scroll', calc, true);
    window.addEventListener('resize', calc);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', calc, true);
      window.removeEventListener('resize', calc);
    };
  }, [open, anchorEl, align, matchWidth, matchMinWidth, gap]);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      const t = e.target as Node;
      if (
        ref.current &&
        !ref.current.contains(t) &&
        anchorEl &&
        !anchorEl.contains(t)
      ) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose, anchorEl]);

  if (!open || !pos || typeof document === 'undefined') return null;

  const style: CSSProperties = {
    position: 'fixed',
    top: pos.top,
    left: pos.left,
    transform: pos.transform,
    zIndex: 10000,
    maxWidth: pos.maxWidth,
    maxHeight: pos.maxHeight,
    // scroll=false: content manages its own scrolling (avoids a double scrollbar).
    overflowY: scroll ? 'auto' : 'visible',
  };
  if (pos.width) style.width = pos.width;
  if (pos.minWidth) style.minWidth = pos.minWidth;

  return createPortal(
    <div ref={ref} className={className} style={style}>
      {children}
    </div>,
    document.body,
  );
}
