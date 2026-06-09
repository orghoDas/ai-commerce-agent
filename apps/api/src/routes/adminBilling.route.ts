import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { billingService } from "../services/billing.service.js";

const BillingQuerySchema = z.object({
  businessId: z.string().min(1)
});

const UpdateSubscriptionSchema = z.object({
  businessId: z.string().min(1),
  plan: z.enum(["STARTER", "GROWTH", "SCALE"]).optional(),
  status: z.enum(["TRIALING", "ACTIVE", "PAST_DUE", "CANCELLED"]).optional(),
  seats: z.number().int().min(1).max(100).optional(),
  cancelAtPeriodEnd: z.boolean().optional()
});

export async function adminBillingRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const query = BillingQuerySchema.parse(request.query);
    return billingService.getBillingOverview(query.businessId);
  });

  app.patch("/subscription", async (request, reply) => {
    const body = UpdateSubscriptionSchema.parse(request.body);
    try {
      return await billingService.updateSubscription(body);
    } catch (error) {
      if (error instanceof Error && error.message === "PLAN_NOT_FOUND") {
        return reply.notFound("Plan was not found.");
      }
      return reply.badRequest(error instanceof Error ? error.message : "Could not update subscription.");
    }
  });
}
