import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authService } from "../services/auth.service.js";
import { requireAuthenticatedUser } from "../config/auth.js";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  businessSlug: z.string().min(1).optional()
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/login", async (request, reply) => {
    const body = LoginSchema.parse(request.body);
    const result = await authService.login(body);

    if (!result.ok) {
      return reply.unauthorized(result.message);
    }

    return result.data;
  });

  app.get("/me", { preHandler: requireAuthenticatedUser }, async (request) => {
    return {
      user: request.user
    };
  });
}
