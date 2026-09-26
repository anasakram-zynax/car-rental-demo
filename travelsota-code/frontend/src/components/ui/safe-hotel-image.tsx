"use client";

import { useState, useCallback, useMemo } from "react";
import { verifiedHotelPhoto } from "@/lib/utils/pexels-fallback-ids";

interface SafeHotelImageProps {
  src?: string;
  alt: string;
  className?: string;
  loading?: "lazy" | "eager";
  /** Seed for deterministic fallback selection — same image across renders. */
  seed?: string;
  [key: string]: unknown;
}

/**
 * Multi-layer fallback hotel image component.
 *
 * Layer 0: primary src (or a pool photo when absent)
 * Layer 1+: successive vision-verified Pexels hotel photos, cycling forever.
 * A real photo is ALWAYS rendered — never a blank box, SVG or icon.
 */
export function SafeHotelImage({
  src,
  alt,
  className = "",
  loading = "lazy",
  seed,
  ...rest
}: SafeHotelImageProps) {
  const fallbackSeed = useMemo(
    () => seed ?? (typeof src === "string" ? src : "fallback"),
    [seed, src],
  );

  const [attempt, setAttempt] = useState(0);

  const handleLoadError = useCallback(() => {
    setAttempt((prev) => prev + 1);
  }, []);

  const imageSrc = useMemo(() => {
    if (attempt === 0 && src) return src;
    return verifiedHotelPhoto(fallbackSeed, attempt);
  }, [src, fallbackSeed, attempt]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={imageSrc}
      src={imageSrc}
      alt={alt}
      className={className}
      loading={loading}
      onError={handleLoadError}
      {...rest}
    />
  );
}
