# API Contracts

## Customer Chat

`POST /v1/chat`

Request:

```json
{
  "businessId": "business_123",
  "conversationId": "optional_existing_conversation",
  "message": "Do you have black wireless headphones?",
  "imageUrl": "https://example.com/customer-upload.jpg"
}
```

Response:

```json
{
  "conversationId": "conversation_123",
  "message": "I found a few black wireless headphones. Which one do you mean?",
  "toolCalls": []
}
```

## Admin Products

`GET /v1/admin/products?businessId=business_123`

Returns products, variants, images, and inventory state.

`POST /v1/admin/products/search`

Request:

```json
{
  "businessId": "business_123",
  "query": "headphones",
  "limit": 10
}
```

## Admin Orders

`GET /v1/admin/orders?businessId=business_123`

Optional:

```text
status=PENDING
```

## Admin Daily Report

`GET /v1/admin/reports/daily?businessId=business_123&date=2026-06-07`

Returns deterministic report data. Let AI summarize the result only after this endpoint returns numbers.

## Webhooks

`POST /v1/webhooks/whatsapp`

Provider-specific webhook. Must implement:

- signature verification
- challenge verification
- idempotency keys
- message deduplication
- channel-specific rate limits

`POST /v1/webhooks/stripe`

Stripe billing webhook. Must verify signature before processing.

