export const LISTINGS_INDEX = 'listings';
export const SEARCH_SYNC_QUEUE = 'search-sync';

/** Emitted by the listings module; consumed by the search-sync listener. */
export const ListingEvents = {
  Changed: 'listing.changed',
  Removed: 'listing.removed',
} as const;

export interface ListingChangedEvent {
  listingId: string;
}

export interface ListingSearchDoc {
  id: string;
  title: string;
  description: string;
  brand: string;
  size: string;
  condition: string;
  categoryId: string;
  categorySlug: string;
  priceAed: number;
  mainImageUrl: string | null;
  sellerId: string;
  isFeatured: boolean;
  publishedAt: number;
  status: string;
}
