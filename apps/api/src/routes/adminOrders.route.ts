import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { orderService } from "../services/order.service.js";

export async function adminOrderRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const query = z.object({
      businessId: z.string().min(1),
      status: z.string().optional()
    }).parse(request.query);

    return orderService.listOrders(query);
  });

  app.patch("/:orderId/status", async (request, reply) => {
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
      status: body.status
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
