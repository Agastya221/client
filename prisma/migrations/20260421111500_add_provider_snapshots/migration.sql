-- CreateTable
CREATE TABLE "AnimeProviderSnapshot" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "synopsis" TEXT,
    "poster" TEXT,
    "banner" TEXT,
    "description" TEXT,
    "genres" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "type" TEXT,
    "rating" TEXT,
    "year" TEXT,
    "status" TEXT,
    "subCount" INTEGER,
    "dubCount" INTEGER,
    "episodeCount" INTEGER,
    "anilistId" INTEGER,
    "malId" INTEGER,
    "providerIds" JSONB,
    "metadata" JSONB NOT NULL,
    "seasons" JSONB NOT NULL,
    "related" JSONB NOT NULL,
    "recommended" JSONB NOT NULL,
    "lastFetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnimeProviderSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimeEpisodeSnapshot" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "episodeNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "image" TEXT,
    "isFiller" BOOLEAN NOT NULL DEFAULT false,
    "isSubbed" BOOLEAN,
    "isDubbed" BOOLEAN,
    "idByProvider" JSONB NOT NULL,
    "availableProviders" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "lastFetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnimeEpisodeSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnimeProviderSnapshot_provider_lastFetchedAt_idx" ON "AnimeProviderSnapshot"("provider", "lastFetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnimeProviderSnapshot_provider_providerId_key" ON "AnimeProviderSnapshot"("provider", "providerId");

-- CreateIndex
CREATE INDEX "AnimeEpisodeSnapshot_provider_providerId_lastFetchedAt_idx" ON "AnimeEpisodeSnapshot"("provider", "providerId", "lastFetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnimeEpisodeSnapshot_provider_providerId_episodeNumber_key" ON "AnimeEpisodeSnapshot"("provider", "providerId", "episodeNumber");
