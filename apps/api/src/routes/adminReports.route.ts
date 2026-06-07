import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { reportService } from "../services/report.service.js";

export async function adminReportRoutes(app: FastifyInstance) {
  app.get("/daily", async (request) => {
    const query = z.object({
      businessId: z.string().min(1),
      date: z.string().optional()
    }).parse(request.query);

    return reportService.generateDailyReport({
      businessId: query.businessId,
      date: query.date ? new Date(query.date) : new Date()
    });
  });
}

