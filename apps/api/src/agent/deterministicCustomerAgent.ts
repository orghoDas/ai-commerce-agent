import type { ProductSearchMatch } from "@ai-commerce-agent/shared";
import { prisma } from "../db/prisma.js";
import { catalogService } from "../services/catalog.service.js";
import { conversationService } from "../services/conversation.service.js";
import type { CustomerIdentityInput } from "../services/customerIdentity.service.js";
import { imageSearchService } from "../services/imageSearch.service.js";
import { inventoryService } from "../services/inventory.service.js";
import { orderService } from "../services/order.service.js";

const STATE_TOOL_NAME = "deterministic_customer_state";

type DeterministicAgentInput = {
  businessId: string;
  conversationId?: string;
  customerMessage: string;
  imageUrl?: string;
  customerIdentity?: CustomerIdentityInput;
};

type DeterministicState = {
  step:
    | "idle"
    | "select_product"
    | "await_order_confirmation"
    | "collect_name"
    | "collect_phone"
    | "collect_address"
    | "final_confirm";
  matches?: ProductSearchMatch[];
  selectedMatch?: ProductSearchMatch;
  quantity?: number;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
};

type DeterministicTurn = {
  message: string;
  state: DeterministicState;
};

export async function runDeterministicCustomerAgent(input: DeterministicAgentInput) {
  const conversation = await conversationService.ensureConversation({
    businessId: input.businessId,
    conversationId: input.conversationId,
    customerIdentity: input.customerIdentity
  });

  const previousState = await loadState(input.businessId, conversation.id);

  await conversationService.addMessage({
    businessId: input.businessId,
    conversationId: conversation.id,
    role: "CUSTOMER",
    content: input.customerMessage,
    imageUrl: input.imageUrl
  });

  const turn = await handleTurn({ ...input, conversationId: conversation.id }, previousState ?? { step: "idle" });

  await conversationService.addMessage({
    businessId: input.businessId,
    conversationId: conversation.id,
    role: "ASSISTANT",
    content: turn.message
  });

  await saveState(input.businessId, conversation.id, turn.state);

  return {
    conversationId: conversation.id,
    mode: "deterministic",
    message: turn.message,
    state: turn.state.step
  };
}

async function handleTurn(input: DeterministicAgentInput, state: DeterministicState): Promise<DeterministicTurn> {
  const text = input.customerMessage.trim();

  if (input.imageUrl) {
    return searchImageAndStartFlow(input.businessId, input.imageUrl, text);
  }

  if (isReset(text)) {
    return {
      message: "No problem. What product are you looking for?",
      state: { step: "idle" }
    };
  }

  if (state.step === "select_product") {
    const selectedMatch = selectMatch(text, state.matches ?? []);
    if (!selectedMatch) {
      return {
        message: formatMatches("Please choose one of these products by replying with its number:", state.matches ?? []),
        state
      };
    }
    return presentAvailability(input.businessId, selectedMatch, state.quantity ?? extractQuantity(text) ?? 1, text);
  }

  if (state.step === "await_order_confirmation") {
    const quantity = extractQuantity(text) ?? state.quantity ?? 1;
    if (isNegative(text)) {
      return {
        message: "No problem. Tell me if you want to check another product.",
        state: { step: "idle" }
      };
    }
    if (isAffirmative(text) || hasOrderIntent(text)) {
      return {
        message: `Great. I will prepare ${quantity} x ${formatMatchName(state.selectedMatch)}. What name should I put on the order?`,
        state: { ...state, step: "collect_name", quantity }
      };
    }
    return {
      message: "Please reply yes if you want to order, or tell me a different quantity.",
      state: { ...state, quantity }
    };
  }

  if (state.step === "collect_name") {
    const customerName = extractName(text);
    if (!customerName) {
      return {
        message: "What name should I put on the order?",
        state
      };
    }
    return {
      message: "Thanks. What phone number should we use for the order?",
      state: { ...state, step: "collect_phone", customerName }
    };
  }

  if (state.step === "collect_phone") {
    const customerPhone = extractPhone(text);
    if (!customerPhone) {
      return {
        message: "Please send a valid phone number for the order.",
        state
      };
    }
    return {
      message: "Got it. What delivery address should we use?",
      state: { ...state, step: "collect_address", customerPhone }
    };
  }

  if (state.step === "collect_address") {
    if (text.length < 6) {
      return {
        message: "Please send the full delivery address.",
        state
      };
    }

    const nextState = { ...state, step: "final_confirm" as const, deliveryAddress: text };
    return {
      message: `Please confirm this order:\n${formatOrderSummary(nextState)}\nReply confirm to place the order, or cancel to stop.`,
      state: nextState
    };
  }

  if (state.step === "final_confirm") {
    if (isNegative(text)) {
      return {
        message: "Order cancelled. Tell me if you want to check another product.",
        state: { step: "idle" }
      };
    }

    if (!isAffirmative(text)) {
      return {
        message: "Please reply confirm to place the order, or cancel to stop.",
        state
      };
    }

    return createOrder(input.businessId, input.conversationId, input.customerIdentity, state);
  }

  return searchAndStartFlow(input.businessId, text);
}

async function searchAndStartFlow(businessId: string, text: string): Promise<DeterministicTurn> {
  if (isGreeting(text)) {
    return {
      message: "Hi! What product are you looking for today?",
      state: { step: "idle" }
    };
  }

  const quantity = extractQuantity(text) ?? 1;
  const searchResult = await catalogService.searchProducts({
    businessId,
    query: text,
    limit: 3
  });

  if (!searchResult.ok || searchResult.data.length === 0) {
    await catalogService.recordUnavailableRequest({
      businessId,
      rawQuery: text,
      requestedQty: quantity
    });
    return {
      message: "Sorry, I could not find that product in stock right now.",
      state: { step: "idle" }
    };
  }

  if (searchResult.data.length > 1) {
    return {
      message: formatMatches("I found a few matching products. Which one do you mean?", searchResult.data),
      state: {
        step: "select_product",
        matches: searchResult.data,
        quantity
      }
    };
  }

  const singleMatch = searchResult.data[0];
  if (!singleMatch) {
    return {
      message: "Sorry, I could not find that product in stock right now.",
      state: { step: "idle" }
    };
  }

  return presentAvailability(businessId, singleMatch, quantity, text);
}

async function searchImageAndStartFlow(businessId: string, imageUrl: string, text: string): Promise<DeterministicTurn> {
  const quantity = extractQuantity(text) ?? 1;
  const searchResult = await imageSearchService.searchByImage({
    businessId,
    imageUrl,
    customerHint: text && !/identify this product/i.test(text) ? text : undefined,
    limit: 3
  });

  if (!searchResult.ok || searchResult.data.length === 0) {
    await catalogService.recordUnavailableRequest({
      businessId,
      rawQuery: text || "image search",
      requestedQty: quantity,
      imageUrl
    });
    return {
      message: "Sorry, I could not match that image to an in-stock catalog product right now.",
      state: { step: "idle" }
    };
  }

  if (searchResult.data.length > 1) {
    return {
      message: formatMatches("I found a few products that look similar. Which one do you mean?", searchResult.data),
      state: {
        step: "select_product",
        matches: searchResult.data,
        quantity
      }
    };
  }

  const singleMatch = searchResult.data[0];
  if (!singleMatch) {
    return {
      message: "Sorry, I could not match that image to an in-stock catalog product right now.",
      state: { step: "idle" }
    };
  }

  return presentAvailability(businessId, singleMatch, quantity, text || "image search");
}

async function presentAvailability(
  businessId: string,
  match: ProductSearchMatch,
  quantity: number,
  customerText: string
): Promise<DeterministicTurn> {
  if (!match.variantId) {
    return {
      message: "I found the product, but I need an exact variant before checking stock.",
      state: { step: "idle" }
    };
  }

  const availability = await inventoryService.checkAvailability({
    businessId,
    variantId: match.variantId,
    quantity
  });

  if (!availability.ok) {
    return {
      message: "Sorry, I could not check stock for that product right now.",
      state: { step: "idle" }
    };
  }

  if (!availability.data.isAvailable) {
    await catalogService.recordUnavailableRequest({
      businessId,
      productId: match.productId,
      rawQuery: formatMatchName(match),
      normalizedName: match.name,
      requestedQty: quantity
    });
    return {
      message: `Sorry, ${formatMatchName(match)} is not available in the requested quantity right now.`,
      state: { step: "idle" }
    };
  }

  const price = formatPrice(availability.data.unitPriceCents, availability.data.currency);
  const availabilityText = `Yes, ${formatMatchName(match)} is available. Price: ${price}. Available quantity: ${availability.data.availableQuantity}.`;

  if (hasOrderIntent(customerText)) {
    return {
      message: `${availabilityText} What name should I put on the order?`,
      state: {
        step: "collect_name",
        selectedMatch: match,
        quantity
      }
    };
  }

  return {
    message: `${availabilityText} Would you like to order ${quantity}?`,
    state: {
      step: "await_order_confirmation",
      selectedMatch: match,
      quantity
    }
  };
}

async function createOrder(
  businessId: string,
  conversationId: string | undefined,
  customerIdentity: CustomerIdentityInput | undefined,
  state: DeterministicState
): Promise<DeterministicTurn> {
  if (!state.selectedMatch?.variantId || !state.quantity || !state.customerName || !state.customerPhone || !state.deliveryAddress) {
    return {
      message: "I am missing some order details. Please start the order again.",
      state: { step: "idle" }
    };
  }

  const order = await orderService.createPendingOrder({
    businessId,
    conversationId,
    customerIdentity,
    customerName: state.customerName,
    customerPhone: state.customerPhone,
    deliveryAddress: state.deliveryAddress,
    items: [
      {
        variantId: state.selectedMatch.variantId,
        quantity: state.quantity
      }
    ]
  });

  if (!order.ok || !order.data) {
    return {
      message: `Sorry, I could not place the order. ${order.message}`,
      state: { step: "idle" }
    };
  }

  return {
    message: `Order confirmed. Your order number is ${order.data.orderNumber}.`,
    state: { step: "idle" }
  };
}

async function loadState(businessId: string, conversationId: string): Promise<DeterministicState | null> {
  const row = await prisma.message.findFirst({
    where: {
      businessId,
      conversationId,
      role: "SYSTEM",
      toolName: STATE_TOOL_NAME
    },
    orderBy: { createdAt: "desc" }
  });

  if (!row?.toolPayload || typeof row.toolPayload !== "object") {
    return null;
  }

  return row.toolPayload as DeterministicState;
}

async function saveState(businessId: string, conversationId: string, state: DeterministicState) {
  await conversationService.addMessage({
    businessId,
    conversationId,
    role: "SYSTEM",
    content: "deterministic customer agent state",
    toolName: STATE_TOOL_NAME,
    toolPayload: state
  });
}

function selectMatch(text: string, matches: ProductSearchMatch[]) {
  const normalized = text.trim().toLowerCase();
  const numericChoice = Number(normalized.match(/\b\d+\b/)?.[0]);
  if (numericChoice >= 1 && numericChoice <= matches.length) {
    return matches[numericChoice - 1];
  }

  return matches.find((match) => formatMatchName(match).toLowerCase().includes(normalized));
}

function formatMatches(intro: string, matches: ProductSearchMatch[]) {
  if (matches.length === 0) {
    return "I could not find matching products.";
  }

  const lines = matches.map((match, index) => {
    const price = match.unitPriceCents && match.currency ? ` - ${formatPrice(match.unitPriceCents, match.currency)}` : "";
    return `${index + 1}. ${formatMatchName(match)}${price}`;
  });

  return `${intro}\n${lines.join("\n")}`;
}

function formatOrderSummary(state: DeterministicState) {
  const itemName = formatMatchName(state.selectedMatch);
  const quantity = state.quantity ?? 1;
  const unitPrice = state.selectedMatch?.unitPriceCents
    ? formatPrice(state.selectedMatch.unitPriceCents, state.selectedMatch.currency ?? "USD")
    : "the listed price";

  return [
    `Product: ${itemName}`,
    `Quantity: ${quantity}`,
    `Unit price: ${unitPrice}`,
    `Name: ${state.customerName}`,
    `Phone: ${state.customerPhone}`,
    `Address: ${state.deliveryAddress}`
  ].join("\n");
}

function formatMatchName(match?: ProductSearchMatch) {
  if (!match) {
    return "the selected product";
  }
  return [match.name, match.variantTitle].filter(Boolean).join(" - ");
}

function formatPrice(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency
  }).format(cents / 100);
}

function extractQuantity(text: string) {
  const numeric = text.match(/\b(\d{1,3})\b/);
  if (numeric) {
    return Math.max(Number(numeric[1]), 1);
  }

  const words: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10
  };
  const found = text.toLowerCase().split(/\s+/).find((word) => words[word]);
  return found ? words[found] : undefined;
}

function extractName(text: string) {
  const match = text.match(/(?:my name is|name is|i am|i'm)\s+(.+)/i);
  const value = (match?.[1] ?? text).trim();
  if (value.length < 2 || /\d/.test(value)) {
    return undefined;
  }
  return value.replace(/[.!,]+$/g, "");
}

function extractPhone(text: string) {
  const digits = text.replace(/[^\d+]/g, "");
  return digits.replace(/\+/g, "").length >= 7 ? digits : undefined;
}

function isGreeting(text: string) {
  return /^(hi|hello|hey|salam|assalamu alaikum|good morning|good afternoon|good evening)\b/i.test(text.trim());
}

function isAffirmative(text: string) {
  return /\b(yes|yeah|yep|sure|ok|okay|confirm|confirmed|place it|go ahead)\b/i.test(text);
}

function isNegative(text: string) {
  return /\b(no|nope|cancel|stop|never mind|nevermind)\b/i.test(text);
}

function isReset(text: string) {
  return /\b(reset|start over|new order|cancel this)\b/i.test(text);
}

function hasOrderIntent(text: string) {
  return /\b(order|buy|purchase|take|get|i want|i need|i'll take|ill take)\b/i.test(text);
}
