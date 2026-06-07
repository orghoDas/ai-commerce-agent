import type { ProductSearchMatch, ToolResult } from "@ai-commerce-agent/shared";
import { catalogService } from "./catalog.service.js";

type ImageSearchInput = {
  businessId: string;
  imageUrl: string;
  customerHint?: string;
  limit?: number;
};

export const imageSearchService = {
  async searchByImage(input: ImageSearchInput): Promise<ToolResult<ProductSearchMatch[]>> {
    // MVP path:
    // 1. Use a vision model to extract OCR text, brand, category, color, and model number.
    // 2. Search catalog with the extracted text and customer hint.
    // Advanced path:
    // 3. Store embeddings for product images and run visual nearest-neighbor search.
    const extractedSearchText = input.customerHint?.trim() || "product image";

    const result = await catalogService.searchProducts({
      businessId: input.businessId,
      query: extractedSearchText,
      limit: input.limit ?? 3
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: result.data.map((match) => ({
        ...match,
        confidence: Math.min(match.confidence, 0.75),
        reason: `Possible image match from ${input.imageUrl}. Ask customer to confirm exact item.`
      }))
    };
  }
};

