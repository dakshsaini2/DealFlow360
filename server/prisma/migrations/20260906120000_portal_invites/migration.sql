-- Portal access is granted by the seller, not claimed by the buyer. An invite
-- turns a rep's invitation into a CustomerUser link once the recipient sets a
-- password. Only the SHA-256 of the token is stored.
CREATE TABLE "PortalInvite" (
  "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
  "customerId"      UUID         NOT NULL,
  "email"           TEXT         NOT NULL,
  "firstName"       TEXT         NOT NULL,
  "lastName"        TEXT         NOT NULL,
  "tokenHash"       TEXT         NOT NULL,
  "invitedByUserId" UUID         NOT NULL,
  "acceptedUserId"  UUID,
  "expiresAt"       TIMESTAMP(3) NOT NULL,
  "acceptedAt"      TIMESTAMP(3),
  "revokedAt"       TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PortalInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PortalInvite_tokenHash_key" ON "PortalInvite"("tokenHash");
CREATE INDEX "PortalInvite_customerId_idx"      ON "PortalInvite"("customerId");
CREATE INDEX "PortalInvite_email_idx"           ON "PortalInvite"("email");
CREATE INDEX "PortalInvite_invitedByUserId_idx" ON "PortalInvite"("invitedByUserId");
CREATE INDEX "PortalInvite_acceptedUserId_idx"  ON "PortalInvite"("acceptedUserId");

ALTER TABLE "PortalInvite" ADD CONSTRAINT "PortalInvite_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortalInvite" ADD CONSTRAINT "PortalInvite_invitedByUserId_fkey"
  FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PortalInvite" ADD CONSTRAINT "PortalInvite_acceptedUserId_fkey"
  FOREIGN KEY ("acceptedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
