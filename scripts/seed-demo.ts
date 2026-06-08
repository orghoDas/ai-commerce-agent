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
