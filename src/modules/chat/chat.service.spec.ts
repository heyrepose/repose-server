import {
  conversationUniqueKey,
  resolveConversationParties,
} from './chat.service';

describe('chat get-or-create helpers', () => {
  it('builds the Prisma unique compound key', () => {
    expect(
      conversationUniqueKey({
        listingId: 'listing-1',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
      }),
    ).toEqual({
      listingId: 'listing-1',
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
    });
  });

  it('assigns actor as buyer and listing owner as seller', () => {
    expect(
      resolveConversationParties({
        actorId: 'buyer-1',
        listingSellerId: 'seller-1',
      }),
    ).toEqual({ buyerId: 'buyer-1', sellerId: 'seller-1' });
  });

  it('rejects messaging yourself', () => {
    expect(
      resolveConversationParties({
        actorId: 'seller-1',
        listingSellerId: 'seller-1',
      }),
    ).toEqual({ error: 'self' });
  });

  it('rejects sellerId that does not match the listing seller', () => {
    expect(
      resolveConversationParties({
        actorId: 'buyer-1',
        listingSellerId: 'seller-1',
        sellerIdOverride: 'other-seller',
      }),
    ).toEqual({ error: 'seller_mismatch' });
  });
});
