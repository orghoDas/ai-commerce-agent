import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireRoles } from "../config/auth.js";
import { reportService } from "../services/report.service.js";

const ReportQuerySchema = z.object({
  businessId: z.string().min(1),
  date: z
    .string()
    .optional()
    .refine((value) => !value || !Number.isNaN(new Date(value).getTime()), "Invalid report date.")
});

const PeriodReportQuerySchema = ReportQuerySchema.extend({
  period: z.enum(["daily", "weekly", "monthly"]).default("daily")
});

export async function adminReportRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: requireRoles(["OWNER", "ADMIN", "VIEWER"], "You cannot view reports.") }, async (request) => {
    const query = PeriodReportQuerySchema.parse(request.query);

    return reportService.generatePeriodReport({
      businessId: query.businessId,
      period: query.period,
      date: parseReportDate(query.date)
    });
  });

  app.get("/daily", { preHandler: requireRoles(["OWNER", "ADMIN", "VIEWER"], "You cannot view reports.") }, async (request) => {
    const query = ReportQuerySchema.parse(request.query);

    return reportService.generateDailyReport({
      businessId: query.businessId,
      date: parseReportDate(query.date)
    });
  });

  app.get("/weekly", { preHandler: requireRoles(["OWNER", "ADMIN", "VIEWER"], "You cannot view reports.") }, async (request) => {
    const query = ReportQuerySchema.parse(request.query);

    return reportService.generatePeriodReport({
      businessId: query.businessId,
      period: "weekly",
      date: parseReportDate(query.date)
    });
  });

  app.get("/monthly", { preHandler: requireRoles(["OWNER", "ADMIN", "VIEWER"], "You cannot view reports.") }, async (request) => {
    const query = ReportQuerySchema.parse(request.query);

    return reportService.generatePeriodReport({
      businessId: query.businessId,
      period: "monthly",
      date: parseReportDate(query.date)
    });
  });
}

function parseReportDate(value?: string) {
  if (!value) {
    return new Date();
  }

  const date = new Date(value);
  return date;
}
