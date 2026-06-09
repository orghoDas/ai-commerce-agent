import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { uploadStorageService } from "../services/uploadStorage.service.js";
import { readImageUpload } from "./uploadHelpers.js";

const UploadImageQuerySchema = z.object({
  businessId: z.string().min(1)
});

export async function uploadRoutes(app: FastifyInstance) {
  app.post("/images", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
    const query = UploadImageQuerySchema.parse(request.query);
    const upload = await readImageUpload(request, reply);
    if (!upload) {
      return reply;
    }

    try {
      const storedImage = await uploadStorageService.storeImage({
        businessId: query.businessId,
        scope: "customer",
        buffer: upload.buffer,
        originalFilename: upload.file.filename,
        mimeType: upload.file.mimetype
      });

      return reply.code(201).send(storedImage);
    } catch (error) {
      return reply.badRequest(error instanceof Error ? error.message : "Image upload failed.");
    }
  });
}
