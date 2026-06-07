import { prisma } from "../db/prisma.js";
import { reportService } from "../services/report.service.js";

export async function runDailyReports() {
  const businesses = await prisma.business.findMany({
    select: { id: true, name: true, timezone: true }
  });

  for (const business of businesses) {
    const report = await reportService.saveDailyReport({
      businessId: business.id,
      date: new Date()
    });

    await prisma.auditLog.create({
      data: {
        businessId: business.id,
        actorType: "SYSTEM",
        action: "REPORT_SENT",
        entityType: "DailyReport",
        entityId: report.id,
        metadata: {
          businessName: business.name,
          timezone: business.timezone
        }
      }
    });
  }
}

