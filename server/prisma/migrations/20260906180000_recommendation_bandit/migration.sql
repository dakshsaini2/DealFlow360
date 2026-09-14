-- Contextual bandit for the upsell panel.
--
-- A SHOWN recommendation event becomes the decision record the policy learns
-- from: the features it was scored on and the probability it was shown with,
-- so feedback can be weighted by inverse propensity rather than assumed to be
-- unbiased. `learnedAt` makes the update idempotent — a row trains once.
ALTER TABLE "RecommendationEvent" ADD COLUMN "probability" DECIMAL(9,6);
ALTER TABLE "RecommendationEvent" ADD COLUMN "features" JSONB;
ALTER TABLE "RecommendationEvent" ADD COLUMN "cost" DECIMAL(6,3);
ALTER TABLE "RecommendationEvent" ADD COLUMN "learnedAt" TIMESTAMP(3);
ALTER TABLE "RecommendationEvent" ADD COLUMN "modelUpdates" INTEGER;
ALTER TABLE "RecommendationEvent" ADD COLUMN "wasExplored" BOOLEAN NOT NULL DEFAULT false;

-- Settling open decisions, and deciding whether a suggestion is already on the
-- panel, both scan for a quotation's rows that have not been learned from yet.
CREATE INDEX "RecommendationEvent_quotationId_learnedAt_idx" ON "RecommendationEvent"("quotationId", "learnedAt");

-- The settle sweep walks the oldest decisions that have not been learned from.
CREATE INDEX "RecommendationEvent_learnedAt_createdAt_idx" ON "RecommendationEvent"("learnedAt", "createdAt");

-- The policy itself: sparse weights plus their AdaGrad accumulators.
CREATE TABLE "BanditModel" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "weights" JSONB NOT NULL,
    "bias" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "biasGrad" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updates" INTEGER NOT NULL DEFAULT 0,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BanditModel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BanditModel_key_key" ON "BanditModel"("key");
