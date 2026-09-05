-- A quote line may be sold as a recurring subscription. The chosen plan is what
-- decides OrderLine.lineType at confirmation, so one order can mix a one-time
-- product with a monthly/quarterly/annual line.
ALTER TABLE "QuoteLine" ADD COLUMN "subscriptionPlanId" UUID;

CREATE INDEX "QuoteLine_subscriptionPlanId_idx" ON "QuoteLine"("subscriptionPlanId");

ALTER TABLE "QuoteLine"
  ADD CONSTRAINT "QuoteLine_subscriptionPlanId_fkey"
  FOREIGN KEY ("subscriptionPlanId") REFERENCES "SubscriptionPlan"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
