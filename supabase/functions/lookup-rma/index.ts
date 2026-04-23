import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mask sensitive information
function maskName(name: string): string {
  if (!name || name.length <= 1) return name;
  if (name.length === 2) return name[0] + '*';
  return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1];
}

function maskPhone(phone: string): string {
  if (!phone || phone.length <= 4) return phone;
  const visibleStart = 4;
  const visibleEnd = 3;
  return phone.substring(0, visibleStart) + '***' + phone.substring(phone.length - visibleEnd);
}

function maskEmail(email: string): string {
  if (!email) return email;
  const parts = email.split('@');
  if (parts.length !== 2) return email;
  const username = parts[0];
  const domain = parts[1];
  if (username.length <= 1) return username[0] + '***@' + domain;
  return username[0] + '***@' + domain;
}

// Normalize phone number for flexible matching
function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('886')) digits = digits.substring(3);
  if (digits.startsWith('0')) digits = digits.substring(1);
  return digits;
}

// Verify the request is from an authenticated admin.
// Returns true only if the JWT belongs to a user with admin/super_admin role.
async function isAdminCaller(req: Request, supabaseUrl: string, anonKey: string): Promise<boolean> {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) return false;
    const token = authHeader.slice(7).trim();
    if (!token) return false;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return false;

    const { data: roleData, error: roleErr } = await userClient
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id);
    if (roleErr || !roleData) return false;

    return roleData.some((r: { role: string }) => r.role === 'admin' || r.role === 'super_admin');
  } catch (e) {
    console.error('isAdminCaller error:', e);
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? '';

    const url = new URL(req.url);
    const rmaNumber = url.searchParams.get('rma_number');
    const customerName = url.searchParams.get('customer_name');
    const customerPhone = url.searchParams.get('customer_phone');
    const requestedFullDetails = url.searchParams.get('full_details') === 'true';

    // Only admins may receive full unmasked PII. Anonymous callers always get masked data.
    const isAdmin = requestedFullDetails ? await isAdminCaller(req, supabaseUrl, anonKey) : false;
    const includeFullDetails = requestedFullDetails && isAdmin;

    if (requestedFullDetails && !isAdmin) {
      console.warn('lookup-rma: full_details=true requested without admin auth — falling back to masked');
    }

    if (!rmaNumber && (!customerName || !customerPhone)) {
      return new Response(
        JSON.stringify({ error: '請提供 RMA 編號或客戶姓名及電話' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    let query = supabaseAdmin.from('rma_requests').select('*');

    if (rmaNumber) {
      const normalizedInput = rmaNumber.trim().toUpperCase();
      query = query.ilike('rma_number', `%${normalizedInput}%`);

      const { data, error } = await query;
      if (error) {
        console.error('Database error:', error);
        return new Response(
          JSON.stringify({ error: '查詢失敗' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const inputWithoutDashes = normalizedInput.replace(/-/g, '');
      const filtered = data?.filter(r =>
        r.rma_number.replace(/-/g, '').toUpperCase().includes(inputWithoutDashes) ||
        inputWithoutDashes.includes(r.rma_number.replace(/-/g, '').toUpperCase())
      ) || [];

      if (filtered.length === 0) {
        return new Response(
          JSON.stringify({ error: '找不到符合的 RMA 申請', results: [] }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const rmaIds = filtered.map(r => r.id);
      const { data: historyData } = await supabaseAdmin
        .from('rma_status_history')
        .select('id, rma_request_id, status, created_at, notes')
        .in('rma_request_id', rmaIds)
        .order('created_at', { ascending: false });

      const historyByRmaId: Record<string, any[]> = {};
      (historyData || []).forEach(h => {
        if (!historyByRmaId[h.rma_request_id]) historyByRmaId[h.rma_request_id] = [];
        historyByRmaId[h.rma_request_id].push({
          id: h.id,
          status: h.status,
          created_at: h.created_at,
          notes: h.notes,
        });
      });

      const maskedResults = filtered.map(rma => ({
        id: rma.id,
        rma_number: rma.rma_number,
        status: rma.status,
        product_name: rma.product_name,
        product_model: rma.product_model,
        serial_number: rma.serial_number,
        issue_type: rma.issue_type,
        issue_description: includeFullDetails ? rma.issue_description : undefined,
        purchase_date: rma.purchase_date,
        created_at: rma.created_at,
        updated_at: rma.updated_at,
        customer_name: includeFullDetails ? rma.customer_name : maskName(rma.customer_name),
        customer_phone: includeFullDetails ? rma.customer_phone : maskPhone(rma.customer_phone),
        customer_email: includeFullDetails ? rma.customer_email : maskEmail(rma.customer_email),
        customer_address: includeFullDetails ? rma.customer_address : null,
        photo_urls: includeFullDetails ? rma.photo_urls : null,
        status_history: historyByRmaId[rma.id] || [],
      }));

      console.log(`Found ${maskedResults.length} RMA(s) for query: ${rmaNumber} (admin=${isAdmin})`);

      return new Response(
        JSON.stringify({ results: maskedResults }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (customerName && customerPhone) {
      const { data, error } = await supabaseAdmin
        .from('rma_requests')
        .select('*')
        .ilike('customer_name', `%${customerName.trim()}%`)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Database error:', error);
        return new Response(
          JSON.stringify({ error: '查詢失敗' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const normalizedInputPhone = normalizePhone(customerPhone);
      const filteredData = (data || []).filter(rma => {
        const normalizedDbPhone = normalizePhone(rma.customer_phone || '');
        return normalizedDbPhone.includes(normalizedInputPhone) ||
               normalizedInputPhone.includes(normalizedDbPhone);
      });

      if (filteredData.length === 0) {
        return new Response(
          JSON.stringify({ error: '找不到符合的 RMA 申請', results: [] }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const rmaIds = filteredData.map(r => r.id);
      const { data: historyData } = await supabaseAdmin
        .from('rma_status_history')
        .select('id, rma_request_id, status, created_at, notes')
        .in('rma_request_id', rmaIds)
        .order('created_at', { ascending: false });

      const historyByRmaId: Record<string, any[]> = {};
      (historyData || []).forEach(h => {
        if (!historyByRmaId[h.rma_request_id]) historyByRmaId[h.rma_request_id] = [];
        historyByRmaId[h.rma_request_id].push({
          id: h.id,
          status: h.status,
          created_at: h.created_at,
          notes: h.notes,
        });
      });

      // Customer search by name+phone is intentionally always masked, regardless of admin flag,
      // to prevent admins from accidentally exposing PII via customer-facing flows.
      const maskedResults = filteredData.map(rma => ({
        id: rma.id,
        rma_number: rma.rma_number,
        status: rma.status,
        product_name: rma.product_name,
        product_model: rma.product_model,
        serial_number: rma.serial_number,
        issue_type: rma.issue_type,
        purchase_date: rma.purchase_date,
        created_at: rma.created_at,
        updated_at: rma.updated_at,
        customer_name: maskName(rma.customer_name),
        customer_phone: maskPhone(rma.customer_phone),
        customer_email: maskEmail(rma.customer_email),
        customer_address: null,
        status_history: historyByRmaId[rma.id] || [],
      }));

      console.log(`Found ${maskedResults.length} RMA(s) for customer: ${customerName}`);

      return new Response(
        JSON.stringify({ results: maskedResults }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: '無效的請求' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in lookup-rma function:', error);
    return new Response(
      JSON.stringify({ error: '伺服器錯誤，請稍後再試' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
