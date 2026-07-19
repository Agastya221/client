-- Add missing updatedAt column if not present
ALTER TABLE "WatchPartyRoom" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add foreign key for WatchPartyEvent.roomCode -> WatchPartyRoom.code (CASCADE)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WatchPartyEvent_roomCode_fkey'
  ) THEN
    ALTER TABLE "WatchPartyEvent"
      ADD CONSTRAINT "WatchPartyEvent_roomCode_fkey"
      FOREIGN KEY ("roomCode") REFERENCES "WatchPartyRoom"("code") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- Indexes
CREATE INDEX IF NOT EXISTS "WatchPartyRoom_code_idx" ON "WatchPartyRoom"("code");
CREATE INDEX IF NOT EXISTS "WatchPartyRoom_expiresAt_idx" ON "WatchPartyRoom"("expiresAt");
CREATE INDEX IF NOT EXISTS "WatchPartyRoom_lastActivityAt_idx" ON "WatchPartyRoom"("lastActivityAt");
CREATE INDEX IF NOT EXISTS "WatchPartyEvent_roomCode_createdAt_idx" ON "WatchPartyEvent"("roomCode", "createdAt");
CREATE INDEX IF NOT EXISTS "WatchPartyEvent_createdAt_idx" ON "WatchPartyEvent"("createdAt");
