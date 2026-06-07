import { z } from "zod";

export const BusinessIdSchema = z.string().min(1);

export const SearchProductInputSchema = z.object({
  businessId: BusinessIdSchema,
  query: z.string().min(1),
  limit: z.number().int().min(1).max(5).default(3)
});

export const CheckInventoryInputSchema = z.object({
  businessId: BusinessIdSchema,
  variantId: z.string().min(1),
  quantity: z.number().int().positive().default(1)
});

export const CreateOrderInputSchema = z.object({
  businessId: BusinessIdSchema,
  conversationId: z.string().optional(),
  customerId: z.string().optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  deliveryAddress: z.string().optional(),
  items: z.array(
    z.object({
      variantId: z.string().min(1),
      quantity: z.number().int().positive()
    })
  ).min(1),
  notes: z.string().optional()
});

export const ImageProductSearchInputSchema = z.object({
  businessId: BusinessIdSchema,
  imageUrl: z.string().url(),
  customerHint: z.string().optional(),
  limit: z.number().int().min(1).max(5).default(3)
});

