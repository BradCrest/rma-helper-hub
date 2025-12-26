import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Convert RMA data to a structured text description for embedding
function rmaToText(rma: any, repairDetails?: any, shipping?: any[], supplierRepair?: any): string {
  const parts: string[] = [];
  
  // Basic RMA info
  parts.push(`RMA編號: ${rma.rma_number}`);
  parts.push(`客戶: ${rma.customer_name}`);
  if (rma.customer_phone) parts.push(`電話: ${rma.customer_phone}`);
  if (rma.customer_email) parts.push(`Email: ${rma.customer_email}`);
  if (rma.customer_type) parts.push(`客戶類型: ${rma.customer_type}`);
  
  // Product info
  parts.push(`產品: ${rma.product_name}`);
  if (rma.product_model) parts.push(`型號: ${rma.product_model}`);
  if (rma.serial_number) parts.push(`序號: ${rma.serial_number}`);
  if (rma.purchase_date) parts.push(`購買日期: ${rma.purchase_date}`);
  if (rma.warranty_status) parts.push(`保固狀態: ${rma.warranty_status}`);
  
  // Issue info
  parts.push(`問題類型: ${rma.issue_type}`);
  parts.push(`問題描述: ${rma.issue_description}`);
  if (rma.customer_issue) parts.push(`客戶反映: ${rma.customer_issue}`);
  if (rma.initial_diagnosis) parts.push(`初步診斷: ${rma.initial_diagnosis}`);
  if (rma.diagnosis_category) parts.push(`診斷類別: ${rma.diagnosis_category}`);
  
  // Status
  parts.push(`狀態: ${rma.status}`);
  if (rma.received_date) parts.push(`收件日期: ${rma.received_date}`);
  
  // Repair details
  if (repairDetails) {
    if (repairDetails.planned_method) parts.push(`計劃維修方式: ${repairDetails.planned_method}`);
    if (repairDetails.actual_method) parts.push(`實際維修方式: ${repairDetails.actual_method}`);
    if (repairDetails.estimated_cost) parts.push(`預估成本: NT$ ${repairDetails.estimated_cost}`);
    if (repairDetails.actual_cost) parts.push(`實際成本: NT$ ${repairDetails.actual_cost}`);
    if (repairDetails.replacement_model) parts.push(`更換型號: ${repairDetails.replacement_model}`);
  }
  
  // Shipping info
  if (shipping && shipping.length > 0) {
    const inbound = shipping.find(s => s.direction === 'inbound');
    const outbound = shipping.find(s => s.direction === 'outbound');
    if (inbound) {
      parts.push(`寄入物流: ${inbound.carrier || '未知'}`);
      if (inbound.tracking_number) parts.push(`寄入追蹤號: ${inbound.tracking_number}`);
    }
    if (outbound) {
      parts.push(`寄回物流: ${outbound.carrier || '未知'}`);
      if (outbound.tracking_number) parts.push(`寄回追蹤號: ${outbound.tracking_number}`);
    }
  }
  
  // Supplier repair info
  if (supplierRepair) {
    if (supplierRepair.supplier_status) parts.push(`供應商狀態: ${supplierRepair.supplier_status}`);
    if (supplierRepair.factory_analysis) parts.push(`原廠分析: ${supplierRepair.factory_analysis}`);
    if (supplierRepair.factory_repair_method) parts.push(`原廠維修方式: ${supplierRepair.factory_repair_method}`);
  }
  
  return parts.join('\n');
}

// Generate embedding using OpenAI API
async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
      dimensions: 1536,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error("OpenAI API error:", error);
    throw new Error(`OpenAI API error: ${response.status}`);
  }
  
  const data = await response.json();
  return data.data[0].embedding;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "Embedding 服務未設定" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, rma_request_id, batch_size = 50, offset = 0 } = await req.json();

    if (action === "single" && rma_request_id) {
      // Process single RMA
      console.log(`Processing single RMA: ${rma_request_id}`);
      
      const { data: rma, error: rmaError } = await supabase
        .from("rma_requests")
        .select("*")
        .eq("id", rma_request_id)
        .single();
      
      if (rmaError || !rma) {
        return new Response(
          JSON.stringify({ error: "找不到 RMA 資料" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Fetch related data
      const [repairResult, shippingResult, supplierResult] = await Promise.all([
        supabase.from("rma_repair_details").select("*").eq("rma_request_id", rma_request_id).maybeSingle(),
        supabase.from("rma_shipping").select("*").eq("rma_request_id", rma_request_id),
        supabase.from("rma_supplier_repairs").select("*").eq("rma_request_id", rma_request_id).maybeSingle(),
      ]);
      
      const content = rmaToText(rma, repairResult.data, shippingResult.data ?? undefined, supplierResult.data);
      const embedding = await generateEmbedding(content, OPENAI_API_KEY);
      
      // Upsert embedding
      const { error: upsertError } = await supabase
        .from("rma_embeddings")
        .upsert({
          rma_request_id,
          content,
          content_type: "full_record",
          embedding: `[${embedding.join(",")}]`,
          metadata: {
            rma_number: rma.rma_number,
            status: rma.status,
            product_name: rma.product_name,
            issue_type: rma.issue_type,
            created_at: rma.created_at,
          },
        }, { onConflict: "rma_request_id,content_type" });
      
      if (upsertError) {
        console.error("Upsert error:", upsertError);
        throw upsertError;
      }
      
      return new Response(
        JSON.stringify({ success: true, processed: 1 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (action === "batch") {
      // Batch process RMAs
      console.log(`Processing batch: offset=${offset}, batch_size=${batch_size}`);
      
      // Get RMAs that don't have embeddings yet or need update
      const { data: rmas, error: rmasError } = await supabase
        .from("rma_requests")
        .select("id")
        .order("created_at", { ascending: false })
        .range(offset, offset + batch_size - 1);
      
      if (rmasError) {
        console.error("Error fetching RMAs:", rmasError);
        throw rmasError;
      }
      
      if (!rmas || rmas.length === 0) {
        return new Response(
          JSON.stringify({ success: true, processed: 0, message: "沒有更多資料需要處理" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      let processed = 0;
      let errors = 0;
      
      for (const rmaRef of rmas) {
        try {
          // Fetch full RMA data
          const { data: rma } = await supabase
            .from("rma_requests")
            .select("*")
            .eq("id", rmaRef.id)
            .single();
          
          if (!rma) continue;
          
          // Fetch related data
          const [repairResult, shippingResult, supplierResult] = await Promise.all([
            supabase.from("rma_repair_details").select("*").eq("rma_request_id", rmaRef.id).maybeSingle(),
            supabase.from("rma_shipping").select("*").eq("rma_request_id", rmaRef.id),
            supabase.from("rma_supplier_repairs").select("*").eq("rma_request_id", rmaRef.id).maybeSingle(),
          ]);
          
          const content = rmaToText(rma, repairResult.data, shippingResult.data ?? undefined, supplierResult.data);
          const embedding = await generateEmbedding(content, OPENAI_API_KEY);
          
          // Upsert embedding
          await supabase
            .from("rma_embeddings")
            .upsert({
              rma_request_id: rmaRef.id,
              content,
              content_type: "full_record",
              embedding: `[${embedding.join(",")}]`,
              metadata: {
                rma_number: rma.rma_number,
                status: rma.status,
                product_name: rma.product_name,
                issue_type: rma.issue_type,
                created_at: rma.created_at,
              },
            }, { onConflict: "rma_request_id,content_type" });
          
          processed++;
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (e) {
          console.error(`Error processing RMA ${rmaRef.id}:`, e);
          errors++;
        }
      }
      
      // Get total count for progress
      const { count: totalCount } = await supabase
        .from("rma_requests")
        .select("*", { count: "exact", head: true });
      
      const { count: embeddedCount } = await supabase
        .from("rma_embeddings")
        .select("*", { count: "exact", head: true });
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          processed, 
          errors,
          total: totalCount,
          embedded: embeddedCount,
          hasMore: offset + batch_size < (totalCount || 0),
          nextOffset: offset + batch_size,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (action === "status") {
      // Get embedding status
      const { count: totalCount } = await supabase
        .from("rma_requests")
        .select("*", { count: "exact", head: true });
      
      const { count: embeddedCount } = await supabase
        .from("rma_embeddings")
        .select("*", { count: "exact", head: true })
        .eq("status", "completed");
      
      const { count: pendingCount } = await supabase
        .from("rma_embeddings")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");
      
      return new Response(
        JSON.stringify({ 
          total: totalCount || 0,
          embedded: embeddedCount || 0,
          pending: pendingCount || 0,
          percentage: totalCount ? Math.round((embeddedCount || 0) / totalCount * 100) : 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (action === "sync") {
      // Process all pending embeddings
      console.log("Processing pending embeddings...");
      
      const { data: pendingRecords, error: pendingError } = await supabase
        .from("rma_embeddings")
        .select("rma_request_id")
        .eq("status", "pending")
        .limit(batch_size);
      
      if (pendingError) {
        console.error("Error fetching pending records:", pendingError);
        throw pendingError;
      }
      
      if (!pendingRecords || pendingRecords.length === 0) {
        return new Response(
          JSON.stringify({ success: true, processed: 0, message: "沒有待同步的記錄" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      let processed = 0;
      let errors = 0;
      
      for (const record of pendingRecords) {
        try {
          // Mark as processing
          await supabase
            .from("rma_embeddings")
            .update({ status: "processing" })
            .eq("rma_request_id", record.rma_request_id);
          
          // Fetch full RMA data
          const { data: rma } = await supabase
            .from("rma_requests")
            .select("*")
            .eq("id", record.rma_request_id)
            .single();
          
          if (!rma) {
            await supabase
              .from("rma_embeddings")
              .update({ status: "failed" })
              .eq("rma_request_id", record.rma_request_id);
            continue;
          }
          
          // Fetch related data
          const [repairResult, shippingResult, supplierResult] = await Promise.all([
            supabase.from("rma_repair_details").select("*").eq("rma_request_id", record.rma_request_id).maybeSingle(),
            supabase.from("rma_shipping").select("*").eq("rma_request_id", record.rma_request_id),
            supabase.from("rma_supplier_repairs").select("*").eq("rma_request_id", record.rma_request_id).maybeSingle(),
          ]);
          
          const content = rmaToText(rma, repairResult.data, shippingResult.data ?? undefined, supplierResult.data);
          const embedding = await generateEmbedding(content, OPENAI_API_KEY);
          
          // Update embedding with completed status
          await supabase
            .from("rma_embeddings")
            .update({
              content,
              embedding: `[${embedding.join(",")}]`,
              status: "completed",
              metadata: {
                rma_number: rma.rma_number,
                status: rma.status,
                product_name: rma.product_name,
                issue_type: rma.issue_type,
                created_at: rma.created_at,
              },
            })
            .eq("rma_request_id", record.rma_request_id);
          
          processed++;
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (e) {
          console.error(`Error processing RMA ${record.rma_request_id}:`, e);
          await supabase
            .from("rma_embeddings")
            .update({ status: "failed" })
            .eq("rma_request_id", record.rma_request_id);
          errors++;
        }
      }
      
      // Get updated counts
      const { count: remainingPending } = await supabase
        .from("rma_embeddings")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          processed, 
          errors,
          remainingPending: remainingPending || 0,
          hasMore: (remainingPending || 0) > 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    return new Response(
      JSON.stringify({ error: "無效的操作" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in generate-rma-embeddings:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "未知錯誤" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
