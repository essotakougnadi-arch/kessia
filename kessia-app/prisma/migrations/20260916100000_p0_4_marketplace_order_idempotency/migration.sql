-- AlterTable
ALTER TABLE "marketplace_orders" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_orders_idempotencyKey_key" ON "marketplace_orders"("idempotencyKey");

