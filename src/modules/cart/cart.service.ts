import { Injectable } from '@nestjs/common';
import { ListingStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../prisma/prisma.service';
import { toProductCard } from '../listings/listings.mapper';
import {
  CartCannotAddOwnListingException,
  CartItemNotFoundException,
  CartListingNotAvailableException,
  CartListingNotFoundException,
} from './cart.errors';

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateCart(userId: string) {
    const existing = await this.prisma.cart.findUnique({ where: { userId } });
    if (existing) return existing;
    return this.prisma.cart.create({ data: { userId } });
  }

  async getCart(userId: string) {
    const cart = await this.getOrCreateCart(userId);
    const items = await this.prisma.cartItem.findMany({
      where: { cartId: cart.id },
      orderBy: { addedAt: 'desc' },
      include: {
        listing: {
          include: {
            images: { orderBy: { sortOrder: 'asc' }, take: 1 },
            seller: {
              select: {
                id: true,
                username: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    let subtotal = new Decimal(0);
    const availableCount = { value: 0 };

    const grouped = new Map<
      string,
      {
        seller: {
          id: string;
          username: string | null;
          avatarUrl: string | null;
        };
        items: Array<{
          listingId: string;
          addedAt: string;
          isAvailable: boolean;
          listing: ReturnType<typeof toProductCard>;
        }>;
      }
    >();

    for (const row of items) {
      const isAvailable = row.listing.status === ListingStatus.ACTIVE;
      if (isAvailable && row.listing.priceAed) {
        subtotal = subtotal.plus(row.listing.priceAed);
        availableCount.value += 1;
      }

      const sellerId = row.listing.sellerId;
      let group = grouped.get(sellerId);
      if (!group) {
        group = {
          seller: {
            id: row.listing.seller.id,
            username: row.listing.seller.username,
            avatarUrl: row.listing.seller.avatarUrl,
          },
          items: [],
        };
        grouped.set(sellerId, group);
      }
      group.items.push({
        listingId: row.listingId,
        addedAt: row.addedAt.toISOString(),
        isAvailable,
        listing: toProductCard(row.listing),
      });
    }

    return {
      id: cart.id,
      itemCount: items.length,
      availableCount: availableCount.value,
      subtotalAed: subtotal.toFixed(2),
      groups: Array.from(grouped.values()),
    };
  }

  async addItem(userId: string, listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
    });
    if (!listing) throw new CartListingNotFoundException();
    if (listing.sellerId === userId) {
      throw new CartCannotAddOwnListingException();
    }
    if (listing.status !== ListingStatus.ACTIVE) {
      throw new CartListingNotAvailableException();
    }

    const cart = await this.getOrCreateCart(userId);
    await this.prisma.cartItem.upsert({
      where: {
        cartId_listingId: { cartId: cart.id, listingId },
      },
      create: { cartId: cart.id, listingId },
      update: { addedAt: new Date() },
    });
    await this.prisma.cart.update({
      where: { id: cart.id },
      data: { updatedAt: new Date() },
    });

    return this.getCart(userId);
  }

  async removeItem(userId: string, listingId: string): Promise<void> {
    const cart = await this.prisma.cart.findUnique({ where: { userId } });
    if (!cart) return;
    await this.prisma.cartItem.deleteMany({
      where: { cartId: cart.id, listingId },
    });
  }

  async moveToSaved(userId: string, listingId: string) {
    const cart = await this.prisma.cart.findUnique({ where: { userId } });
    if (!cart) throw new CartItemNotFoundException();

    const item = await this.prisma.cartItem.findUnique({
      where: { cartId_listingId: { cartId: cart.id, listingId } },
    });
    if (!item) throw new CartItemNotFoundException();

    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
    });
    if (!listing || listing.status !== ListingStatus.ACTIVE) {
      throw new CartListingNotAvailableException();
    }

    await this.prisma.$transaction([
      this.prisma.savedListing.upsert({
        where: { userId_listingId: { userId, listingId } },
        create: { userId, listingId },
        update: {},
      }),
      this.prisma.cartItem.delete({
        where: { cartId_listingId: { cartId: cart.id, listingId } },
      }),
    ]);

    return this.getCart(userId);
  }

  /** Removes listing IDs from the buyer's cart after successful payment. */
  async clearListingsForUser(
    userId: string,
    listingIds: string[],
  ): Promise<void> {
    if (!listingIds.length) return;
    const cart = await this.prisma.cart.findUnique({ where: { userId } });
    if (!cart) return;
    await this.prisma.cartItem.deleteMany({
      where: { cartId: cart.id, listingId: { in: listingIds } },
    });
  }
}
