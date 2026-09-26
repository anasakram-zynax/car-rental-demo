/** Country display helpers for the demo-leads page (globe + tables). */

const NAMES: Record<string, string> = {
  US: 'United States', CA: 'Canada', MX: 'Mexico', BR: 'Brazil', AR: 'Argentina',
  CL: 'Chile', CO: 'Colombia', PE: 'Peru', GB: 'United Kingdom', IE: 'Ireland',
  FR: 'France', DE: 'Germany', NL: 'Netherlands', BE: 'Belgium', ES: 'Spain',
  PT: 'Portugal', IT: 'Italy', CH: 'Switzerland', AT: 'Austria', SE: 'Sweden',
  NO: 'Norway', DK: 'Denmark', FI: 'Finland', IS: 'Iceland', PL: 'Poland',
  CZ: 'Czechia', SK: 'Slovakia', HU: 'Hungary', RO: 'Romania', BG: 'Bulgaria',
  GR: 'Greece', TR: 'Türkiye', UA: 'Ukraine', BY: 'Belarus', RU: 'Russia',
  LT: 'Lithuania', LV: 'Latvia', EE: 'Estonia', RS: 'Serbia', HR: 'Croatia',
  SI: 'Slovenia', BA: 'Bosnia & Herzegovina', MK: 'North Macedonia',
  AL: 'Albania', MT: 'Malta', CY: 'Cyprus', LU: 'Luxembourg', MD: 'Moldova',
  AZ: 'Azerbaijan', AM: 'Armenia', GE: 'Georgia',
  SA: 'Saudi Arabia', AE: 'United Arab Emirates', QA: 'Qatar', KW: 'Kuwait',
  BH: 'Bahrain', OM: 'Oman', JO: 'Jordan', LB: 'Lebanon', IQ: 'Iraq',
  IR: 'Iran', IL: 'Israel', PS: 'Palestine', YE: 'Yemen', EG: 'Egypt',
  MA: 'Morocco', DZ: 'Algeria', TN: 'Tunisia', LY: 'Libya', SD: 'Sudan',
  SO: 'Somalia', DJ: 'Djibouti', ER: 'Eritrea', ET: 'Ethiopia', KE: 'Kenya',
  TZ: 'Tanzania', UG: 'Uganda', RW: 'Rwanda', BI: 'Burundi', NG: 'Nigeria',
  GH: 'Ghana', CI: "Côte d'Ivoire", SN: 'Senegal', CM: 'Cameroon',
  TD: 'Chad', NE: 'Niger', ML: 'Mali', BF: 'Burkina Faso', BJ: 'Benin',
  TG: 'Togo', SL: 'Sierra Leone', LR: 'Liberia', GN: 'Guinea', GM: 'Gambia',
  GA: 'Gabon', CG: 'Congo', CD: 'DR Congo', CF: 'Central African Republic',
  AO: 'Angola', ZM: 'Zambia', ZW: 'Zimbabwe', MW: 'Malawi', MZ: 'Mozambique',
  BW: 'Botswana', NA: 'Namibia', ZA: 'South Africa', MG: 'Madagascar',
  MU: 'Mauritius', SC: 'Seychelles', KM: 'Comoros', IN: 'India',
  PK: 'Pakistan', BD: 'Bangladesh', LK: 'Sri Lanka', NP: 'Nepal',
  AF: 'Afghanistan', MV: 'Maldives', BT: 'Bhutan', KZ: 'Kazakhstan',
  UZ: 'Uzbekistan', CN: 'China', JP: 'Japan', KR: 'South Korea',
  TW: 'Taiwan', HK: 'Hong Kong', MO: 'Macao', MN: 'Mongolia', TH: 'Thailand',
  VN: 'Vietnam', MY: 'Malaysia', SG: 'Singapore', ID: 'Indonesia',
  PH: 'Philippines', KH: 'Cambodia', MM: 'Myanmar', LA: 'Laos', BN: 'Brunei',
  AU: 'Australia', NZ: 'New Zealand', FJ: 'Fiji',
};

/** Proper English names for any ISO code not in the hand-curated map. */
let regionNames: Intl.DisplayNames | null = null;
try {
  regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
} catch {
  // Very old runtime without Intl.DisplayNames — the code fallback covers us.
}

/** Human name for an ISO alpha-2 code (falls back to the code itself). */
export function countryName(country: string | null | undefined): string {
  if (!country) return 'Unknown';
  const up = country.toUpperCase();
  return NAMES[up] ?? regionNames?.of(up) ?? up;
}

/**
 * Cross-platform flag image URL (flagcdn PNG — renders on Windows too, where
 * flag emoji are not supported). Returns null for invalid codes.
 */
export function flagUrl(country: string | null | undefined): string | null {
  if (!country || !/^[A-Za-z]{2}$/.test(country)) return null;
  return `https://flagcdn.com/w80/${country.toLowerCase()}.png`;
}

/** ISO 3166-1 alpha-2 → [longitude, latitude] country centroids. */
export const COUNTRY_COORDS: Record<string, [number, number]> = {
  US: [-95.7, 37.1], CA: [-101.0, 56.1], MX: [-102.5, 23.9], BR: [-52.9, -10.8],
  AR: [-64.2, -35.4], CL: [-71.4, -33.5], CO: [-73.1, 3.9], PE: [-74.4, -9.2],
  GB: [-1.8, 53.0], IE: [-8.0, 53.2], FR: [2.4, 46.6], DE: [10.3, 51.0],
  NL: [5.5, 52.2], BE: [4.5, 50.6], ES: [-3.9, 40.3], PT: [-8.4, 39.6],
  IT: [12.8, 42.6], CH: [8.2, 46.8], AT: [14.2, 47.7], SE: [16.5, 62.2],
  NO: [11.0, 61.0], DK: [10.5, 56.0], FI: [25.9, 63.5], IS: [-19.0, 64.9],
  PL: [19.3, 52.0], CZ: [15.4, 49.7], SK: [19.6, 48.7], HU: [19.4, 47.2],
  RO: [25.1, 45.8], BG: [25.4, 42.9], GR: [22.7, 39.3], TR: [35.0, 39.0],
  UA: [31.3, 48.7], BY: [27.9, 53.5], RU: [96.0, 60.0], LT: [23.9, 55.3],
  LV: [24.9, 56.9], EE: [25.6, 58.7], RS: [20.9, 44.1], HR: [16.4, 45.3],
  SI: [14.9, 46.1], BA: [17.8, 44.0], MK: [21.7, 41.6], AL: [20.1, 41.2],
  MT: [14.4, 35.9], CY: [33.2, 35.1], LU: [6.1, 49.8], MD: [28.5, 47.2],
  AZ: [47.6, 40.4], AM: [45.0, 40.3], GE: [43.5, 42.2],
  SA: [44.5, 24.0], AE: [54.2, 24.0], QA: [51.2, 25.3], KW: [47.6, 29.3],
  BH: [50.5, 26.0], OM: [56.1, 21.0], JO: [36.8, 31.3], LB: [35.9, 33.9],
  IQ: [43.7, 33.2], IR: [53.7, 32.4], IL: [34.9, 31.4], PS: [35.2, 31.9],
  YE: [47.5, 15.6], EG: [30.7, 27.0], MA: [-6.3, 32.3], DZ: [1.7, 28.1],
  TN: [9.6, 34.1], LY: [17.2, 26.3], SD: [30.2, 13.6], SO: [45.9, 5.2],
  DJ: [42.6, 11.7], ER: [38.8, 15.4], ET: [39.6, 8.6], KE: [38.0, 0.3],
  TZ: [34.9, -6.3], UG: [32.4, 1.3], RW: [29.9, -2.0], BI: [29.9, -3.4],
  NG: [8.1, 9.1], GH: [-1.0, 7.9], CI: [-5.6, 7.5], SN: [-14.5, 14.5],
  CM: [12.7, 5.7], TD: [18.7, 15.4], NE: [8.1, 17.6], ML: [-4.0, 17.6],
  BF: [-1.6, 12.3], BJ: [2.3, 9.6], TG: [1.0, 8.5], SL: [-11.8, 8.5],
  LR: [-9.4, 6.4], GN: [-10.9, 10.4], GM: [-15.3, 13.4], GA: [11.8, -0.6],
  CG: [15.2, -0.8], CD: [23.6, -2.9], CF: [20.9, 6.6], AO: [17.5, -12.3],
  ZM: [27.8, -13.1], ZW: [29.2, -19.0], MW: [34.3, -13.2], MZ: [35.5, -18.7],
  BW: [23.8, -22.2], NA: [17.2, -22.1], ZA: [24.7, -29.0], MG: [46.7, -19.4],
  MU: [57.6, -20.3], SC: [55.5, -4.7], IN: [78.7, 22.4], PK: [69.4, 30.3],
  BD: [90.3, 23.8], LK: [80.7, 7.6], NP: [84.1, 28.3], AF: [66.0, 33.8],
  MV: [73.4, 3.2], BT: [90.4, 27.5], KZ: [66.9, 48.2], UZ: [63.2, 41.8],
  CN: [104.2, 35.9], JP: [138.3, 36.6], KR: [127.8, 36.4], TW: [120.9, 23.7],
  HK: [114.1, 22.4], MO: [113.5, 22.2], MN: [103.0, 46.9],
  TH: [100.9, 15.1], VN: [106.3, 16.6], MY: [101.9, 4.2], SG: [103.8, 1.35],
  ID: [117.4, -2.3], PH: [122.9, 12.9], KH: [104.9, 12.6], MM: [96.0, 21.2],
  LA: [102.5, 18.2], BN: [114.7, 4.5], AU: [133.8, -25.3], NZ: [172.8, -41.1],
  FJ: [178.0, -17.8],
};
