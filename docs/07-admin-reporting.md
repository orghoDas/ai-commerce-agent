# Admin Reporting

## Daily Report Sections

Inventory summary:

- Total active products
- Total variants
- Products in stock
- Products low in stock
- Products out of stock

Order summary:

- New orders
- Pending orders
- Confirmed orders
- Cancelled orders
- Orders awaiting human review

Demand summary:

- Most requested products
- Most requested unavailable products
- Products searched by image
- Product searches with no match

Financial summary:

- Gross order value
- Average order value
- Top products by order value

Operational alerts:

- Failed tool calls
- Failed channel webhooks
- Inventory sync errors
- Report delivery failures

## Metric Definitions

```text
available_to_sell = stock_on_hand - reserved_quantity
reserved_quantity = active reservations not expired
pending_to_order = orders with status PENDING
order_queue = pending + confirmed orders not fulfilled
out_of_stock = available_to_sell <= 0
low_stock = available_to_sell <= reorder_point
```

## Report Delivery

Start with dashboard + email. Add WhatsApp delivery later after channel rules are implemented.

