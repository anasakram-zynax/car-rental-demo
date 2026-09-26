const CITY_AIRPORT_MAP: Record<string, string[]> = {
  LON: ['LHR', 'LGW', 'STN', 'LCY', 'LTN', 'SEN'],
  NYC: ['JFK', 'EWR', 'LGA'],
  PAR: ['CDG', 'ORY', 'BVA'],
  SHA: ['PVG', 'SHA'],
  TYO: ['NRT', 'HND'],
  CHI: ['ORD', 'MDW'],
  WAS: ['IAD', 'DCA', 'BWI'],
  MIL: ['MXP', 'LIN', 'BGY'],
  YTO: ['YYZ', 'YTZ', 'YKZ'],
  OSA: ['KIX', 'ITM'],
  MOW: ['SVO', 'DME', 'VKO'],
  STO: ['ARN', 'BMA', 'NYO'],
  ROM: ['FCO', 'CIA'],
  SEL: ['ICN', 'GMP'],
  TPE: ['TPE', 'TSA'],
  SAO: ['GRU', 'CGH'],
  BUE: ['EZE', 'AEP'],
  RIO: ['GIG', 'SDU'],
  MEX: ['MEX', 'NLU', 'TLC'],
  BER: ['BER', 'TXL'],
  CAI: ['CAI', 'SPX'],
  IST: ['IST', 'SAW'],
  BKK: ['BKK', 'DMK'],
};

function norm(code?: string | null): string {
  return (code ?? '').trim().toUpperCase();
}

export function airportBelongsToCity(airportCode?: string | null, cityCode?: string | null): boolean {
  const a = norm(airportCode);
  const c = norm(cityCode);
  if (!a || !c) return false;
  if (a === c) return true;
  const airports = CITY_AIRPORT_MAP[c];
  if (!airports) return false;
  return airports.includes(a);
}
