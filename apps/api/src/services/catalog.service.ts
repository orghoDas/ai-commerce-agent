import type { ProductSearchMatch, ToolResult } from "@ai-commerce-agent/shared";
import { prisma } from "../db/prisma.js";

type SearchProductsInput = {
  businessId: string;
  query: string;
  limit?: number;
};

type RecordUnavailableInput = {
  businessId: string;
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

  async searchProducts(input: SearchProductsInput): Promise<ToolResult<ProductSearchMatch[]>> {
    const query = input.query.trim();
    if (!query) {
      return { ok: false, errorCode: "EMPTY_QUERY", message: "Search query is required." };
    }

    const products = await prisma.product.findMany({
      where: {
        businessId: input.businessId,
        status: "ACTIVE",
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
          { brand: { contains: query, mode: "insensitive" } },
          { category: { contains: query, mode: "insensitive" } },
          { tags: { has: query } },
          { searchKeywords: { has: query } }
        ]
      },
      include: {
        variants: {
          where: { isActive: true },
          include: { inventory: true },
          take: 5
        }
      },
      take: input.limit ?? 3
    });

    const matches: ProductSearchMatch[] = products.flatMap((product) => {
      const variants = product.variants.length > 0 ? product.variants : [];
      return variants.map((variant) => ({
        productId: product.id,
        variantId: variant.id,
        name: product.name,
        variantTitle: variant.title,
        sku: variant.sku,
        brand: product.brand ?? undefined,
        category: product.category ?? undefined,
        unitPriceCents: variant.unitPriceCents,
        currency: variant.currency,
        confidence: product.name.toLowerCase().includes(query.toLowerCase()) ? 0.9 : 0.65,
        reason: "Matched catalog text fields."
      }));
    });

    return { ok: true, data: matches.slice(0, input.limit ?? 3) };
  },

  async recordUnavailableRequest(input: RecordUnavailableInput) {
    const request = await prisma.unavailableProductRequest.create({
      data: {
        businessId: input.businessId,
        rawQuery: input.rawQuery,
        normalizedName: input.normalizedName,
        requestedQty: input.requestedQty ?? 1,
        imageUrl: input.imageUrl
      }
    });

    return { ok: true, data: request };
  }
};

