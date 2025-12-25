import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { rma_request_id, carrier, tracking_number, notes, ship_date, ship_type } = await req.json();

    // Validate required fields
    if (!rma_request_id) {
      console.error("Missing rma_request_id");
      return new Response(
        JSON.stringify({ error: "缺少 RMA 編號" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate ship_type
    const validShipTypes = ['original', 'refurbished', 'new'];
    if (ship_type && !validShipTypes.includes(ship_type)) {
      console.error("Invalid ship_type:", ship_type);
      return new Response(
        JSON.stringify({ error: "無效的回寄類型" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!carrier || carrier.trim().length === 0) {
      console.error("Missing carrier");
      return new Response(
        JSON.stringify({ error: "請填寫物流名稱" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!tracking_number || tracking_number.trim().length === 0) {
      console.error("Missing tracking_number");
      return new Response(
        JSON.stringify({ error: "請填寫物流單號" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Verify the RMA request exists
    const { data: rmaData, error: rmaError } = await supabase
      .from('rma_requests')
      .select('id, status, rma_number')
      .eq('id', rma_request_id)
      .maybeSingle();

    if (rmaError) {
      console.error("Error fetching RMA:", rmaError);
      return new Response(
        JSON.stringify({ error: "查詢 RMA 失敗" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!rmaData) {
      console.error("RMA not found:", rma_request_id);
      return new Response(
        JSON.stringify({ error: "找不到此 RMA 申請" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if outbound shipping already exists
    const { data: existingOutbound, error: existingError } = await supabase
      .from('rma_shipping')
      .select('id')
      .eq('rma_request_id', rma_request_id)
      .eq('direction', 'outbound')
      .maybeSingle();

    if (existingError) {
      console.error("Error checking existing outbound shipping:", existingError);
      return new Response(
        JSON.stringify({ error: "查詢回寄資訊失敗" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (existingOutbound) {
      console.error("Outbound shipping already exists for RMA:", rma_request_id);
      return new Response(
        JSON.stringify({ error: "此 RMA 已有回寄記錄" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert outbound shipping record
    const { data: shippingData, error: shippingError } = await supabase
      .from('rma_shipping')
      .insert({
        rma_request_id,
        direction: 'outbound',
        carrier: carrier.trim(),
        tracking_number: tracking_number.trim(),
        notes: notes?.trim() || null,
        ship_date: ship_date || new Date().toISOString().split('T')[0],
      })
      .select()
      .single();

    if (shippingError) {
      console.error("Error inserting outbound shipping:", shippingError);
      return new Response(
        JSON.stringify({ error: "新增回寄資訊失敗" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine the new status based on ship_type
    let newStatus = 'shipped_back_original'; // Default
    if (ship_type === 'refurbished') {
      newStatus = 'shipped_back_refurbished';
    } else if (ship_type === 'new') {
      newStatus = 'shipped_back_new';
    } else if (ship_type === 'original') {
      newStatus = 'shipped_back_original';
    }

    // Update RMA status
    const { error: updateError } = await supabase
      .from('rma_requests')
      .update({ status: newStatus })
      .eq('id', rma_request_id);

    if (updateError) {
      console.error("Error updating RMA status:", updateError);
      // Note: shipping was already created, so we log but don't fail
    }

    console.log(`Outbound shipping submitted successfully for RMA: ${rmaData.rma_number}, status: ${newStatus}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "回寄資訊已成功提交",
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
