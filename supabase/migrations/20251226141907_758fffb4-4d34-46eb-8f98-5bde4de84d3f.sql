-- Step 1: Add status column to rma_embeddings table
ALTER TABLE public.rma_embeddings 
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed';

-- Add index for faster queries on pending records
CREATE INDEX IF NOT EXISTS idx_rma_embeddings_status ON public.rma_embeddings(status);

-- Step 2: Create function to mark embedding for update when RMA changes
CREATE OR REPLACE FUNCTION public.mark_embedding_pending()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if embedding exists
  IF EXISTS (SELECT 1 FROM public.rma_embeddings WHERE rma_request_id = NEW.id) THEN
    -- Update existing embedding to pending
    UPDATE public.rma_embeddings 
    SET status = 'pending', updated_at = now()
    WHERE rma_request_id = NEW.id;
  ELSE
    -- Insert placeholder for new RMA
    INSERT INTO public.rma_embeddings (rma_request_id, content, content_type, status)
    VALUES (NEW.id, '', 'full_record', 'pending');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 3: Create trigger on rma_requests
DROP TRIGGER IF EXISTS trigger_mark_embedding_pending ON public.rma_requests;

CREATE TRIGGER trigger_mark_embedding_pending
AFTER INSERT OR UPDATE ON public.rma_requests
FOR EACH ROW
EXECUTE FUNCTION public.mark_embedding_pending();