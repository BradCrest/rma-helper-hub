import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getAdminUser(req: Request, supabaseUrl: string, anonKey: string) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return null;

  const { data: roles } = await userClient
    .from('user_roles')
    .select('role')
    .eq('user_id', userData.user.id);

  const isAdmin = (roles || []).some((r: { role: string }) =>
    r.role === 'admin' || r.role === 'super_admin'
  );
  return isAdmin ? userData.user : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? '';

    // Outbound shipping is admin-only.
    const adminUser = await getAdminUser(req, supabaseUrl, anonKey);
    if (!adminUser) {
      return new Response(
        JSON.stringify({ error: "未授權：僅管理員可提交回寄資訊" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { rma_request_id, carrier, tracking_number, notes, ship_date, ship_type } = await req.json();

    if (!rma_request_id) {
      return new Response(
        JSON.stringify({ error: "缺少 RMA 編號" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validShipTypes = ['original', 'refurbished', 'new'];
    if (ship_type && !validShipTypes.includes(ship_type)) {
      return new Response(
        JSON.stringify({ error: "無效的回寄類型" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!carrier || carrier.trim().length === 0 || carrier.length > 100) {
      return new Response(
        JSON.stringify({ error: "請填寫物流名稱" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!tracking_number || tracking_number.trim().length === 0 || tracking_number.length > 100) {
      return new Response(
        JSON.stringify({ error: "請填寫物流單號" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

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
      return new Response(
        JSON.stringify({ error: "找不到此 RMA 申請" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: existingOutbound } = await supabase
      .from('rma_shipping')
      .select('id')
      .eq('rma_request_id', rma_request_id)
      .eq('direction', 'outbound')
      .maybeSingle();

    if (existingOutbound) {
      return new Response(
        JSON.stringify({ error: "此 RMA 已有回寄記錄" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    let newStatus = 'shipped_back_original';
    if (ship_type === 'refurbished') newStatus = 'shipped_back_refurbished';
    else if (ship_type === 'new') newStatus = 'shipped_back_new';

    const { error: updateError } = await supabase
      .from('rma_requests')
      .update({ status: newStatus })
      .eq('id', rma_request_id);

    if (updateError) console.error("Error updating RMA status:", updateError);

    console.log(`Outbound shipping submitted by ${adminUser.email} for RMA: ${rmaData.rma_number}, status: ${newStatus}`);

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
