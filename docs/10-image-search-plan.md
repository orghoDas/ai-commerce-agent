# Image Product Search Plan

## MVP Version

Use vision extraction first.

```text
customer image
  -> vision model extracts text/category/brand/color/model
  -> catalog text search
  -> show likely matches
  -> customer confirms exact product
  -> inventory/order flow
```

The agent should never create an order directly from an image match unless the customer confirms the exact product and variant.

## Advanced Version

Use visual embeddings.

```text
product image embeddings stored per product image
customer image embedding
nearest-neighbor vector search
combined score = visual similarity + text/OCR/category score
```

Recommended fields:

- `ProductImage.visibleText`
- `ProductImage.embeddingRef`
- product `brand`
- product `category`
- product `tags`
- variant `color`
- variant `size`

## Image Search Corner Cases

- Image contains multiple products
- Image is blurry
- Image is from another store
- Product is similar but not identical
- Product is available in another color only
- Packaging text is visible but product size differs
- Customer sends private information by mistake

## Agent Rule

```text
When using image search, present likely matches and ask the customer to confirm the exact product before checking stock or creating an order.
```

