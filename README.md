# AI Commerce Agent SaaS

Working MVP for a sellable commerce chat-agent service. The product currently supports a deterministic no-LLM customer flow, admin authentication, role-based admin APIs, catalog/inventory management, order workflow, conversation takeover, customer identity linking, audit logs, reports, CSV import, and local billing/subscription scaffolding.

Core principle:

```text
Conversation can be automated.
Catalog, inventory, order, auth, and billing truth must live in the backend.
```

## Current Features

- Customer chat widget connected to the real `/v1/chat` endpoint.
- Customer identity linking:
  - widget sends a stable browser customer id
  - conversations and orders link to `Customer`
  - repeat browser sessions can be tied back to the same customer record
- No-LLM deterministic sales flow:
  - greet customer
  - fuzzy product search
  - check stock
  - quote price
  - collect name, phone, address
  - create pending order
  - reserve inventory
- Optional OpenAI agent path with tool calling.
- Admin auth with database-backed sessions, logout revocation, password reset, invite acceptance, and auth rate limiting.
- Protected `/v1/admin/*` API routes with per-route role permissions.
- Product and variant CRUD.
- Inventory edit and stock/reorder management.
- CSV product import from admin UI or CLI.
- Local image upload storage with `/uploads/...` static serving.
- Product image upload/delete from the admin inventory table.
- Deterministic image product search using stored image fingerprints and color signatures.
- Order queue with confirm, cancel, and fulfill actions.
- Conversation viewer with full transcript and linked orders.
- Audit-log UI for recent admin, auth, product, order, billing, and customer-link events.
- Human takeover:
  - take over/release conversation
  - send admin replies
  - close conversations
  - customer widget polls transcript for admin replies
  - bot pauses while takeover is active
- Daily, weekly, and monthly reports.
- Billing/subscription foundation:
  - Starter/Growth/Scale plans
  - local subscription model
  - usage counters and tenant limits
  - billing enforcement for seats, active products, and billing-period conversations
  - manual plan/status updates
- Daily report job scaffold.
- PostgreSQL/Prisma persistence.

## Monorepo Layout

```text
apps/
  api/                  Fastify API, services, agent flows, admin/customer routes
  admin-web/            Vite React admin dashboard
  customer-widget/      Vite React customer chat widget
packages/
  shared/               Shared types and schemas
prisma/
  schema.prisma         Commerce, conversation, auth, billing data model
  migrations/           Applied database migrations
scripts/
  seed-demo.ts          Seeds demo shop, owner, product, inventory, billing
  import-products-csv.ts
docs/
  Product, architecture, roadmap, edge cases, security, reporting, pricing
```

## Prerequisites

- Node.js 22+ recommended.
- PostgreSQL running locally.
- npm workspaces.

Docker Compose exists, but this local setup has mostly been run with Homebrew PostgreSQL on macOS.

## Environment

Create a root `.env`:

```bash
cp .env.example .env
```

For Homebrew PostgreSQL on macOS, `DATABASE_URL` usually looks like:

```bash
DATABASE_URL=postgresql://your_mac_username@localhost:5432/ai_commerce_agent
```

Important values:

```bash
AI_PROVIDER=deterministic
SESSION_SECRET=replace_me_with_a_32_char_random_secret
OPENAI_API_KEY=replace_me
```

Use `AI_PROVIDER=deterministic` for the free MVP flow. Switch to `AI_PROVIDER=openai` only when you are ready to use a paid model API.

Optional app env files:

```bash
cp apps/admin-web/.env.example apps/admin-web/.env
cp apps/customer-widget/.env.example apps/customer-widget/.env
```

## Install And Database Setup

```bash
npm install
npm run db:generate
npm run db:migrate
npm run seed
```

The seed creates:

- Business: `Demo Shop`
- Business slug: `demo-shop`
- Demo owner email: `owner@demo-shop.local`
- Demo owner password: `demo-password-123`
- Demo product: `Wireless Headphones`
- Starter trial subscription

## Run Locally

Use separate terminals:

```bash
npm run dev:api
npm run dev:admin
npm run dev:widget
```

URLs:

- API: `http://localhost:4000`
- Admin dashboard: `http://localhost:3000`
- Customer widget: `http://localhost:5173`

Admin login:

```text
Email: owner@demo-shop.local
Password: demo-password-123
Business slug: demo-shop
```

## Useful Commands

```bash
npm run typecheck
npm test
npm run build
npm run db:studio
```

CSV import from CLI:

```bash
npm run import:products -- products.csv <businessId>
```

For the seeded demo business:

```bash
npm run import:products -- products.csv cmq4w4tnf0000rt4rfr38t93b
```

If your seeded `businessId` differs, use the value printed by `npm run seed`.

## CSV Product Import

Admin UI location:

```text
Admin Dashboard -> Product And Inventory -> CSV Product Import
```

API endpoint:

```http
POST /v1/admin/products/import-csv
```

Supported columns:

```text
name,sku,variantTitle,price,stockOnHand,reorderPoint,brand,category,description,tags,searchKeywords,color,size,currency,productStatus,variantActive
```

Minimal example:

```csv
name,sku,variantTitle,price,stockOnHand,reorderPoint,brand,category,tags,searchKeywords,color,size,currency,productStatus,variantActive
Wireless Headphones,WH-1000XM5-BLK,Black,349.00,12,3,Sony,Audio,headphones|wireless,sony|black,Black,,USD,ACTIVE,true
```

Behavior:

- Existing SKU updates product, variant, price, stock, and reorder point.
- New SKU creates product/variant/inventory.
- Row-level validation errors are returned without failing the whole import.
- Import limit is 500 rows per request.
- `tags` and `searchKeywords` can be split with `|`, `;`, or `,`.

## API Overview

Public:

```http
GET  /health
POST /v1/chat
GET  /v1/chat/:conversationId/messages
POST /v1/uploads/images
```

Auth:

```http
POST   /v1/auth/login
POST   /v1/auth/logout
GET    /v1/auth/me
POST   /v1/auth/password-reset/request
POST   /v1/auth/password-reset/confirm
GET    /v1/auth/invites?businessId=...
POST   /v1/auth/invites
DELETE /v1/auth/invites/:inviteId?businessId=...
GET    /v1/auth/invites/:token
POST   /v1/auth/invites/accept
```

Admin routes require:

```http
Authorization: Bearer <token>
```

Admin products:

```http
GET   /v1/admin/products?businessId=...
POST  /v1/admin/products
PATCH /v1/admin/products/:productId
POST  /v1/admin/products/:productId/images?businessId=...
DELETE /v1/admin/products/:productId/images/:imageId?businessId=...
POST  /v1/admin/products/:productId/variants
PATCH /v1/admin/products/:productId/variants/:variantId
POST  /v1/admin/products/search
POST  /v1/admin/products/import-csv
```

Admin orders:

```http
GET   /v1/admin/orders?businessId=...
PATCH /v1/admin/orders/:orderId/status
```

Admin conversations:

```http
GET   /v1/admin/conversations?businessId=...
GET   /v1/admin/conversations/:conversationId?businessId=...
POST  /v1/admin/conversations/:conversationId/handoff
POST  /v1/admin/conversations/:conversationId/messages
PATCH /v1/admin/conversations/:conversationId/status
```

Admin reports:

```http
GET /v1/admin/reports?businessId=...&period=daily&date=YYYY-MM-DD
GET /v1/admin/reports/daily?businessId=...&date=YYYY-MM-DD
GET /v1/admin/reports/weekly?businessId=...&date=YYYY-MM-DD
GET /v1/admin/reports/monthly?businessId=...&date=YYYY-MM-DD
```

Admin billing:

```http
GET   /v1/admin/billing?businessId=...
PATCH /v1/admin/billing/subscription
```

Webhook placeholder:

```http
POST /v1/webhooks/stripe
```

## Human Takeover Flow

1. Admin opens Conversation Viewer.
2. Admin clicks `Take Over`.
3. Conversation status becomes `NEEDS_HUMAN`.
4. Customer messages are stored, but the bot does not answer.
5. Admin sends replies from the dashboard.
6. Customer widget polls `/v1/chat/:conversationId/messages` and displays admin replies.
7. Admin can `Release` the conversation back to the agent or `Close` it.

## Billing State

Billing is currently local/manual, not connected to a payment provider. Tenant limits are enforced in the backend.

Current plan ids:

```text
STARTER
GROWTH
SCALE
```

The Billing panel shows:

- current plan
- subscription status
- monthly price
- renewal status
- usage counters and plan limits
- plan selection controls

Enforced limits:

- Seats: active users plus pending invites cannot exceed subscription seats.
- Products: active products cannot exceed the selected plan's product limit.
- Conversations: new customer conversations cannot exceed the selected plan's billing-period conversation limit.
- Subscription state: cancelled, past-due, expired, or ended-trial tenants cannot create new billable usage.

Stripe/Paddle can be added later by using the existing `BillingSubscription` model and webhook placeholder.

## Deterministic Customer Agent

The deterministic mode is the default MVP path. It avoids paid LLM calls while proving core commerce logic.

Flow:

```text
customer message
-> text or image product search
-> stock check
-> quote price
-> collect customer details
-> final confirmation
-> create pending order
-> reserve inventory
```

Image search in deterministic mode uses uploaded product-image fingerprints and color signatures. It works best after each catalog product has at least one clear product image. The OpenAI path still has tool-calling scaffolding, but the default MVP image path does not require a paid model API.

## Testing And Verification

Current known-good checks:

```bash
npm run typecheck
npm test
npm run build
```

The API service tests cover the current high-risk inventory/order logic.

## Security Notes

- Admin APIs are protected by database-backed bearer sessions that can be revoked on logout or password reset.
- Login, password reset, and invite acceptance endpoints are rate-limited.
- Owner/Admin users can create and revoke Admin, Agent, and Viewer invites from the Account Security panel.
- Admin requests are scoped to the authenticated user's `businessId`.
- Admin routes enforce role permissions per route:
  - Owner: billing updates and all admin operations.
  - Admin: audit logs, user invites, catalog management, order/conversation operations, reports, billing view.
  - Agent: order and conversation operations, catalog/order/conversation read.
  - Viewer: read-only catalog, orders, conversations, and reports.
- Customer chat remains public because it is intended to be embedded.
- Payment details are not stored.
- `SESSION_SECRET` must be changed before any real deployment.
- Demo password is only for local development.

## Still To Do Before Selling

- Plug auth reset/invite tokens into a real email delivery provider.
- Connect Stripe/Paddle for real checkout, subscription lifecycle, and webhook verification.
- Move uploads to durable object storage such as S3/R2 before production.
- Add advanced image embeddings or a vision model for harder image matches.
- Add WhatsApp/Instagram/SMS channels.
- Add more tests for external channel integrations, object storage, payment webhooks, and deployment flows.
- Add deployment config and CI.
