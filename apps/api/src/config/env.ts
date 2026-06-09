import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { z } from "zod";

config({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)) });

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_BASE_URL: z.string().url().default("http://localhost:4000"),
  ADMIN_WEB_URL: z.string().url().default("http://localhost:3000"),
  CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:3001,http://localhost:5173,http://localhost:5174"),
  DATABASE_URL: z.string().min(1),
  AI_PROVIDER: z.enum(["deterministic", "openai"]).default("deterministic"),
  OPENAI_API_KEY: z.string().default("replace_me"),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  SESSION_SECRET: z.string().min(32).default("replace_me_with_a_32_char_random_secret"),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  INVITE_TTL_DAYS: z.coerce.number().int().positive().default(7),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(8),
  AUTH_RATE_LIMIT_WINDOW: z.string().default("1 minute"),
  UPLOAD_STORAGE_DIR: z.string().default("uploads"),
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(5_000_000),
  REPORT_TIMEZONE_DEFAULT: z.string().default("UTC")
});

export const env = EnvSchema.parse(process.env);
