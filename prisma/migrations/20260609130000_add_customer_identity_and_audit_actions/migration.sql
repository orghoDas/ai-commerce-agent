ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CUSTOMER_LINKED';

ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS "Customer_businessId_externalId_key" ON "Customer"("businessId", "externalId");
CREATE INDEX IF NOT EXISTS "Customer_businessId_lastSeenAt_idx" ON "Customer"("businessId", "lastSeenAt");
