-- Where a quotation came from. A customer can request products from the portal;
-- the resulting draft still has to be priced and sent by a rep, so this is a
-- provenance marker rather than a different kind of deal.
ALTER TABLE "Quotation" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'REP';

CREATE INDEX "Quotation_source_idx" ON "Quotation"("source");
