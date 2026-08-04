import { Listing, ListingImage } from '@prisma/client';

/** Shared ProductCard list-item shape used by search, feed, seller listings. */
export function toProductCard(
  listing: Listing & { images: ListingImage[] },
): {
  id: string;
  title: string | null;
  priceAed: string | null;
  condition: Listing['condition'];
  mainImageUrl: string | null;
  isFeatured?: boolean;
  status?: Listing['status'];
  viewCount?: number;
} {
  return {
    id: listing.id,
    title: listing.title,
    priceAed: listing.priceAed?.toString() ?? null,
    condition: listing.condition,
    mainImageUrl: listing.images[0]?.url ?? null,
    isFeatured: listing.isFeatured,
    status: listing.status,
    viewCount: listing.viewCount,
  };
}

export function decimalToString(value: { toString(): string } | null | undefined): string | null {
  return value == null ? null : value.toString();
}
