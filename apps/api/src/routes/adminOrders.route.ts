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
}

