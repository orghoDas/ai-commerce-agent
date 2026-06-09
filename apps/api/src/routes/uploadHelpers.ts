import type { MultipartFields, MultipartFile } from "@fastify/multipart";
import type { FastifyReply, FastifyRequest } from "fastify";

export async function readImageUpload(request: FastifyRequest, reply: FastifyReply) {
  const file = await request.file();
  if (!file) {
    reply.badRequest("Image file is required.");
    return null;
  }

  if (!file.mimetype.startsWith("image/")) {
    reply.badRequest("Only image uploads are supported.");
    return null;
  }

  try {
    return {
      file,
      buffer: await file.toBuffer()
    };
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("file too large")) {
      reply.payloadTooLarge("Image file is too large.");
      return null;
    }
    throw error;
  }
}

export function multipartField(fields: MultipartFields, name: string) {
  const value = fields[name];
  const field = Array.isArray(value) ? value[0] : value;
  if (!field || isMultipartFile(field)) {
    return undefined;
  }

  return typeof field.value === "string" ? field.value.trim() : undefined;
}

function isMultipartFile(value: MultipartFields[string]): value is MultipartFile {
  return Boolean(value && !Array.isArray(value) && value.type === "file");
}
