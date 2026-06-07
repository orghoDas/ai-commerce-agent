import type { FastifyInstance } from "fastify";

export async function webhookRoutes(app: FastifyInstance) {
  app.post("/whatsapp", async () => ({
    ok: true,
    message: "WhatsApp webhook placeholder. Add provider verification, idempotency, and message routing here."
  }));

  app.post("/stripe", async () => ({
    ok: true,
    message: "Stripe webhook placeholder. Verify signatures before processing billing updates."
  }));
}

