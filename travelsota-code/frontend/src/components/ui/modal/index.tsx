"use client";
import React, { useRef, useEffect } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
  showCloseButton?: boolean;
  isFullscreen?: boolean;
  title?: React.ReactNode;
  /** Applies the elevated, opaque admin-shell surface. Frontside modals keep their legacy styling. */
  adminSurface?: boolean;
}

// Module-level open-modal counter for the shared scroll lock (see effect below).
let modalOpenCount = 0;

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  className,
  showCloseButton = true,
  isFullscreen = false,
  title,
  adminSurface = false,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { onClose(); }
    };
    if (isOpen) { document.addEventListener("keydown", handleEscape); }
    return () => { document.removeEventListener("keydown", handleEscape); };
  }, [isOpen, onClose]);

  // Reference-counted body scroll lock — stacked modals (e.g. a confirm dialog
  // opened on top of another modal) must not unlock scroll while one is open.
  useEffect(() => {
    if (!isOpen) return;
    modalOpenCount += 1;
    document.body.style.overflow = "hidden";
    return () => {
      modalOpenCount = Math.max(0, modalOpenCount - 1);
      if (modalOpenCount === 0) document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const contentClasses = isFullscreen ? "w-full h-full" : "relative w-full rounded-3xl bg-white dark:bg-gray-900";
  const overlayClass = adminSurface ? "admin-overlay" : "";
  const backdropClass = adminSurface ? "admin-overlay-backdrop bg-black/45 backdrop-blur-[8px]" : "bg-gray-400/50 backdrop-blur-[32px]";
  const surfaceClass = adminSurface ? "admin-overlay-content" : "";

  // The dim/blur lives on the OVERLAY itself and the panel is its CHILD.
  // A separate blurred backdrop sibling gets promoted to its own compositor
  // layer by backdrop-filter, which in Chromium can win pointer hit-testing
  // over higher-z siblings — making every modal button unclickable. With no
  // sibling layer, that failure mode cannot exist. Clicks on the panel stop
  // propagation; clicks anywhere else close the modal.
  return (
    <div
      className={`${overlayClass} fixed inset-0 z-[99999] ${backdropClass}`}
      onClick={onClose}
      role="presentation"
    >
      <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
        <div ref={modalRef} className={`relative ${surfaceClass} ${contentClasses} ${className ?? ''}`} onClick={(e) => e.stopPropagation()}>
          {showCloseButton && (
            <button onClick={onClose} className="absolute right-3 top-3 z-999 flex h-9.5 w-9.5 items-center justify-center rounded-full bg-gray-100 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white sm:right-6 sm:top-6 sm:h-11 sm:w-11">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" clipRule="evenodd" d="M6.04289 16.5413C5.65237 16.9318 5.65237 17.565 6.04289 17.9555C6.43342 18.346 7.06658 18.346 7.45711 17.9555L11.9987 13.4139L16.5408 17.956C16.9313 18.3466 17.5645 18.3466 17.955 17.956C18.3455 17.5655 18.3455 16.9323 17.955 16.5418L13.4129 11.9997L17.955 7.4576C18.3455 7.06707 18.3455 6.43391 17.955 6.04338C17.5645 5.65286 16.9313 5.65286 16.5408 6.04338L11.9987 10.5855L7.45711 6.0439C7.06658 5.65338 6.43342 5.65338 6.04289 6.0439C5.65237 6.43442 5.65237 7.06759 6.04289 7.45811L10.5845 11.9997L6.04289 16.5413Z" fill="currentColor" />
              </svg>
            </button>
          )}
          {title && <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800"><h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2></div>}
          <div className="p-6">{children}</div>
        </div>
      </div>
    </div>
  );
};
