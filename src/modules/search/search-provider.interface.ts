import { ListingSearchDoc } from './search.constants';

export const SEARCH_PROVIDER = Symbol('SEARCH_PROVIDER');

export interface SearchQuery {
  q?: string;
  categoryId?: string;
  /** Prefer when filtering by public category slug (indexed on documents). */
  categorySlug?: string;
  condition?: string[];
  brand?: string[];
  size?: string[];
  minPriceAed?: number;
  maxPriceAed?: number;
  /** Omit or undefined = Meilisearch relevance ranking. */
  sort?: 'newest' | 'price_asc' | 'price_desc';
  limit: number;
  offset: number;
}

export interface SearchResult {
  hits: ListingSearchDoc[];
  estimatedTotal: number;
  facets?: Record<string, Record<string, number>>;
}

/** Swappable search engine. MVP = Meilisearch; Phase 2 path = OpenSearch. */
export interface SearchProvider {
  ensureIndex(): Promise<void>;
  upsert(doc: ListingSearchDoc): Promise<void>;
  remove(id: string): Promise<void>;
  search(query: SearchQuery): Promise<SearchResult>;
}
