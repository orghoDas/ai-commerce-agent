import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireRoles } from "../config/auth.js";
import { auditLogService } from "../services/auditLog.service.js";

const AuditLogQuerySchema = z.object({
  businessId: z.string().min(1),
  action: z
    .enum([
      "AUTH_LOGIN",
      "AUTH_LOGOUT",
      "PASSWORD_RESET_REQUESTED",
      "PASSWORD_RESET_COMPLETED",
      "USER_INVITED",
      "USER_INVITE_ACCEPTED",
      "PRODUCT_CREATED",
      "PRODUCT_UPDATED",
      "STOCK_ADJUSTED",
      "RESERVATION_CREATED",
      "RESERVATION_RELEASED",
      "ORDER_CREATED",
      "ORDER_UPDATED",
      "HUMAN_TAKEOVER",
      "CUSTOMER_LINKED",
      "TOOL_CALL_FAILED",
      "REPORT_SENT",
      "BILLING_UPDATED"
    ])
    .optional(),
  actorType: z.string().min(1).max(80).optional(),
  entityType: z.string().min(1).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional()
});

export async function adminAuditLogRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: requireRoles(["OWNER", "ADMIN"], "You cannot view audit logs.") }, async (request) => {
    const query = AuditLogQuerySchema.parse(request.query);
    return auditLogService.listAuditLogs(query);
  });
}
