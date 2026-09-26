import { Controller, Get, Query } from '@nestjs/common';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';
import { RateLimitTier } from '../../../shared/rate-limit/rate-limit-tier.decorator';
import { AutocompleteService } from '../application/autocomplete.service';
import { AutocompleteQueryDto } from './dto/autocomplete-query.dto';
import type { AutocompleteModule } from '../domain/autocomplete.types';

@Controller('autocomplete')
@RateLimitTier({ tier: 'anonymous' })
export class AutocompleteController {
  constructor(private readonly autocompleteService: AutocompleteService) {}

  @Get('travel')
  @ResponseMessage('Autocomplete suggestions returned.')
  async searchTravel(
    @Query() query: AutocompleteQueryDto,
  ) {
    const module = (query.module ?? 'all') as AutocompleteModule;
    return this.autocompleteService.search(query.q, module, query.limit);
  }
}
