-- CreateEnum
CREATE TYPE "SellerVerificationStatus" AS ENUM ('NOT_SUBMITTED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SellerVerificationDocumentType" AS ENUM ('BUSINESS_REGISTRATION', 'TAX_ID', 'OWNER_ID', 'PROOF_OF_ADDRESS', 'OTHER');

-- AlterTable
ALTER TABLE "marketplace_deliveries" ADD COLUMN     "kessiaTrackingCode" TEXT,
ADD COLUMN     "labelPhotoUploadedAt" TIMESTAMP(3),
ADD COLUMN     "labelPhotoUploadedById" TEXT,
ADD COLUMN     "labelPhotoUrl" TEXT;

-- CreateTable
CREATE TABLE "seller_verifications" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "status" "SellerVerificationStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_verification_documents" (
    "id" TEXT NOT NULL,
    "verificationId" TEXT NOT NULL,
    "type" "SellerVerificationDocumentType" NOT NULL,
    "label" TEXT,
    "fileUrl" TEXT NOT NULL,
    "storageKey" TEXT,
    "mimeType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seller_verification_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "seller_verifications_businessId_key" ON "seller_verifications"("businessId");

-- CreateIndex
CREATE INDEX "seller_verifications_status_idx" ON "seller_verifications"("status");

-- CreateIndex
-- Index unique uniquement : PostgreSQL l'utilise déjà pour toute
-- recherche par égalité sur cette colonne — un @@index séparé sur la
-- même colonne serait un doublon pur (aucun bénéfice de lecture,
-- coût d'écriture en double à chaque INSERT/UPDATE).
CREATE UNIQUE INDEX "marketplace_deliveries_kessiaTrackingCode_key" ON "marketplace_deliveries"("kessiaTrackingCode");

-- AddForeignKey
ALTER TABLE "seller_verifications" ADD CONSTRAINT "seller_verifications_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_verification_documents" ADD CONSTRAINT "seller_verification_documents_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "seller_verifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

