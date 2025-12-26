-- 修改 generate_rma_number 函數為 SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.generate_rma_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  year_hex TEXT;
  monthly_count INTEGER;
  total_count INTEGER;
  current_year INTEGER;
  current_month INTEGER;
BEGIN
  current_year := EXTRACT(YEAR FROM NOW())::INTEGER;
  current_month := EXTRACT(MONTH FROM NOW())::INTEGER;
  year_hex := UPPER(TO_HEX(current_year));
  
  SELECT COUNT(*) + 1 INTO monthly_count
  FROM public.rma_requests
  WHERE EXTRACT(YEAR FROM created_at) = current_year
    AND EXTRACT(MONTH FROM created_at) = current_month;
  
  SELECT COUNT(*) + 1 INTO total_count
  FROM public.rma_requests;
  
  NEW.rma_number := 'RC' || year_hex || LPAD(monthly_count::TEXT, 3, '0') || LPAD((total_count % 1000)::TEXT, 3, '0');
  
  RETURN NEW;
END;
$function$;

-- 修改 update_updated_at_column 函數為 SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;