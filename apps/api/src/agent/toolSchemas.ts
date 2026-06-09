import type { Tool } from "openai/resources/responses/responses";

export const customerAgentTools: Tool[] = [
  {
    type: "function",
    name: "search_product",
    description: "Search the business product catalog by customer text query.",
    strict: true,
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
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        imageUrl: { type: "string" },
        customerHint: { type: ["string", "null"] },
        limit: { type: "number", minimum: 1, maximum: 5 }
      },
      required: ["imageUrl", "customerHint", "limit"]
    }
  },
  {
    type: "function",
    name: "check_inventory",
    description: "Check current available quantity and price for a variant.",
    strict: true,
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
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        conversationId: { type: ["string", "null"] },
        customerId: { type: ["string", "null"] },
        customerExternalId: { type: ["string", "null"] },
        customerName: { type: ["string", "null"] },
        customerPhone: { type: ["string", "null"] },
        customerEmail: { type: ["string", "null"] },
        deliveryAddress: { type: ["string", "null"] },
        notes: { type: ["string", "null"] },
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
      required: [
        "conversationId",
        "customerId",
        "customerExternalId",
        "customerName",
        "customerPhone",
        "customerEmail",
        "deliveryAddress",
        "notes",
        "items"
      ]
    }
  },
  {
    type: "function",
    name: "record_unavailable_request",
    description: "Record demand for a product that is unavailable or not found.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        rawQuery: { type: "string" },
        normalizedName: { type: ["string", "null"] },
        requestedQty: { type: "number", minimum: 1 },
        imageUrl: { type: ["string", "null"] }
      },
      required: ["rawQuery", "normalizedName", "requestedQty", "imageUrl"]
    }
  },
  {
    type: "function",
    name: "handoff_to_human",
    description: "Mark a conversation for human takeover.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        reason: { type: "string" }
      },
      required: ["reason"]
    }
  }
];
