import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  JWT_SECRET: z.string().min(16).default("replace_me_with_long_random_secret"),
  REPORT_TIMEZONE_DEFAULT: z.string().default("UTC")
});

export const env = EnvSchema.parse(process.env);

