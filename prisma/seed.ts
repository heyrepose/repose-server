/**
 * Development seed — uploads local dummy images to Cloudinary and creates
 * users / listings / orders / wallet / chat / notifications / reviews covering
 * every enum status needed to exercise the MVP.
 *
 * Images: ../../documentation/dummy images/
 * Password for all seeded users (except admin from env): password123
 *
 * Run: pnpm prisma:seed
 */
import * as path from 'path';
import * as fs from 'fs';
import * as bcrypt from 'bcrypt';
import { v2 as cloudinary } from 'cloudinary';
import {
  PrismaClient,
  ListingCondition,
  ListingStatus,
  OrderStatus,
  PaymentStatus,
  NotificationType,
  WalletTxType,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

const DUMMY_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  'documentation',
  'dummy images',
);

const PASSWORD = 'password123';
const COMMISSION_RATE = Number(process.env.COMMISSION_RATE ?? '0.10');

// ───────────────────────── Cloudinary ─────────────────────────

function configureCloudinary(): void {
  const url = process.env.CLOUDINARY_URL?.trim();
  if (url) {
    const match = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec(url);
    if (!match) throw new Error('Invalid CLOUDINARY_URL format');
    cloudinary.config({
      cloud_name: match[3],
      api_key: match[1],
      api_secret: match[2],
      secure: true,
    });
  } else {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }
  if (!cloudinary.config().cloud_name) {
    throw new Error(
      'Cloudinary not configured. Set CLOUDINARY_URL or CLOUDINARY_* in .env',
    );
  }
  console.log(`Cloudinary cloud: ${cloudinary.config().cloud_name}`);
}

const uploadCache = new Map<string, string>();

async function uploadDummy(filename: string, folder: string): Promise<string> {
  const cacheKey = `${folder}/${filename}`;
  if (uploadCache.has(cacheKey)) return uploadCache.get(cacheKey)!;

  const filePath = path.join(DUMMY_DIR, filename);
  if (!fs.existsSync(filePath)) {
    const fallback = path.join(DUMMY_DIR, 'avatar-placeholder.jpg');
    if (!fs.existsSync(fallback)) {
      throw new Error(`Missing dummy image: ${filename} (and no avatar-placeholder.jpg)`);
    }
    console.warn(`  missing ${filename} — using avatar-placeholder.jpg`);
    return uploadDummy('avatar-placeholder.jpg', folder);
  }

  const result = await cloudinary.uploader.upload(filePath, {
    folder: `repose/seed/${folder}`,
    public_id: path.parse(filename).name,
    overwrite: true,
    resource_type: 'image',
  });
  uploadCache.set(cacheKey, result.secure_url);
  console.log(`  ↑ ${filename}`);
  return result.secure_url;
}

// ───────────────────────── Categories ─────────────────────────

const CATEGORIES = [
  { name: 'Women', slug: 'women', sortOrder: 1, isActive: true, banner: 'category-women.jpg' },
  { name: 'Men', slug: 'men', sortOrder: 2, isActive: true, banner: 'category-men.jpg' },
  { name: 'Shoes', slug: 'shoes', sortOrder: 3, isActive: true, banner: 'category-shoes.jpg' },
  { name: 'Bags', slug: 'bags', sortOrder: 4, isActive: true, banner: 'category-bags.jpg' },
  {
    name: 'Accessories',
    slug: 'accessories',
    sortOrder: 5,
    isActive: true,
    banner: 'category-accessories.jpg',
  },
  { name: 'Kids', slug: 'kids', sortOrder: 6, isActive: false, banner: null },
] as const;

// ───────────────────────── Helpers ─────────────────────────

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function money(n: number): Decimal {
  return new Decimal(n.toFixed(2));
}

async function wipeDevData(): Promise<void> {
  // Children first — development only
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.review.deleteMany();
  await prisma.savedListing.deleteMany();
  await prisma.walletTransaction.deleteMany();
  await prisma.sellerWallet.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.orderStatusHistory.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.listingImage.deleteMany();
  await prisma.listing.deleteMany();
  await prisma.address.deleteMany();
  await prisma.otpVerification.deleteMany();
  await prisma.webhookEvent.deleteMany();
  await prisma.user.deleteMany();
  await prisma.category.deleteMany();
  console.log('Wiped existing rows');
}

// ───────────────────────── Seed steps ─────────────────────────

async function seedCategories() {
  console.log('Categories…');
  for (const c of CATEGORIES) {
    const bannerUrl = c.banner
      ? await uploadDummy(c.banner, 'categories')
      : null;
    await prisma.category.create({
      data: {
        name: c.name,
        slug: c.slug,
        sortOrder: c.sortOrder,
        isActive: c.isActive,
        bannerUrl,
        iconUrl: bannerUrl,
      },
    });
  }
}

async function seedUsers(passwordHash: string) {
  console.log('Users…');

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@repose.ae';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD
    ? await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD, 12)
    : passwordHash;

  const adminAvatar = await uploadDummy('avatar-admin.jpg', 'avatars');
  const amaraAvatar = await uploadDummy('avatar-amara.jpg', 'avatars');
  const nouraAvatar = await uploadDummy('avatar-noura.jpg', 'avatars');
  const khalidAvatar = await uploadDummy('avatar-khalid.jpg', 'avatars');
  const saraAvatar = await uploadDummy('avatar-sara.jpg', 'avatars');
  const suspendedAvatar = await uploadDummy('avatar-suspended.jpg', 'avatars');

  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      fullName: 'Repose Admin',
      username: 'repose.admin',
      role: 'ADMIN',
      status: 'ACTIVE',
      isEmailVerified: true,
      passwordHash: adminPassword,
      avatarUrl: adminAvatar,
    },
  });

  const amara = await prisma.user.create({
    data: {
      email: 'amara@repose.ae',
      phone: '+971500000001',
      fullName: 'Amara Studio',
      username: 'amara.studio',
      bio: 'Vintage curator, Dubai Marina.',
      status: 'ACTIVE',
      isPhoneVerified: true,
      isEmailVerified: true,
      passwordHash,
      avatarUrl: amaraAvatar,
      ratingAvg: 4.9,
      ratingCount: 18,
      itemsSoldCount: 12,
    },
  });

  const noura = await prisma.user.create({
    data: {
      email: 'noura@repose.ae',
      phone: '+971500000002',
      fullName: 'Noura Al Farsi',
      username: 'noura.closet',
      bio: 'Minimalist wardrobe shares.',
      status: 'ACTIVE',
      isPhoneVerified: true,
      isEmailVerified: true,
      passwordHash,
      avatarUrl: nouraAvatar,
      ratingAvg: 4.6,
      ratingCount: 7,
      itemsSoldCount: 4,
    },
  });

  const khalid = await prisma.user.create({
    data: {
      email: 'khalid@repose.ae',
      phone: '+971500000003',
      fullName: 'Khalid Hassan',
      username: 'khalid.h',
      bio: 'Hunting rare menswear.',
      status: 'ACTIVE',
      isPhoneVerified: true,
      isEmailVerified: true,
      passwordHash,
      avatarUrl: khalidAvatar,
      itemsBoughtCount: 5,
    },
  });

  const sara = await prisma.user.create({
    data: {
      email: 'sara@repose.ae',
      phone: '+971500000004',
      fullName: 'Sara Mendes',
      username: 'sara.m',
      status: 'ACTIVE',
      isPhoneVerified: true,
      isEmailVerified: true,
      passwordHash,
      avatarUrl: saraAvatar,
      itemsBoughtCount: 2,
    },
  });

  const suspended = await prisma.user.create({
    data: {
      email: 'suspended@repose.ae',
      phone: '+971500000005',
      fullName: 'Suspended User',
      username: 'user.suspended',
      status: 'SUSPENDED',
      isPhoneVerified: true,
      passwordHash,
      avatarUrl: suspendedAvatar,
    },
  });

  const banned = await prisma.user.create({
    data: {
      email: 'banned@repose.ae',
      phone: '+971500000006',
      fullName: 'Banned User',
      username: 'user.banned',
      status: 'BANNED',
      isPhoneVerified: true,
      passwordHash,
      avatarUrl: await uploadDummy('avatar-placeholder.jpg', 'avatars'),
    },
  });

  // Wallets for sellers
  await prisma.sellerWallet.create({
    data: {
      userId: amara.id,
      onboardingComplete: true,
      stripeAccountId: 'acct_seed_amara',
      balanceAed: money(450),
      pendingAed: money(135),
    },
  });
  await prisma.sellerWallet.create({
    data: {
      userId: noura.id,
      onboardingComplete: false,
      balanceAed: money(0),
      pendingAed: money(0),
    },
  });

  return { admin, amara, noura, khalid, sara, suspended, banned };
}

async function seedAddresses(users: {
  khalid: { id: string };
  sara: { id: string };
  amara: { id: string };
}) {
  console.log('Addresses…');
  const khalidHome = await prisma.address.create({
    data: {
      userId: users.khalid.id,
      label: 'Home',
      line1: 'Apartment 1204, Marina Gate',
      city: 'Dubai',
      emirate: 'Dubai',
      phone: '+971500000003',
      isDefault: true,
    },
  });
  const saraHome = await prisma.address.create({
    data: {
      userId: users.sara.id,
      label: 'Home',
      line1: 'Villa 18, Arabian Ranches',
      city: 'Dubai',
      emirate: 'Dubai',
      phone: '+971500000004',
      isDefault: true,
    },
  });
  await prisma.address.create({
    data: {
      userId: users.amara.id,
      label: 'Studio',
      line1: 'Warehouse 4, Al Quoz',
      city: 'Dubai',
      emirate: 'Dubai',
      phone: '+971500000001',
      isDefault: true,
    },
  });
  return { khalidHome, saraHome };
}

type CatMap = Record<string, { id: string }>;

async function seedListings(
  sellers: { amara: { id: string }; noura: { id: string } },
  cats: CatMap,
) {
  console.log('Listings…');

  const img = {
    women: await uploadDummy('listing-women.jpg', 'listings'),
    men: await uploadDummy('listing-men.jpg', 'listings'),
    shoes: await uploadDummy('listing-shoes.jpg', 'listings'),
    bags: await uploadDummy('listing-bags.jpg', 'listings'),
    accessories: await uploadDummy('listing-accessories.jpg', 'listings'),
    featured: await uploadDummy('listing-featured.jpg', 'listings'),
  };

  const conditions: ListingCondition[] = [
    'NEW_WITH_TAGS',
    'NEW_WITHOUT_TAGS',
    'VERY_GOOD',
    'GOOD',
    'SATISFACTORY',
  ];

  async function createListing(opts: {
    sellerId: string;
    categoryId: string;
    title: string;
    brand?: string;
    size?: string;
    condition: ListingCondition | null;
    priceAed: number | null;
    status: ListingStatus;
    imageUrl: string;
    isFeatured?: boolean;
    publishedAt?: Date | null;
    soldAt?: Date | null;
    attributes?: object;
  }) {
    return prisma.listing.create({
      data: {
        sellerId: opts.sellerId,
        categoryId: opts.categoryId,
        title: opts.title,
        brand: opts.brand,
        size: opts.size,
        condition: opts.condition ?? undefined,
        priceAed: opts.priceAed != null ? money(opts.priceAed) : undefined,
        status: opts.status,
        isFeatured: opts.isFeatured ?? false,
        publishedAt: opts.publishedAt ?? undefined,
        soldAt: opts.soldAt ?? undefined,
        attributes: opts.attributes ?? undefined,
        viewCount: Math.floor(Math.random() * 200),
        images: {
          create: [{ url: opts.imageUrl, sortOrder: 0 }],
        },
      },
    });
  }

  // One ACTIVE listing per condition (women) — browse + badges
  const byCondition = [];
  for (let i = 0; i < conditions.length; i++) {
    byCondition.push(
      await createListing({
        sellerId: sellers.amara.id,
        categoryId: cats.women.id,
        title: `Condition demo — ${conditions[i].replace(/_/g, ' ').toLowerCase()}`,
        brand: ['Burberry', 'Zara', 'COS', 'Mango', 'H&M'][i],
        size: ['S', 'M', 'L', 'M', 'S'][i],
        condition: conditions[i],
        priceAed: 89 + i * 30,
        status: 'ACTIVE',
        imageUrl: img.women,
        publishedAt: daysAgo(10 - i),
      }),
    );
  }

  const menActive = await createListing({
    sellerId: sellers.noura.id,
    categoryId: cats.men.id,
    title: 'Relaxed linen overshirt',
    brand: 'COS',
    size: 'L',
    condition: 'VERY_GOOD',
    priceAed: 175,
    status: 'ACTIVE',
    imageUrl: img.men,
    publishedAt: daysAgo(3),
  });

  const shoesActive = await createListing({
    sellerId: sellers.amara.id,
    categoryId: cats.shoes.id,
    title: 'Leather loafers',
    brand: 'Church\'s',
    size: '42',
    condition: 'GOOD',
    priceAed: 320,
    status: 'ACTIVE',
    imageUrl: img.shoes,
    publishedAt: daysAgo(5),
  });

  const bagsActive = await createListing({
    sellerId: sellers.noura.id,
    categoryId: cats.bags.id,
    title: 'Structured tote',
    brand: 'Polène',
    size: 'One size',
    condition: 'NEW_WITHOUT_TAGS',
    priceAed: 480,
    status: 'ACTIVE',
    imageUrl: img.bags,
    publishedAt: daysAgo(2),
  });

  const accessoriesActive = await createListing({
    sellerId: sellers.amara.id,
    categoryId: cats.accessories.id,
    title: 'Silk square scarf',
    brand: 'Hermès',
    size: '90cm',
    condition: 'VERY_GOOD',
    priceAed: 650,
    status: 'ACTIVE',
    imageUrl: img.accessories,
    publishedAt: daysAgo(1),
  });

  const featured = await createListing({
    sellerId: sellers.amara.id,
    categoryId: cats.women.id,
    title: 'Archive trench — Rare Find',
    brand: 'Burberry',
    size: 'M',
    condition: 'NEW_WITH_TAGS',
    priceAed: 1290,
    status: 'ACTIVE',
    imageUrl: img.featured,
    isFeatured: true,
    publishedAt: daysAgo(1),
  });

  // Status variants
  const draft = await createListing({
    sellerId: sellers.amara.id,
    categoryId: cats.women.id,
    title: 'Draft knit (unpublished)',
    brand: 'Totême',
    size: 'S',
    condition: 'GOOD',
    priceAed: 210,
    status: 'DRAFT',
    imageUrl: img.women,
    publishedAt: null,
  });

  const sold1 = await createListing({
    sellerId: sellers.amara.id,
    categoryId: cats.bags.id,
    title: 'Sold mini crossbody',
    brand: 'Jacquemus',
    size: 'One size',
    condition: 'VERY_GOOD',
    priceAed: 390,
    status: 'SOLD',
    imageUrl: img.bags,
    publishedAt: daysAgo(20),
    soldAt: daysAgo(12),
  });

  const sold2 = await createListing({
    sellerId: sellers.noura.id,
    categoryId: cats.men.id,
    title: 'Sold wool blazer',
    brand: 'Acne Studios',
    size: '48',
    condition: 'GOOD',
    priceAed: 560,
    status: 'SOLD',
    imageUrl: img.men,
    publishedAt: daysAgo(30),
    soldAt: daysAgo(8),
  });

  const flagged = await createListing({
    sellerId: sellers.noura.id,
    categoryId: cats.accessories.id,
    title: 'Flagged — counterfeit check',
    brand: 'Rolex',
    size: 'One size',
    condition: 'NEW_WITH_TAGS',
    priceAed: 50,
    status: 'FLAGGED',
    imageUrl: img.accessories,
    publishedAt: daysAgo(4),
    attributes: {
      flagReason: 'COUNTERFEIT_SUSPECTED',
      flaggedAt: new Date().toISOString(),
    },
  });

  const removed = await createListing({
    sellerId: sellers.amara.id,
    categoryId: cats.shoes.id,
    title: 'Removed sneaker listing',
    brand: 'Nike',
    size: '41',
    condition: 'SATISFACTORY',
    priceAed: 95,
    status: 'REMOVED',
    imageUrl: img.shoes,
    publishedAt: daysAgo(40),
  });

  // Extra active for feed volume
  await createListing({
    sellerId: sellers.noura.id,
    categoryId: cats.women.id,
    title: 'Pleated midi skirt',
    brand: 'Uniqlo',
    size: 'M',
    condition: 'GOOD',
    priceAed: 85,
    status: 'ACTIVE',
    imageUrl: img.women,
    publishedAt: daysAgo(6),
  });

  return {
    byCondition,
    menActive,
    shoesActive,
    bagsActive,
    accessoriesActive,
    featured,
    draft,
    sold1,
    sold2,
    flagged,
    removed,
    img,
  };
}

async function createOrder(opts: {
  buyerId: string;
  addressId: string;
  listing: {
    id: string;
    sellerId: string;
    priceAed: Decimal | null;
    title: string | null;
  };
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  courierName?: string;
  trackingNumber?: string;
  shippedAt?: Date;
  deliveredAt?: Date;
  history: OrderStatus[];
  createdAt: Date;
}) {
  const price = Number(opts.listing.priceAed ?? 100);
  const subtotal = money(price);
  const commission = money(Number((price * COMMISSION_RATE).toFixed(2)));
  // Seller-side: buyer pays subtotal only
  const total = subtotal;

  const address = await prisma.address.findUniqueOrThrow({
    where: { id: opts.addressId },
  });
  const buyer = await prisma.user.findUniqueOrThrow({
    where: { id: opts.buyerId },
  });

  const order = await prisma.order.create({
    data: {
      buyerId: opts.buyerId,
      addressId: opts.addressId,
      status: opts.status,
      subtotalAed: subtotal,
      commissionAed: commission,
      totalAed: total,
      shipName: buyer.fullName,
      shipLine1: address.line1,
      shipLine2: address.line2,
      shipCity: address.city,
      shipEmirate: address.emirate,
      shipCountry: address.country,
      shipPostalCode: address.postalCode,
      shipPhone: address.phone,
      courierName: opts.courierName,
      trackingNumber: opts.trackingNumber,
      shippedAt: opts.shippedAt,
      deliveredAt: opts.deliveredAt,
      createdAt: opts.createdAt,
      updatedAt: opts.createdAt,
      items: {
        create: [
          {
            listingId: opts.listing.id,
            sellerId: opts.listing.sellerId,
            priceAed: subtotal,
          },
        ],
      },
      payment: {
        create: {
          provider: 'stripe',
          providerIntentId: `pi_seed_${opts.listing.id.slice(0, 8)}_${opts.status}`,
          amountAed: total,
          status: opts.paymentStatus,
          capturedAt:
            opts.paymentStatus === 'CAPTURED' ||
            opts.paymentStatus === 'RELEASED'
              ? opts.createdAt
              : undefined,
          releasedAt: opts.paymentStatus === 'RELEASED' ? opts.deliveredAt : undefined,
        },
      },
      statusHistory: {
        create: opts.history.map((status, i) => ({
          status,
          createdAt: new Date(opts.createdAt.getTime() + i * 3600_000),
          note: `Seed transition → ${status}`,
        })),
      },
    },
  });
  return order;
}

async function seedOrders(
  users: {
    khalid: { id: string };
    sara: { id: string };
    amara: { id: string };
    noura: { id: string };
  },
  addresses: { khalidHome: { id: string }; saraHome: { id: string } },
  listings: Awaited<ReturnType<typeof seedListings>>,
) {
  console.log('Orders…');

  // PENDING_PAYMENT — checkout in progress
  const pendingListing = listings.bagsActive;
  await createOrder({
    buyerId: users.khalid.id,
    addressId: addresses.khalidHome.id,
    listing: pendingListing,
    status: 'PENDING_PAYMENT',
    paymentStatus: 'REQUIRES_ACTION',
    history: ['PENDING_PAYMENT'],
    createdAt: daysAgo(0),
  });

  // PAID_HELD — awaiting shipment
  const paidHeld = await createOrder({
    buyerId: users.sara.id,
    addressId: addresses.saraHome.id,
    listing: listings.shoesActive,
    status: 'PAID_HELD',
    paymentStatus: 'CAPTURED',
    history: ['PENDING_PAYMENT', 'PAID_HELD'],
    createdAt: daysAgo(2),
  });
  await prisma.listing.update({
    where: { id: listings.shoesActive.id },
    data: { status: 'SOLD', soldAt: daysAgo(2) },
  });

  // SHIPPED
  await createOrder({
    buyerId: users.khalid.id,
    addressId: addresses.khalidHome.id,
    listing: listings.menActive,
    status: 'SHIPPED',
    paymentStatus: 'CAPTURED',
    courierName: 'Aramex',
    trackingNumber: 'AWB-SEED-1001',
    shippedAt: daysAgo(1),
    history: ['PENDING_PAYMENT', 'PAID_HELD', 'SHIPPED'],
    createdAt: daysAgo(4),
  });
  await prisma.listing.update({
    where: { id: listings.menActive.id },
    data: { status: 'SOLD', soldAt: daysAgo(4) },
  });

  // DELIVERED (dispute window open)
  const delivered = await createOrder({
    buyerId: users.sara.id,
    addressId: addresses.saraHome.id,
    listing: listings.accessoriesActive,
    status: 'DELIVERED',
    paymentStatus: 'CAPTURED',
    courierName: 'Fetchr',
    trackingNumber: 'AWB-SEED-2002',
    shippedAt: daysAgo(5),
    deliveredAt: daysAgo(1),
    history: ['PENDING_PAYMENT', 'PAID_HELD', 'SHIPPED', 'DELIVERED'],
    createdAt: daysAgo(8),
  });
  await prisma.listing.update({
    where: { id: listings.accessoriesActive.id },
    data: { status: 'SOLD', soldAt: daysAgo(8) },
  });

  // RELEASED — completed + review eligible done
  const released = await createOrder({
    buyerId: users.khalid.id,
    addressId: addresses.khalidHome.id,
    listing: listings.sold1,
    status: 'RELEASED',
    paymentStatus: 'RELEASED',
    courierName: 'Aramex',
    trackingNumber: 'AWB-SEED-3003',
    shippedAt: daysAgo(14),
    deliveredAt: daysAgo(10),
    history: [
      'PENDING_PAYMENT',
      'PAID_HELD',
      'SHIPPED',
      'DELIVERED',
      'RELEASED',
    ],
    createdAt: daysAgo(18),
  });

  // CANCELLED
  await createOrder({
    buyerId: users.sara.id,
    addressId: addresses.saraHome.id,
    listing: listings.byCondition[0],
    status: 'CANCELLED',
    paymentStatus: 'FAILED',
    history: ['PENDING_PAYMENT', 'CANCELLED'],
    createdAt: daysAgo(6),
  });
  // restore listing as ACTIVE (cancel before paid)
  await prisma.listing.update({
    where: { id: listings.byCondition[0].id },
    data: { status: 'ACTIVE', soldAt: null },
  });

  // DISPUTED
  await createOrder({
    buyerId: users.sara.id,
    addressId: addresses.saraHome.id,
    listing: listings.sold2,
    status: 'DISPUTED',
    paymentStatus: 'CAPTURED',
    courierName: 'Aramex',
    trackingNumber: 'AWB-SEED-4004',
    shippedAt: daysAgo(11),
    deliveredAt: daysAgo(7),
    history: ['PENDING_PAYMENT', 'PAID_HELD', 'SHIPPED', 'DELIVERED', 'DISPUTED'],
    createdAt: daysAgo(15),
  });
  await prisma.order.updateMany({
    where: { status: 'DISPUTED' },
    data: { disputeReason: 'ITEM_NOT_AS_DESCRIBED' },
  });

  // REFUNDED
  await createOrder({
    buyerId: users.khalid.id,
    addressId: addresses.khalidHome.id,
    listing: listings.removed,
    status: 'REFUNDED',
    paymentStatus: 'REFUNDED',
    history: ['PENDING_PAYMENT', 'PAID_HELD', 'CANCELLED', 'REFUNDED'],
    createdAt: daysAgo(25),
  });

  return { paidHeld, delivered, released };
}

async function seedWalletLedger(amaraId: string, releasedOrderId: string) {
  console.log('Wallet ledger…');
  const wallet = await prisma.sellerWallet.findUniqueOrThrow({
    where: { userId: amaraId },
  });
  await prisma.walletTransaction.createMany({
    data: [
      {
        walletId: wallet.id,
        type: 'SALE_CREDIT' as WalletTxType,
        amountAed: money(351),
        referenceOrderId: releasedOrderId,
        note: 'Net proceeds after 10% commission',
        availableAt: daysAgo(3),
        createdAt: daysAgo(10),
      },
      {
        walletId: wallet.id,
        type: 'COMMISSION_DEBIT' as WalletTxType,
        amountAed: money(-39),
        referenceOrderId: releasedOrderId,
        note: 'Platform commission 10%',
        createdAt: daysAgo(10),
      },
      {
        walletId: wallet.id,
        type: 'WITHDRAWAL' as WalletTxType,
        amountAed: money(-100),
        note: 'Payout to bank',
        createdAt: daysAgo(5),
      },
      {
        walletId: wallet.id,
        type: 'SALE_CREDIT' as WalletTxType,
        amountAed: money(135),
        note: 'Pending clearance',
        availableAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
        createdAt: daysAgo(1),
      },
    ],
  });
}

async function seedEngagement(
  users: {
    khalid: { id: string };
    amara: { id: string };
    sara: { id: string };
    noura: { id: string };
  },
  listings: Awaited<ReturnType<typeof seedListings>>,
  orders: { released: { id: string }; delivered: { id: string } },
) {
  console.log('Chat, saves, notifications, reviews…');

  await prisma.savedListing.createMany({
    data: [
      { userId: users.khalid.id, listingId: listings.featured.id },
      { userId: users.khalid.id, listingId: listings.byCondition[2].id },
      { userId: users.sara.id, listingId: listings.featured.id },
    ],
  });

  const convo = await prisma.conversation.create({
    data: {
      listingId: listings.featured.id,
      buyerId: users.khalid.id,
      sellerId: users.amara.id,
      lastMessageAt: daysAgo(0),
      messages: {
        create: [
          {
            senderId: users.khalid.id,
            body: 'Is the trench still available? Can you confirm measurements?',
            createdAt: daysAgo(1),
          },
          {
            senderId: users.amara.id,
            body: 'Yes — pit to pit 52cm. Happy to ship tomorrow.',
            createdAt: daysAgo(0),
            readAt: new Date(),
          },
        ],
      },
    },
  });

  await prisma.conversation.create({
    data: {
      listingId: listings.byCondition[1].id,
      buyerId: users.sara.id,
      sellerId: users.amara.id,
      lastMessageAt: daysAgo(2),
      messages: {
        create: [
          {
            senderId: users.sara.id,
            body: 'Would you take 150 AED?',
            createdAt: daysAgo(2),
          },
        ],
      },
    },
  });

  const notifs: Array<{
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    data?: object;
  }> = [
    {
      userId: users.amara.id,
      type: 'NEW_MESSAGE',
      title: 'New message',
      body: 'Khalid Hassan sent you a message',
      data: { route: 'chat', conversationId: convo.id },
    },
    {
      userId: users.amara.id,
      type: 'ITEM_SOLD',
      title: 'Item sold',
      body: 'Your mini crossbody sold',
      data: { listingId: listings.sold1.id },
    },
    {
      userId: users.khalid.id,
      type: 'ORDER_UPDATE',
      title: 'Order shipped',
      body: 'Your order is on the way via Aramex',
    },
    {
      userId: users.sara.id,
      type: 'ORDER_UPDATE',
      title: 'Delivered',
      body: 'Confirm receipt when you are happy with the item',
      data: { orderId: orders.delivered.id },
    },
    {
      userId: users.amara.id,
      type: 'SYSTEM',
      title: 'Welcome to Repose',
      body: 'Complete your seller wallet onboarding to withdraw earnings.',
    },
    {
      userId: users.noura.id,
      type: 'SYSTEM',
      title: 'Listing flagged',
      body: 'A listing was sent to moderation for review.',
      data: { listingId: listings.flagged.id },
    },
  ];

  for (const n of notifs) {
    await prisma.notification.create({
      data: {
        userId: n.userId,
        type: n.type,
        title: n.title,
        body: n.body,
        data: n.data ?? undefined,
        createdAt: daysAgo(Math.floor(Math.random() * 5)),
      },
    });
  }

  // Mark one as read
  const first = await prisma.notification.findFirst({
    where: { userId: users.amara.id },
  });
  if (first) {
    await prisma.notification.update({
      where: { id: first.id },
      data: { readAt: new Date() },
    });
  }

  await prisma.review.create({
    data: {
      orderId: orders.released.id,
      reviewerId: users.khalid.id,
      revieweeId: users.amara.id,
      rating: 5,
      comment: 'Fast shipping, item exactly as described.',
    },
  });
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run full wipe seed in production');
  }
  if (!fs.existsSync(DUMMY_DIR)) {
    throw new Error(`Dummy images folder not found: ${DUMMY_DIR}`);
  }

  configureCloudinary();
  await wipeDevData();

  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  await seedCategories();
  const users = await seedUsers(passwordHash);
  const addresses = await seedAddresses(users);

  const catRows = await prisma.category.findMany();
  const cats: CatMap = Object.fromEntries(catRows.map((c) => [c.slug, c]));

  const listings = await seedListings(
    { amara: users.amara, noura: users.noura },
    cats,
  );
  const orders = await seedOrders(users, addresses, listings);
  await seedWalletLedger(users.amara.id, orders.released.id);
  await seedEngagement(users, listings, orders);

  console.log('\n──────── Seed complete ────────');
  console.log('Login password for demo users: password123');
  console.log(`Admin: ${process.env.SEED_ADMIN_EMAIL ?? 'admin@repose.ae'} (SEED_ADMIN_PASSWORD)`);
  console.log('Sellers: amara@repose.ae, noura@repose.ae');
  console.log('Buyers:  khalid@repose.ae, sara@repose.ae');
  console.log('Also:    suspended@repose.ae, banned@repose.ae');
  console.log(`Listings: ${await prisma.listing.count()}  Orders: ${await prisma.order.count()}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
