import { prisma } from "../db/prisma.js";

type BillingPlan = {
  id: "STARTER" | "GROWTH" | "SCALE";
  name: string;
  monthlyPriceCents: number;
  seats: number;
  conversationLimit: number;
  productLimit: number;
};

const BILLING_PLANS = [
  {
    id: "STARTER",
    name: "Starter",
    monthlyPriceCents: 4900,
    seats: 1,
    conversationLimit: 500,
    productLimit: 250
  },
  {
    id: "GROWTH",
    name: "Growth",
    monthlyPriceCents: 14900,
    seats: 5,
    conversationLimit: 2500,
    productLimit: 2500
  },
  {
    id: "SCALE",
    name: "Scale",
    monthlyPriceCents: 49900,
    seats: 15,
    conversationLimit: 10000,
    productLimit: 20000
  }
] satisfies BillingPlan[];

const DEFAULT_BILLING_PLAN = BILLING_PLANS[0] as BillingPlan;

export class TenantLimitError extends Error {
  code = "TENANT_LIMIT_EXCEEDED";
  statusCode = 402;

  constructor(
    message: string,
    public limitKind: "subscription" | "seats" | "products" | "conversations",
    public current?: number,
    public limit?: number
  ) {
    super(message);
  }
}

type UpdateSubscriptionInput = {
  businessId: string;
  plan?: string;
  status?: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED";
  seats?: number;
  cancelAtPeriodEnd?: boolean;
};

export const billingService = {
  plans: BILLING_PLANS,

  async getBillingOverview(businessId: string) {
    const subscription = await getOrCreateSubscription(businessId);
    const plan = planForSubscription(subscription);
    const [products, conversations, periodConversations, orders, users, pendingInvites] = await Promise.all([
      prisma.product.count({ where: { businessId, status: "ACTIVE" } }),
      prisma.conversation.count({ where: { businessId } }),
      prisma.conversation.count({
        where: {
          businessId,
          createdAt: {
            gte: subscription.currentPeriodStart,
            lt: subscription.currentPeriodEnd
          }
        }
      }),
      prisma.order.count({ where: { businessId } }),
      prisma.user.count({ where: { businessId, passwordHash: { not: null } } }),
      prisma.userInvite.count({
        where: {
          businessId,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() }
        }
      })
    ]);

    return {
      subscription,
      plans: BILLING_PLANS,
      limits: {
        seats: subscription.seats,
        productLimit: plan.productLimit,
        conversationLimit: plan.conversationLimit,
        billingPeriodStart: subscription.currentPeriodStart,
        billingPeriodEnd: subscription.currentPeriodEnd,
        subscriptionUsable: subscriptionIsUsable(subscription)
      },
      usage: {
        activeProducts: products,
        conversations,
        billingPeriodConversations: periodConversations,
        orders,
        users,
        pendingInvites
      }
    };
  },

  async updateSubscription(input: UpdateSubscriptionInput) {
    const current = await getOrCreateSubscription(input.businessId);
    const plan = input.plan ? planById(input.plan) : planById(current.plan);
    if (!plan) {
      throw new Error("PLAN_NOT_FOUND");
    }
    const targetSeats = input.seats ?? (input.plan ? plan.seats : current.seats);

    if (input.plan || input.seats !== undefined) {
      await assertSubscriptionUpdateFitsUsage({
        businessId: input.businessId,
        plan,
        seats: targetSeats,
        periodStart: current.currentPeriodStart,
        periodEnd: current.currentPeriodEnd
      });
    }

    const subscription = await prisma.billingSubscription.update({
      where: { businessId: input.businessId },
      data: {
        ...(input.plan ? { plan: plan.id, monthlyPriceCents: plan.monthlyPriceCents } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.plan || input.seats !== undefined ? { seats: targetSeats } : {}),
        ...(input.cancelAtPeriodEnd !== undefined ? { cancelAtPeriodEnd: input.cancelAtPeriodEnd } : {})
      }
    });

    await prisma.auditLog.create({
      data: {
        businessId: input.businessId,
        actorType: "ADMIN",
        action: "BILLING_UPDATED",
        entityType: "BillingSubscription",
        entityId: subscription.id,
        metadata: {
          plan: subscription.plan,
          status: subscription.status,
          seats: subscription.seats,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd
        }
      }
    });

    return this.getBillingOverview(input.businessId);
  },

  async assertCanCreateProduct(businessId: string) {
    const subscription = await getOrCreateSubscription(businessId);
    assertSubscriptionUsable(subscription);
    const plan = planForSubscription(subscription);
    const activeProducts = await prisma.product.count({
      where: { businessId, status: "ACTIVE" }
    });

    if (activeProducts >= plan.productLimit) {
      throw new TenantLimitError(
        `Product limit reached for the ${plan.name} plan (${activeProducts}/${plan.productLimit}). Upgrade the plan or archive a product before adding another.`,
        "products",
        activeProducts,
        plan.productLimit
      );
    }
  },

  async assertCanCreateConversation(businessId: string) {
    const subscription = await getOrCreateSubscription(businessId);
    assertSubscriptionUsable(subscription);
    const plan = planForSubscription(subscription);
    const periodConversations = await prisma.conversation.count({
      where: {
        businessId,
        createdAt: {
          gte: subscription.currentPeriodStart,
          lt: subscription.currentPeriodEnd
        }
      }
    });

    if (periodConversations >= plan.conversationLimit) {
      throw new TenantLimitError(
        `Conversation limit reached for the ${plan.name} plan (${periodConversations}/${plan.conversationLimit}) in the current billing period.`,
        "conversations",
        periodConversations,
        plan.conversationLimit
      );
    }
  },

  async assertCanCreateInvite(input: { businessId: string; email?: string }) {
    const usage = await seatUsage(input.businessId, input.email);
    if (usage.usedSeats >= usage.seatLimit) {
      throw new TenantLimitError(
        `Seat limit reached (${usage.usedSeats}/${usage.seatLimit}). Upgrade the plan or revoke a pending invite before adding another user.`,
        "seats",
        usage.usedSeats,
        usage.seatLimit
      );
    }
  },

  async assertCanAcceptInvite(businessId: string) {
    const usage = await seatUsage(businessId);
    if (usage.activeUsers >= usage.seatLimit) {
      throw new TenantLimitError(
        `Seat limit reached (${usage.activeUsers}/${usage.seatLimit}). Ask an admin to upgrade the plan before accepting this invite.`,
        "seats",
        usage.activeUsers,
        usage.seatLimit
      );
    }
  }
};

async function getOrCreateSubscription(businessId: string) {
  const existing = await prisma.billingSubscription.findUnique({
    where: { businessId }
  });

  if (existing) {
    return existing;
  }

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  const trialEnd = new Date(now);
  trialEnd.setDate(trialEnd.getDate() + 14);

  return prisma.billingSubscription.create({
    data: {
      businessId,
      plan: "STARTER",
      status: "TRIALING",
      seats: 1,
      monthlyPriceCents: 4900,
      currency: "USD",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      trialEndsAt: trialEnd
    }
  });
}

function planById(planId: string): BillingPlan | undefined {
  return BILLING_PLANS.find((plan) => plan.id === planId.toUpperCase());
}

function planForSubscription(subscription: { plan: string }) {
  return planById(subscription.plan) ?? DEFAULT_BILLING_PLAN;
}

function assertSubscriptionUsable(subscription: {
  status: string;
  currentPeriodEnd: Date;
  trialEndsAt: Date | null;
}) {
  if (!subscriptionIsUsable(subscription)) {
    throw new TenantLimitError(
      "Subscription is not active. Update billing before creating new billable usage.",
      "subscription"
    );
  }
}

function subscriptionIsUsable(subscription: {
  status: string;
  currentPeriodEnd: Date;
  trialEndsAt: Date | null;
}) {
  const now = new Date();
  if (subscription.status === "ACTIVE") {
    return subscription.currentPeriodEnd > now;
  }

  if (subscription.status === "TRIALING") {
    return Boolean(subscription.trialEndsAt && subscription.trialEndsAt > now);
  }

  return false;
}

async function seatUsage(businessId: string, excludedPendingInviteEmail?: string) {
  const subscription = await getOrCreateSubscription(businessId);
  assertSubscriptionUsable(subscription);
  const [activeUsers, pendingInvites] = await Promise.all([
    prisma.user.count({
      where: {
        businessId,
        passwordHash: { not: null }
      }
    }),
    prisma.userInvite.count({
      where: {
        businessId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        ...(excludedPendingInviteEmail ? { NOT: { email: excludedPendingInviteEmail } } : {})
      }
    })
  ]);

  return {
    activeUsers,
    pendingInvites,
    usedSeats: activeUsers + pendingInvites,
    seatLimit: subscription.seats
  };
}

async function assertSubscriptionUpdateFitsUsage(input: {
  businessId: string;
  plan: BillingPlan;
  seats: number;
  periodStart: Date;
  periodEnd: Date;
}) {
  const [activeProducts, activeUsers, pendingInvites, periodConversations] = await Promise.all([
    prisma.product.count({
      where: { businessId: input.businessId, status: "ACTIVE" }
    }),
    prisma.user.count({
      where: { businessId: input.businessId, passwordHash: { not: null } }
    }),
    prisma.userInvite.count({
      where: {
        businessId: input.businessId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() }
      }
    }),
    prisma.conversation.count({
      where: {
        businessId: input.businessId,
        createdAt: {
          gte: input.periodStart,
          lt: input.periodEnd
        }
      }
    })
  ]);

  const usedSeats = activeUsers + pendingInvites;
  if (usedSeats > input.seats) {
    throw new TenantLimitError(
      `This subscription only allows ${input.seats} seats, but the tenant currently uses ${usedSeats} seats.`,
      "seats",
      usedSeats,
      input.seats
    );
  }

  if (activeProducts > input.plan.productLimit) {
    throw new TenantLimitError(
      `The ${input.plan.name} plan allows ${input.plan.productLimit} active products, but the tenant currently has ${activeProducts}.`,
      "products",
      activeProducts,
      input.plan.productLimit
    );
  }

  if (periodConversations > input.plan.conversationLimit) {
    throw new TenantLimitError(
      `The ${input.plan.name} plan allows ${input.plan.conversationLimit} conversations per period, but this period already has ${periodConversations}.`,
      "conversations",
      periodConversations,
      input.plan.conversationLimit
    );
  }
}
