import type { OrderStatus } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { canTransitionOrder } from "../domain/orderState.js";
import type { CustomerIdentityInput } from "./customerIdentity.service.js";
import { customerIdentityService } from "./customerIdentity.service.js";

type CreatePendingOrderInput = {
  businessId: string;
  conversationId?: string;
  customerId?: string;
  customerIdentity?: CustomerIdentityInput;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
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

type UpdateOrderStatusInput = {
  businessId: string;
  orderId: string;
  status: OrderStatus;
  actorId?: string;
};

export const orderService = {
  async listOrders(input: ListOrdersInput) {
    const where = {
      businessId: input.businessId,
      ...(input.status ? { status: input.status as OrderStatus } : {})
    };

    return prisma.order.findMany({
      where,
      include: { items: true, customer: true },
      orderBy: { createdAt: "desc" },
      take: 100
    });
  },

  async createPendingOrder(input: CreatePendingOrderInput) {
    if (input.items.length === 0) {
      return { ok: false, errorCode: "EMPTY_ORDER", message: "Order must include at least one item." };
    }

    try {
      const linkedCustomer = await linkOrderCustomer(input);
      const customerId = input.customerId ?? linkedCustomer?.id;

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
            customerId,
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
              customerId,
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
  },

  async updateOrderStatus(input: UpdateOrderStatusInput) {
    try {
      const order = await prisma.$transaction(async (tx) => {
        const existingOrder = await tx.order.findFirst({
          where: {
            id: input.orderId,
            businessId: input.businessId
          },
          include: {
            items: true,
            reservations: true
          }
        });

        if (!existingOrder) {
          throw new Error("ORDER_NOT_FOUND");
        }

        if (!canTransitionOrder(existingOrder.status, input.status)) {
          throw new Error("INVALID_ORDER_TRANSITION");
        }

        if (input.status === "CONFIRMED") {
          await tx.inventoryReservation.updateMany({
            where: {
              businessId: input.businessId,
              orderId: input.orderId,
              status: "ACTIVE"
            },
            data: {
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            }
          });
        }

        if (input.status === "CANCELLED") {
          await tx.inventoryReservation.updateMany({
            where: {
              businessId: input.businessId,
              orderId: input.orderId,
              status: "ACTIVE"
            },
            data: { status: "RELEASED" }
          });
        }

        if (input.status === "FULFILLED") {
          const activeReservations = existingOrder.reservations.filter((reservation) => reservation.status === "ACTIVE");
          if (activeReservations.length === 0) {
            throw new Error("NO_ACTIVE_RESERVATIONS");
          }

          for (const reservation of activeReservations) {
            await tx.$queryRaw`
              SELECT id FROM "InventoryItem"
              WHERE "businessId" = ${input.businessId}
              AND "variantId" = ${reservation.variantId}
              FOR UPDATE
            `;

            const inventory = await tx.inventoryItem.findUnique({
              where: { variantId: reservation.variantId }
            });

            if (!inventory || inventory.businessId !== input.businessId) {
              throw new Error("INVENTORY_NOT_FOUND");
            }

            if (inventory.stockOnHand < reservation.quantity) {
              throw new Error("INSUFFICIENT_STOCK_TO_FULFILL");
            }

            await tx.inventoryItem.update({
              where: { variantId: reservation.variantId },
              data: {
                stockOnHand: {
                  decrement: reservation.quantity
                }
              }
            });

            await tx.inventoryReservation.update({
              where: { id: reservation.id },
              data: { status: "CONVERTED" }
            });
          }
        }

        const updatedOrder = await tx.order.update({
          where: { id: input.orderId },
          data: { status: input.status },
          include: { items: true }
        });

        await tx.auditLog.create({
          data: {
            businessId: input.businessId,
            actorType: "ADMIN",
            actorId: input.actorId,
            action: "ORDER_UPDATED",
            entityType: "Order",
            entityId: input.orderId,
            metadata: {
              from: existingOrder.status,
              to: input.status,
              orderNumber: existingOrder.orderNumber
            }
          }
        });

        return updatedOrder;
      });

      return { ok: true, data: order };
    } catch (error) {
      const code = error instanceof Error ? error.message : "ORDER_UPDATE_FAILED";
      return {
        ok: false,
        errorCode: code,
        message: messageForOrderStatusError(code)
      };
    }
  }
};

async function nextOrderNumber(businessId: string) {
  const count = await prisma.order.count({ where: { businessId } });
  return `ORD-${String(count + 1).padStart(6, "0")}`;
}

function messageForOrderStatusError(code: string) {
  switch (code) {
    case "ORDER_NOT_FOUND":
      return "Order was not found.";
    case "INVALID_ORDER_TRANSITION":
      return "That order status change is not allowed.";
    case "NO_ACTIVE_RESERVATIONS":
      return "This order has no active inventory reservation to fulfill.";
    case "INVENTORY_NOT_FOUND":
      return "Inventory was not found for this order.";
    case "INSUFFICIENT_STOCK_TO_FULFILL":
      return "There is not enough stock on hand to fulfill this order.";
    default:
      return "Could not update the order status.";
  }
}

async function linkOrderCustomer(input: CreatePendingOrderInput) {
  return customerIdentityService.linkCustomer({
    businessId: input.businessId,
    conversationId: input.conversationId,
    externalId: input.customerIdentity?.externalId,
    name: input.customerName ?? input.customerIdentity?.name,
    phone: input.customerPhone ?? input.customerIdentity?.phone,
    email: input.customerEmail ?? input.customerIdentity?.email,
    defaultAddress: input.deliveryAddress ?? input.customerIdentity?.defaultAddress,
    actorType: "AGENT"
  });
}
