import { createHash } from "node:crypto";

export function makeIdempotencyKey(parts: Array<string | number | undefined | null>) {
  return createHash("sha256")
    .update(parts.filter((part) => part !== undefined && part !== null).join(":"))
    .digest("hex");
}

