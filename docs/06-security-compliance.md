# Security And Compliance

## Tenant Isolation

- Every business-owned table uses `businessId`.
- Every API route resolves the authenticated business before data access.
- Add tests for cross-tenant access.
- Consider PostgreSQL row-level security for stronger isolation.

## Data Handling

Store:

- Customer name
- Phone/email if needed
- Delivery address if needed
- Conversation transcript
- Order history

Avoid storing:

- Raw card numbers
- Government IDs unless required
- Sensitive images unrelated to products
- Unnecessary personal data

## Access Control

Roles:

- `OWNER`: billing, settings, users, all data
- `ADMIN`: products, orders, reports
- `AGENT`: conversations and orders
- `VIEWER`: read-only dashboard access

## Audit Logs

Log:

- Stock edits
- Reservation creation/expiry
- Order creation/cancellation
- Admin login
- Human takeover
- Agent tool failures
- Billing status changes

## AI Safety

- Use strict tool schemas.
- Validate all tool arguments server-side.
- Do not pass admin secrets into prompts.
- Do not let the model directly write database rows.
- Keep customer-facing and admin-facing agents separate.
- Redact sensitive data from logs where possible.

