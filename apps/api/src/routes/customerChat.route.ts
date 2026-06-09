import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runDeterministicCustomerAgent } from "../agent/deterministicCustomerAgent.js";
import { runCustomerAgent } from "../agent/customerAgent.js";
import { env } from "../config/env.js";
import { conversationService } from "../services/conversation.service.js";
import { sendTenantLimitError } from "./errorHelpers.js";

const ChatRequestSchema = z.object({
  businessId: z.string().min(1),
  conversationId: z.string().optional(),
  message: z.string().min(1),
  imageUrl: z.string().url().optional(),
  customer: z
    .object({
      externalId: z.string().min(1).max(128).optional(),
      name: z.string().min(1).max(160).optional(),
      phone: z.string().min(7).max(40).optional(),
      email: z.string().email().optional()
    })
    .optional()
});

const ConversationMessagesQuerySchema = z.object({
  businessId: z.string().min(1)
});

const ConversationMessagesParamsSchema = z.object({
  conversationId: z.string().min(1)
});

export async function customerChatRoutes(app: FastifyInstance) {
  app.get("/:conversationId/messages", async (request, reply) => {
    const params = ConversationMessagesParamsSchema.parse(request.params);
    const query = ConversationMessagesQuerySchema.parse(request.query);

    const conversation = await conversationService.listPublicMessages({
      businessId: query.businessId,
      conversationId: params.conversationId
    });

    if (!conversation) {
      return reply.notFound("Conversation was not found.");
    }

    return conversation;
  });

  app.post("/", async (request, reply) => {
    const input = ChatRequestSchema.parse(request.body);

    if (input.conversationId) {
      const conversation = await conversationService.getConversationState({
        businessId: input.businessId,
        conversationId: input.conversationId
      });

      if (conversation?.handoffToHuman || conversation?.status === "NEEDS_HUMAN") {
        await conversationService.ensureConversation({
          businessId: input.businessId,
          conversationId: input.conversationId,
          customerIdentity: input.customer
        });

        await conversationService.addMessage({
          businessId: input.businessId,
          conversationId: input.conversationId,
          role: "CUSTOMER",
          content: input.message,
          imageUrl: input.imageUrl
        });

        return reply.send({
          conversationId: input.conversationId,
          mode: "human",
          message: "A team member is handling this conversation. We received your message and will reply shortly.",
          state: "needs_human"
        });
      }
    }

    const agentInput = {
      businessId: input.businessId,
      conversationId: input.conversationId,
      customerMessage: input.message,
      imageUrl: input.imageUrl,
      customerIdentity: input.customer
    };

    const result = await (env.AI_PROVIDER === "openai"
      ? runCustomerAgent(agentInput)
      : runDeterministicCustomerAgent(agentInput)
    ).catch((error) => {
      const tenantLimitResponse = sendTenantLimitError(reply, error);
      if (tenantLimitResponse) {
        return null;
      }
      throw error;
    });

    if (!result) {
      return reply;
    }

    return reply.send(result);
  });
}
