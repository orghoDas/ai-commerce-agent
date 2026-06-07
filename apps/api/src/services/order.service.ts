import type { OrderStatus } from "@prisma/client";
import { prisma } from "../db/prisma.js";

type CreatePendingOrderInput = {
  businessId: string;
  conversationId?: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  notes?: string;
  items: Array<{
    variantId: string;
    quantity: number;
  }>;
};

type ListOrdersInput = {
  businessId: string;
  status?: string;
};

export const orderService = {
  async listOrders(input: ListOrdersInput) {
    const where = {
      businessId: input.businessId,
      ...(input.status ? { status: input.status as OrderStatus } : {})
    };

    return prisma.order.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: 100
    });
  },

  async createPendingOrder(input: CreatePendingOrderInput) {
    if (input.items.length === 0) {
      return { ok: false, errorCode: "EMPTY_ORDER", message: "Order must include at least one item." };
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const variants = await tx.productVariant.findMany({
          where: {
            businessId: input.businessId,
            id: { in: input.items.map((item) => item.variantId) },
            isActive: true
          },
          include: { product: true }
        });

        if (variants.length !== input.items.length) {
          throw new Error("VARIANT_NOT_FOUND");
        }

        for (const item of input.items) {
          await tx.$queryRaw`
            SELECT id FROM "InventoryItem"
            WHERE "businessId" = ${input.businessId}
            AND "variantId" = ${item.variantId}
            FOR UPDATE
          `;

          const inventory = await tx.inventoryItem.findUnique({
            where: { variantId: item.variantId },
            include: {
              variant: {
                include: {
                  reservations: {
                    where: {
                      status: "ACTIVE",
                      expiresAt: { gt: new Date() }
                    }
                  }
                }
              }
            }
          });

          if (!inventory || inventory.businessId !== input.businessId) {
            throw new Error("VARIANT_NOT_FOUND");
          }

          const reservedQuantity = inventory.variant.reservations.reduce(
            (sum, reservation) => sum + reservation.quantity,
            0
          );
          const availableQuantity = inventory.stockOnHand - reservedQuantity;

          if (availableQuantity < item.quantity) {
            throw new Error("INSUFFICIENT_STOCK");
          }
        }

        const orderNumber = await nextOrderNumber(input.businessId);
        const subtotalCents = input.items.reduce((sum, item) => {
          const variant = variants.find((candidate) => candidate.id === item.variantId);
          return sum + (variant?.unitPriceCents ?? 0) * item.quantity;
        }, 0);

        const order = await tx.order.create({
          data: {
            businessId: input.businessId,
            conversationId: input.conversationId,
            customerId: input.customerId,
            orderNumber,
            customerName: input.customerName,
            customerPhone: input.customerPhone,
            deliveryAddress: input.deliveryAddress,
            notes: input.notes,
            subtotalCents,
            currency: variants[0]?.currency ?? "USD",
            status: "PENDING",
            items: {
              create: input.items.map((item) => {
                const variant = variants.find((candidate) => candidate.id === item.variantId);
                if (!variant) {
                  throw new Error("VARIANT_NOT_FOUND");
                }
                return {
                  businessId: input.businessId,
                  variantId: variant.id,
                  productName: variant.product.name,
                  variantTitle: variant.title,
                  sku: variant.sku,
                  quantity: item.quantity,
                  unitPriceCents: variant.unitPriceCents,
                  currency: variant.currency
                };
              })
            }
          }
        });

        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        for (const item of input.items) {
          await tx.inventoryReservation.create({
            data: {
              businessId: input.businessId,
              variantId: item.variantId,
              quantity: item.quantity,
              customerId: input.customerId,
              orderId: order.id,
              expiresAt
            }
          });
        }

        await tx.auditLog.create({
          data: {
            businessId: input.businessId,
            actorType: "AGENT",
            action: "ORDER_CREATED",
            entityType: "Order",
            entityId: order.id,
            metadata: { orderNumber: order.orderNumber }
          }
        });

        return order;
      });

      return {
        ok: true,
        data: {
          orderId: result.id,
          orderNumber: result.orderNumber,
          status: result.status,
          subtotalCents: result.subtotalCents,
          currency: result.currency
        }
      };
    } catch (error) {
      const code = error instanceof Error ? error.message : "ORDER_CREATE_FAILED";
      return {
        ok: false,
        errorCode: code,
        message:
          code === "INSUFFICIENT_STOCK"
            ? "One or more requested products are not available in the requested quantity."
            : "Could not create the order."
      };
    }
  }
};

async function nextOrderNumber(businessId: string) {
  const count = await prisma.order.count({ where: { businessId } });
  return `ORD-${String(count + 1).padStart(6, "0")}`;
}
