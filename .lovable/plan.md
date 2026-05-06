## Plan: Fix cleanup-rma-attachments status query bug

### Problem
The `cleanup-rma-attachments` Edge Function queries for RMAs with `status = 'completed'`, but the RMA system uses `'closed'` as the final status. This causes the cleanup to never find any matching RMAs, so stale reply attachments are never deleted.

### Changes
Edit `supabase/functions/cleanup-rma-attachments/index.ts`:

1. **Line 2** (top comment):  
   `'completed'` → `'closed'`
2. **Line 48** (inline comment):  
   `completed and stale` → `closed and stale`
3. **Line 53** (Supabase query):  
   `.eq("status", "completed")` → `.eq("status", "closed")`

The cutoff logic (`updated_at < cutoff`, 90 days) remains unchanged as requested.

### Deployment
After editing, deploy the `cleanup-rma-attachments` Edge Function immediately.