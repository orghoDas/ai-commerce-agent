import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import type { UserRole } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { billingService } from "./billing.service.js";

const PASSWORD_ITERATIONS = 120_000;
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_DIGEST = "sha256";
const PASSWORD_MIN_LENGTH = 12;
const SESSION_TOKEN_PREFIX = "sess";
const RESET_TOKEN_PREFIX = "reset";
const INVITE_TOKEN_PREFIX = "invite";
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export type SessionUser = {
  userId: string;
  sessionId: string;
  businessId: string;
  email: string;
  name: string | null;
  role: UserRole;
};

type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

type LoginInput = RequestContext & {
  email: string;
  password: string;
  businessSlug?: string;
};

type CreateInviteInput = {
  businessId: string;
  email: string;
  role: Exclude<UserRole, "OWNER">;
  name?: string;
  invitedByUserId: string;
};

type AcceptInviteInput = RequestContext & {
  token: string;
  password: string;
  name?: string;
};

export const authService = {
  hashPassword,
  verifyPassword,

  async login(input: LoginInput) {
    const user = await prisma.user.findFirst({
      where: {
        email: normalizeEmail(input.email),
        ...(input.businessSlug ? { business: { slug: input.businessSlug } } : {})
      },
      include: {
        business: true
      }
    });

    if (!user || !verifyPassword(input.password, user.passwordHash)) {
      return invalidLogin();
    }

    const session = await createSession({
      user,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent
    });

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() }
      }),
      prisma.auditLog.create({
        data: {
          businessId: user.businessId,
          actorType: "ADMIN",
          actorId: user.id,
          action: "AUTH_LOGIN",
          entityType: "Session",
          entityId: session.sessionId,
          metadata: { ipAddress: input.ipAddress }
        }
      })
    ]);

    return {
      ok: true as const,
      data: {
        token: session.token,
        expiresAt: session.expiresAt,
        user: sessionUserFromRecord(user, session.sessionId),
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

  async verifySessionToken(token: string): Promise<SessionUser | null> {
    const session = await prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true }
    });

    if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user.passwordHash) {
      return null;
    }

    if (Date.now() - session.lastSeenAt.getTime() > SESSION_TOUCH_INTERVAL_MS) {
      await prisma.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date() }
      });
    }

    return sessionUserFromRecord(session.user, session.id);
  },

  async logout(token: string | undefined, actor?: SessionUser) {
    if (!token) {
      return;
    }

    const session = await prisma.session.updateMany({
      where: {
        tokenHash: hashToken(token),
        revokedAt: null
      },
      data: { revokedAt: new Date() }
    });

    if (session.count > 0 && actor) {
      await prisma.auditLog.create({
        data: {
          businessId: actor.businessId,
          actorType: "ADMIN",
          actorId: actor.userId,
          action: "AUTH_LOGOUT",
          entityType: "Session",
          entityId: actor.sessionId
        }
      });
    }
  },

  async requestPasswordReset(input: RequestContext & { email: string; businessSlug?: string }) {
    const user = await prisma.user.findFirst({
      where: {
        email: normalizeEmail(input.email),
        ...(input.businessSlug ? { business: { slug: input.businessSlug } } : {})
      },
      include: { business: true }
    });

    if (!user || !user.passwordHash) {
      return passwordResetRequestAccepted();
    }

    const token = secureToken(RESET_TOKEN_PREFIX);
    const expiresAt = minutesFromNow(env.PASSWORD_RESET_TTL_MINUTES);

    await prisma.$transaction([
      prisma.passwordResetToken.updateMany({
        where: {
          businessId: user.businessId,
          userId: user.id,
          usedAt: null,
          expiresAt: { gt: new Date() }
        },
        data: { usedAt: new Date() }
      }),
      prisma.passwordResetToken.create({
        data: {
          businessId: user.businessId,
          userId: user.id,
          tokenHash: hashToken(token),
          requestedIp: input.ipAddress,
          expiresAt
        }
      }),
      prisma.auditLog.create({
        data: {
          businessId: user.businessId,
          actorType: "SYSTEM",
          actorId: user.id,
          action: "PASSWORD_RESET_REQUESTED",
          entityType: "User",
          entityId: user.id,
          metadata: { ipAddress: input.ipAddress }
        }
      })
    ]);

    return passwordResetRequestAccepted({
      resetUrl: buildAdminUrl({ resetToken: token }),
      expiresAt
    });
  },

  async resetPassword(input: { token: string; password: string }) {
    const passwordError = validatePassword(input.password);
    if (passwordError) {
      return {
        ok: false as const,
        errorCode: "WEAK_PASSWORD",
        message: passwordError
      };
    }

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(input.token) },
      include: { user: true }
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= new Date() || !resetToken.user) {
      return {
        ok: false as const,
        errorCode: "INVALID_RESET_TOKEN",
        message: "Password reset link is invalid or expired."
      };
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: {
          passwordHash: hashPassword(input.password),
          emailVerifiedAt: resetToken.user.emailVerifiedAt ?? new Date()
        }
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() }
      }),
      prisma.session.updateMany({
        where: {
          userId: resetToken.userId,
          revokedAt: null
        },
        data: { revokedAt: new Date() }
      }),
      prisma.auditLog.create({
        data: {
          businessId: resetToken.businessId,
          actorType: "SYSTEM",
          actorId: resetToken.userId,
          action: "PASSWORD_RESET_COMPLETED",
          entityType: "User",
          entityId: resetToken.userId
        }
      })
    ]);

    return { ok: true as const };
  },

  async listInvites(businessId: string) {
    return prisma.userInvite.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        invitedBy: {
          select: { id: true, email: true, name: true }
        },
        acceptedBy: {
          select: { id: true, email: true, name: true }
        }
      }
    });
  },

  async createInvite(input: CreateInviteInput) {
    const email = normalizeEmail(input.email);
    const existingUser = await prisma.user.findUnique({
      where: {
        businessId_email: {
          businessId: input.businessId,
          email
        }
      }
    });

    if (existingUser) {
      return {
        ok: false as const,
        errorCode: "USER_ALREADY_EXISTS",
        message: "A user with that email already belongs to this business."
      };
    }

    await billingService.assertCanCreateInvite({
      businessId: input.businessId,
      email
    });

    const token = secureToken(INVITE_TOKEN_PREFIX);
    const invite = await prisma.$transaction(async (tx) => {
      await tx.userInvite.updateMany({
        where: {
          businessId: input.businessId,
          email,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() }
        },
        data: { revokedAt: new Date() }
      });

      const createdInvite = await tx.userInvite.create({
        data: {
          businessId: input.businessId,
          email,
          name: input.name,
          role: input.role,
          tokenHash: hashToken(token),
          invitedByUserId: input.invitedByUserId,
          expiresAt: daysFromNow(env.INVITE_TTL_DAYS)
        }
      });

      await tx.auditLog.create({
        data: {
          businessId: input.businessId,
          actorType: "ADMIN",
          actorId: input.invitedByUserId,
          action: "USER_INVITED",
          entityType: "UserInvite",
          entityId: createdInvite.id,
          metadata: { email, role: input.role }
        }
      });

      return createdInvite;
    });

    return {
      ok: true as const,
      data: {
        ...invite,
        acceptUrl: buildAdminUrl({ inviteToken: token })
      }
    };
  },

  async revokeInvite(input: { businessId: string; inviteId: string }) {
    const invite = await prisma.userInvite.updateMany({
      where: {
        id: input.inviteId,
        businessId: input.businessId,
        acceptedAt: null,
        revokedAt: null
      },
      data: { revokedAt: new Date() }
    });

    return invite.count > 0;
  },

  async getInvite(token: string) {
    const invite = await prisma.userInvite.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        }
      }
    });

    if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt <= new Date()) {
      return null;
    }

    return {
      id: invite.id,
      email: invite.email,
      name: invite.name,
      role: invite.role,
      expiresAt: invite.expiresAt,
      business: invite.business
    };
  },

  async acceptInvite(input: AcceptInviteInput) {
    const passwordError = validatePassword(input.password);
    if (passwordError) {
      return {
        ok: false as const,
        errorCode: "WEAK_PASSWORD",
        message: passwordError
      };
    }

    const invite = await prisma.userInvite.findUnique({
      where: { tokenHash: hashToken(input.token) },
      include: { business: true }
    });

    if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt <= new Date()) {
      return {
        ok: false as const,
        errorCode: "INVALID_INVITE",
        message: "Invite link is invalid or expired."
      };
    }

    const existingUser = await prisma.user.findUnique({
      where: {
        businessId_email: {
          businessId: invite.businessId,
          email: invite.email
        }
      }
    });

    if (existingUser?.passwordHash) {
      return {
        ok: false as const,
        errorCode: "USER_ALREADY_EXISTS",
        message: "A user with that email already exists."
      };
    }

    if (!existingUser?.passwordHash) {
      await billingService.assertCanAcceptInvite(invite.businessId);
    }

    const result = await prisma.$transaction(async (tx) => {
      const user = existingUser
        ? await tx.user.update({
            where: { id: existingUser.id },
            data: {
              name: input.name?.trim() || invite.name || existingUser.name,
              role: invite.role,
              passwordHash: hashPassword(input.password),
              emailVerifiedAt: new Date()
            }
          })
        : await tx.user.create({
            data: {
              businessId: invite.businessId,
              email: invite.email,
              name: input.name?.trim() || invite.name,
              role: invite.role,
              passwordHash: hashPassword(input.password),
              emailVerifiedAt: new Date()
            }
          });

      await tx.userInvite.update({
        where: { id: invite.id },
        data: {
          acceptedAt: new Date(),
          acceptedByUserId: user.id
        }
      });

      await tx.auditLog.create({
        data: {
          businessId: invite.businessId,
          actorType: "ADMIN",
          actorId: user.id,
          action: "USER_INVITE_ACCEPTED",
          entityType: "User",
          entityId: user.id
        }
      });

      return user;
    });

    const session = await createSession({
      user: result,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent
    });

    return {
      ok: true as const,
      data: {
        token: session.token,
        expiresAt: session.expiresAt,
        user: sessionUserFromRecord(result, session.sessionId),
        business: {
          id: invite.business.id,
          name: invite.business.name,
          slug: invite.business.slug,
          timezone: invite.business.timezone,
          defaultCurrency: invite.business.defaultCurrency
        }
      }
    };
  }
};

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const hash = pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST).toString("base64url");
  return `pbkdf2:${PASSWORD_ITERATIONS}:${salt}:${hash}`;
}

function verifyPassword(password: string, passwordHash: string | null) {
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
}

async function createSession(input: {
  user: {
    id: string;
    businessId: string;
    email: string;
    name: string | null;
    role: UserRole;
  };
  ipAddress?: string;
  userAgent?: string;
}) {
  const token = secureToken(SESSION_TOKEN_PREFIX);
  const expiresAt = hoursFromNow(env.SESSION_TTL_HOURS);
  const session = await prisma.session.create({
    data: {
      businessId: input.user.businessId,
      userId: input.user.id,
      tokenHash: hashToken(token),
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      expiresAt
    }
  });

  return {
    token,
    sessionId: session.id,
    expiresAt
  };
}

function sessionUserFromRecord(
  user: {
    id: string;
    businessId: string;
    email: string;
    name: string | null;
    role: UserRole;
  },
  sessionId: string
): SessionUser {
  return {
    userId: user.id,
    sessionId,
    businessId: user.businessId,
    email: user.email,
    name: user.name,
    role: user.role
  };
}

function validatePassword(password: string) {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }

  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return "Password must include uppercase, lowercase, and a number.";
  }

  return null;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function secureToken(prefix: string) {
  return `${prefix}_${randomBytes(32).toString("base64url")}`;
}

function hashToken(token: string) {
  return createHmac("sha256", env.SESSION_SECRET).update(token).digest("base64url");
}

function buildAdminUrl(params: Record<string, string>) {
  const url = new URL(env.ADMIN_WEB_URL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function hoursFromNow(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function minutesFromNow(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

function daysFromNow(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function invalidLogin() {
  return {
    ok: false as const,
    errorCode: "INVALID_LOGIN",
    message: "Invalid email or password."
  };
}

function passwordResetRequestAccepted(data?: { resetUrl: string; expiresAt: Date }) {
  return {
    ok: true as const,
    data: {
      message: "If the account exists, password reset instructions will be sent shortly.",
      ...(env.NODE_ENV === "production" ? {} : data)
    }
  };
}
