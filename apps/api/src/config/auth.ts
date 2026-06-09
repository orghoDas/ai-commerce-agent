import type { FastifyReply, FastifyRequest } from "fastify";
import { authService } from "../services/auth.service.js";

export type AuthenticatedUser = {
  userId: string;
  sessionId: string;
  businessId: string;
  role: "OWNER" | "ADMIN" | "AGENT" | "VIEWER";
  email: string;
  name: string | null;
};

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

export async function requireAuthenticatedUser(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

  if (!token) {
    return reply.unauthorized("Authentication is required.");
  }

  const user = await authService.verifySessionToken(token);
  if (!user) {
    return reply.unauthorized("Session is invalid or expired.");
  }

  request.user = user;

  const requestedBusinessId = businessIdFromRequest(request);
  if (requestedBusinessId && requestedBusinessId !== user.businessId) {
    return reply.forbidden("You cannot access that business.");
  }
}

export function assertCanWriteCatalog(user: AuthenticatedUser) {
  if (!["OWNER", "ADMIN"].includes(user.role)) {
    throw new Error("FORBIDDEN");
  }
}

export function assertCanManageUsers(user: AuthenticatedUser) {
  if (!["OWNER", "ADMIN"].includes(user.role)) {
    throw new Error("FORBIDDEN");
  }
}

export function assertCanViewReports(user: AuthenticatedUser) {
  if (!["OWNER", "ADMIN", "VIEWER"].includes(user.role)) {
    throw new Error("FORBIDDEN");
  }
}

export function requireRoles(roles: AuthenticatedUser["role"][], message = "You do not have permission for this action.") {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    if (!user) {
      return reply.unauthorized("Authentication is required.");
    }

    if (!roles.includes(user.role)) {
      return reply.forbidden(message);
    }
  };
}

function businessIdFromRequest(request: FastifyRequest) {
  const query = request.query as { businessId?: unknown } | undefined;
  const body = request.body as { businessId?: unknown } | undefined;
  const queryBusinessId = typeof query?.businessId === "string" ? query.businessId : undefined;
  const bodyBusinessId = typeof body?.businessId === "string" ? body.businessId : undefined;
  return queryBusinessId ?? bodyBusinessId;
}
