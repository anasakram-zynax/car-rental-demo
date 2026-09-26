import type { FlightsProviderKey } from '../../../settings/domain/provider-config.entity';
import type { FlightSearchDto } from '../../api/dto/flight-search.dto';
import type { NormalizedFlightSearchResponse } from '../../domain/entities/flight-search-response';

export interface FlightProvider {
  /** Unique provider key, used for routing and config lookups */
  readonly key: FlightsProviderKey;

  searchFlights(
    input: FlightSearchDto,
  ): Promise<NormalizedFlightSearchResponse>;
}
