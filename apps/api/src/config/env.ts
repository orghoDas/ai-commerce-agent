import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { z } from "zod";

config({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)) });

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  AI_PROVIDER: z.enum(["deterministic", "openai"]).default("deterministic"),
  OPENAI_API_KEY: z.string().default("replace_me"),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  JWT_SECRET: z.string().min(16).default("replace_me_with_long_random_secret"),
  REPORT_TIMEZONE_DEFAULT: z.string().default("UTC")
});

export const env = EnvSchema.parse(process.env);
