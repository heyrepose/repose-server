import { Category, Listing, ListingImage } from '@prisma/client';
import { ListingSearchDoc } from './search.constants';

type ListingForIndex = Listing & {
  images: ListingImage[];
  category: Pick<Category, 'slug'>;
};

export function toSearchDoc(listing: ListingForIndex): ListingSearchDoc {
  return {
    id: listing.id,
    title: listing.title ?? '',
    description: listing.description ?? '',
    brand: listing.brand ?? '',
    size: listing.size ?? '',
    condition: listing.condition ?? '',
    categoryId: listing.categoryId,
    categorySlug: listing.category.slug,
    priceAed: listing.priceAed ? Number(listing.priceAed) : 0,
    mainImageUrl: listing.images[0]?.url ?? null,
    sellerId: listing.sellerId,
    isFeatured: listing.isFeatured,
    publishedAt: listing.publishedAt ? listing.publishedAt.getTime() : 0,
    status: listing.status,
  };
}
