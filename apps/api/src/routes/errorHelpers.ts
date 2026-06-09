import type { FastifyReply } from "fastify";
import { TenantLimitError } from "../services/billing.service.js";

export function sendTenantLimitError(reply: FastifyReply, error: unknown) {
  if (!(error instanceof TenantLimitError)) {
    return null;
  }

  return reply.code(error.statusCode).send({
    errorCode: error.code,
    message: error.message,
    limitKind: error.limitKind,
    current: error.current,
    limit: error.limit
  });
}
