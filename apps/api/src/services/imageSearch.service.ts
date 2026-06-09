import type { ProductSearchMatch, ToolResult } from "@ai-commerce-agent/shared";
import { prisma } from "../db/prisma.js";
import { catalogService } from "./catalog.service.js";
import { imageAnalysisService, type ImageSignature } from "./imageAnalysis.service.js";
import { uploadStorageService } from "./uploadStorage.service.js";

type ImageSearchInput = {
  businessId: string;
  imageUrl: string;
  customerHint?: string;
  limit?: number;
};

type ImageSearchCandidate = {
  match: ProductSearchMatch;
  score: number;
};

export const imageSearchService = {
  async searchByImage(input: ImageSearchInput): Promise<ToolResult<ProductSearchMatch[]>> {
    if (!input.imageUrl.trim()) {
      return { ok: false, errorCode: "IMAGE_REQUIRED", message: "Image URL is required." };
    }

    let signature: ImageSignature;
    try {
      const imageBuffer = await uploadStorageService.loadImageBufferFromUrl(input.imageUrl);
      signature = await imageAnalysisService.signature(imageBuffer);
    } catch (error) {
      return {
        ok: false,
        errorCode: error instanceof Error ? error.message : "IMAGE_SEARCH_FAILED",
        message: "Could not read that image for product search."
      };
    }

    const productImages = await prisma.productImage.findMany({
      where: {
        businessId: input.businessId,
        perceptualHash: { not: null },
        product: {
          status: "ACTIVE"
        }
      },
      include: {
        product: {
          include: {
            variants: {
              where: { isActive: true },
              include: { inventory: true },
              take: 4
            }
          }
        }
      },
      take: 500
    });

    const candidates = productImages
      .flatMap((image) => {
        const imageSignature = signatureFromProductImage(image);
        if (!imageSignature) {
          return [];
        }

        const variant = chooseVariant(image.product.variants, input.customerHint);
        if (!variant) {
          return [];
        }

        const visualScore = imageAnalysisService.similarity(signature, imageSignature);
        const hintScore = input.customerHint ? scoreHint(image.product, variant, image, input.customerHint) : 0;
        const score = visualScore * 0.88 + hintScore * 0.12;

        return [
          {
            score,
            match: {
              productId: image.product.id,
              variantId: variant.id,
              name: image.product.name,
              variantTitle: variant.title,
              sku: variant.sku,
              brand: image.product.brand ?? undefined,
              category: image.product.category ?? undefined,
              unitPriceCents: variant.unitPriceCents,
              currency: variant.currency,
              confidence: Math.min(score, 0.98),
              reason: `Matched product image ${image.id} by visual fingerprint.`
            }
          }
        ];
      })
      .filter((candidate) => candidate.score >= 0.56);

    const deduped = dedupeByVariant(candidates)
      .sort((a, b) => b.score - a.score)
      .slice(0, input.limit ?? 3)
      .map((candidate) => candidate.match);

    if (deduped.length > 0) {
      return { ok: true, data: deduped };
    }

    if (input.customerHint?.trim()) {
      return catalogService.searchProducts({
        businessId: input.businessId,
        query: input.customerHint,
        limit: input.limit ?? 3
      });
    }

    return { ok: true, data: [] };
  }
};

function signatureFromProductImage(image: {
  perceptualHash: string | null;
  averageColor: string | null;
  colorSignature: unknown;
}): ImageSignature | null {
  const colorSignature = Array.isArray(image.colorSignature)
    ? image.colorSignature.filter((value): value is number => typeof value === "number")
    : [];

  if (!image.perceptualHash || colorSignature.length === 0) {
    return null;
  }

  return {
    perceptualHash: image.perceptualHash,
    averageColor: image.averageColor ?? "#000000",
    colorSignature
  };
}

function chooseVariant<T extends { title: string; sku: string }>(variants: T[], hint?: string) {
  if (variants.length <= 1 || !hint) {
    return variants[0] ?? null;
  }

  const normalizedHint = hint.toLowerCase();
  return (
    variants.find((variant) => normalizedHint.includes(variant.title.toLowerCase()) || normalizedHint.includes(variant.sku.toLowerCase())) ??
    variants[0] ??
    null
  );
}

function scoreHint(
  product: {
    name: string;
    description: string | null;
    brand: string | null;
    category: string | null;
    tags: string[];
    searchKeywords: string[];
  },
  variant: { title: string; sku: string; color: string | null; size: string | null },
  image: { altText: string | null; visibleText: string | null },
  hint: string
) {
  const tokens = hint
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2);

  if (tokens.length === 0) {
    return 0;
  }

  const searchable = [
    product.name,
    product.description,
    product.brand,
    product.category,
    variant.title,
    variant.sku,
    variant.color,
    variant.size,
    image.altText,
    image.visibleText,
    ...product.tags,
    ...product.searchKeywords
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const hits = tokens.filter((token) => searchable.includes(token)).length;
  return hits / tokens.length;
}

function dedupeByVariant(candidates: ImageSearchCandidate[]) {
  const byVariant = new Map<string, ImageSearchCandidate>();
  for (const candidate of candidates) {
    const key = candidate.match.variantId ?? candidate.match.productId;
    const previous = byVariant.get(key);
    if (!previous || candidate.score > previous.score) {
      byVariant.set(key, candidate);
    }
  }
  return [...byVariant.values()];
}
