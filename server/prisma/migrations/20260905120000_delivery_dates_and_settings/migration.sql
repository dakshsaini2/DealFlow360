-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "promisedDeliveryDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "FulfillmentOrder" ADD COLUMN     "expectedShipDate" TIMESTAMP(3),
ADD COLUMN     "shippedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);
