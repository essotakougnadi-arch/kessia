-- P0.2 : corrige la collision Session.token (JWT signé stocké en @unique,
-- déterministe à la seconde près -> collision sur créations concurrentes)
-- et ajoute la révocation douce (revokedAt) pour que withAuth applique la
-- révocation immédiatement (logout, changement de mot de passe, suspension
-- admin, détection de réutilisation de refresh token).

-- Vide les sessions existantes : `jti` devient NOT NULL sans valeur de
-- repli sensée pour d'anciennes lignes (le JWT signé qu'elles stockaient
-- dans `token` n'est pas un identifiant de session valide). Sans impact
-- fonctionnel : une session est un jeton éphémère, pas une donnée métier —
-- les utilisateurs connectés se reconnectent une fois (refresh token
-- rejeté -> flux normal de ré-authentification déjà géré côté client).
DELETE FROM "sessions";

-- DropIndex
DROP INDEX "sessions_token_idx";

-- DropIndex
DROP INDEX "sessions_token_key";

-- AlterTable
ALTER TABLE "sessions" DROP COLUMN "token",
ADD COLUMN     "jti" TEXT NOT NULL,
ADD COLUMN     "revokedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_jti_key" ON "sessions"("jti");

-- CreateIndex
CREATE INDEX "sessions_userId_revokedAt_idx" ON "sessions"("userId", "revokedAt");
