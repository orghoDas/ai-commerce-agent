# MVP Roadmap

## Phase 1 - Internal Prototype

Goal: prove the core loop works.

- Product database
- Variant and stock model
- Website chat endpoint
- Product search tool
- Inventory check tool
- Pending order creation
- Daily report query
- Admin can inspect conversations and orders

Exit criteria:

- Agent can handle 20 realistic product conversations without inventing stock or price.
- Last-item inventory cannot be oversold in tests.
- Admin report numbers match database queries.

## Phase 2 - Sellable Pilot

Goal: onboard 3 to 5 real businesses in one niche.

- CSV product import
- Admin dashboard
- Human takeover
- Business-specific policies
- Low-stock alerts
- Conversation transcripts
- Basic subscription billing

Exit criteria:

- A real shop can onboard without developer help.
- Admin can correct stock and prices.
- Human can take over failed conversations.

## Phase 3 - Channel Expansion

Goal: meet customers where they already message businesses.

- WhatsApp integration
- Instagram/Facebook integration
- SMS integration if market needs it
- Channel-specific templates and opt-in rules
- Webhook retry and idempotency

Exit criteria:

- Messages are deduplicated.
- Channel costs are tracked per business.
- Business-initiated messaging rules are enforced.

## Phase 4 - Advanced Search and Automation

Goal: improve conversion and reporting.

- Image product search
- Product recommendations
- Payment links
- Delivery integration
- Shopify/WooCommerce/POS sync
- Demand forecasting
- Advanced admin analytics

