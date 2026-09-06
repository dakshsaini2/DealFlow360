-- Email verification codes and password-reset tokens share one table: they
-- differ only in what is generated, so expiry, single use and attempt limiting
-- are implemented once. Only a hash of the secret is stored.
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

CREATE TABLE "VerificationToken" (
  "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
  "userId"     UUID         NOT NULL,
  "type"       TEXT         NOT NULL,
  "codeHash"   TEXT         NOT NULL,
  "attempts"   INTEGER      NOT NULL DEFAULT 0,
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VerificationToken_userId_type_idx" ON "VerificationToken"("userId", "type");
CREATE INDEX "VerificationToken_codeHash_idx"    ON "VerificationToken"("codeHash");
CREATE INDEX "VerificationToken_expiresAt_idx"   ON "VerificationToken"("expiresAt");

ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Accounts that already existed predate verification; treating them as verified
-- avoids locking out the seeded demo users.
UPDATE "User" SET "emailVerifiedAt" = NOW() WHERE "emailVerifiedAt" IS NULL;
