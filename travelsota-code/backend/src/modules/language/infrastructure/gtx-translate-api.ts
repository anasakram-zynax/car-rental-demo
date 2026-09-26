const API_URL = 'https://translate.googleapis.com/translate_a/single';

// ponytail: unofficial gtx endpoint, same pattern as legacy
// travelgatemain/install/translate.php::translateFree. No key, no SDK.
// One text per request (URL-length safe), null on failure -> caller
// falls back to English. Unofficial: may throttle or break without notice.
export class GtxTranslateApiClient {
  async translateText(
    text: string,
    target: string,
    source = 'en',
  ): Promise<{ translated: string | null; chars: number }> {
    const chars = text.length;
    if (!text.trim()) return { translated: text, chars };
    try {
      const url =
        `${API_URL}?client=gtx&sl=${encodeURIComponent(source)}` +
        `&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(text)}`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return { translated: null, chars };
      const data: unknown = await response.json();
      if (!Array.isArray(data) || !Array.isArray(data[0]))
        return { translated: null, chars };
      const sentences = (data[0] as unknown[]).map((s) =>
        Array.isArray(s) && typeof s[0] === 'string' ? s[0] : '',
      );
      const joined = sentences.join('').trim();
      return { translated: joined ? joined : null, chars };
    } catch {
      return { translated: null, chars };
    }
  }
}
