/**
 * Development seed — uploads Stitch-generated images to Cloudinary and creates
 * users / listings / orders / wallet / chat / notifications / reviews covering
 * every enum status needed to exercise the MVP.
 *
 * Images: ../../documentation/stitch_p2p_marketplace_asset_generator/
 * (each subfolder contains screen.png)
 *
 * Password for all seeded users (except admin from env): password123
 *
 * Run: pnpm prisma:seed  (wipes previous seed rows)
 */
import * as path from 'path';
import * as fs from 'fs';
import * as bcrypt from 'bcrypt';
import { v2 as cloudinary } from 'cloudinary';
import { MeiliSearch } from 'meilisearch';
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

const ASSETS_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  'documentation',
  'stitch_p2p_marketplace_asset_generator',
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

/** Cache by asset folder so reused images upload once. */
const uploadCache = new Map<string, string>();

/** Upload screen.png from a Stitch asset folder. */
async function uploadAsset(
  folderName: string,
  publicId: string,
  cloudFolder: string,
): Promise<string> {
  if (uploadCache.has(folderName)) return uploadCache.get(folderName)!;

  const filePath = path.join(ASSETS_DIR, folderName, 'screen.png');
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing asset: ${folderName}/screen.png`);
  }

  const result = await cloudinary.uploader.upload(filePath, {
    folder: `repose/seed/${cloudFolder}`,
    public_id: publicId,
    overwrite: true,
    resource_type: 'image',
  });
  uploadCache.set(folderName, result.secure_url);
  console.log(`  ↑ ${publicId}`);
  return result.secure_url;
}

// ───────────────── Asset maps (Stitch folders) ─────────────────

const AVATAR_FOLDERS: Record<string, string> = {
  admin:
    'realistic_portrait_of_a_professional_looking_middle_aged_woman_face_and',
  amara:
    'realistic_portrait_of_a_stylish_young_woman_amara_face_and_shoulders_natural',
  noura:
    'realistic_portrait_of_a_friendly_woman_in_her_30s_noura_face_and_shoulders',
  khalid:
    'realistic_portrait_of_a_young_man_khalid_face_and_shoulders_clean_and_modern',
  sara: 'realistic_portrait_of_a_fashionable_young_woman_sara_face_and_shoulders_urban',
  suspended:
    'realistic_portrait_of_a_man_neutral_expression_face_and_shoulders_standard',
  placeholder:
    'generic_silhouette_or_a_very_neutral_non_descript_face_for_a_profile',
};

type ProductDef = {
  key: string;
  category: string;
  title: string;
  brand: string;
  size: string;
  condition: ListingCondition;
  priceAed: number;
  seller: 'amara' | 'noura';
  status: ListingStatus;
  isFeatured?: boolean;
  publishedDaysAgo?: number | null;
  soldDaysAgo?: number | null;
  flagReason?: string;
  main: string;
  second?: string;
  detail?: string;
};

const PRODUCTS: ProductDef[] = [
  {
    key: 'women-trench',
    category: 'women',
    title: 'Archive trench coat — rare find',
    brand: 'Burberry',
    size: 'M',
    condition: 'NEW_WITH_TAGS',
    priceAed: 1290,
    seller: 'amara',
    status: 'ACTIVE',
    isFeatured: true,
    publishedDaysAgo: 1,
    main: 'main_product_photo_4_5_ratio_of_a_high_quality_vintage_trench_coat_archive_find',
    second:
      'second_angle_photo_of_the_trench_coat_image_12_close_up_of_the_storm_flap_and',
    detail:
      'close_up_photo_of_the_archive_brand_label_inside_the_collar_of_a_vintage_trench',
  },
  {
    key: 'women-dress',
    category: 'women',
    title: 'Floral midi summer dress',
    brand: 'Reformation',
    size: 'S',
    condition: 'VERY_GOOD',
    priceAed: 220,
    seller: 'amara',
    status: 'ACTIVE',
    publishedDaysAgo: 3,
    main: 'main_product_photo_4_5_ratio_of_a_beautiful_floral_midi_summer_dress_laid_flat',
    second:
      'second_angle_photo_of_the_floral_dress_image_13_close_up_of_the_fabric_print',
    detail:
      'close_up_photo_of_the_delicate_floral_print_fabric_and_adjustable_strap_buckle',
  },
  {
    key: 'women-blazer',
    category: 'women',
    title: 'Structured navy wool blazer',
    brand: 'Theory',
    size: 'M',
    condition: 'GOOD',
    priceAed: 340,
    seller: 'noura',
    status: 'ACTIVE',
    publishedDaysAgo: 4,
    main: 'main_product_photo_4_5_ratio_of_a_structured_navy_wool_blazer_archive_fashion',
    second:
      'second_angle_photo_of_the_navy_blazer_image_11_back_view_on_the_hanger_showing',
    detail:
      'close_up_photo_of_the_gold_tone_buttons_and_textured_navy_wool_fabric_of_a',
  },
  {
    key: 'women-skirt',
    category: 'women',
    title: 'Pleated midi skirt',
    brand: 'Uniqlo',
    size: 'M',
    condition: 'GOOD',
    priceAed: 85,
    seller: 'noura',
    status: 'ACTIVE',
    publishedDaysAgo: 6,
    main: 'main_product_photo_4_5_ratio_of_a_pleated_midi_skirt_high_quality_fabric',
    second:
      'second_angle_photo_of_the_pleated_skirt_image_10_close_up_of_the_waistband_and',
    detail:
      'close_up_photo_of_the_side_zipper_and_neat_pleat_transition_at_the_waistband_of',
  },
  {
    key: 'women-knit',
    category: 'women',
    title: 'Cable knit wool sweater (draft)',
    brand: 'Totême',
    size: 'S',
    condition: 'GOOD',
    priceAed: 210,
    seller: 'amara',
    status: 'DRAFT',
    publishedDaysAgo: null,
    main: 'main_product_photo_4_5_ratio_of_a_cozy_wool_sweater_knit_laid_flat_on_a_clean',
    second:
      'second_angle_photo_of_the_wool_sweater_image_9_close_up_of_the_cable_knit',
    detail:
      'close_up_photo_of_the_thick_wool_cable_knit_pattern_and_the_brand_tag_of_a_cozy',
  },
  {
    key: 'women-top',
    category: 'women',
    title: 'Silk blouse with soft drape',
    brand: 'COS',
    size: 'S',
    condition: 'NEW_WITHOUT_TAGS',
    priceAed: 195,
    seller: 'amara',
    status: 'ACTIVE',
    publishedDaysAgo: 2,
    main: 'main_product_photo_4_5_ratio_of_a_silk_blouse_top_elegant_drape_fashion',
    second:
      'second_angle_photo_of_the_silk_blouse_image_6_side_view_on_the_mannequin',
    detail:
      'close_up_photo_of_the_material_composition_tag_and_fine_silk_texture_of_a_cream',
  },
  {
    key: 'men-overshirt',
    category: 'men',
    title: 'Relaxed linen overshirt',
    brand: 'COS',
    size: 'L',
    condition: 'VERY_GOOD',
    priceAed: 175,
    seller: 'noura',
    status: 'ACTIVE',
    publishedDaysAgo: 3,
    main: 'main_product_photo_4_5_ratio_of_a_casual_linen_overshirt_for_men_relaxed_fit',
    second:
      'second_angle_photo_of_the_linen_overshirt_image_8_close_up_of_the_cuff_and',
    detail:
      'close_up_photo_of_the_natural_linen_texture_and_chest_pocket_stitching_of_a_men',
  },
  {
    key: 'men-blazer',
    category: 'men',
    title: 'Sold wool blazer',
    brand: 'Acne Studios',
    size: '48',
    condition: 'GOOD',
    priceAed: 560,
    seller: 'noura',
    status: 'SOLD',
    publishedDaysAgo: 30,
    soldDaysAgo: 8,
    // Shares shoot with women-blazer (only one navy blazer set generated).
    main: 'main_product_photo_4_5_ratio_of_a_structured_navy_wool_blazer_archive_fashion',
    second:
      'second_angle_photo_of_the_navy_blazer_image_11_back_view_on_the_hanger_showing',
    detail:
      'close_up_photo_of_the_gold_tone_buttons_and_textured_navy_wool_fabric_of_a',
  },
  {
    key: 'men-trousers',
    category: 'men',
    title: 'Tailored wool trousers',
    brand: 'J.Crew',
    size: '32',
    condition: 'VERY_GOOD',
    priceAed: 160,
    seller: 'amara',
    status: 'ACTIVE',
    publishedDaysAgo: 5,
    main: 'main_product_photo_4_5_ratio_of_tailored_men_s_trousers_clean_lines',
    second:
      'second_angle_photo_of_the_tailored_trousers_image_7_close_up_of_the_waistband',
    detail:
      'close_up_photo_of_the_inner_pocket_lining_and_tailored_seam_construction_of_men',
  },
  {
    key: 'men-tee',
    category: 'men',
    title: 'Premium cotton polo',
    brand: 'Lacoste',
    size: 'M',
    condition: 'GOOD',
    priceAed: 120,
    seller: 'noura',
    status: 'ACTIVE',
    publishedDaysAgo: 7,
    main: 'main_product_photo_4_5_ratio_of_a_premium_cotton_polo_shirt_marketplace_listing',
    second:
      'second_angle_photo_of_the_navy_polo_shirt_image_3_close_up_of_the_fabric',
    detail:
      'close_up_photo_of_the_fabric_weave_and_a_spare_button_attached_to_the_care',
  },
  {
    key: 'shoes-loafers',
    category: 'shoes',
    title: 'Classic leather loafers',
    brand: "Church's",
    size: '42',
    condition: 'GOOD',
    priceAed: 320,
    seller: 'amara',
    status: 'ACTIVE',
    publishedDaysAgo: 5,
    main: 'main_product_photo_4_5_ratio_of_classic_leather_loafers_detailed_texture',
    second:
      'second_angle_photo_of_the_leather_loafers_image_2_side_profile_view_showing_the',
    detail:
      'close_up_photo_of_the_inner_brand_stamp_and_hand_stitched_detailing_on_a_pair',
  },
  {
    key: 'shoes-sneakers',
    category: 'shoes',
    title: 'Clean white leather sneakers',
    brand: 'Common Projects',
    size: '41',
    condition: 'SATISFACTORY',
    priceAed: 280,
    seller: 'noura',
    status: 'ACTIVE',
    publishedDaysAgo: 8,
    main: 'main_product_photo_4_5_ratio_of_clean_white_leather_sneakers_modern_marketplace',
    second:
      'second_angle_photo_of_the_white_sneakers_image_4_back_view_showing_the_heel_tab',
    detail:
      'close_up_photo_of_the_textured_sole_and_clean_stitching_on_the_side_of_a_white',
  },
  {
    key: 'shoes-heels',
    category: 'shoes',
    title: 'Black leather pointed pumps',
    brand: 'Jimmy Choo',
    size: '38',
    condition: 'VERY_GOOD',
    priceAed: 410,
    seller: 'amara',
    status: 'ACTIVE',
    publishedDaysAgo: 2,
    main: 'main_product_photo_of_elegant_black_leather_high_heel_pumps_classic_pointed_toe',
    second:
      'second_angle_photo_of_the_black_high_heels_shoes_heels_01.jpg_side_profile_view',
    detail:
      'close_up_photo_of_the_inner_designer_label_and_clean_heel_tip_of_the_black_high',
  },
  {
    key: 'shoes-sandals',
    category: 'shoes',
    title: 'Tan leather strappy sandals',
    brand: 'Ancient Greek Sandals',
    size: '39',
    condition: 'GOOD',
    priceAed: 190,
    seller: 'noura',
    status: 'REMOVED',
    publishedDaysAgo: 40,
    main: 'main_product_photo_of_tan_leather_strappy_sandals_minimalist_design_laid_flat',
    second:
      'second_angle_photo_of_the_tan_leather_sandals_shoes_sandals_01.jpg_top_down',
  },
  {
    key: 'bags-tote',
    category: 'bags',
    title: 'Structured leather tote',
    brand: 'Polène',
    size: 'One size',
    condition: 'NEW_WITHOUT_TAGS',
    priceAed: 480,
    seller: 'noura',
    status: 'ACTIVE',
    publishedDaysAgo: 2,
    main: 'main_product_photo_4_5_ratio_of_a_structured_leather_tote_bag_archive_designer',
    second:
      'second_angle_photo_of_the_structured_leather_tote_bag_image_1_showing_the',
    detail:
      'close_up_photo_of_a_designer_label_and_interior_lining_of_a_structured_leather',
  },
  {
    key: 'bags-crossbody',
    category: 'bags',
    title: 'Sold mini leather crossbody',
    brand: 'Jacquemus',
    size: 'One size',
    condition: 'VERY_GOOD',
    priceAed: 390,
    seller: 'amara',
    status: 'SOLD',
    publishedDaysAgo: 20,
    soldDaysAgo: 12,
    main: 'main_product_photo_4_5_ratio_equivalent_of_a_minimalist_leather_crossbody_bag',
    second:
      'second_angle_photo_of_the_olive_leather_crossbody_bag_bags_crossbody_01.jpg',
    detail:
      'close_up_photo_of_the_adjustable_strap_buckle_and_the_embossed_brand_logo_on',
  },
  {
    key: 'bags-shoulder',
    category: 'bags',
    title: 'Cognac leather shoulder bag',
    brand: 'Mansur Gavriel',
    size: 'One size',
    condition: 'GOOD',
    priceAed: 350,
    seller: 'amara',
    status: 'ACTIVE',
    publishedDaysAgo: 9,
    main: 'main_product_photo_4_5_ratio_equivalent_of_a_vintage_leather_shoulder_bag',
    second:
      'second_angle_photo_of_the_cognac_leather_shoulder_bag_bags_shoulder_01.jpg_side',
  },
  {
    key: 'bags-clutch',
    category: 'bags',
    title: 'Black satin evening clutch',
    brand: 'The Row',
    size: 'One size',
    condition: 'NEW_WITH_TAGS',
    priceAed: 290,
    seller: 'noura',
    status: 'ACTIVE',
    publishedDaysAgo: 1,
    main: 'main_product_photo_4_5_ratio_equivalent_of_an_elegant_evening_clutch_bag_black',
    second:
      'second_angle_photo_of_the_black_satin_evening_clutch_bags_clutch_01.jpg_showing',
    detail:
      'close_up_photo_of_the_inner_designer_label_and_magnetic_snap_closure_of_the',
  },
  {
    key: 'acc-scarf',
    category: 'accessories',
    title: 'Silk square scarf',
    brand: 'Hermès',
    size: '90cm',
    condition: 'VERY_GOOD',
    priceAed: 650,
    seller: 'amara',
    status: 'ACTIVE',
    publishedDaysAgo: 1,
    main: 'main_product_photo_4_5_ratio_of_a_silk_square_scarf_vibrant_pattern_laid_flat',
    second:
      'second_angle_photo_of_the_silk_scarf_image_5_folded_neatly_to_show_the_pattern',
    detail:
      'close_up_photo_of_the_rolled_hem_and_a_corner_of_the_intricate_pattern_on_a',
  },
  {
    key: 'acc-belt',
    category: 'accessories',
    title: 'Dark brown leather belt',
    brand: "Anderson's",
    size: '85',
    condition: 'GOOD',
    priceAed: 95,
    seller: 'noura',
    status: 'ACTIVE',
    publishedDaysAgo: 11,
    main: 'main_product_photo_of_a_classic_leather_belt_dark_brown_with_a_brushed_brass',
    second:
      'second_angle_photo_of_the_brown_leather_belt_close_up_showing_the_buckle_detail',
    detail:
      'close_up_photo_of_the_adjustable_brass_buckle_and_fine_stitching_on_the_leather',
  },
  {
    key: 'acc-sunglasses',
    category: 'accessories',
    title: 'Tortoiseshell wayfarer sunglasses',
    brand: 'Ray-Ban',
    size: 'One size',
    condition: 'VERY_GOOD',
    priceAed: 140,
    seller: 'amara',
    status: 'ACTIVE',
    publishedDaysAgo: 4,
    main: 'main_product_photo_of_stylish_tortoiseshell_sunglasses_classic_wayfarer_shape',
    second:
      'second_angle_photo_of_the_tortoiseshell_sunglasses_side_view_showing_the_hinge',
  },
  {
    key: 'acc-watch',
    category: 'accessories',
    title: 'Flagged vintage gold-tone watch',
    brand: 'Rolex',
    size: 'One size',
    condition: 'NEW_WITH_TAGS',
    priceAed: 50,
    seller: 'noura',
    status: 'FLAGGED',
    publishedDaysAgo: 4,
    flagReason: 'COUNTERFEIT_SUSPECTED',
    main: 'main_product_photo_4_5_ratio_equivalent_of_a_vintage_gold_tone_watch_with_a',
    second:
      'second_angle_photo_of_the_vintage_watch_acc_watch_01.jpg_side_profile_showing',
    detail:
      'close_up_photo_of_the_intricate_gold_tone_clasp_and_the_fabric_texture_of_the',
  },
];

const CONDITION_EXTRAS: ListingCondition[] = [
  'NEW_WITH_TAGS',
  'NEW_WITHOUT_TAGS',
  'VERY_GOOD',
  'GOOD',
  'SATISFACTORY',
];

// ───────────────────────── Categories ─────────────────────────

const CATEGORIES = [
  { name: 'Women', slug: 'women', sortOrder: 1, isActive: true },
  { name: 'Men', slug: 'men', sortOrder: 2, isActive: true },
  { name: 'Shoes', slug: 'shoes', sortOrder: 3, isActive: true },
  { name: 'Bags', slug: 'bags', sortOrder: 4, isActive: true },
  {
    name: 'Accessories',
    slug: 'accessories',
    sortOrder: 5,
    isActive: true,
  },
  { name: 'Kids', slug: 'kids', sortOrder: 6, isActive: false },
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
    // Icons are rendered in the client by slug (no banner/icon images).
    await prisma.category.create({
      data: {
        name: c.name,
        slug: c.slug,
        sortOrder: c.sortOrder,
        isActive: c.isActive,
        bannerUrl: null,
        iconUrl: null,
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

  console.log('Uploading avatars…');
  const adminAvatar = await uploadAsset(
    AVATAR_FOLDERS.admin,
    'avatar-admin',
    'avatars',
  );
  const amaraAvatar = await uploadAsset(
    AVATAR_FOLDERS.amara,
    'avatar-amara',
    'avatars',
  );
  const nouraAvatar = await uploadAsset(
    AVATAR_FOLDERS.noura,
    'avatar-noura',
    'avatars',
  );
  const khalidAvatar = await uploadAsset(
    AVATAR_FOLDERS.khalid,
    'avatar-khalid',
    'avatars',
  );
  const saraAvatar = await uploadAsset(
    AVATAR_FOLDERS.sara,
    'avatar-sara',
    'avatars',
  );
  const suspendedAvatar = await uploadAsset(
    AVATAR_FOLDERS.suspended,
    'avatar-suspended',
    'avatars',
  );
  const placeholderAvatar = await uploadAsset(
    AVATAR_FOLDERS.placeholder,
    'avatar-placeholder',
    'avatars',
  );

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
      avatarUrl: placeholderAvatar,
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
  console.log('Listings (Stitch multi-image products)…');

  async function createListing(opts: {
    sellerId: string;
    categoryId: string;
    title: string;
    brand?: string;
    size?: string;
    condition: ListingCondition | null;
    priceAed: number | null;
    status: ListingStatus;
    imageUrls: string[];
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
          create: opts.imageUrls.map((url, i) => ({
            url,
            sortOrder: i,
          })),
        },
      },
    });
  }

  async function uploadProductImages(
    p: ProductDef,
  ): Promise<string[]> {
    const urls: string[] = [];
    urls.push(await uploadAsset(p.main, `${p.key}-01`, 'listings'));
    if (p.second) {
      urls.push(await uploadAsset(p.second, `${p.key}-02`, 'listings'));
    }
    if (p.detail) {
      urls.push(await uploadAsset(p.detail, `${p.key}-03`, 'listings'));
    }
    return urls;
  }

  const byKey: Record<string, Awaited<ReturnType<typeof createListing>>> = {};

  for (const p of PRODUCTS) {
    const cat = cats[p.category];
    if (!cat) throw new Error(`Missing category slug: ${p.category}`);
    const sellerId =
      p.seller === 'amara' ? sellers.amara.id : sellers.noura.id;

    const imageUrls = await uploadProductImages(p);
    byKey[p.key] = await createListing({
      sellerId,
      categoryId: cat.id,
      title: p.title,
      brand: p.brand,
      size: p.size,
      condition: p.condition,
      priceAed: p.priceAed,
      status: p.status,
      imageUrls,
      isFeatured: p.isFeatured,
      publishedAt:
        p.publishedDaysAgo == null
          ? null
          : daysAgo(p.publishedDaysAgo),
      soldAt:
        p.soldDaysAgo != null ? daysAgo(p.soldDaysAgo) : undefined,
      attributes: p.flagReason
        ? {
            flagReason: p.flagReason,
            flaggedAt: new Date().toISOString(),
          }
        : undefined,
    });
  }

  // One ACTIVE listing per condition — reuses dress shoot for demo badges
  const dressImages = [
    await uploadAsset(
      'main_product_photo_4_5_ratio_of_a_beautiful_floral_midi_summer_dress_laid_flat',
      'cond-dress-01',
      'listings',
    ),
    await uploadAsset(
      'second_angle_photo_of_the_floral_dress_image_13_close_up_of_the_fabric_print',
      'cond-dress-02',
      'listings',
    ),
  ];

  const byCondition = [];
  for (let i = 0; i < CONDITION_EXTRAS.length; i++) {
    byCondition.push(
      await createListing({
        sellerId: sellers.amara.id,
        categoryId: cats.women.id,
        title: `Condition demo — ${CONDITION_EXTRAS[i].replace(/_/g, ' ').toLowerCase()}`,
        brand: ['Burberry', 'Zara', 'COS', 'Mango', 'H&M'][i],
        size: ['S', 'M', 'L', 'M', 'S'][i],
        condition: CONDITION_EXTRAS[i],
        priceAed: 89 + i * 30,
        status: 'ACTIVE',
        imageUrls: dressImages,
        publishedAt: daysAgo(10 - i),
      }),
    );
  }

  return {
    byKey,
    byCondition,
    menActive: byKey['men-overshirt'],
    shoesActive: byKey['shoes-loafers'],
    bagsActive: byKey['bags-tote'],
    accessoriesActive: byKey['acc-scarf'],
    featured: byKey['women-trench'],
    draft: byKey['women-knit'],
    sold1: byKey['bags-crossbody'],
    sold2: byKey['men-blazer'],
    flagged: byKey['acc-watch'],
    removed: byKey['shoes-sandals'],
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
          releasedAt:
            opts.paymentStatus === 'RELEASED' ? opts.deliveredAt : undefined,
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
    history: [
      'PENDING_PAYMENT',
      'PAID_HELD',
      'SHIPPED',
      'DELIVERED',
      'DISPUTED',
    ],
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

/**
 * Seed writes listings via Prisma (not ListingsService), so listing.changed
 * events never fire and Bull never indexes. Rebuild Meili for explore/search.
 */
async function reindexMeilisearch(): Promise<void> {
  const host = process.env.MEILISEARCH_HOST?.trim();
  if (!host) {
    console.warn('MEILISEARCH_HOST unset — skip search reindex (explore will be empty)');
    return;
  }

  console.log('Meilisearch reindex…');
  const client = new MeiliSearch({
    host,
    apiKey: process.env.MEILISEARCH_API_KEY,
  });
  const indexUid = 'listings';

  await client.createIndex(indexUid, { primaryKey: 'id' }).catch(() => undefined);
  const index = client.index(indexUid);
  await index.updateSettings({
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

  await index.deleteAllDocuments();

  const active = await prisma.listing.findMany({
    where: { status: 'ACTIVE' },
    include: {
      images: { orderBy: { sortOrder: 'asc' }, take: 1 },
      category: { select: { slug: true } },
    },
  });

  const docs = active.map((listing) => ({
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
  }));

  if (docs.length) {
    const task = await index.addDocuments(docs);
    await client.waitForTask(task.taskUid, { timeOutMs: 60_000 });
  }

  console.log(`  indexed ${docs.length} ACTIVE listings`);
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run full wipe seed in production');
  }
  if (!fs.existsSync(ASSETS_DIR)) {
    throw new Error(`Stitch assets folder not found: ${ASSETS_DIR}`);
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
  // After order side-effects flip some ACTIVE → SOLD
  await reindexMeilisearch();

  console.log('\n──────── Seed complete ────────');
  console.log('Login password for demo users: password123');
  console.log(
    `Admin: ${process.env.SEED_ADMIN_EMAIL ?? 'admin@repose.ae'} (SEED_ADMIN_PASSWORD)`,
  );
  console.log('Sellers: amara@repose.ae, noura@repose.ae');
  console.log('Buyers:  khalid@repose.ae, sara@repose.ae');
  console.log('Also:    suspended@repose.ae, banned@repose.ae');
  console.log(
    `Listings: ${await prisma.listing.count()}  Orders: ${await prisma.order.count()}  Images: ${await prisma.listingImage.count()}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
