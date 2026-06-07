import { describe, expect, it } from "vitest";

describe("inventory reservation", () => {
  it("should reserve the last unit only once", () => {
    // Implement with a test database:
    // 1. Create business, product, variant, stockOnHand = 1.
    // 2. Run two reserveInventory calls concurrently.
    // 3. Assert one succeeds and one fails with INSUFFICIENT_STOCK.
    expect(true).toBe(true);
  });
});

