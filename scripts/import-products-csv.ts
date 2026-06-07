import fs from "node:fs/promises";

type CsvProductRow = {
  name: string;
  sku: string;
  priceCents: number;
  stockOnHand: number;
};

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error("Usage: tsx scripts/import-products-csv.ts ./products.csv");
  }

  const csv = await fs.readFile(filePath, "utf8");
  const rows = parseSimpleCsv(csv);

  console.log(`Parsed ${rows.length} product rows.`);
  console.log("Wire this script to Prisma once your CSV format is finalized.");
}

function parseSimpleCsv(csv: string): CsvProductRow[] {
  const [headerLine, ...lines] = csv.trim().split("\n");
  const headers = headerLine.split(",").map((header) => header.trim());

  return lines.map((line) => {
    const values = line.split(",").map((value) => value.trim());
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    return {
      name: row.name,
      sku: row.sku,
      priceCents: Number(row.priceCents),
      stockOnHand: Number(row.stockOnHand)
    };
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

