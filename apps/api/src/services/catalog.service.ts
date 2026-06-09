import type { Prisma } from "@prisma/client";
import type { ProductSearchMatch, ToolResult } from "@ai-commerce-agent/shared";
import { prisma } from "../db/prisma.js";

type SearchProductsInput = {
  businessId: string;
  query: string;
  limit?: number;
};

type CreateProductInput = {
  businessId: string;
  name: string;
  description?: string;
  brand?: string;
  category?: string;
  tags?: string[];
  searchKeywords?: string[];
  variant: {
    sku: string;
    title: string;
    color?: string;
    size?: string;
    unitPriceCents: number;
    currency?: string;
    stockOnHand: number;
    reorderPoint?: number;
  };
};

type UpdateProductInput = {
  businessId: string;
  productId: string;
  name?: string;
  description?: string | null;
  brand?: string | null;
  category?: string | null;
  status?: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  tags?: string[];
  searchKeywords?: string[];
};

type CreateVariantInput = {
  businessId: string;
  productId: string;
  sku: string;
  title: string;
  color?: string;
  size?: string;
  unitPriceCents: number;
  currency?: string;
  stockOnHand: number;
  reorderPoint?: number;
};

type UpdateVariantInput = {
  businessId: string;
  productId: string;
  variantId: string;
  sku?: string;
  title?: string;
  color?: string | null;
  size?: string | null;
  unitPriceCents?: number;
  currency?: string;
  isActive?: boolean;
  stockOnHand?: number;
  reorderPoint?: number;
};

type ImportProductsCsvInput = {
  businessId: string;
  csvText: string;
};

type CsvImportRow = {
  productName: string;
  description?: string;
  brand?: string;
  category?: string;
  status?: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  tags: string[];
  searchKeywords: string[];
  sku: string;
  variantTitle: string;
  color?: string;
  size?: string;
  unitPriceCents: number;
  currency: string;
  stockOnHand: number;
  reorderPoint: number;
  isActive: boolean;
};

type RecordUnavailableInput = {
  businessId: string;
  productId?: string;
  customerId?: string;
  rawQuery: string;
  normalizedName?: string;
  requestedQty?: number;
  imageUrl?: string;
};

export const catalogService = {
  async listProducts(businessId: string) {
    return prisma.product.findMany({
      where: { businessId },
      include: {
        variants: {
          include: { inventory: true }
        },
        images: true
      },
      orderBy: { updatedAt: "desc" },
      take: 100
    });
  },

  async createProduct(input: CreateProductInput) {
    return prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          businessId: input.businessId,
          name: input.name,
          description: emptyToNull(input.description),
          brand: emptyToNull(input.brand),
          category: emptyToNull(input.category),
          tags: input.tags ?? [],
          searchKeywords: input.searchKeywords ?? [],
          variants: {
            create: {
              businessId: input.businessId,
              sku: input.variant.sku,
              title: input.variant.title,
              color: emptyToNull(input.variant.color),
              size: emptyToNull(input.variant.size),
              unitPriceCents: input.variant.unitPriceCents,
              currency: input.variant.currency ?? "USD",
              inventory: {
                create: {
                  businessId: input.businessId,
                  stockOnHand: input.variant.stockOnHand,
                  reorderPoint: input.variant.reorderPoint ?? 3
                }
              }
            }
          }
        },
        include: {
          variants: {
            include: { inventory: true }
          },
          images: true
        }
      });

      await tx.auditLog.create({
        data: {
          businessId: input.businessId,
          actorType: "ADMIN",
          action: "PRODUCT_CREATED",
          entityType: "Product",
          entityId: product.id,
          metadata: { name: product.name }
        }
      });

      return product;
    });
  },

  async updateProduct(input: UpdateProductInput) {
    const product = await prisma.product.update({
      where: {
        id: input.productId,
        businessId: input.businessId
      },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: emptyToNull(input.description) } : {}),
        ...(input.brand !== undefined ? { brand: emptyToNull(input.brand) } : {}),
        ...(input.category !== undefined ? { category: emptyToNull(input.category) } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.searchKeywords !== undefined ? { searchKeywords: input.searchKeywords } : {})
      },
      include: {
        variants: {
          include: { inventory: true }
        },
        images: true
      }
    });

    await prisma.auditLog.create({
      data: {
        businessId: input.businessId,
        actorType: "ADMIN",
        action: "PRODUCT_UPDATED",
        entityType: "Product",
        entityId: product.id,
        metadata: { status: product.status }
      }
    });

    return product;
  },

  async createVariant(input: CreateVariantInput) {
    return prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: {
          id: input.productId,
          businessId: input.businessId
        }
      });

      if (!product) {
        throw new Error("PRODUCT_NOT_FOUND");
      }

      const variant = await tx.productVariant.create({
        data: {
          businessId: input.businessId,
          productId: input.productId,
          sku: input.sku,
          title: input.title,
          color: emptyToNull(input.color),
          size: emptyToNull(input.size),
          unitPriceCents: input.unitPriceCents,
          currency: input.currency ?? "USD",
          inventory: {
            create: {
              businessId: input.businessId,
              stockOnHand: input.stockOnHand,
              reorderPoint: input.reorderPoint ?? 3
            }
          }
        },
        include: { inventory: true }
      });

      await tx.auditLog.create({
        data: {
          businessId: input.businessId,
          actorType: "ADMIN",
          action: "PRODUCT_UPDATED",
          entityType: "ProductVariant",
          entityId: variant.id,
          metadata: { productId: input.productId, sku: variant.sku }
        }
      });

      return variant;
    });
  },

  async updateVariant(input: UpdateVariantInput) {
    return prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.findFirst({
        where: {
          id: input.variantId,
          productId: input.productId,
          businessId: input.businessId
        },
        include: { inventory: true }
      });

      if (!variant) {
        throw new Error("VARIANT_NOT_FOUND");
      }

      const updatedVariant = await tx.productVariant.update({
        where: { id: input.variantId },
        data: {
          ...(input.sku !== undefined ? { sku: input.sku } : {}),
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.color !== undefined ? { color: emptyToNull(input.color) } : {}),
          ...(input.size !== undefined ? { size: emptyToNull(input.size) } : {}),
          ...(input.unitPriceCents !== undefined ? { unitPriceCents: input.unitPriceCents } : {}),
          ...(input.currency !== undefined ? { currency: input.currency } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {})
        },
        include: { inventory: true }
      });

      if (input.stockOnHand !== undefined || input.reorderPoint !== undefined) {
        await tx.inventoryItem.upsert({
          where: { variantId: input.variantId },
          create: {
            businessId: input.businessId,
            variantId: input.variantId,
            stockOnHand: input.stockOnHand ?? 0,
            reorderPoint: input.reorderPoint ?? 3
          },
          update: {
            ...(input.stockOnHand !== undefined ? { stockOnHand: input.stockOnHand } : {}),
            ...(input.reorderPoint !== undefined ? { reorderPoint: input.reorderPoint } : {})
          }
        });
      }

      await tx.auditLog.create({
        data: {
          businessId: input.businessId,
          actorType: "ADMIN",
          action: "STOCK_ADJUSTED",
          entityType: "ProductVariant",
          entityId: input.variantId,
          metadata: {
            sku: updatedVariant.sku,
            stockOnHand: input.stockOnHand,
            reorderPoint: input.reorderPoint,
            unitPriceCents: input.unitPriceCents
          }
        }
      });

      return tx.productVariant.findUnique({
        where: { id: input.variantId },
        include: { inventory: true }
      });
    });
  },

  async importProductsCsv(input: ImportProductsCsvInput) {
    const parsedRows = parseProductCsv(input.csvText);
    const result = {
      totalRows: parsedRows.length,
      processedRows: 0,
      productsCreated: 0,
      productsUpdated: 0,
      variantsCreated: 0,
      variantsUpdated: 0,
      inventoryUpdated: 0,
      skippedRows: 0,
      errors: [] as Array<{ row: number; sku?: string; message: string }>
    };

    if (parsedRows.length > 500) {
      throw new Error("CSV import is limited to 500 rows at a time.");
    }

    for (const parsedRow of parsedRows) {
      if (!parsedRow.ok) {
        result.skippedRows += 1;
        result.errors.push({
          row: parsedRow.rowNumber,
          message: parsedRow.message
        });
        continue;
      }

      try {
        const outcome = await upsertImportedProductRow(input.businessId, parsedRow.data);
        result.processedRows += 1;
        result.productsCreated += outcome.productCreated ? 1 : 0;
        result.productsUpdated += outcome.productUpdated ? 1 : 0;
        result.variantsCreated += outcome.variantCreated ? 1 : 0;
        result.variantsUpdated += outcome.variantUpdated ? 1 : 0;
        result.inventoryUpdated += 1;
      } catch (error) {
        result.skippedRows += 1;
        result.errors.push({
          row: parsedRow.rowNumber,
          sku: parsedRow.data.sku,
          message: error instanceof Error ? error.message : "Could not import row."
        });
      }
    }

    await prisma.auditLog.create({
      data: {
        businessId: input.businessId,
        actorType: "ADMIN",
        action: "PRODUCT_UPDATED",
        entityType: "ProductImport",
        metadata: {
          totalRows: result.totalRows,
          processedRows: result.processedRows,
          skippedRows: result.skippedRows,
          productsCreated: result.productsCreated,
          variantsCreated: result.variantsCreated,
          variantsUpdated: result.variantsUpdated
        }
      }
    });

    return result;
  },

  async searchProducts(input: SearchProductsInput): Promise<ToolResult<ProductSearchMatch[]>> {
    const query = input.query.trim();
    if (!query) {
      return { ok: false, errorCode: "EMPTY_QUERY", message: "Search query is required." };
    }

    const products = await prisma.product.findMany({
      where: {
        businessId: input.businessId,
        status: "ACTIVE"
      },
      include: {
        variants: {
          where: { isActive: true },
          include: { inventory: true },
          take: 5
        }
      },
      take: 100
    });

    const queryTokens = tokenize(query);
    const matches: ProductSearchMatch[] = products
      .flatMap((product) => {
        const variants = product.variants.length > 0 ? product.variants : [];
        return variants.map((variant) => {
          const searchable = [
            product.name,
            product.description,
            product.brand,
            product.category,
            variant.title,
            variant.sku,
            variant.color,
            variant.size,
            ...product.tags,
            ...product.searchKeywords
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          const score = scoreSearchableText(searchable, queryTokens);
          return {
            match: {
              productId: product.id,
              variantId: variant.id,
              name: product.name,
              variantTitle: variant.title,
              sku: variant.sku,
              brand: product.brand ?? undefined,
              category: product.category ?? undefined,
              unitPriceCents: variant.unitPriceCents,
              currency: variant.currency,
              confidence: Math.min(score / Math.max(queryTokens.length, 1), 1),
              reason: "Matched catalog tokens."
            },
            score
          };
        });
      })
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((candidate) => candidate.match);

    return { ok: true, data: matches.slice(0, input.limit ?? 3) };
  },

  async recordUnavailableRequest(input: RecordUnavailableInput) {
    const request = await prisma.unavailableProductRequest.create({
      data: {
        businessId: input.businessId,
        productId: input.productId,
        customerId: input.customerId,
        rawQuery: input.rawQuery,
        normalizedName: input.normalizedName,
        requestedQty: input.requestedQty ?? 1,
        imageUrl: input.imageUrl
      }
    });

    return { ok: true, data: request };
  }
};

function tokenize(value: string) {
  const stopWords = new Set([
    "a",
    "an",
    "and",
    "any",
    "are",
    "available",
    "buy",
    "can",
    "do",
    "for",
    "have",
    "i",
    "in",
    "is",
    "it",
    "me",
    "of",
    "please",
    "price",
    "the",
    "there",
    "to",
    "want",
    "with",
    "you"
  ]);

  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !stopWords.has(token));
}

function scoreSearchableText(searchable: string, tokens: string[]) {
  let score = 0;
  for (const token of tokens) {
    if (searchable.includes(token)) {
      score += 1;
    }
  }
  return score;
}

function emptyToNull(value: string | null | undefined) {
  if (value === null || value === undefined) {
    return value ?? null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

type ParsedCsvRow =
  | {
      ok: true;
      rowNumber: number;
      data: CsvImportRow;
    }
  | {
      ok: false;
      rowNumber: number;
      message: string;
    };

async function upsertImportedProductRow(businessId: string, row: CsvImportRow) {
  return prisma.$transaction(async (tx) => {
    const existingVariant = await tx.productVariant.findFirst({
      where: {
        businessId,
        sku: row.sku
      },
      include: {
        product: true,
        inventory: true
      }
    });

    if (existingVariant) {
      await tx.product.update({
        where: { id: existingVariant.productId },
        data: {
          name: row.productName,
          description: emptyToNull(row.description),
          brand: emptyToNull(row.brand),
          category: emptyToNull(row.category),
          ...(row.status ? { status: row.status } : {}),
          tags: row.tags,
          searchKeywords: row.searchKeywords
        }
      });

      await tx.productVariant.update({
        where: { id: existingVariant.id },
        data: {
          title: row.variantTitle,
          color: emptyToNull(row.color),
          size: emptyToNull(row.size),
          unitPriceCents: row.unitPriceCents,
          currency: row.currency,
          isActive: row.isActive
        }
      });

      await tx.inventoryItem.upsert({
        where: { variantId: existingVariant.id },
        create: {
          businessId,
          variantId: existingVariant.id,
          stockOnHand: row.stockOnHand,
          reorderPoint: row.reorderPoint
        },
        update: {
          stockOnHand: row.stockOnHand,
          reorderPoint: row.reorderPoint
        }
      });

      return {
        productCreated: false,
        productUpdated: true,
        variantCreated: false,
        variantUpdated: true
      };
    }

    const product = await findOrCreateImportedProduct(tx, businessId, row);

    const variant = await tx.productVariant.create({
      data: {
        businessId,
        productId: product.id,
        sku: row.sku,
        title: row.variantTitle,
        color: emptyToNull(row.color),
        size: emptyToNull(row.size),
        unitPriceCents: row.unitPriceCents,
        currency: row.currency,
        isActive: row.isActive,
        inventory: {
          create: {
            businessId,
            stockOnHand: row.stockOnHand,
            reorderPoint: row.reorderPoint
          }
        }
      }
    });

    return {
      productCreated: product.created,
      productUpdated: !product.created,
      variantCreated: Boolean(variant),
      variantUpdated: false
    };
  });
}

async function findOrCreateImportedProduct(tx: Prisma.TransactionClient, businessId: string, row: CsvImportRow) {
  const existingProduct = await tx.product.findFirst({
    where: {
      businessId,
      name: row.productName,
      ...(row.brand ? { brand: row.brand } : {}),
      ...(row.category ? { category: row.category } : {})
    }
  });

  if (existingProduct) {
    const product = await tx.product.update({
      where: { id: existingProduct.id },
      data: {
        description: emptyToNull(row.description),
        brand: emptyToNull(row.brand),
        category: emptyToNull(row.category),
        ...(row.status ? { status: row.status } : {}),
        tags: row.tags,
        searchKeywords: row.searchKeywords
      }
    });
    return { ...product, created: false };
  }

  const product = await tx.product.create({
    data: {
      businessId,
      name: row.productName,
      description: emptyToNull(row.description),
      brand: emptyToNull(row.brand),
      category: emptyToNull(row.category),
      status: row.status ?? "ACTIVE",
      tags: row.tags,
      searchKeywords: row.searchKeywords
    }
  });

  return { ...product, created: true };
}

function parseProductCsv(csvText: string): ParsedCsvRow[] {
  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    throw new Error("CSV file is empty.");
  }

  const headers = rows[0]?.map(normalizeHeader) ?? [];
  if (headers.length === 0) {
    throw new Error("CSV header row is required.");
  }

  const parsedRows: ParsedCsvRow[] = [];

  rows.slice(1).forEach((values, index) => {
    const rowNumber = index + 2;
    if (values.every((value) => value.trim().length === 0)) {
      return;
    }

    const row = Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex]?.trim() ?? ""]));
    const parsed = normalizeCsvProductRow(row);

    if (!parsed.ok) {
      parsedRows.push({ ok: false, rowNumber, message: parsed.message });
      return;
    }

    parsedRows.push({ ok: true, rowNumber, data: parsed.data });
  });

  return parsedRows;
}

function normalizeCsvProductRow(row: Record<string, string>) {
  const productName = firstValue(row, ["name", "productname", "product"]);
  const sku = firstValue(row, ["sku", "variant sku", "variantsku"]);
  const variantTitle = firstValue(row, ["varianttitle", "title", "variant"]) || "Default";
  const price = parsePriceCents(row);
  const stockOnHand = parseNonNegativeInteger(firstValue(row, ["stockonhand", "stock", "quantity", "qty"]), "stockOnHand");
  const reorderPoint = parseNonNegativeInteger(firstValue(row, ["reorderpoint", "reorder"]), "reorderPoint", 3);
  const productStatus = parseProductStatus(firstValue(row, ["productstatus", "status"]));
  const variantActive = parseBoolean(firstValue(row, ["variantactive", "isactive", "active"]), true);
  const currency = (firstValue(row, ["currency"]) || "USD").toUpperCase();

  if (!productName) {
    return { ok: false as const, message: "Product name is required." };
  }

  if (!sku) {
    return { ok: false as const, message: "SKU is required." };
  }

  if (!price.ok) {
    return { ok: false as const, message: price.message };
  }

  if (!stockOnHand.ok) {
    return { ok: false as const, message: stockOnHand.message };
  }

  if (!reorderPoint.ok) {
    return { ok: false as const, message: reorderPoint.message };
  }

  if (currency.length !== 3) {
    return { ok: false as const, message: "Currency must be a 3-letter code." };
  }

  if (!productStatus.ok) {
    return { ok: false as const, message: productStatus.message };
  }

  if (!variantActive.ok) {
    return { ok: false as const, message: variantActive.message };
  }

  return {
    ok: true as const,
    data: {
      productName,
      description: firstValue(row, ["description"]),
      brand: firstValue(row, ["brand"]),
      category: firstValue(row, ["category"]),
      status: productStatus.value,
      tags: splitList(firstValue(row, ["tags"])),
      searchKeywords: splitList(firstValue(row, ["searchkeywords", "keywords"])),
      sku,
      variantTitle,
      color: firstValue(row, ["color"]),
      size: firstValue(row, ["size"]),
      unitPriceCents: price.value,
      currency,
      stockOnHand: stockOnHand.value,
      reorderPoint: reorderPoint.value,
      isActive: variantActive.value
    }
  };
}

function parseCsv(csvText: string) {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = "";
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index];
    const nextCharacter = csvText[index + 1];

    if (character === '"' && inQuotes && nextCharacter === '"') {
      currentValue += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }
      currentRow.push(currentValue);
      rows.push(currentRow);
      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += character;
  }

  if (inQuotes) {
    throw new Error("CSV contains an unclosed quoted value.");
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue);
    rows.push(currentRow);
  }

  return rows.filter((row) => row.some((value) => value.trim().length > 0));
}

function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/[\s_-]/g, "");
}

function firstValue(row: Record<string, string>, keys: string[]) {
  for (const key of keys.map(normalizeHeader)) {
    const value = row[key]?.trim();
    if (value) {
      return value;
    }
  }
  return "";
}

function parsePriceCents(row: Record<string, string>) {
  const cents = firstValue(row, ["unitpricecents", "pricecents"]);
  if (cents) {
    return parseNonNegativeInteger(cents, "priceCents");
  }

  const price = firstValue(row, ["price", "unitprice"]);
  if (!price) {
    return { ok: false as const, message: "Price is required." };
  }

  const numericPrice = Number(price.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(numericPrice) || numericPrice < 0) {
    return { ok: false as const, message: "Price must be a non-negative number." };
  }

  return { ok: true as const, value: Math.round(numericPrice * 100) };
}

function parseNonNegativeInteger(value: string, label: string, defaultValue?: number) {
  if (!value && defaultValue !== undefined) {
    return { ok: true as const, value: defaultValue };
  }

  if (!value) {
    return { ok: false as const, message: `${label} is required.` };
  }

  const parsed = Number(value.replace(/,/g, ""));
  if (!Number.isInteger(parsed) || parsed < 0) {
    return { ok: false as const, message: `${label} must be a non-negative whole number.` };
  }

  return { ok: true as const, value: parsed };
}

function parseProductStatus(value: string) {
  if (!value) {
    return { ok: true as const, value: undefined };
  }

  const normalized = value.toUpperCase().replace(/[\s-]/g, "_");
  if (["ACTIVE", "INACTIVE", "ARCHIVED"].includes(normalized)) {
    return { ok: true as const, value: normalized as "ACTIVE" | "INACTIVE" | "ARCHIVED" };
  }

  return { ok: false as const, message: "productStatus must be ACTIVE, INACTIVE, or ARCHIVED." };
}

function parseBoolean(value: string, defaultValue: boolean) {
  if (!value) {
    return { ok: true as const, value: defaultValue };
  }

  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "1", "active"].includes(normalized)) {
    return { ok: true as const, value: true };
  }

  if (["false", "no", "0", "inactive"].includes(normalized)) {
    return { ok: true as const, value: false };
  }

  return { ok: false as const, message: "variantActive must be true or false." };
}

function splitList(value: string) {
  if (!value) {
    return [];
  }

  return value
    .split(/[|;,]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}
