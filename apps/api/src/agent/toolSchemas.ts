export const customerAgentTools = [
  {
    type: "function",
    name: "search_product",
    description: "Search the business product catalog by customer text query.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string" },
        limit: { type: "number", minimum: 1, maximum: 5 }
      },
      required: ["query", "limit"]
    }
  },
  {
    type: "function",
    name: "search_product_by_image",
    description: "Analyze a customer product image and return likely product matches.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        imageUrl: { type: "string" },
        customerHint: { type: "string" },
        limit: { type: "number", minimum: 1, maximum: 5 }
      },
      required: ["imageUrl", "limit"]
    }
  },
  {
    type: "function",
    name: "check_inventory",
    description: "Check current available quantity and price for a variant.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        variantId: { type: "string" },
        quantity: { type: "number", minimum: 1 }
      },
      required: ["variantId", "quantity"]
    }
  },
  {
    type: "function",
    name: "create_order",
    description: "Reserve inventory and create a pending order.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        conversationId: { type: "string" },
        customerId: { type: "string" },
        customerName: { type: "string" },
        customerPhone: { type: "string" },
        deliveryAddress: { type: "string" },
        notes: { type: "string" },
        items: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              variantId: { type: "string" },
              quantity: { type: "number", minimum: 1 }
            },
            required: ["variantId", "quantity"]
          }
        }
      },
      required: ["items"]
    }
  },
  {
    type: "function",
    name: "record_unavailable_request",
    description: "Record demand for a product that is unavailable or not found.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        rawQuery: { type: "string" },
        normalizedName: { type: "string" },
        requestedQty: { type: "number", minimum: 1 },
        imageUrl: { type: "string" }
      },
      required: ["rawQuery", "requestedQty"]
    }
  },
  {
    type: "function",
    name: "handoff_to_human",
    description: "Mark a conversation for human takeover.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        reason: { type: "string" }
      },
      required: ["reason"]
    }
  }
] as const;

