/**
 * One-off: rebuild Meilisearch from active Postgres listings.
 * Usage: npx ts-node scripts/reindex-search.ts
 */
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "@prisma/client";
import { MeiliSearch } from "meilisearch";

for (const line of fs
  .readFileSync(path.join(__dirname, "..", ".env"), "utf8")
  .split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue;
  const i = line.indexOf("=");
  if (i < 0) continue;
  const k = line.slice(0, i);
  const v = line.slice(i + 1);
  if (!process.env[k]) process.env[k] = v;
}

const prisma = new PrismaClient();

async function main() {
  const host = process.env.MEILISEARCH_HOST?.trim();
  if (!host) throw new Error("MEILISEARCH_HOST missing");

  const client = new MeiliSearch({
    host,
    apiKey: process.env.MEILISEARCH_API_KEY,
  });
  const indexUid = "listings";
  await client
    .createIndex(indexUid, { primaryKey: "id" })
    .catch(() => undefined);
  const index = client.index(indexUid);
  await index.updateSettings({
    searchableAttributes: ["title", "brand", "description", "categorySlug"],
    filterableAttributes: [
      "categoryId",
      "categorySlug",
      "condition",
      "brand",
      "size",
      "priceAed",
      "status",
      "isFeatured",
    ],
    sortableAttributes: ["priceAed", "publishedAt"],
    rankingRules: [
      "sort",
      "words",
      "typo",
      "proximity",
      "attribute",
      "exactness",
    ],
  });
  await index.deleteAllDocuments();

  const active = await prisma.listing.findMany({
    where: { status: "ACTIVE" },
    include: {
      images: { orderBy: { sortOrder: "asc" }, take: 1 },
      category: { select: { slug: true } },
    },
  });

  const docs = active.map((listing) => ({
    id: listing.id,
    title: listing.title ?? "",
    description: listing.description ?? "",
    brand: listing.brand ?? "",
    size: listing.size ?? "",
    condition: listing.condition ?? "",
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

  console.log(`Indexed ${docs.length} ACTIVE listings`);

  const search = await fetch(
    "http://localhost:4000/api/v1/search?limit=5",
  ).then((r) => r.json());
  console.log(
    "search resultCount:",
    search?.meta?.resultCount,
    "titles:",
    (search?.data ?? []).map((d: { title: string }) => d.title),
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
