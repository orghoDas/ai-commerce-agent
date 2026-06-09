import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { requireAuthenticatedUser } from "./config/auth.js";
import { env } from "./config/env.js";
import { authRoutes } from "./routes/auth.route.js";
import { healthRoutes } from "./routes/health.route.js";
import { customerChatRoutes } from "./routes/customerChat.route.js";
import { adminBillingRoutes } from "./routes/adminBilling.route.js";
import { adminAuditLogRoutes } from "./routes/adminAuditLogs.route.js";
import { adminConversationRoutes } from "./routes/adminConversations.route.js";
import { adminProductRoutes } from "./routes/adminProducts.route.js";
import { adminOrderRoutes } from "./routes/adminOrders.route.js";
import { adminReportRoutes } from "./routes/adminReports.route.js";
import { uploadRoutes } from "./routes/upload.route.js";
import { uploadStorageService } from "./services/uploadStorage.service.js";
import { webhookRoutes } from "./webhooks/index.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info"
    }
  });

  const allowedOrigins = env.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean);
  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin is not allowed."), false);
    }
  });
  await app.register(rateLimit, {
    global: false,
    max: env.AUTH_RATE_LIMIT_MAX,
    timeWindow: env.AUTH_RATE_LIMIT_WINDOW
  });
  await app.register(multipart, {
    limits: {
      files: 1,
      fileSize: env.UPLOAD_MAX_BYTES
    }
  });
  await app.register(sensible);
  await uploadStorageService.ensureRoot();
  await app.register(fastifyStatic, {
    root: uploadStorageService.uploadRoot,
    prefix: "/uploads/"
  });

  await app.register(healthRoutes, { prefix: "/health" });
  await app.register(authRoutes, { prefix: "/v1/auth" });
  await app.register(uploadRoutes, { prefix: "/v1/uploads" });
  await app.register(customerChatRoutes, { prefix: "/v1/chat" });
  await app.register(
    async (adminApp) => {
      adminApp.addHook("preHandler", requireAuthenticatedUser);
      await adminApp.register(adminConversationRoutes, { prefix: "/conversations" });
      await adminApp.register(adminProductRoutes, { prefix: "/products" });
      await adminApp.register(adminOrderRoutes, { prefix: "/orders" });
      await adminApp.register(adminReportRoutes, { prefix: "/reports" });
      await adminApp.register(adminBillingRoutes, { prefix: "/billing" });
      await adminApp.register(adminAuditLogRoutes, { prefix: "/audit-logs" });
    },
    { prefix: "/v1/admin" }
  );
  await app.register(webhookRoutes, { prefix: "/v1/webhooks" });

  return app;
}
