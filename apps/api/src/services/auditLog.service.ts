import type { AuditAction } from "@prisma/client";
import { prisma } from "../db/prisma.js";

type ListAuditLogsInput = {
  businessId: string;
  action?: AuditAction;
  actorType?: string;
  entityType?: string;
  limit?: number;
};

export const auditLogService = {
  async listAuditLogs(input: ListAuditLogsInput) {
    const take = Math.min(input.limit ?? 100, 200);
    const logs = await prisma.auditLog.findMany({
      where: {
        businessId: input.businessId,
        ...(input.action ? { action: input.action } : {}),
        ...(input.actorType ? { actorType: input.actorType } : {}),
        ...(input.entityType ? { entityType: input.entityType } : {})
      },
      orderBy: { createdAt: "desc" },
      take
    });

    const actorIds = [...new Set(logs.map((log) => log.actorId).filter((actorId): actorId is string => Boolean(actorId)))];
    const actors = actorIds.length
      ? await prisma.user.findMany({
          where: {
            businessId: input.businessId,
            id: { in: actorIds }
          },
          select: {
            id: true,
            email: true,
            name: true,
            role: true
          }
        })
      : [];
    const actorsById = new Map(actors.map((actor) => [actor.id, actor]));

    return logs.map((log) => ({
      ...log,
      actor: log.actorId ? actorsById.get(log.actorId) ?? null : null
    }));
  }
};
