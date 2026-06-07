# Implementation Checklist

## Repository Setup

- Install dependencies
- Configure `.env`
- Start PostgreSQL
- Run Prisma migration
- Seed a demo business
- Add auth provider

## Backend

- Add real auth middleware
- Enforce tenant scoping in every route
- Implement product CRUD
- Implement CSV import
- Implement stock adjustment endpoint
- Implement order state transition endpoint
- Implement human takeover endpoint
- Implement conversation transcript endpoint
- Add webhook signature verification
- Add idempotency keys for webhooks and order creation

## Agent

- Complete function-call loop in `customerAgent.ts`
- Add tool-call retries with limits
- Add confidence thresholds
- Add escalation logic
- Add customer language detection
- Add test conversation fixtures
- Add prompt-injection tests

## Inventory

- Use transactions for order creation
- Lock inventory rows while reserving stock
- Expire old reservations
- Release reservations on cancellation
- Convert reservations on fulfilled orders
- Add stock movement history if needed

## Admin Dashboard

- Product list and editor
- Variant editor
- Inventory editor
- Order queue
- Conversation inbox
- Human takeover
- Reports page
- Settings page
- Billing page

## SaaS

- Billing plans
- Usage metering
- Tenant limits
- Admin invites
- Audit logs
- Backups
- Monitoring
- Privacy policy
- Terms of service

## Tests

- Last item cannot be oversold
- Cross-tenant access is blocked
- Agent cannot quote price without tool result
- Agent escalates after repeated failures
- Duplicate webhook does not duplicate message/order
- Daily report totals match database state

