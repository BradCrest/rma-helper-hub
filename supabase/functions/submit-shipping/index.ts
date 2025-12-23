import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { rma_request_id, carrier, tracking_number, photo_url } = await req.json();

    // Validate required fields
    if (!rma_request_id || !carrier || !tracking_number) {
      return new Response(
        JSON.stringify({ error: "缺少必要欄位：rma_request_id, carrier, tracking_number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate input lengths
    if (carrier.length > 100) {
      return new Response(
        JSON.stringify({ error: "物流名稱過長" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (tracking_number.length > 100) {
      return new Response(
        JSON.stringify({ error: "物流單號過長" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role key to bypass RLS
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the RMA exists
    const { data: rmaData, error: rmaError } = await supabase
      .from("rma_requests")
      .select("id, rma_number, status")
      .eq("id", rma_request_id)
      .single();

    if (rmaError || !rmaData) {
      console.error("RMA lookup error:", rmaError);
      return new Response(
        JSON.stringify({ error: "找不到此 RMA" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if already has inbound shipping info
    const { data: existingShipping, error: existingError } = await supabase
      .from("rma_shipping")
      .select("id")
      .eq("rma_request_id", rma_request_id)
      .eq("direction", "inbound")
      .maybeSingle();

    if (existingShipping) {
      return new Response(
        JSON.stringify({ error: "此 RMA 已有寄件資訊，無法重複新增" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert shipping record
    const { data: shippingData, error: insertError } = await supabase
      .from("rma_shipping")
      .insert({
        rma_request_id,
        direction: "inbound",
        carrier: carrier.trim(),
        tracking_number: tracking_number.trim(),
        photo_url: photo_url || null,
        ship_date: new Date().toISOString().split("T")[0],
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "新增寄件資訊失敗" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update RMA status to shipped (客戶已寄出)
    const { error: updateError } = await supabase
      .from("rma_requests")
      .update({ status: "shipped" })
      .eq("id", rma_request_id);

    if (updateError) {
      console.error("Update status error:", updateError);
      // Don't fail the request, just log the error
    }

    console.log(`Shipping info added for RMA: ${rmaData.rma_number}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "寄件資訊已新增成功",
        shipping: shippingData 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "伺服器錯誤，請稍後再試" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
