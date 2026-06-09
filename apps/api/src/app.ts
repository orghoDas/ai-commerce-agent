import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { requireAuthenticatedUser } from "./config/auth.js";
import { authRoutes } from "./routes/auth.route.js";
import { healthRoutes } from "./routes/health.route.js";
import { customerChatRoutes } from "./routes/customerChat.route.js";
import { adminBillingRoutes } from "./routes/adminBilling.route.js";
import { adminConversationRoutes } from "./routes/adminConversations.route.js";
import { adminProductRoutes } from "./routes/adminProducts.route.js";
import { adminOrderRoutes } from "./routes/adminOrders.route.js";
import { adminReportRoutes } from "./routes/adminReports.route.js";
import { webhookRoutes } from "./webhooks/index.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info"
    }
  });

  await app.register(cors, { origin: true });
  await app.register(sensible);

  await app.register(healthRoutes, { prefix: "/health" });
  await app.register(authRoutes, { prefix: "/v1/auth" });
  await app.register(customerChatRoutes, { prefix: "/v1/chat" });
  await app.register(
    async (adminApp) => {
      adminApp.addHook("preHandler", requireAuthenticatedUser);
      await adminApp.register(adminConversationRoutes, { prefix: "/conversations" });
      await adminApp.register(adminProductRoutes, { prefix: "/products" });
      await adminApp.register(adminOrderRoutes, { prefix: "/orders" });
      await adminApp.register(adminReportRoutes, { prefix: "/reports" });
      await adminApp.register(adminBillingRoutes, { prefix: "/billing" });
    },
    { prefix: "/v1/admin" }
  );
  await app.register(webhookRoutes, { prefix: "/v1/webhooks" });

  return app;
}
