# Architecture

## High-Level Flow

```text
Customer channel
  -> Channel adapter/webhook
  -> Conversation API
  -> Agent orchestrator
  -> Backend tools
  -> Services
  -> PostgreSQL
  -> Response to customer
```

## Backend Responsibilities

The backend is the source of truth for:

- Business identity
- Product catalog
- Prices
- Inventory
- Reservations
- Orders
- Conversation logs
- Admin reports
- Billing limits

## Agent Responsibilities

The agent is responsible for:

- Greeting the customer
- Understanding intent
- Asking clarifying questions
- Calling tools
- Explaining results clearly
- Escalating when needed

The agent is not responsible for:

- Deciding stock from memory
- Deciding prices from memory
- Creating orders without backend confirmation
- Applying unapproved discounts
- Revealing admin-only data

## Service Boundaries

Catalog service:

- Product CRUD
- Product search
- Variant lookup
- Image metadata search

Inventory service:

- Availability checks
- Reservations
- Reservation expiry
- Stock movement audit

Order service:

- Pending order creation
- Order confirmation
- Cancellation
- Status changes

Report service:

- Daily stock/order summaries
- Low-stock report
- Unavailable product demand

Agent service:

- Prompt construction
- Tool schemas
- Tool execution
- Conversation state

## Multi-Tenancy

Every business-owned row must include `businessId`.

Every query must scope by `businessId`.

Add database indexes for common tenant-scoped queries:

- `businessId + sku`
- `businessId + status`
- `businessId + createdAt`
- `businessId + productId`

