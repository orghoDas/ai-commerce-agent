import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { conversationService } from "../services/conversation.service.js";

const ConversationQuerySchema = z.object({
  businessId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

const ConversationParamsSchema = z.object({
  conversationId: z.string().min(1)
});

const TakeoverSchema = z.object({
  businessId: z.string().min(1),
  enabled: z.boolean(),
  reason: z.string().optional()
});

const AdminMessageSchema = z.object({
  businessId: z.string().min(1),
  content: z.string().min(1).max(4000)
});

const StatusSchema = z.object({
  businessId: z.string().min(1),
  status: z.enum(["OPEN", "NEEDS_HUMAN", "CLOSED"])
});

export async function adminConversationRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const query = ConversationQuerySchema.parse(request.query);
    return conversationService.listConversations(query);
  });

  app.get("/:conversationId", async (request, reply) => {
    const params = ConversationParamsSchema.parse(request.params);
    const query = ConversationQuerySchema.pick({ businessId: true }).parse(request.query);

    const conversation = await conversationService.getConversation({
      businessId: query.businessId,
      conversationId: params.conversationId
    });

    if (!conversation) {
      return reply.notFound("Conversation was not found.");
    }

    return conversation;
  });

  app.post("/:conversationId/handoff", async (request, reply) => {
    const params = ConversationParamsSchema.parse(request.params);
    const body = TakeoverSchema.parse(request.body);

    const result = await conversationService.setHumanTakeover({
      businessId: body.businessId,
      conversationId: params.conversationId,
      enabled: body.enabled,
      reason: body.reason,
      actorId: request.user?.userId
    });

    if (!result.ok) {
      return reply.notFound(result.message);
    }

    return result.data;
  });

  app.post("/:conversationId/messages", async (request, reply) => {
    const params = ConversationParamsSchema.parse(request.params);
    const body = AdminMessageSchema.parse(request.body);

    const result = await conversationService.addAdminMessage({
      businessId: body.businessId,
      conversationId: params.conversationId,
      content: body.content,
      actorId: request.user?.userId
    });

    if (!result.ok) {
      return reply.notFound(result.message);
    }

    return reply.code(201).send(result.data);
  });

  app.patch("/:conversationId/status", async (request, reply) => {
    const params = ConversationParamsSchema.parse(request.params);
    const body = StatusSchema.parse(request.body);

    const result = await conversationService.setConversationStatus({
      businessId: body.businessId,
      conversationId: params.conversationId,
      status: body.status,
      actorId: request.user?.userId
    });

    if (!result.ok) {
      return reply.notFound(result.message);
    }

    return result.data;
  });
}
