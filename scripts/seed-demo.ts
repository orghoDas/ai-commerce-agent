import { pbkdf2Sync, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const business = await prisma.business.upsert({
    where: { slug: "demo-shop" },
    update: {},
    create: {
      name: "Demo Shop",
      slug: "demo-shop",
      timezone: "Asia/Dhaka",
      defaultCurrency: "USD"
    }
  });

  await prisma.user.upsert({
    where: {
      businessId_email: {
        businessId: business.id,
        email: "owner@demo-shop.local"
      }
    },
    update: {
      name: "Demo Owner",
      role: "OWNER",
      passwordHash: hashPassword("demo-password-123"),
      emailVerifiedAt: new Date()
    },
    create: {
      businessId: business.id,
      email: "owner@demo-shop.local",
      name: "Demo Owner",
      role: "OWNER",
      passwordHash: hashPassword("demo-password-123"),
      emailVerifiedAt: new Date()
    }
  });

  const currentPeriodEnd = new Date();
  currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 14);

  await prisma.billingSubscription.upsert({
    where: { businessId: business.id },
    update: {},
    create: {
      businessId: business.id,
      plan: "STARTER",
      status: "TRIALING",
      seats: 1,
      monthlyPriceCents: 4900,
      currency: "USD",
      currentPeriodEnd,
      trialEndsAt
    }
  });

  const product =
    (await prisma.product.findFirst({
      where: {
        businessId: business.id,
        name: "Wireless Headphones"
      }
    })) ??
    (await prisma.product.create({
      data: {
        businessId: business.id,
        name: "Wireless Headphones",
        brand: "Sony",
        category: "Electronics",
        tags: ["audio", "headphones", "wireless"],
        searchKeywords: ["black headphones", "noise cancelling"]
      }
    }));

  const variant = await prisma.productVariant.upsert({
    where: {
      businessId_sku: {
        businessId: business.id,
        sku: "WH-1000XM5-BLK"
      }
    },
    update: {
      title: "Black",
      color: "Black",
      unitPriceCents: 34900,
      currency: "USD",
      isActive: true
    },
    create: {
      businessId: business.id,
      productId: product.id,
      sku: "WH-1000XM5-BLK",
      title: "Black",
      color: "Black",
      unitPriceCents: 34900,
      currency: "USD"
    }
  });

  await prisma.inventoryItem.upsert({
    where: { variantId: variant.id },
    update: {
      stockOnHand: 12,
      reorderPoint: 3
    },
    create: {
      businessId: business.id,
      variantId: variant.id,
      stockOnHand: 12,
      reorderPoint: 3
    }
  });

  console.log(`Seeded ${business.name} with product ${product.name}`);
  console.log(`Demo businessId: ${business.id}`);
  console.log("Demo admin login: owner@demo-shop.local / demo-password-123");
  console.log(`Product API: http://localhost:4000/v1/admin/products?businessId=${business.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const hash = pbkdf2Sync(password, salt, 120_000, 32, "sha256").toString("base64url");
  return `pbkdf2:120000:${salt}:${hash}`;
}
