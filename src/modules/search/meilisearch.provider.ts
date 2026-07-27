import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MeiliSearch, Index } from 'meilisearch';
import type { AppConfig } from '../../config/configuration';
import { LISTINGS_INDEX, ListingSearchDoc } from './search.constants';
import {
  SearchProvider,
  SearchQuery,
  SearchResult,
} from './search-provider.interface';

@Injectable()
export class MeilisearchProvider implements SearchProvider, OnModuleInit {
  private readonly logger = new Logger(MeilisearchProvider.name);
  private client: MeiliSearch;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    this.client = new MeiliSearch({
      host: this.config.get('MEILISEARCH_HOST', { infer: true }),
      apiKey: this.config.get('MEILISEARCH_API_KEY', { infer: true }),
    });
  }

  private get index(): Index<ListingSearchDoc> {
    return this.client.index<ListingSearchDoc>(LISTINGS_INDEX);
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureIndex();
    } catch (err) {
      // Never block API boot on search being down; sync retries handle recovery.
      this.logger.warn(
        `Meilisearch not reachable at boot: ${(err as Error).message}`,
      );
    }
  }

  async ensureIndex(): Promise<void> {
    await this.client.createIndex(LISTINGS_INDEX, { primaryKey: 'id' }).catch(() => undefined);
    await this.index.updateSettings({
      searchableAttributes: ['title', 'brand', 'description'],
      filterableAttributes: [
        'categoryId',
        'condition',
        'brand',
        'size',
        'priceAed',
        'status',
        'isFeatured',
      ],
      sortableAttributes: ['priceAed', 'publishedAt'],
      rankingRules: [
        'words',
        'typo',
        'proximity',
        'attribute',
        'sort',
        'exactness',
      ],
    });
  }

  async upsert(doc: ListingSearchDoc): Promise<void> {
    await this.index.addDocuments([doc]);
  }

  async remove(id: string): Promise<void> {
    await this.index.deleteDocument(id);
  }

  async search(query: SearchQuery): Promise<SearchResult> {
    const filters: string[] = ['status = ACTIVE'];
    if (query.categoryId) filters.push(`categoryId = "${query.categoryId}"`);
    if (query.condition?.length) {
      filters.push(`(${query.condition.map((c) => `condition = "${c}"`).join(' OR ')})`);
    }
    if (query.brand?.length) {
      filters.push(`(${query.brand.map((b) => `brand = "${b}"`).join(' OR ')})`);
    }
    if (query.size?.length) {
      filters.push(`(${query.size.map((s) => `size = "${s}"`).join(' OR ')})`);
    }
    if (query.minPriceAed !== undefined) filters.push(`priceAed >= ${query.minPriceAed}`);
    if (query.maxPriceAed !== undefined) filters.push(`priceAed <= ${query.maxPriceAed}`);

    const sort =
      query.sort === 'price_asc'
        ? ['priceAed:asc']
        : query.sort === 'price_desc'
          ? ['priceAed:desc']
          : ['publishedAt:desc'];

    const res = await this.index.search(query.q ?? '', {
      filter: filters,
      sort,
      limit: query.limit,
      offset: query.offset,
      facets: ['brand', 'condition', 'size'],
    });

    return {
      hits: res.hits as ListingSearchDoc[],
      estimatedTotal: res.estimatedTotalHits ?? res.hits.length,
      facets: res.facetDistribution as Record<string, Record<string, number>>,
    };
  }
}
