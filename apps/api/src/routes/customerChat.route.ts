import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runCustomerAgent } from "../agent/customerAgent.js";

const ChatRequestSchema = z.object({
  businessId: z.string().min(1),
  conversationId: z.string().optional(),
  message: z.string().min(1),
  imageUrl: z.string().url().optional()
});

export async function customerChatRoutes(app: FastifyInstance) {
  app.post("/", async (request, reply) => {
    const input = ChatRequestSchema.parse(request.body);
    const result = await runCustomerAgent({
      businessId: input.businessId,
      conversationId: input.conversationId,
      customerMessage: input.message,
      imageUrl: input.imageUrl
    });
    return reply.send(result);
  });
}

