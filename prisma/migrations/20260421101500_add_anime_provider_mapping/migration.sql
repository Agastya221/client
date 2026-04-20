-- CreateTable
CREATE TABLE "AnimeProviderMapping" (
    "id" TEXT NOT NULL,
    "anilistId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "providerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "matchedTitle" TEXT,
    "checkedTitles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "failureReason" TEXT,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnimeProviderMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnimeProviderMapping_provider_status_idx" ON "AnimeProviderMapping"("provider", "status");

-- CreateIndex
CREATE INDEX "AnimeProviderMapping_lastCheckedAt_idx" ON "AnimeProviderMapping"("lastCheckedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnimeProviderMapping_anilistId_provider_key" ON "AnimeProviderMapping"("anilistId", "provider");
