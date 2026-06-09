import type { DailyReportSummary, ReportPeriod } from "@ai-commerce-agent/shared";
import { prisma } from "../db/prisma.js";

type GenerateDailyReportInput = {
  businessId: string;
  date: Date;
};

type GeneratePeriodReportInput = {
  businessId: string;
  period: ReportPeriod;
  date: Date;
};

export const reportService = {
  async generateDailyReport(input: GenerateDailyReportInput) {
    return this.generatePeriodReport({
      businessId: input.businessId,
      period: "daily",
      date: input.date
    });
  },

  async generatePeriodReport(input: GeneratePeriodReportInput) {
    const range = rangeForPeriod(input.period, input.date);

    const [activeProducts, activeVariants, inventory, orders, unavailableRequests, conversations] = await Promise.all([
      prisma.product.count({
        where: { businessId: input.businessId, status: "ACTIVE" }
      }),
      prisma.productVariant.count({
        where: {
          businessId: input.businessId,
          isActive: true,
          product: { status: "ACTIVE" }
        }
      }),
      prisma.inventoryItem.findMany({
        where: {
          businessId: input.businessId,
          variant: {
            isActive: true,
            product: { status: "ACTIVE" }
          }
        },
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
            gte: range.start,
            lt: range.end
          }
        },
        include: { items: true },
        orderBy: { createdAt: "desc" }
      }),
      prisma.unavailableProductRequest.findMany({
        where: {
          businessId: input.businessId,
          createdAt: {
            gte: range.start,
            lt: range.end
          }
        },
        orderBy: { createdAt: "desc" },
        take: 25
      }),
      prisma.conversation.findMany({
        where: {
          businessId: input.businessId,
          createdAt: {
            gte: range.start,
            lt: range.end
          }
        },
        select: {
          id: true,
          status: true,
          handoffToHuman: true
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
        reorderPoint: item.reorderPoint,
        status: inventoryStatus(available, item.reorderPoint)
      };
    });

    const activeOrders = orders.filter((order) => order.status !== "CANCELLED");
    const grossOrderValueCents = activeOrders.reduce((sum, order) => sum + order.subtotalCents, 0);
    const topProducts = summarizeTopProducts(activeOrders);

    const summary: DailyReportSummary = {
      reportDate: formatDateKey(range.start),
      inventory: {
        activeProducts,
        activeVariants,
        inStockVariants: inventoryRows.filter((row) => row.available > 0).length,
        lowStockVariants: inventoryRows.filter((row) => row.available > 0 && row.available <= row.reorderPoint).length,
        outOfStockVariants: inventoryRows.filter((row) => row.available <= 0).length,
        stockOnHandUnits: inventoryRows.reduce((sum, row) => sum + row.stockOnHand, 0),
        reservedUnits: inventoryRows.reduce((sum, row) => sum + row.reserved, 0),
        availableUnits: inventoryRows.reduce((sum, row) => sum + row.available, 0)
      },
      orders: {
        total: orders.length,
        pending: orders.filter((order) => order.status === "PENDING").length,
        confirmed: orders.filter((order) => order.status === "CONFIRMED").length,
        fulfilled: orders.filter((order) => order.status === "FULFILLED").length,
        cancelled: orders.filter((order) => order.status === "CANCELLED").length,
        needsHumanReview: orders.filter((order) => order.status === "NEEDS_HUMAN_REVIEW").length,
        grossOrderValueCents,
        averageOrderValueCents: activeOrders.length > 0 ? Math.round(grossOrderValueCents / activeOrders.length) : 0
      },
      demand: {
        unavailableRequests: unavailableRequests.length,
        noMatchSearches: unavailableRequests.length
      },
      conversations: {
        opened: conversations.length,
        needsHuman: conversations.filter((conversation) => conversation.handoffToHuman || conversation.status === "NEEDS_HUMAN").length
      }
    };

    return {
      period: input.period,
      range: {
        startDate: formatDateKey(range.start),
        endDate: formatDateKey(addDays(range.end, -1)),
        label: reportLabel(input.period, range.start, range.end)
      },
      summary,
      inventoryRows,
      orders,
      topProducts,
      unavailableRequests
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

function rangeForPeriod(period: ReportPeriod, date: Date) {
  if (period === "weekly") {
    const start = startOfWeek(date);
    return {
      start,
      end: addDays(start, 7)
    };
  }

  if (period === "monthly") {
    const start = startOfMonth(date);
    return {
      start,
      end: nextMonth(start)
    };
  }

  const start = startOfDay(date);
  return {
    start,
    end: addDays(start, 1)
  };
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function startOfWeek(date: Date) {
  const copy = startOfDay(date);
  const day = copy.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + mondayOffset);
  return copy;
}

function startOfMonth(date: Date) {
  const copy = startOfDay(date);
  copy.setDate(1);
  return copy;
}

function nextMonth(date: Date) {
  const copy = startOfMonth(date);
  copy.setMonth(copy.getMonth() + 1);
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function reportLabel(period: ReportPeriod, start: Date, end: Date) {
  if (period === "daily") {
    return formatDateKey(start);
  }

  if (period === "monthly") {
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric"
    }).format(start);
  }

  return `${formatDateKey(start)} to ${formatDateKey(addDays(end, -1))}`;
}

function inventoryStatus(available: number, reorderPoint: number) {
  if (available <= 0) {
    return "OUT_OF_STOCK";
  }

  if (available <= reorderPoint) {
    return "LOW_STOCK";
  }

  return "IN_STOCK";
}

function summarizeTopProducts(orders: Array<{ items: Array<{ productName: string; variantTitle: string; sku: string; quantity: number; unitPriceCents: number; currency: string }> }>) {
  const rows = new Map<
    string,
    {
      productName: string;
      variantTitle: string;
      sku: string;
      quantity: number;
      grossSalesCents: number;
      currency: string;
    }
  >();

  for (const order of orders) {
    for (const item of order.items) {
      const existing =
        rows.get(item.sku) ??
        {
          productName: item.productName,
          variantTitle: item.variantTitle,
          sku: item.sku,
          quantity: 0,
          grossSalesCents: 0,
          currency: item.currency
        };

      existing.quantity += item.quantity;
      existing.grossSalesCents += item.quantity * item.unitPriceCents;
      rows.set(item.sku, existing);
    }
  }

  return [...rows.values()]
    .sort((left, right) => right.quantity - left.quantity || right.grossSalesCents - left.grossSalesCents)
    .slice(0, 10);
}
