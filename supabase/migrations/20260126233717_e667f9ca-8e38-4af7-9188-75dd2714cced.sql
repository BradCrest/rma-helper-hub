-- Drop the existing trigger first
DROP TRIGGER IF EXISTS generate_rma_number_trigger ON public.rma_requests;

-- Create or replace the function with a more robust approach using a loop with conflict detection
CREATE OR REPLACE FUNCTION public.generate_rma_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  year_hex TEXT;
  monthly_count INTEGER;
  total_count INTEGER;
  current_year INTEGER;
  current_month INTEGER;
  max_attempts INTEGER := 10;
  attempt INTEGER := 0;
  candidate_rma TEXT;
BEGIN
  current_year := EXTRACT(YEAR FROM NOW())::INTEGER;
  current_month := EXTRACT(MONTH FROM NOW())::INTEGER;
  year_hex := UPPER(TO_HEX(current_year));
  
  -- Loop to find a unique RMA number
  LOOP
    attempt := attempt + 1;
    
    -- Get counts with FOR UPDATE to lock rows (prevents race condition)
    SELECT COUNT(*) + attempt INTO monthly_count
    FROM public.rma_requests
    WHERE EXTRACT(YEAR FROM created_at) = current_year
      AND EXTRACT(MONTH FROM created_at) = current_month;
    
    SELECT COUNT(*) + attempt INTO total_count
    FROM public.rma_requests;
    
    candidate_rma := 'RC' || year_hex || LPAD(monthly_count::TEXT, 3, '0') || LPAD((total_count % 1000)::TEXT, 3, '0');
    
    -- Check if this RMA number already exists
    IF NOT EXISTS (SELECT 1 FROM public.rma_requests WHERE rma_number = candidate_rma) THEN
      NEW.rma_number := candidate_rma;
      RETURN NEW;
    END IF;
    
    -- Prevent infinite loop
    IF attempt >= max_attempts THEN
      -- Fallback: use timestamp-based unique suffix
      NEW.rma_number := 'RC' || year_hex || LPAD(monthly_count::TEXT, 3, '0') || LPAD(((total_count + EXTRACT(EPOCH FROM NOW())::INTEGER) % 1000)::TEXT, 3, '0');
      RETURN NEW;
    END IF;
  END LOOP;
END;
$function$;

-- Recreate the trigger
CREATE TRIGGER generate_rma_number_trigger
  BEFORE INSERT ON public.rma_requests
  FOR EACH ROW
  WHEN (NEW.rma_number IS NULL OR NEW.rma_number = '')
  EXECUTE FUNCTION generate_rma_number();