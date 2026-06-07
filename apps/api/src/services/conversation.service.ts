import { prisma } from "../db/prisma.js";

type EnsureConversationInput = {
  businessId: string;
  conversationId?: string;
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
        return existing;
      }
    }

    return prisma.conversation.create({
      data: {
        businessId: input.businessId,
        channel: "WEB"
      }
    });
  },

  async addMessage(input: AddMessageInput) {
    return prisma.message.create({
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
