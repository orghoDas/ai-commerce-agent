import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { assertCanManageUsers, requireAuthenticatedUser } from "../config/auth.js";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { authService } from "../services/auth.service.js";
import { sendTenantLimitError } from "./errorHelpers.js";

const authRateLimit = {
  rateLimit: {
    max: env.AUTH_RATE_LIMIT_MAX,
    timeWindow: env.AUTH_RATE_LIMIT_WINDOW
  }
};

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  businessSlug: z.string().min(1).optional()
});

const PasswordResetRequestSchema = z.object({
  email: z.string().email(),
  businessSlug: z.string().min(1).optional()
});

const PasswordResetConfirmSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(12)
});

const BusinessQuerySchema = z.object({
  businessId: z.string().min(1)
});

const InviteParamsSchema = z.object({
  inviteId: z.string().min(1)
});

const InviteTokenParamsSchema = z.object({
  token: z.string().min(1)
});

const CreateInviteSchema = z.object({
  businessId: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1).optional(),
  role: z.enum(["ADMIN", "AGENT", "VIEWER"]).default("AGENT")
});

const AcceptInviteSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(1).optional(),
  password: z.string().min(12)
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/login", { config: authRateLimit }, async (request, reply) => {
    const body = LoginSchema.parse(request.body);
    const result = await authService.login({
      ...body,
      ...requestContext(request)
    });

    if (!result.ok) {
      return reply.unauthorized(result.message);
    }

    return result.data;
  });

  app.post("/logout", { preHandler: requireAuthenticatedUser }, async (request, reply) => {
    await authService.logout(bearerTokenFromRequest(request), request.user);
    return reply.code(204).send();
  });

  app.get("/me", { preHandler: requireAuthenticatedUser }, async (request) => {
    const business = await prisma.business.findUnique({
      where: { id: request.user!.businessId },
      select: {
        id: true,
        name: true,
        slug: true,
        timezone: true,
        defaultCurrency: true
      }
    });

    return {
      user: request.user,
      business
    };
  });

  app.post("/password-reset/request", { config: authRateLimit }, async (request) => {
    const body = PasswordResetRequestSchema.parse(request.body);
    const result = await authService.requestPasswordReset({
      ...body,
      ...requestContext(request)
    });
    return result.data;
  });

  app.post("/password-reset/confirm", { config: authRateLimit }, async (request, reply) => {
    const body = PasswordResetConfirmSchema.parse(request.body);
    const result = await authService.resetPassword(body);

    if (!result.ok) {
      return reply.badRequest(result.message);
    }

    return { ok: true };
  });

  app.get("/invites", { preHandler: requireAuthenticatedUser }, async (request, reply) => {
    const query = BusinessQuerySchema.parse(request.query);
    try {
      assertCanManageUsers(request.user!);
      return authService.listInvites(query.businessId);
    } catch (error) {
      if (error instanceof Error && error.message === "FORBIDDEN") {
        return reply.forbidden("You cannot manage users for this business.");
      }
      const tenantLimitResponse = sendTenantLimitError(reply, error);
      if (tenantLimitResponse) {
        return tenantLimitResponse;
      }
      throw error;
    }
  });

  app.post("/invites", { preHandler: requireAuthenticatedUser }, async (request, reply) => {
    const body = CreateInviteSchema.parse(request.body);
    try {
      assertCanManageUsers(request.user!);
      const result = await authService.createInvite({
        ...body,
        invitedByUserId: request.user!.userId
      });

      if (!result.ok) {
        return reply.badRequest(result.message);
      }

      return reply.code(201).send(result.data);
    } catch (error) {
      if (error instanceof Error && error.message === "FORBIDDEN") {
        return reply.forbidden("You cannot manage users for this business.");
      }
      const tenantLimitResponse = sendTenantLimitError(reply, error);
      if (tenantLimitResponse) {
        return tenantLimitResponse;
      }
      throw error;
    }
  });

  app.delete("/invites/:inviteId", { preHandler: requireAuthenticatedUser }, async (request, reply) => {
    const params = InviteParamsSchema.parse(request.params);
    const query = BusinessQuerySchema.parse(request.query);
    try {
      assertCanManageUsers(request.user!);
      const revoked = await authService.revokeInvite({
        businessId: query.businessId,
        inviteId: params.inviteId
      });

      if (!revoked) {
        return reply.notFound("Invite was not found.");
      }

      return reply.code(204).send();
    } catch (error) {
      if (error instanceof Error && error.message === "FORBIDDEN") {
        return reply.forbidden("You cannot manage users for this business.");
      }
      throw error;
    }
  });

  app.get("/invites/:token", { config: authRateLimit }, async (request, reply) => {
    const params = InviteTokenParamsSchema.parse(request.params);
    const invite = await authService.getInvite(params.token);

    if (!invite) {
      return reply.notFound("Invite was not found or has expired.");
    }

    return invite;
  });

  app.post("/invites/accept", { config: authRateLimit }, async (request, reply) => {
    const body = AcceptInviteSchema.parse(request.body);
    const result = await authService
      .acceptInvite({
        ...body,
        ...requestContext(request)
      })
      .catch((error) => {
        const tenantLimitResponse = sendTenantLimitError(reply, error);
        if (tenantLimitResponse) {
          return null;
        }
        throw error;
      });

    if (!result) {
      return reply;
    }

    if (!result.ok) {
      return reply.badRequest(result.message);
    }

    return result.data;
  });
}

function requestContext(request: FastifyRequest) {
  const userAgent = request.headers["user-agent"];
  return {
    ipAddress: request.ip,
    userAgent: Array.isArray(userAgent) ? userAgent.join(" ") : userAgent
  };
}

function bearerTokenFromRequest(request: FastifyRequest) {
  const authHeader = request.headers.authorization;
  return authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : undefined;
}
