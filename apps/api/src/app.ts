import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { healthRoutes } from "./routes/health.route.js";
import { customerChatRoutes } from "./routes/customerChat.route.js";
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
  await app.register(customerChatRoutes, { prefix: "/v1/chat" });
  await app.register(adminProductRoutes, { prefix: "/v1/admin/products" });
  await app.register(adminOrderRoutes, { prefix: "/v1/admin/orders" });
  await app.register(adminReportRoutes, { prefix: "/v1/admin/reports" });
  await app.register(webhookRoutes, { prefix: "/v1/webhooks" });

  return app;
}

