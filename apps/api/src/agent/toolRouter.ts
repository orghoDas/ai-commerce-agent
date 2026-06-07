import { catalogService } from "../services/catalog.service.js";
import { conversationService } from "../services/conversation.service.js";
import { imageSearchService } from "../services/imageSearch.service.js";
import { inventoryService } from "../services/inventory.service.js";
import { orderService } from "../services/order.service.js";

type ToolContext = {
  businessId: string;
  conversationId?: string;
};

type ToolCall = {
  name: string;
  arguments: Record<string, unknown>;
};

export async function runCustomerTool(context: ToolContext, call: ToolCall) {
  switch (call.name) {
    case "search_product":
      return catalogService.searchProducts({
        businessId: context.businessId,
        query: String(call.arguments.query ?? ""),
        limit: Number(call.arguments.limit ?? 3)
      });

    case "search_product_by_image":
      return imageSearchService.searchByImage({
        businessId: context.businessId,
        imageUrl: String(call.arguments.imageUrl ?? ""),
        customerHint: call.arguments.customerHint ? String(call.arguments.customerHint) : undefined,
        limit: Number(call.arguments.limit ?? 3)
      });

    case "check_inventory":
      return inventoryService.checkAvailability({
        businessId: context.businessId,
        variantId: String(call.arguments.variantId ?? ""),
        quantity: Number(call.arguments.quantity ?? 1)
      });

    case "create_order":
      return orderService.createPendingOrder({
        businessId: context.businessId,
        conversationId: context.conversationId,
        customerId: optionalString(call.arguments.customerId),
        customerName: optionalString(call.arguments.customerName),
        customerPhone: optionalString(call.arguments.customerPhone),
        deliveryAddress: optionalString(call.arguments.deliveryAddress),
        notes: optionalString(call.arguments.notes),
        items: Array.isArray(call.arguments.items)
          ? call.arguments.items.map((item) => ({
              variantId: String((item as Record<string, unknown>).variantId ?? ""),
              quantity: Number((item as Record<string, unknown>).quantity ?? 1)
            }))
          : []
      });

    case "record_unavailable_request":
      return catalogService.recordUnavailableRequest({
        businessId: context.businessId,
        rawQuery: String(call.arguments.rawQuery ?? ""),
        normalizedName: optionalString(call.arguments.normalizedName),
        requestedQty: Number(call.arguments.requestedQty ?? 1),
        imageUrl: optionalString(call.arguments.imageUrl)
      });

    case "handoff_to_human":
      return conversationService.handoffToHuman({
        businessId: context.businessId,
        conversationId: context.conversationId,
        reason: String(call.arguments.reason ?? "Unspecified")
      });

    default:
      return {
        ok: false,
        errorCode: "UNKNOWN_TOOL",
        message: `Tool ${call.name} is not supported.`
      };
  }
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

