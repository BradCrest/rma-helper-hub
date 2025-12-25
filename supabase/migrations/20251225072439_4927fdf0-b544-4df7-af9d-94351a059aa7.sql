CREATE OR REPLACE FUNCTION public.generate_rma_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  year_hex TEXT;
  monthly_count INTEGER;
  total_count INTEGER;
  current_year INTEGER;
  current_month INTEGER;
BEGIN
  -- Get current year and month
  current_year := EXTRACT(YEAR FROM NOW())::INTEGER;
  current_month := EXTRACT(MONTH FROM NOW())::INTEGER;
  
  -- Convert year to hexadecimal (uppercase)
  year_hex := UPPER(TO_HEX(current_year));
  
  -- Get monthly sequence count
  SELECT COUNT(*) + 1 INTO monthly_count
  FROM public.rma_requests
  WHERE EXTRACT(YEAR FROM created_at) = current_year
    AND EXTRACT(MONTH FROM created_at) = current_month;
  
  -- Get total sequence count
  SELECT COUNT(*) + 1 INTO total_count
  FROM public.rma_requests;
  
  -- Format: RC + YearHex + MonthlySeq(3 digits) + TotalSeq(last 3 digits)
  NEW.rma_number := 'RC' || year_hex || LPAD(monthly_count::TEXT, 3, '0') || LPAD((total_count % 1000)::TEXT, 3, '0');
  
  RETURN NEW;
END;
$function$;