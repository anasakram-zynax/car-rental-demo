import { Module } from '@nestjs/common';
import { SearchJobService } from './search-job.service';
import { SearchJobController } from './search-job.controller';

@Module({
  controllers: [SearchJobController],
  providers: [SearchJobService],
  exports: [SearchJobService],
})
export class SearchJobModule {}
