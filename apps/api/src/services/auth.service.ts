import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import type { UserRole } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";

const TOKEN_TTL_SECONDS = 60 * 60 * 12;
const PASSWORD_ITERATIONS = 120_000;
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_DIGEST = "sha256";

export type SessionUser = {
  userId: string;
  businessId: string;
  email: string;
  name: string | null;
  role: UserRole;
};

type SessionPayload = SessionUser & {
  exp: number;
};

export const authService = {
  hashPassword(password: string) {
    const salt = randomBytes(16).toString("base64url");
    const hash = pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST).toString("base64url");
    return `pbkdf2:${PASSWORD_ITERATIONS}:${salt}:${hash}`;
  },

  verifyPassword(password: string, passwordHash: string | null) {
    if (!passwordHash) {
      return false;
    }

    const [scheme, iterationsRaw, salt, expectedHash] = passwordHash.split(":");
    if (scheme !== "pbkdf2" || !iterationsRaw || !salt || !expectedHash) {
      return false;
    }

    const iterations = Number(iterationsRaw);
    if (!Number.isInteger(iterations) || iterations <= 0) {
      return false;
    }

    const actualHash = pbkdf2Sync(password, salt, iterations, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST);
    const expected = Buffer.from(expectedHash, "base64url");
    return expected.length === actualHash.length && timingSafeEqual(expected, actualHash);
  },

  async login(input: { email: string; password: string; businessSlug?: string }) {
    const user = await prisma.user.findFirst({
      where: {
        email: input.email.toLowerCase(),
        ...(input.businessSlug ? { business: { slug: input.businessSlug } } : {})
      },
      include: {
        business: true
      }
    });

    if (!user || !this.verifyPassword(input.password, user.passwordHash)) {
      return {
        ok: false as const,
        errorCode: "INVALID_LOGIN",
        message: "Invalid email or password."
      };
    }

    const sessionUser: SessionUser = {
      userId: user.id,
      businessId: user.businessId,
      email: user.email,
      name: user.name,
      role: user.role
    };

    return {
      ok: true as const,
      data: {
        token: signSessionToken(sessionUser),
        user: sessionUser,
        business: {
          id: user.business.id,
          name: user.business.name,
          slug: user.business.slug,
          timezone: user.business.timezone,
          defaultCurrency: user.business.defaultCurrency
        }
      }
    };
  },

  verifySessionToken(token: string): SessionUser | null {
    const [payloadRaw, signature] = token.split(".");
    if (!payloadRaw || !signature) {
      return null;
    }

    const expectedSignature = sign(payloadRaw);
    const actual = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return null;
    }

    try {
      const payload = JSON.parse(Buffer.from(payloadRaw, "base64url").toString("utf8")) as SessionPayload;
      if (!payload.userId || !payload.businessId || !payload.email || !payload.role || payload.exp < Math.floor(Date.now() / 1000)) {
        return null;
      }

      return {
        userId: payload.userId,
        businessId: payload.businessId,
        email: payload.email,
        name: payload.name,
        role: payload.role
      };
    } catch {
      return null;
    }
  }
};

function signSessionToken(user: SessionUser) {
  const payload: SessionPayload = {
    ...user,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
  };
  const payloadRaw = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadRaw}.${sign(payloadRaw)}`;
}

function sign(payloadRaw: string) {
  return createHmac("sha256", env.JWT_SECRET).update(payloadRaw).digest("base64url");
}
