import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";
import { imageAnalysisService, type ImageSignature } from "./imageAnalysis.service.js";

type StoreImageInput = {
  businessId: string;
  scope: "products" | "customer";
  ownerId?: string;
  buffer: Buffer;
  originalFilename?: string;
  mimeType?: string;
};

export type StoredImage = ImageSignature & {
  url: string;
  storageKey: string;
  mimeType: "image/webp";
  sizeBytes: number;
  width: number;
  height: number;
};

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const uploadRoot = isAbsolute(env.UPLOAD_STORAGE_DIR)
  ? env.UPLOAD_STORAGE_DIR
  : resolve(repoRoot, env.UPLOAD_STORAGE_DIR);

export const uploadStorageService = {
  uploadRoot,

  async ensureRoot() {
    await mkdir(uploadRoot, { recursive: true });
  },

  async storeImage(input: StoreImageInput): Promise<StoredImage> {
    validateImageUpload(input);
    const analyzed = await imageAnalysisService.analyze(input.buffer);
    const storageKey = storageKeyFor(input);
    const absolutePath = pathForStorageKey(storageKey);

    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, analyzed.normalizedBuffer);

    return {
      url: publicUrlForStorageKey(storageKey),
      storageKey,
      mimeType: analyzed.mimeType,
      sizeBytes: analyzed.sizeBytes,
      width: analyzed.width,
      height: analyzed.height,
      averageColor: analyzed.averageColor,
      perceptualHash: analyzed.perceptualHash,
      colorSignature: analyzed.colorSignature
    };
  },

  async deleteStoredFile(storageKey: string | null | undefined) {
    if (!storageKey) {
      return;
    }
    await rm(pathForStorageKey(storageKey), { force: true });
  },

  async loadImageBufferFromUrl(imageUrl: string) {
    const storageKey = storageKeyFromPublicUrl(imageUrl);
    if (storageKey) {
      return readFile(pathForStorageKey(storageKey));
    }

    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error("IMAGE_FETCH_FAILED");
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      throw new Error("UNSUPPORTED_IMAGE_TYPE");
    }

    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength > env.UPLOAD_MAX_BYTES) {
      throw new Error("IMAGE_TOO_LARGE");
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > env.UPLOAD_MAX_BYTES) {
      throw new Error("IMAGE_TOO_LARGE");
    }

    return buffer;
  }
};

function validateImageUpload(input: StoreImageInput) {
  if (input.buffer.byteLength === 0) {
    throw new Error("EMPTY_UPLOAD");
  }

  if (input.buffer.byteLength > env.UPLOAD_MAX_BYTES) {
    throw new Error("IMAGE_TOO_LARGE");
  }

  if (input.mimeType && !input.mimeType.startsWith("image/")) {
    throw new Error("UNSUPPORTED_IMAGE_TYPE");
  }
}

function storageKeyFor(input: StoreImageInput) {
  const ownerSegment = safeSegment(input.ownerId ?? "unassigned");
  const originalBase = safeSegment((input.originalFilename ?? "image").replace(extname(input.originalFilename ?? ""), ""));
  return `${safeSegment(input.businessId)}/${input.scope}/${ownerSegment}/${Date.now()}-${randomUUID()}-${originalBase}.webp`;
}

function pathForStorageKey(storageKey: string) {
  const normalizedKey = normalize(storageKey).replace(/^(\.\.(\/|\\|$))+/, "");
  const absolutePath = resolve(uploadRoot, normalizedKey);
  if (absolutePath !== uploadRoot && !absolutePath.startsWith(`${uploadRoot}${sep}`)) {
    throw new Error("INVALID_STORAGE_KEY");
  }
  return absolutePath;
}

function publicUrlForStorageKey(storageKey: string) {
  return new URL(`/uploads/${storageKey}`, env.APP_BASE_URL).toString();
}

function storageKeyFromPublicUrl(imageUrl: string) {
  let url: URL;
  try {
    url = new URL(imageUrl, env.APP_BASE_URL);
  } catch {
    return null;
  }

  if (!url.pathname.startsWith("/uploads/")) {
    return null;
  }

  return decodeURIComponent(url.pathname.slice("/uploads/".length));
}

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 80) || "file";
}
