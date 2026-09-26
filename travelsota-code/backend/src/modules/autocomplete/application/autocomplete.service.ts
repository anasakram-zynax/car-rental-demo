import { Inject, Injectable } from '@nestjs/common';
import type { AutocompleteRepoPort } from './ports/autocomplete-repo.port';
import { AutocompleteRepoPortToken } from './ports/autocomplete-repo.port';
import type { AutocompleteModule, AutocompleteSuggestion } from '../domain/autocomplete.types';

@Injectable()
export class AutocompleteService {
  constructor(
    @Inject(AutocompleteRepoPortToken)
    private readonly repo: AutocompleteRepoPort,
  ) {}

  async search(
    query: string,
    module: AutocompleteModule = 'all',
    requestedLimit?: number,
  ): Promise<AutocompleteSuggestion[]> {
    const q = query.trim();
    // Callers may pass a smaller cap (e.g. the deep-link resolver asks for 5);
    // clamp to a sane range so a bogus value can never explode the query.
    const limit =
      typeof requestedLimit === 'number' && Number.isFinite(requestedLimit)
        ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 25)
        : 15;

    if (!q) {
      if (module === 'flights') {
        return this.repo.searchFlightLocations('', limit);
      }
      if (module === 'hotels') {
        const [destinations, hotels] = await Promise.all([
          this.repo.searchSupplierDestinationss('', limit),
          this.repo.searchHotels('', undefined, limit),
        ]);
        return [...destinations, ...hotels].slice(0, limit * 2);
      }
      const [destinations, hotels, flights] = await Promise.all([
        this.repo.searchSupplierDestinationss('', limit),
        this.repo.searchHotels('', undefined, limit),
        this.repo.searchFlightLocations('', limit),
      ]);
      return [...flights, ...destinations, ...hotels].slice(0, limit * 3);
    }

    if (module === 'flights') {
      return this.repo.searchFlightLocations(q, limit);
    }

    if (module === 'hotels') {
      const [destinations, hotels] = await Promise.all([
        this.repo.searchSupplierDestinationss(q, limit),
        this.repo.searchHotels(q, undefined, limit),
      ]);
      return [...destinations, ...hotels].slice(0, limit * 2);
    }

    // module === 'all'
    const [destinations, hotels, flights] = await Promise.all([
      this.repo.searchSupplierDestinationss(q, limit),
      this.repo.searchHotels(q, undefined, limit),
      this.repo.searchFlightLocations(q, limit),
    ]);
    return [...flights, ...destinations, ...hotels].slice(0, limit * 3);
  }
}
