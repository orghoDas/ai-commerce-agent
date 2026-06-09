import type { MessageRole } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { billingService } from "./billing.service.js";
import type { CustomerIdentityInput } from "./customerIdentity.service.js";
import { customerIdentityService } from "./customerIdentity.service.js";

const STATE_TOOL_NAME = "deterministic_customer_state";
const visibleMessageWhere = {
  NOT: {
    role: "SYSTEM" as const,
    toolName: STATE_TOOL_NAME
  }
};
const publicMessageWhere = {
  role: { in: ["CUSTOMER", "ASSISTANT", "ADMIN"] as MessageRole[] }
};

type EnsureConversationInput = {
  businessId: string;
  conversationId?: string;
  customerIdentity?: CustomerIdentityInput;
};

type AddMessageInput = {
  businessId: string;
  conversationId: string;
  role: "CUSTOMER" | "ASSISTANT" | "ADMIN" | "TOOL" | "SYSTEM";
  content: string;
  imageUrl?: string;
  toolName?: string;
  toolPayload?: unknown;
};

type HandoffInput = {
  businessId: string;
  conversationId?: string;
  reason: string;
};

type SetHumanTakeoverInput = {
  businessId: string;
  conversationId: string;
  enabled: boolean;
  reason?: string;
  actorId?: string;
};

type AddAdminMessageInput = {
  businessId: string;
  conversationId: string;
  content: string;
  actorId?: string;
};

type SetConversationStatusInput = {
  businessId: string;
  conversationId: string;
  status: "OPEN" | "NEEDS_HUMAN" | "CLOSED";
  actorId?: string;
};

type ListConversationsInput = {
  businessId: string;
  limit?: number;
};

type GetConversationInput = {
  businessId: string;
  conversationId: string;
};

export const conversationService = {
  async ensureConversation(input: EnsureConversationInput) {
    if (input.conversationId) {
      const existing = await prisma.conversation.findFirst({
        where: {
          id: input.conversationId,
          businessId: input.businessId
        }
      });
      if (existing) {
        if (input.customerIdentity) {
          await customerIdentityService.linkCustomer({
            businessId: input.businessId,
            conversationId: existing.id,
            ...input.customerIdentity,
            actorType: "CUSTOMER"
          });
        }
        return existing;
      }
    }

    await billingService.assertCanCreateConversation(input.businessId);
    const linkedCustomer = input.customerIdentity
      ? await customerIdentityService.resolveCustomer({
          businessId: input.businessId,
          ...input.customerIdentity
        })
      : null;

    const conversation = await prisma.conversation.create({
      data: {
        businessId: input.businessId,
        channel: "WEB"
      }
    });

    if (linkedCustomer) {
      const linkedConversation = await customerIdentityService.linkConversation({
        businessId: input.businessId,
        conversationId: conversation.id,
        customerId: linkedCustomer.customer.id,
        actorType: "CUSTOMER",
        metadata: {
          created: linkedCustomer.created,
          matchedBy: linkedCustomer.matchedBy
        }
      });
      return linkedConversation ?? conversation;
    }

    return conversation;
  },

  async addMessage(input: AddMessageInput) {
    return prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          businessId: input.businessId,
          conversationId: input.conversationId,
          role: input.role,
          content: input.content,
          imageUrl: input.imageUrl,
          toolName: input.toolName,
          toolPayload: input.toolPayload as never
        }
      });

      await tx.conversation.update({
        where: { id: input.conversationId },
        data: { updatedAt: new Date() }
      });

      return message;
    });
  },

  async listConversations(input: ListConversationsInput) {
    const take = Math.min(input.limit ?? 50, 100);
    const conversations = await prisma.conversation.findMany({
      where: {
        businessId: input.businessId
      },
      include: {
        customer: true,
        messages: {
          where: visibleMessageWhere,
          orderBy: { createdAt: "desc" },
          take: 6
        },
        orders: {
          include: { items: true },
          orderBy: { createdAt: "desc" },
          take: 3
        },
        _count: {
          select: {
            messages: { where: visibleMessageWhere },
            orders: true
          }
        }
      },
      orderBy: { updatedAt: "desc" },
      take
    });

    return conversations.map((conversation) => ({
      ...conversation,
      messages: conversation.messages.reverse()
    }));
  },

  async getConversation(input: GetConversationInput) {
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: input.conversationId,
        businessId: input.businessId
      },
      include: {
        customer: true,
        messages: {
          where: visibleMessageWhere,
          orderBy: { createdAt: "asc" }
        },
        orders: {
          include: { items: true },
          orderBy: { createdAt: "desc" }
        },
        _count: {
          select: {
            messages: { where: visibleMessageWhere },
            orders: true
          }
        }
      }
    });

    return conversation;
  },

  async getConversationState(input: GetConversationInput) {
    return prisma.conversation.findFirst({
      where: {
        id: input.conversationId,
        businessId: input.businessId
      },
      select: {
        id: true,
        businessId: true,
        status: true,
        handoffToHuman: true
      }
    });
  },

  async listPublicMessages(input: GetConversationInput) {
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: input.conversationId,
        businessId: input.businessId
      },
      select: {
        id: true,
        status: true,
        handoffToHuman: true,
        messages: {
          where: publicMessageWhere,
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            role: true,
            content: true,
            imageUrl: true,
            createdAt: true
          }
        }
      }
    });

    return conversation;
  },

  async setHumanTakeover(input: SetHumanTakeoverInput) {
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: input.conversationId,
        businessId: input.businessId
      }
    });

    if (!conversation) {
      return {
        ok: false as const,
        errorCode: "CONVERSATION_NOT_FOUND",
        message: "Conversation was not found."
      };
    }

    const updatedConversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        handoffToHuman: input.enabled,
        status: input.enabled ? "NEEDS_HUMAN" : "OPEN"
      }
    });

    await prisma.auditLog.create({
      data: {
        businessId: input.businessId,
        actorType: "ADMIN",
        actorId: input.actorId,
        action: "HUMAN_TAKEOVER",
        entityType: "Conversation",
        entityId: input.conversationId,
        metadata: {
          enabled: input.enabled,
          reason: input.reason
        }
      }
    });

    return { ok: true as const, data: updatedConversation };
  },

  async addAdminMessage(input: AddAdminMessageInput) {
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: input.conversationId,
        businessId: input.businessId
      }
    });

    if (!conversation) {
      return {
        ok: false as const,
        errorCode: "CONVERSATION_NOT_FOUND",
        message: "Conversation was not found."
      };
    }

    const message = await this.addMessage({
      businessId: input.businessId,
      conversationId: input.conversationId,
      role: "ADMIN",
      content: input.content
    });

    await prisma.conversation.update({
      where: { id: input.conversationId },
      data: {
        handoffToHuman: true,
        status: "NEEDS_HUMAN"
      }
    });

    await prisma.auditLog.create({
      data: {
        businessId: input.businessId,
        actorType: "ADMIN",
        actorId: input.actorId,
        action: "HUMAN_TAKEOVER",
        entityType: "Message",
        entityId: message.id,
        metadata: {
          conversationId: input.conversationId
        }
      }
    });

    return { ok: true as const, data: message };
  },

  async setConversationStatus(input: SetConversationStatusInput) {
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: input.conversationId,
        businessId: input.businessId
      }
    });

    if (!conversation) {
      return {
        ok: false as const,
        errorCode: "CONVERSATION_NOT_FOUND",
        message: "Conversation was not found."
      };
    }

    const updatedConversation = await prisma.conversation.update({
      where: { id: input.conversationId },
      data: {
        status: input.status,
        handoffToHuman: input.status === "NEEDS_HUMAN"
      }
    });

    await prisma.auditLog.create({
      data: {
        businessId: input.businessId,
        actorType: "ADMIN",
        actorId: input.actorId,
        action: "HUMAN_TAKEOVER",
        entityType: "Conversation",
        entityId: input.conversationId,
        metadata: {
          status: input.status
        }
      }
    });

    return { ok: true as const, data: updatedConversation };
  },

  async handoffToHuman(input: HandoffInput) {
    if (!input.conversationId) {
      return {
        ok: false,
        errorCode: "MISSING_CONVERSATION",
        message: "Conversation is required for human handoff."
      };
    }

    const conversation = await prisma.conversation.findFirst({
      where: {
        id: input.conversationId,
        businessId: input.businessId
      }
    });

    if (!conversation) {
      return {
        ok: false,
        errorCode: "CONVERSATION_NOT_FOUND",
        message: "Conversation was not found."
      };
    }

    const updatedConversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { handoffToHuman: true, status: "NEEDS_HUMAN" }
    });

    await prisma.auditLog.create({
      data: {
        businessId: input.businessId,
        actorType: "AGENT",
        action: "HUMAN_TAKEOVER",
        entityType: "Conversation",
        entityId: input.conversationId,
        metadata: { reason: input.reason }
      }
    });

    return { ok: true, data: updatedConversation };
  }
};
