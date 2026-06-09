export type CustomerIntent =
  | "product_search"
  | "availability_check"
  | "price_quote"
  | "order_request"
  | "order_status"
  | "human_support"
  | "unknown";

export type ToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; errorCode: string; message: string; retryable?: boolean };

export type ProductSearchMatch = {
  productId: string;
  variantId?: string;
  name: string;
  variantTitle?: string;
  sku?: string;
  brand?: string;
  category?: string;
  unitPriceCents?: number;
  currency?: string;
  confidence: number;
  reason: string;
};

export type AvailabilityResult = {
  variantId: string;
  sku: string;
  productName: string;
  variantTitle: string;
  requestedQuantity: number;
  availableQuantity: number;
  isAvailable: boolean;
  unitPriceCents: number;
  currency: string;
};

export type OrderDraftItem = {
  variantId: string;
  quantity: number;
};

export type CreatedOrder = {
  orderId: string;
  orderNumber: string;
  status: "PENDING" | "CONFIRMED" | "NEEDS_HUMAN_REVIEW";
  subtotalCents: number;
  currency: string;
};

export type DailyReportSummary = {
  reportDate: string;
  inventory: {
    activeProducts: number;
    activeVariants: number;
    inStockVariants: number;
    lowStockVariants: number;
    outOfStockVariants: number;
    stockOnHandUnits?: number;
    reservedUnits?: number;
    availableUnits?: number;
  };
  orders: {
    total?: number;
    pending: number;
    confirmed: number;
    fulfilled: number;
    cancelled: number;
    needsHumanReview?: number;
    grossOrderValueCents: number;
    averageOrderValueCents?: number;
  };
  demand: {
    unavailableRequests: number;
    noMatchSearches: number;
  };
  conversations?: {
    opened: number;
    needsHuman: number;
  };
};

export type ReportPeriod = "daily" | "weekly" | "monthly";
