/**
 * Hotelbeds giata URLs without a size segment are 320x240 thumbnails.
 * Insert "xl" (1024x768) when no explicit size segment is present.
 */
export function upgradeHotelbedsImage(url: string | null | undefined): string {
  if (!url) return "";
  if (/\/giata\/(xxl|xl|medium|small|thumb)\//i.test(url)) return url;
  return url.replace(
    /^(https?:\/\/[^/]+\/giata)\//i,
    "$1/xl/",
  );
}
