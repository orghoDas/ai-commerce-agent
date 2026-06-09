import "dotenv/config";
import fs from "node:fs/promises";
import { catalogService } from "../apps/api/src/services/catalog.service.js";
import { prisma } from "../apps/api/src/db/prisma.js";

async function main() {
  const [filePath, businessId] = process.argv.slice(2);
  if (!filePath || !businessId) {
    throw new Error("Usage: tsx scripts/import-products-csv.ts ./products.csv <businessId>");
  }

  const csvText = await fs.readFile(filePath, "utf8");
  const result = await catalogService.importProductsCsv({
    businessId,
    csvText
  });

  console.log(JSON.stringify(result, null, 2));

  if (result.errors.length > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
