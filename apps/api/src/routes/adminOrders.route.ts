import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireRoles } from "../config/auth.js";
import { orderService } from "../services/order.service.js";

export async function adminOrderRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: requireRoles(["OWNER", "ADMIN", "AGENT", "VIEWER"], "You cannot view orders.") }, async (request) => {
    const query = z.object({
      businessId: z.string().min(1),
      status: z.string().optional()
    }).parse(request.query);

    return orderService.listOrders(query);
  });

  app.patch("/:orderId/status", { preHandler: requireRoles(["OWNER", "ADMIN", "AGENT"], "You cannot update orders.") }, async (request, reply) => {
    const params = z.object({
      orderId: z.string().min(1)
    }).parse(request.params);

    const body = z.object({
      businessId: z.string().min(1),
      status: z.enum(["CONFIRMED", "CANCELLED", "FULFILLED"])
    }).parse(request.body);

    const result = await orderService.updateOrderStatus({
      businessId: body.businessId,
      orderId: params.orderId,
      status: body.status,
      actorId: request.user?.userId
    });

    if (!result.ok) {
      if (result.errorCode === "ORDER_NOT_FOUND") {
        return reply.notFound(result.message);
      }
      return reply.badRequest(result.message);
    }

    return result.data;
  });
}
