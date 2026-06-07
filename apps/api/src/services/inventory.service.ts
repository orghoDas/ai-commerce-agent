import type { AvailabilityResult, ToolResult } from "@ai-commerce-agent/shared";
import { prisma } from "../db/prisma.js";

type CheckAvailabilityInput = {
  businessId: string;
  variantId: string;
  quantity: number;
};

type ReserveInventoryInput = {
  businessId: string;
  variantId: string;
  quantity: number;
  customerId?: string;
  orderId?: string;
  expiresAt?: Date;
};

export const inventoryService = {
  async checkAvailability(input: CheckAvailabilityInput): Promise<ToolResult<AvailabilityResult>> {
    const variant = await prisma.productVariant.findFirst({
      where: {
        id: input.variantId,
        businessId: input.businessId,
        isActive: true
      },
      include: {
        product: true,
        inventory: true,
        reservations: {
          where: {
            status: "ACTIVE",
            expiresAt: { gt: new Date() }
          }
        }
      }
    });

    if (!variant || !variant.inventory) {
      return {
        ok: false,
        errorCode: "VARIANT_NOT_FOUND",
        message: "Product variant was not found."
      };
    }

    const reservedQuantity = variant.reservations.reduce((sum, reservation) => sum + reservation.quantity, 0);
    const availableQuantity = Math.max(variant.inventory.stockOnHand - reservedQuantity, 0);

    return {
      ok: true,
      data: {
        variantId: variant.id,
        sku: variant.sku,
        productName: variant.product.name,
        variantTitle: variant.title,
        requestedQuantity: input.quantity,
        availableQuantity,
        isAvailable: availableQuantity >= input.quantity,
        unitPriceCents: variant.unitPriceCents,
        currency: variant.currency
      }
    };
  },

  async reserveInventory(input: ReserveInventoryInput) {
    const expiresAt = input.expiresAt ?? new Date(Date.now() + 15 * 60 * 1000);

    return prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.findFirst({
        where: {
          id: input.variantId,
          businessId: input.businessId,
          isActive: true
        },
        include: {
          inventory: true,
          reservations: {
            where: {
              status: "ACTIVE",
              expiresAt: { gt: new Date() }
            }
          }
        }
      });

      if (!variant || !variant.inventory) {
        throw new Error("VARIANT_NOT_FOUND");
      }

      const reservedQuantity = variant.reservations.reduce((sum, reservation) => sum + reservation.quantity, 0);
      const availableQuantity = variant.inventory.stockOnHand - reservedQuantity;

      if (availableQuantity < input.quantity) {
        throw new Error("INSUFFICIENT_STOCK");
      }

      const reservation = await tx.inventoryReservation.create({
        data: {
          businessId: input.businessId,
          variantId: input.variantId,
          quantity: input.quantity,
          customerId: input.customerId,
          orderId: input.orderId,
          expiresAt
        }
      });

      await tx.auditLog.create({
        data: {
          businessId: input.businessId,
          actorType: "SYSTEM",
          action: "RESERVATION_CREATED",
          entityType: "InventoryReservation",
          entityId: reservation.id,
          metadata: {
            variantId: input.variantId,
            quantity: input.quantity,
            expiresAt: expiresAt.toISOString()
          }
        }
      });

      return reservation;
    });
  }
};

