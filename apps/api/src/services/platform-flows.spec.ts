import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { prisma } from "../db/prisma.js";
import { authService } from "./auth.service.js";
import { catalogService } from "./catalog.service.js";

type PlanId = "STARTER" | "GROWTH" | "SCALE";

type TestTenant = {
  business: {
    id: string;
    slug: string;
  };
  owner: {
    id: string;
    email: string;
  };
  ownerPassword: string;
};

type LoginBody = {
  token: string;
  user: {
    userId: string;
    businessId: string;
    role: string;
  };
};

const createdBusinessIds: string[] = [];

const PLAN_DEFAULTS: Record<PlanId, { seats: number; monthlyPriceCents: number }> = {
  STARTER: { seats: 1, monthlyPriceCents: 4900 },
  GROWTH: { seats: 5, monthlyPriceCents: 14900 },
  SCALE: { seats: 15, monthlyPriceCents: 49900 }
};

describe("platform flows", () => {
  afterEach(async () => {
    const ids = createdBusinessIds.splice(0);
    if (ids.length > 0) {
      await prisma.business.deleteMany({
        where: {
          id: { in: ids }
        }
      });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("imports CSV products, reports row errors, and updates existing SKUs", async () => {
    const tenant = await createTestTenant({ plan: "GROWTH" });
    const csv = [
      "name,sku,variantTitle,price,stockOnHand,reorderPoint,brand,category,tags,searchKeywords,color,size,currency,productStatus,variantActive",
      "\"Trail Mug, Large\",MUG-LG,Large,19.99,7,2,Acme,Drinkware,\"mug|camp\",\"insulated|steel\",Steel,Large,USD,ACTIVE,true",
      "Broken Row,,Default,9.99,1,1,Acme,Drinkware,,,,,USD,ACTIVE,true"
    ].join("\n");

    const result = await catalogService.importProductsCsv({
      businessId: tenant.business.id,
      csvText: csv
    });

    expect(result).toMatchObject({
      totalRows: 2,
      processedRows: 1,
      productsCreated: 1,
      variantsCreated: 1,
      inventoryUpdated: 1,
      skippedRows: 1
    });
    expect(result.errors).toEqual([
      expect.objectContaining({
        row: 3,
        message: "SKU is required."
      })
    ]);

    const variant = await prisma.productVariant.findFirstOrThrow({
      where: {
        businessId: tenant.business.id,
        sku: "MUG-LG"
      },
      include: {
        inventory: true,
        product: true
      }
    });

    expect(variant.product.name).toBe("Trail Mug, Large");
    expect(variant.unitPriceCents).toBe(1999);
    expect(variant.inventory?.stockOnHand).toBe(7);
    expect(variant.product.tags).toEqual(["mug", "camp"]);

    const updateResult = await catalogService.importProductsCsv({
      businessId: tenant.business.id,
      csvText: [
        "name,sku,variantTitle,price,stockOnHand,reorderPoint,brand,category,tags,searchKeywords,color,size,currency,productStatus,variantActive",
        "\"Trail Mug, Large\",MUG-LG,Large,24.50,11,4,Acme,Drinkware,mug,steel,Steel,Large,USD,ACTIVE,true"
      ].join("\n")
    });

    expect(updateResult).toMatchObject({
      processedRows: 1,
      productsUpdated: 1,
      variantsUpdated: 1,
      inventoryUpdated: 1,
      skippedRows: 0
    });

    const updatedVariant = await prisma.productVariant.findFirstOrThrow({
      where: {
        businessId: tenant.business.id,
        sku: "MUG-LG"
      },
      include: { inventory: true }
    });
    expect(updatedVariant.unitPriceCents).toBe(2450);
    expect(updatedVariant.inventory?.stockOnHand).toBe(11);
    expect(updatedVariant.inventory?.reorderPoint).toBe(4);

    await expect(
      prisma.auditLog.findFirstOrThrow({
        where: {
          businessId: tenant.business.id,
          entityType: "ProductImport"
        }
      })
    ).resolves.toBeTruthy();
  });

  it("covers login, session validation, password reset, invite acceptance, and invite revocation", async () => {
    const tenant = await createTestTenant({ plan: "GROWTH" });

    await withApp(async (app) => {
      const firstLogin = await login(app, tenant);
      const me = await app.inject({
        method: "GET",
        url: "/v1/auth/me",
        headers: authHeader(firstLogin.token)
      });
      expect(me.statusCode).toBe(200);
      expect((me.json() as { user: { userId: string } }).user.userId).toBe(tenant.owner.id);

      const resetRequest = await app.inject({
        method: "POST",
        url: "/v1/auth/password-reset/request",
        payload: {
          email: tenant.owner.email,
          businessSlug: tenant.business.slug
        }
      });
      expect(resetRequest.statusCode).toBe(200);
      const resetToken = tokenFromUrl(
        (resetRequest.json() as { resetUrl?: string }).resetUrl,
        "resetToken"
      );

      const resetConfirm = await app.inject({
        method: "POST",
        url: "/v1/auth/password-reset/confirm",
        payload: {
          token: resetToken,
          password: "New-password-123"
        }
      });
      expect(resetConfirm.statusCode).toBe(200);

      const oldSession = await app.inject({
        method: "GET",
        url: "/v1/auth/me",
        headers: authHeader(firstLogin.token)
      });
      expect(oldSession.statusCode).toBe(401);

      const secondLogin = await login(app, tenant, "New-password-123");
      const invite = await app.inject({
        method: "POST",
        url: "/v1/auth/invites",
        headers: authHeader(secondLogin.token),
        payload: {
          businessId: tenant.business.id,
          email: `agent-${randomUUID()}@test.local`,
          name: "Test Agent",
          role: "AGENT"
        }
      });
      expect(invite.statusCode).toBe(201);
      const inviteToken = tokenFromUrl((invite.json() as { acceptUrl?: string }).acceptUrl, "inviteToken");

      const invitePreview = await app.inject({
        method: "GET",
        url: `/v1/auth/invites/${encodeURIComponent(inviteToken)}`
      });
      expect(invitePreview.statusCode).toBe(200);
      expect((invitePreview.json() as { role: string }).role).toBe("AGENT");

      const acceptedInvite = await app.inject({
        method: "POST",
        url: "/v1/auth/invites/accept",
        payload: {
          token: inviteToken,
          name: "Accepted Agent",
          password: "Invite-password-123"
        }
      });
      expect(acceptedInvite.statusCode).toBe(200);
      expect((acceptedInvite.json() as LoginBody).user.role).toBe("AGENT");

      const revokeInvite = await app.inject({
        method: "POST",
        url: "/v1/auth/invites",
        headers: authHeader(secondLogin.token),
        payload: {
          businessId: tenant.business.id,
          email: `revoked-${randomUUID()}@test.local`,
          role: "VIEWER"
        }
      });
      expect(revokeInvite.statusCode).toBe(201);
      const revokeBody = revokeInvite.json() as { id: string; acceptUrl?: string };
      const revokeToken = tokenFromUrl(revokeBody.acceptUrl, "inviteToken");

      const deleteInvite = await app.inject({
        method: "DELETE",
        url: `/v1/auth/invites/${revokeBody.id}?businessId=${tenant.business.id}`,
        headers: authHeader(secondLogin.token)
      });
      expect(deleteInvite.statusCode).toBe(204);

      const revokedPreview = await app.inject({
        method: "GET",
        url: `/v1/auth/invites/${encodeURIComponent(revokeToken)}`
      });
      expect(revokedPreview.statusCode).toBe(404);
    });
  });

  it("pauses the bot during human takeover and exposes admin replies publicly", async () => {
    const tenant = await createTestTenant({ plan: "GROWTH" });

    await withApp(async (app) => {
      const ownerLogin = await login(app, tenant);
      const externalId = `customer-${randomUUID()}`;
      const initialChat = await app.inject({
        method: "POST",
        url: "/v1/chat",
        payload: {
          businessId: tenant.business.id,
          message: "hello",
          customer: { externalId }
        }
      });
      expect(initialChat.statusCode).toBe(200);
      const conversationId = (initialChat.json() as { conversationId: string }).conversationId;

      const handoff = await app.inject({
        method: "POST",
        url: `/v1/admin/conversations/${conversationId}/handoff`,
        headers: authHeader(ownerLogin.token),
        payload: {
          businessId: tenant.business.id,
          enabled: true,
          reason: "Needs a person"
        }
      });
      expect(handoff.statusCode).toBe(200);
      expect((handoff.json() as { handoffToHuman: boolean; status: string }).handoffToHuman).toBe(true);

      const customerFollowUp = await app.inject({
        method: "POST",
        url: "/v1/chat",
        payload: {
          businessId: tenant.business.id,
          conversationId,
          message: "Can someone help me?",
          customer: { externalId }
        }
      });
      expect(customerFollowUp.statusCode).toBe(200);
      expect(customerFollowUp.json()).toMatchObject({
        conversationId,
        mode: "human",
        state: "needs_human"
      });

      const adminReply = await app.inject({
        method: "POST",
        url: `/v1/admin/conversations/${conversationId}/messages`,
        headers: authHeader(ownerLogin.token),
        payload: {
          businessId: tenant.business.id,
          content: "A real person is here now."
        }
      });
      expect(adminReply.statusCode).toBe(201);

      const publicMessages = await app.inject({
        method: "GET",
        url: `/v1/chat/${conversationId}/messages?businessId=${tenant.business.id}`
      });
      expect(publicMessages.statusCode).toBe(200);
      expect((publicMessages.json() as { messages: Array<{ role: string; content: string }> }).messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: "ADMIN",
            content: "A real person is here now."
          })
        ])
      );

      const closeConversation = await app.inject({
        method: "PATCH",
        url: `/v1/admin/conversations/${conversationId}/status`,
        headers: authHeader(ownerLogin.token),
        payload: {
          businessId: tenant.business.id,
          status: "CLOSED"
        }
      });
      expect(closeConversation.statusCode).toBe(200);
      expect(closeConversation.json()).toMatchObject({
        status: "CLOSED",
        handoffToHuman: false
      });

      await expect(
        prisma.auditLog.findFirstOrThrow({
          where: {
            businessId: tenant.business.id,
            action: "HUMAN_TAKEOVER",
            entityId: conversationId
          }
        })
      ).resolves.toBeTruthy();
    });
  });

  it("enforces billing seat limits, downgrade protection, and blocked subscriptions", async () => {
    const tenant = await createTestTenant({ plan: "STARTER", seats: 1, status: "TRIALING" });

    await withApp(async (app) => {
      const ownerLogin = await login(app, tenant);
      const blockedInvite = await app.inject({
        method: "POST",
        url: "/v1/auth/invites",
        headers: authHeader(ownerLogin.token),
        payload: {
          businessId: tenant.business.id,
          email: `blocked-${randomUUID()}@test.local`,
          role: "AGENT"
        }
      });
      expect(blockedInvite.statusCode).toBe(402);
      expect(blockedInvite.json()).toMatchObject({
        errorCode: "TENANT_LIMIT_EXCEEDED",
        limitKind: "seats"
      });

      const growthPlan = await app.inject({
        method: "PATCH",
        url: "/v1/admin/billing/subscription",
        headers: authHeader(ownerLogin.token),
        payload: {
          businessId: tenant.business.id,
          plan: "GROWTH"
        }
      });
      expect(growthPlan.statusCode).toBe(200);
      expect((growthPlan.json() as { limits: { seats: number } }).limits.seats).toBe(5);

      const allowedInvite = await app.inject({
        method: "POST",
        url: "/v1/auth/invites",
        headers: authHeader(ownerLogin.token),
        payload: {
          businessId: tenant.business.id,
          email: `allowed-${randomUUID()}@test.local`,
          role: "VIEWER"
        }
      });
      expect(allowedInvite.statusCode).toBe(201);

      const blockedDowngrade = await app.inject({
        method: "PATCH",
        url: "/v1/admin/billing/subscription",
        headers: authHeader(ownerLogin.token),
        payload: {
          businessId: tenant.business.id,
          seats: 1
        }
      });
      expect(blockedDowngrade.statusCode).toBe(402);
      expect(blockedDowngrade.json()).toMatchObject({
        errorCode: "TENANT_LIMIT_EXCEEDED",
        limitKind: "seats"
      });

      const pastDue = await app.inject({
        method: "PATCH",
        url: "/v1/admin/billing/subscription",
        headers: authHeader(ownerLogin.token),
        payload: {
          businessId: tenant.business.id,
          status: "PAST_DUE"
        }
      });
      expect(pastDue.statusCode).toBe(200);

      const blockedChat = await app.inject({
        method: "POST",
        url: "/v1/chat",
        payload: {
          businessId: tenant.business.id,
          message: "hello"
        }
      });
      expect(blockedChat.statusCode).toBe(402);
      expect(blockedChat.json()).toMatchObject({
        errorCode: "TENANT_LIMIT_EXCEEDED",
        limitKind: "subscription"
      });
    });
  });
});

async function createTestTenant(input: {
  plan?: PlanId;
  seats?: number;
  status?: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED";
} = {}): Promise<TestTenant> {
  const id = randomUUID().slice(0, 12);
  const plan = input.plan ?? "GROWTH";
  const planDefaults = PLAN_DEFAULTS[plan];
  const ownerPassword = "Test-password-123";
  const business = await prisma.business.create({
    data: {
      name: `Test Shop ${id}`,
      slug: `test-shop-${id}`,
      timezone: "UTC",
      defaultCurrency: "USD"
    },
    select: {
      id: true,
      slug: true
    }
  });
  createdBusinessIds.push(business.id);

  const currentPeriodStart = new Date();
  currentPeriodStart.setDate(currentPeriodStart.getDate() - 1);
  const currentPeriodEnd = new Date();
  currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 30);
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 14);

  await prisma.billingSubscription.create({
    data: {
      businessId: business.id,
      plan,
      status: input.status ?? "TRIALING",
      seats: input.seats ?? planDefaults.seats,
      monthlyPriceCents: planDefaults.monthlyPriceCents,
      currency: "USD",
      currentPeriodStart,
      currentPeriodEnd,
      trialEndsAt
    }
  });

  const owner = await prisma.user.create({
    data: {
      businessId: business.id,
      email: `owner-${id}@test.local`,
      name: "Test Owner",
      role: "OWNER",
      passwordHash: authService.hashPassword(ownerPassword),
      emailVerifiedAt: new Date()
    },
    select: {
      id: true,
      email: true
    }
  });

  return {
    business,
    owner,
    ownerPassword
  };
}

async function withApp(run: (app: FastifyInstance) => Promise<void>) {
  const app = await buildApp();
  try {
    await run(app);
  } finally {
    await app.close();
  }
}

async function login(app: FastifyInstance, tenant: TestTenant, password = tenant.ownerPassword) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: {
      email: tenant.owner.email,
      password,
      businessSlug: tenant.business.slug
    }
  });

  expect(response.statusCode).toBe(200);
  const body = response.json() as LoginBody;
  expect(body.user.businessId).toBe(tenant.business.id);
  return body;
}

function authHeader(token: string) {
  return {
    authorization: `Bearer ${token}`
  };
}

function tokenFromUrl(value: string | undefined, key: "resetToken" | "inviteToken") {
  expect(value).toBeTruthy();
  const token = new URL(value ?? "http://localhost").searchParams.get(key);
  expect(token).toBeTruthy();
  return token as string;
}
