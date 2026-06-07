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

  const product = await prisma.product.create({
    data: {
      businessId: business.id,
      name: "Wireless Headphones",
      brand: "Sony",
      category: "Electronics",
      tags: ["audio", "headphones", "wireless"],
      searchKeywords: ["black headphones", "noise cancelling"],
      variants: {
        create: {
          businessId: business.id,
          sku: "WH-1000XM5-BLK",
          title: "Black",
          color: "Black",
          unitPriceCents: 34900,
          currency: "USD",
          inventory: {
            create: {
              businessId: business.id,
              stockOnHand: 12,
              reorderPoint: 3
            }
          }
        }
      }
    }
  });

  console.log(`Seeded ${business.name} with product ${product.name}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

