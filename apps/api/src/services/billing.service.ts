import { prisma } from "../db/prisma.js";

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
];

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
    const [products, conversations, orders, users] = await Promise.all([
      prisma.product.count({ where: { businessId, status: "ACTIVE" } }),
      prisma.conversation.count({ where: { businessId } }),
      prisma.order.count({ where: { businessId } }),
      prisma.user.count({ where: { businessId } })
    ]);

    return {
      subscription,
      plans: BILLING_PLANS,
      usage: {
        activeProducts: products,
        conversations,
        orders,
        users
      }
    };
  },

  async updateSubscription(input: UpdateSubscriptionInput) {
    const current = await getOrCreateSubscription(input.businessId);
    const plan = input.plan ? planById(input.plan) : planById(current.plan);
    if (!plan) {
      throw new Error("PLAN_NOT_FOUND");
    }

    const subscription = await prisma.billingSubscription.update({
      where: { businessId: input.businessId },
      data: {
        ...(input.plan ? { plan: plan.id, monthlyPriceCents: plan.monthlyPriceCents } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.seats !== undefined ? { seats: input.seats } : {}),
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

function planById(planId: string) {
  return BILLING_PLANS.find((plan) => plan.id === planId.toUpperCase());
}
