import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { catalogService } from "../services/catalog.service.js";

const BusinessQuerySchema = z.object({
  businessId: z.string().min(1)
});

export async function adminProductRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const query = BusinessQuerySchema.parse(request.query);
    return catalogService.listProducts(query.businessId);
  });

  app.post("/search", async (request) => {
    const body = z.object({
      businessId: z.string().min(1),
      query: z.string().min(1),
      limit: z.number().int().min(1).max(20).default(10)
    }).parse(request.body);

    return catalogService.searchProducts(body);
  });
}

