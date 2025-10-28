-- Migration: Add retry and checkpoint fields to webhooks table
-- Date: 2025-10-28
-- Description: Adds fields for checkpoint-based processing and retry logic

-- Add processing_context field (stores data from each completed stage)
ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS processing_context JSONB DEFAULT '{}';

-- Add completed_stages field (array of stage names that finished successfully)
ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS completed_stages JSONB DEFAULT '[]';

-- Add failed_stage field (the exact stage where processing failed)
ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS failed_stage VARCHAR(100);

-- Add retry_count field (number of retry attempts)
ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;

-- Add last_retry_at field (timestamp of last retry attempt)
ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMP;

-- Add is_retriable field (whether the webhook can be retried)
ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS is_retriable BOOLEAN DEFAULT true;

-- Create index on failed_stage for faster queries
CREATE INDEX IF NOT EXISTS idx_webhooks_failed_stage ON webhooks(failed_stage) WHERE failed_stage IS NOT NULL;

-- Create index on is_retriable for dashboard queries
CREATE INDEX IF NOT EXISTS idx_webhooks_retriable ON webhooks(is_retriable) WHERE is_retriable = true AND status = 'error';

-- Create index on retry_count for monitoring
CREATE INDEX IF NOT EXISTS idx_webhooks_retry_count ON webhooks(retry_count) WHERE retry_count > 0;

-- Add comment to table
COMMENT ON COLUMN webhooks.processing_context IS 'Stores cached data from each completed stage to avoid re-executing API calls';
COMMENT ON COLUMN webhooks.completed_stages IS 'Array of stage names that completed successfully (checkpoint list)';
COMMENT ON COLUMN webhooks.failed_stage IS 'The exact stage where processing failed';
COMMENT ON COLUMN webhooks.retry_count IS 'Number of times this webhook has been retried';
COMMENT ON COLUMN webhooks.last_retry_at IS 'Timestamp of the last retry attempt';
COMMENT ON COLUMN webhooks.is_retriable IS 'Whether this webhook can be retried (false for fatal errors)';
