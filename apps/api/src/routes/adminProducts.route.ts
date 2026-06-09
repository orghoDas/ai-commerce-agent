import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { requireRoles } from "../config/auth.js";
import { catalogService } from "../services/catalog.service.js";
import { uploadStorageService } from "../services/uploadStorage.service.js";
import { sendTenantLimitError } from "./errorHelpers.js";
import { multipartField, readImageUpload } from "./uploadHelpers.js";

const BusinessQuerySchema = z.object({
  businessId: z.string().min(1)
});

const ProductParamsSchema = z.object({
  productId: z.string().min(1)
});

const VariantParamsSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1)
});

const ProductImageParamsSchema = z.object({
  productId: z.string().min(1),
  imageId: z.string().min(1)
});

const CsvListSchema = z
  .string()
  .optional()
  .transform((value) =>
    value
      ? value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : []
  );

const OptionalCsvListSchema = z
  .string()
  .optional()
  .transform((value) =>
    value === undefined
      ? undefined
      : value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
  );

const CreateProductSchema = z.object({
  businessId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  brand: z.string().optional(),
  category: z.string().optional(),
  tags: CsvListSchema,
  searchKeywords: CsvListSchema,
  variant: z.object({
    sku: z.string().min(1),
    title: z.string().min(1),
    color: z.string().optional(),
    size: z.string().optional(),
    unitPriceCents: z.number().int().min(0),
    currency: z.string().min(3).max(3).default("USD"),
    stockOnHand: z.number().int().min(0),
    reorderPoint: z.number().int().min(0).default(3)
  })
});

const UpdateProductSchema = z.object({
  businessId: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
  tags: OptionalCsvListSchema,
  searchKeywords: OptionalCsvListSchema
});

const CreateVariantSchema = z.object({
  businessId: z.string().min(1),
  sku: z.string().min(1),
  title: z.string().min(1),
  color: z.string().optional(),
  size: z.string().optional(),
  unitPriceCents: z.number().int().min(0),
  currency: z.string().min(3).max(3).default("USD"),
  stockOnHand: z.number().int().min(0),
  reorderPoint: z.number().int().min(0).default(3)
});

const UpdateVariantSchema = z.object({
  businessId: z.string().min(1),
  sku: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  color: z.string().nullable().optional(),
  size: z.string().nullable().optional(),
  unitPriceCents: z.number().int().min(0).optional(),
  currency: z.string().min(3).max(3).optional(),
  isActive: z.boolean().optional(),
  stockOnHand: z.number().int().min(0).optional(),
  reorderPoint: z.number().int().min(0).optional()
});

const ImportProductsCsvSchema = z.object({
  businessId: z.string().min(1),
  csvText: z.string().min(1).max(500_000)
});

export async function adminProductRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: requireRoles(["OWNER", "ADMIN", "AGENT", "VIEWER"], "You cannot view catalog data.") }, async (request) => {
    const query = BusinessQuerySchema.parse(request.query);
    return catalogService.listProducts(query.businessId);
  });

  app.post("/", { preHandler: requireRoles(["OWNER", "ADMIN"], "You cannot manage catalog data.") }, async (request, reply) => {
    const body = CreateProductSchema.parse(request.body);
    try {
      const product = await catalogService.createProduct(body);
      return reply.code(201).send(product);
    } catch (error) {
      return sendCatalogError(reply, error);
    }
  });

  app.post("/import-csv", { preHandler: requireRoles(["OWNER", "ADMIN"], "You cannot import catalog data.") }, async (request, reply) => {
    const body = ImportProductsCsvSchema.parse(request.body);
    try {
      return await catalogService.importProductsCsv(body);
    } catch (error) {
      return reply.badRequest(error instanceof Error ? error.message : "CSV import failed.");
    }
  });

  app.patch("/:productId", { preHandler: requireRoles(["OWNER", "ADMIN"], "You cannot manage catalog data.") }, async (request, reply) => {
    const params = ProductParamsSchema.parse(request.params);
    const body = UpdateProductSchema.parse(request.body);
    try {
      return await catalogService.updateProduct({
        ...body,
        productId: params.productId
      });
    } catch (error) {
      return sendCatalogError(reply, error);
    }
  });

  app.post("/:productId/images", { preHandler: requireRoles(["OWNER", "ADMIN"], "You cannot manage product images.") }, async (request, reply) => {
    const params = ProductParamsSchema.parse(request.params);
    const query = BusinessQuerySchema.parse(request.query);
    const upload = await readImageUpload(request, reply);
    if (!upload) {
      return reply;
    }

    try {
      const storedImage = await uploadStorageService.storeImage({
        businessId: query.businessId,
        scope: "products",
        ownerId: params.productId,
        buffer: upload.buffer,
        originalFilename: upload.file.filename,
        mimeType: upload.file.mimetype
      });

      const image = await catalogService.addProductImage({
        businessId: query.businessId,
        productId: params.productId,
        storedImage,
        altText: multipartField(upload.file.fields, "altText"),
        visibleText: multipartField(upload.file.fields, "visibleText")
      });

      return reply.code(201).send(image);
    } catch (error) {
      return sendCatalogError(reply, error);
    }
  });

  app.delete("/:productId/images/:imageId", { preHandler: requireRoles(["OWNER", "ADMIN"], "You cannot manage product images.") }, async (request, reply) => {
    const params = ProductImageParamsSchema.parse(request.params);
    const query = BusinessQuerySchema.parse(request.query);

    try {
      await catalogService.deleteProductImage({
        businessId: query.businessId,
        productId: params.productId,
        imageId: params.imageId
      });

      return reply.code(204).send();
    } catch (error) {
      return sendCatalogError(reply, error);
    }
  });

  app.post("/:productId/variants", { preHandler: requireRoles(["OWNER", "ADMIN"], "You cannot manage variants.") }, async (request, reply) => {
    const params = ProductParamsSchema.parse(request.params);
    const body = CreateVariantSchema.parse(request.body);
    try {
      const variant = await catalogService.createVariant({
        ...body,
        productId: params.productId
      });
      return reply.code(201).send(variant);
    } catch (error) {
      return sendCatalogError(reply, error);
    }
  });

  app.patch("/:productId/variants/:variantId", { preHandler: requireRoles(["OWNER", "ADMIN"], "You cannot manage variants.") }, async (request, reply) => {
    const params = VariantParamsSchema.parse(request.params);
    const body = UpdateVariantSchema.parse(request.body);
    try {
      return await catalogService.updateVariant({
        ...body,
        productId: params.productId,
        variantId: params.variantId
      });
    } catch (error) {
      return sendCatalogError(reply, error);
    }
  });

  app.post("/search", { preHandler: requireRoles(["OWNER", "ADMIN", "AGENT", "VIEWER"], "You cannot search catalog data.") }, async (request) => {
    const body = z.object({
      businessId: z.string().min(1),
      query: z.string().min(1),
      limit: z.number().int().min(1).max(20).default(10)
    }).parse(request.body);

    return catalogService.searchProducts(body);
  });
}

function sendCatalogError(reply: FastifyReply, error: unknown) {
  const tenantLimitResponse = sendTenantLimitError(reply, error);
  if (tenantLimitResponse) {
    return tenantLimitResponse;
  }

  if (error instanceof Error && ["PRODUCT_NOT_FOUND", "VARIANT_NOT_FOUND", "PRODUCT_IMAGE_NOT_FOUND"].includes(error.message)) {
    return reply.notFound(error.message);
  }

  if (error instanceof Error && error.message.includes("Unique constraint failed")) {
    return reply.badRequest("SKU already exists for this business.");
  }

  return reply.badRequest(error instanceof Error ? error.message : "Catalog operation failed.");
}
