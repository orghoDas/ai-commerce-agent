import type { Customer, Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";

export type CustomerIdentityInput = {
  externalId?: string;
  name?: string;
  phone?: string;
  email?: string;
  defaultAddress?: string;
};

type ResolveCustomerInput = CustomerIdentityInput & {
  businessId: string;
  conversationId?: string;
};

type LinkCustomerInput = ResolveCustomerInput & {
  actorType?: string;
  actorId?: string;
};

type ResolveCustomerResult = {
  customer: Customer;
  created: boolean;
  matchedBy: "conversation" | "externalId" | "phone" | "email" | "new";
};

export const customerIdentityService = {
  async resolveCustomer(input: ResolveCustomerInput): Promise<ResolveCustomerResult | null> {
    const identity = normalizeIdentity(input);
    const conversationCustomer = input.conversationId
      ? await prisma.conversation.findFirst({
          where: {
            id: input.conversationId,
            businessId: input.businessId
          },
          select: {
            customer: true
          }
        })
      : null;

    const candidate =
      conversationCustomer?.customer
        ? { customer: conversationCustomer.customer, matchedBy: "conversation" as const }
        : await findExistingCustomer(input.businessId, identity);

    if (candidate) {
      const customer = await prisma.customer.update({
        where: { id: candidate.customer.id },
        data: buildCustomerUpdate(candidate.customer, identity)
      });
      return {
        customer,
        created: false,
        matchedBy: candidate.matchedBy
      };
    }

    if (!hasCustomerSignal(identity)) {
      return null;
    }

    const customer = await prisma.customer.create({
      data: {
        businessId: input.businessId,
        externalId: identity.externalId,
        name: identity.name,
        phone: identity.phone,
        email: identity.email,
        defaultAddress: identity.defaultAddress,
        lastSeenAt: new Date()
      }
    });

    return {
      customer,
      created: true,
      matchedBy: "new"
    };
  },

  async linkCustomer(input: LinkCustomerInput) {
    const resolved = await this.resolveCustomer(input);
    if (!resolved) {
      return null;
    }

    if (input.conversationId) {
      await this.linkConversation({
        businessId: input.businessId,
        conversationId: input.conversationId,
        customerId: resolved.customer.id,
        actorType: input.actorType,
        actorId: input.actorId,
        metadata: {
          created: resolved.created,
          matchedBy: resolved.matchedBy
        }
      });
    }

    return resolved.customer;
  },

  async linkConversation(input: {
    businessId: string;
    conversationId: string;
    customerId: string;
    actorType?: string;
    actorId?: string;
    metadata?: Record<string, unknown>;
  }) {
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: input.conversationId,
        businessId: input.businessId
      },
      select: {
        id: true,
        customerId: true
      }
    });

    if (!conversation || conversation.customerId === input.customerId) {
      return conversation;
    }

    const updatedConversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { customerId: input.customerId }
    });

    await prisma.auditLog.create({
      data: {
        businessId: input.businessId,
        actorType: input.actorType ?? "SYSTEM",
        actorId: input.actorId,
        action: "CUSTOMER_LINKED",
        entityType: "Conversation",
        entityId: input.conversationId,
        metadata: {
          customerId: input.customerId,
          previousCustomerId: conversation.customerId,
          ...input.metadata
        }
      }
    });

    return updatedConversation;
  },

  toIdentity(input: CustomerIdentityInput | undefined) {
    return normalizeIdentity(input ?? {});
  }
};

async function findExistingCustomer(businessId: string, identity: CustomerIdentityInput) {
  if (identity.externalId) {
    const customer = await prisma.customer.findFirst({
      where: {
        businessId,
        externalId: identity.externalId
      }
    });
    if (customer) {
      return { customer, matchedBy: "externalId" as const };
    }
  }

  if (identity.phone) {
    const customer = await prisma.customer.findFirst({
      where: {
        businessId,
        phone: identity.phone
      }
    });
    if (customer) {
      return { customer, matchedBy: "phone" as const };
    }
  }

  if (identity.email) {
    const customer = await prisma.customer.findFirst({
      where: {
        businessId,
        email: identity.email
      }
    });
    if (customer) {
      return { customer, matchedBy: "email" as const };
    }
  }

  return null;
}

function buildCustomerUpdate(existing: Customer, identity: CustomerIdentityInput): Prisma.CustomerUpdateInput {
  return {
    lastSeenAt: new Date(),
    ...(identity.externalId && existing.externalId !== identity.externalId ? { externalId: identity.externalId } : {}),
    ...(identity.name ? { name: identity.name } : {}),
    ...(identity.phone ? { phone: identity.phone } : {}),
    ...(identity.email ? { email: identity.email } : {}),
    ...(identity.defaultAddress ? { defaultAddress: identity.defaultAddress } : {})
  };
}

function normalizeIdentity(input: CustomerIdentityInput) {
  return {
    externalId: normalizeText(input.externalId, 128),
    name: normalizeText(input.name, 160),
    phone: normalizePhone(input.phone),
    email: normalizeEmail(input.email),
    defaultAddress: normalizeText(input.defaultAddress, 500)
  };
}

function hasCustomerSignal(identity: CustomerIdentityInput) {
  return Boolean(identity.externalId || identity.name || identity.phone || identity.email || identity.defaultAddress);
}

function normalizeText(value: string | undefined, maxLength: number) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function normalizeEmail(value: string | undefined) {
  return normalizeText(value, 254)?.toLowerCase();
}

function normalizePhone(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const normalized = trimmed.replace(/[^\d+]/g, "");
  return normalized.replace(/\+/g, "").length >= 7 ? normalized.slice(0, 40) : undefined;
}
