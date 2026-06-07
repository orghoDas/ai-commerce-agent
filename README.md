# AI Commerce Agent SaaS Scaffold

This scaffold is a structured starter kit for a sellable AI agent service for businesses. The agent handles customer product questions, stock checks, pricing, order intake, and admin reporting.

The main principle:

```text
AI handles conversation.
Backend handles truth.
```

The model should never invent product availability, prices, order status, or business policies. It must call backend tools that read and write trusted data.

## What Is Included

```text
apps/
  api/                  Fastify API, agent orchestration, tools, services, jobs
  admin-web/            Next.js admin dashboard scaffold
  customer-widget/      Vite customer chat widget scaffold
packages/
  shared/               Shared contracts and DTOs
prisma/
  schema.prisma         Multi-tenant commerce data model
docs/
  Product, architecture, roadmap, edge cases, security, reporting, pricing
tests/
  api/                  Test placeholders for high-risk workflows
scripts/
  Seed/import placeholders
```

## MVP Scope

Build this first:

1. Business admin can create products, variants, prices, and inventory.
2. Customer can use a website chat widget.
3. Agent can search products, check stock, quote prices, and create pending orders.
4. Backend reserves inventory before confirming an order.
5. Admin sees orders and inventory status.
6. Daily report is generated per business.

Add WhatsApp, Instagram, image search, payments, POS integrations, and delivery tracking after the MVP proves reliable.

## Suggested Stack

- API: Node.js, TypeScript, Fastify
- Agent: OpenAI Responses API or Agents SDK with tool calling
- Database: PostgreSQL
- ORM: Prisma
- Admin web: Next.js
- Queue/jobs: BullMQ, Temporal, or a managed scheduled job
- Billing: Stripe Billing
- Messaging later: WhatsApp Cloud API, Twilio, Instagram Messaging API

## Local Setup

This scaffold is intentionally code-ready but not dependency-installed.

```bash
npm install
cp .env.example .env
npm run db:generate
npm run dev
```

## Critical Implementation Rules

- Always scope reads and writes by `businessId`.
- Never confirm orders from model text alone.
- Always re-check and reserve inventory inside a transaction.
- Log every order-impacting action in `AuditLog`.
- Store conversation history, but do not store sensitive payment data.
- Use human handoff for low confidence, angry customers, policy exceptions, or repeated failed tool calls.

## Next Engineering Milestones

1. Wire Prisma client and migrations.
2. Implement catalog CRUD in `apps/api/src/services/catalog.service.ts`.
3. Implement transactional inventory reservation in `apps/api/src/services/inventory.service.ts`.
4. Connect OpenAI tool calling in `apps/api/src/agent/customerAgent.ts`.
5. Build admin dashboard pages for products, inventory, orders, and reports.
6. Add automated daily report job.
7. Add billing and tenant limits.
