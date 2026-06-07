import type { DailyReportSummary } from "@ai-commerce-agent/shared";
import { prisma } from "../db/prisma.js";

type GenerateDailyReportInput = {
  businessId: string;
  date: Date;
};

export const reportService = {
  async generateDailyReport(input: GenerateDailyReportInput) {
    const [activeProducts, activeVariants, inventory, orders, unavailableRequests] = await Promise.all([
      prisma.product.count({
        where: { businessId: input.businessId, status: "ACTIVE" }
      }),
      prisma.productVariant.count({
        where: { businessId: input.businessId, isActive: true }
      }),
      prisma.inventoryItem.findMany({
        where: { businessId: input.businessId },
        include: {
          variant: {
            include: {
              product: true,
              reservations: {
                where: {
                  status: "ACTIVE",
                  expiresAt: { gt: new Date() }
                }
              }
            }
          }
        }
      }),
      prisma.order.findMany({
        where: {
          businessId: input.businessId,
          createdAt: {
            gte: startOfDay(input.date),
            lt: nextDay(input.date)
          }
        }
      }),
      prisma.unavailableProductRequest.count({
        where: {
          businessId: input.businessId,
          createdAt: {
            gte: startOfDay(input.date),
            lt: nextDay(input.date)
          }
        }
      })
    ]);

    const inventoryRows = inventory.map((item) => {
      const reserved = item.variant.reservations.reduce((sum, reservation) => sum + reservation.quantity, 0);
      const available = item.stockOnHand - reserved;
      return {
        productName: item.variant.product.name,
        variantTitle: item.variant.title,
        sku: item.variant.sku,
        stockOnHand: item.stockOnHand,
        reserved,
        available,
        reorderPoint: item.reorderPoint
      };
    });

    const summary: DailyReportSummary = {
      reportDate: input.date.toISOString().slice(0, 10),
      inventory: {
        activeProducts,
        activeVariants,
        inStockVariants: inventoryRows.filter((row) => row.available > 0).length,
        lowStockVariants: inventoryRows.filter((row) => row.available > 0 && row.available <= row.reorderPoint).length,
        outOfStockVariants: inventoryRows.filter((row) => row.available <= 0).length
      },
      orders: {
        pending: orders.filter((order) => order.status === "PENDING").length,
        confirmed: orders.filter((order) => order.status === "CONFIRMED").length,
        fulfilled: orders.filter((order) => order.status === "FULFILLED").length,
        cancelled: orders.filter((order) => order.status === "CANCELLED").length,
        grossOrderValueCents: orders
          .filter((order) => order.status !== "CANCELLED")
          .reduce((sum, order) => sum + order.subtotalCents, 0)
      },
      demand: {
        unavailableRequests,
        noMatchSearches: unavailableRequests
      }
    };

    return {
      summary,
      inventoryRows,
      orders
    };
  },

  async saveDailyReport(input: GenerateDailyReportInput) {
    const report = await this.generateDailyReport(input);
    return prisma.dailyReport.upsert({
      where: {
        businessId_reportDate: {
          businessId: input.businessId,
          reportDate: startOfDay(input.date)
        }
      },
      create: {
        businessId: input.businessId,
        reportDate: startOfDay(input.date),
        summary: report.summary as never
      },
      update: {
        summary: report.summary as never
      }
    });
  }
};

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function nextDay(date: Date) {
  const copy = startOfDay(date);
  copy.setDate(copy.getDate() + 1);
  return copy;
}

