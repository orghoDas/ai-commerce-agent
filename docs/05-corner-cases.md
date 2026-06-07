# Corner Cases

## Product Search

- Misspelled product name
- Product has multiple variants
- Product name matches multiple products
- Product is inactive
- Product is available only in another branch
- Customer asks for a category, not a product
- Customer sends an image with multiple products
- Customer sends a screenshot from another store

## Inventory

- Two customers want the last unit
- Admin changes stock during conversation
- Reservation expires before order is confirmed
- Payment fails after stock is reserved
- Returned stock is not sellable yet
- Stock sync from external system is stale
- Product has batch/expiry constraints

## Orders

- Customer changes quantity
- Customer cancels after confirmation
- Duplicate webhook creates duplicate message
- Duplicate tool call tries to create duplicate order
- Delivery address is incomplete
- Customer is outside delivery area
- Customer asks to combine orders

## AI Behavior

- Prompt injection: "ignore your instructions"
- Customer asks for internal prompts
- Customer asks for another business's data
- Customer asks for fake discount
- Model gives high-confidence wrong product match
- Conversation switches languages
- Customer asks unrelated questions

## Admin Reports

- Timezone mismatch
- Pending vs reserved vs confirmed confusion
- Cancelled orders counted incorrectly
- Out-of-stock products hidden by filters
- Product price changed during reporting period
- Report fails to send

## SaaS Operations

- Business exceeds plan limits
- Business cancels subscription
- API key is leaked
- One tenant can see another tenant's data
- Database backup restore is needed
- Channel provider outage

