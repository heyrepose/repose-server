import { Module } from '@nestjs/common';
import { MeilisearchProvider } from './meilisearch.provider';
import { SEARCH_PROVIDER } from './search-provider.interface';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SearchSyncService } from './search-sync.service';
import { SearchSyncWorker } from './search-sync.worker';

@Module({
  controllers: [SearchController],
  providers: [
    SearchService,
    SearchSyncService,
    SearchSyncWorker,
    MeilisearchProvider,
    { provide: SEARCH_PROVIDER, useExisting: MeilisearchProvider },
  ],
  exports: [SearchService, SEARCH_PROVIDER],
})
export class SearchModule {}
