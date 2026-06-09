ALTER TABLE "ProductImage" ADD COLUMN "storageKey" TEXT;
ALTER TABLE "ProductImage" ADD COLUMN "mimeType" TEXT;
ALTER TABLE "ProductImage" ADD COLUMN "sizeBytes" INTEGER;
ALTER TABLE "ProductImage" ADD COLUMN "width" INTEGER;
ALTER TABLE "ProductImage" ADD COLUMN "height" INTEGER;
ALTER TABLE "ProductImage" ADD COLUMN "averageColor" TEXT;
ALTER TABLE "ProductImage" ADD COLUMN "perceptualHash" TEXT;
ALTER TABLE "ProductImage" ADD COLUMN "colorSignature" JSONB;

CREATE INDEX "ProductImage_businessId_perceptualHash_idx" ON "ProductImage"("businessId", "perceptualHash");
