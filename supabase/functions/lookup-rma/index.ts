import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ---------- Masking helpers ----------
function maskName(name: string): string {
  if (!name || name.length <= 1) return name;
  if (name.length === 2) return name[0] + '*';
  return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1];
}
function maskPhone(phone: string): string {
  if (!phone || phone.length <= 4) return phone;
  return phone.substring(0, 4) + '***' + phone.substring(phone.length - 3);
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

// ---------- Normalization helpers ----------
function normalizeRma(s: string): string {
  return (s || '').trim().toUpperCase().replace(/-/g, '');
}
function normalizePhoneDigits(s: string): string {
  return (s || '').replace(/\D/g, '');
}
function phoneLast3(s: string): string {
  const d = normalizePhoneDigits(s);
  return d.length >= 3 ? d.slice(-3) : d;
}
function normalizeEmail(s: string): string {
  return (s || '').trim().toLowerCase();
}
function normalizeName(s: string): string {
  return (s || '').trim();
}

// ---------- Admin check ----------
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

// ---------- Safe (anonymous) response shape ----------
function buildSafeResult(rma: Record<string, unknown>, history: Array<{ status: string; created_at: string }>) {
  return {
    rma_number: rma.rma_number,
    status: rma.status,
    product_name: rma.product_name,
    product_model: rma.product_model,
    issue_type: rma.issue_type,
    purchase_date: rma.purchase_date,
    created_at: rma.created_at,
    updated_at: rma.updated_at,
    customer_name: maskName(rma.customer_name as string),
    customer_phone: maskPhone(rma.customer_phone as string),
    customer_email: maskEmail(rma.customer_email as string),
    status_history: history.map(h => ({ status: h.status, created_at: h.created_at })),
  };
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
    const rmaNumberParam = url.searchParams.get('rma_number');
    const customerNameParam = url.searchParams.get('customer_name');
    const customerPhoneParam = url.searchParams.get('customer_phone');
    const customerEmailParam = url.searchParams.get('customer_email');
    const requestedFullDetails = url.searchParams.get('full_details') === 'true';
    const purposeParam = url.searchParams.get('purpose');

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // ---------- Email-link path (bearer-by-link) ----------
    // Used when customers click a link in our automated emails. The email itself
    // is the proof-of-access; we skip phone/email second-factor BUT return zero PII.
    if (purposeParam === 'email_link') {
      if (!rmaNumberParam || !rmaNumberParam.trim()) {
        console.log('email_link lookup rejected: missing rma_number');
        return new Response(
          JSON.stringify({ error: '缺少 RMA 編號' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const normalized = normalizeRma(rmaNumberParam);
      if (normalized.length < 6) {
        console.log('email_link lookup rejected: rma too short', normalized);
        return new Response(
          JSON.stringify({ error: '請提供完整 RMA 編號' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data, error } = await supabaseAdmin
        .from('rma_requests')
        .select('id, rma_number, status, product_name, product_model, issue_type, purchase_date, created_at, updated_at')
        .ilike('rma_number', `%${normalized.slice(0, 8)}%`)
        .limit(50);
      if (error) {
        console.error('email_link lookup error:', error);
        return new Response(
          JSON.stringify({ error: '查詢失敗' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const matched = (data || []).filter((r: { rma_number: string }) => normalizeRma(r.rma_number) === normalized);
      if (matched.length !== 1) {
        console.log('email_link lookup miss', { rma_number: normalized, matched: matched.length });
        return new Response(
          JSON.stringify({ error: '找不到符合的 RMA 申請', results: [] }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const rma = matched[0];
      // NOTE: do NOT select notes — they may contain customer PII or internal details
      const { data: historyData } = await supabaseAdmin
        .from('rma_status_history')
        .select('id, status, created_at')
        .eq('rma_request_id', rma.id)
        .order('created_at', { ascending: false });

      const minimal = {
        id: rma.id,
        rma_number: rma.rma_number,
        status: rma.status,
        product_name: rma.product_name,
        product_model: rma.product_model,
        issue_type: rma.issue_type,
        purchase_date: rma.purchase_date,
        created_at: rma.created_at,
        updated_at: rma.updated_at,
        status_history: (historyData || []).map((h: { id: string; status: string; created_at: string }) => ({
          id: h.id, status: h.status, created_at: h.created_at,
        })),
      };
      console.log('email_link lookup OK', { rma_number: rma.rma_number });
      return new Response(
        JSON.stringify({ results: [minimal] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ---------- Admin path ----------
    if (requestedFullDetails) {
      const isAdmin = await isAdminCaller(req, supabaseUrl, anonKey);
      if (!isAdmin) {
        return new Response(
          JSON.stringify({ error: 'Admin authentication required for full details' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Admin must still provide an identifier
      if (!rmaNumberParam && !(customerNameParam && (customerPhoneParam || customerEmailParam))) {
        return new Response(
          JSON.stringify({ error: '請提供 RMA 編號或客戶姓名 + 電話/Email' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let adminQuery = supabaseAdmin.from('rma_requests').select('*');
      if (rmaNumberParam) {
        const normalized = normalizeRma(rmaNumberParam);
        // Fetch a small candidate set then strict-match in JS
        const { data, error } = await adminQuery.ilike('rma_number', `%${normalized.slice(0, 8)}%`).limit(50);
        if (error) {
          console.error('Admin lookup error:', error);
          return new Response(JSON.stringify({ error: '查詢失敗' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const filtered = (data || []).filter(r => normalizeRma(r.rma_number) === normalized);
        return await respondAdmin(filtered, supabaseAdmin);
      } else {
        // name + phone/email (admin convenience: name exact, phone last3 or email exact)
        const nameNorm = normalizeName(customerNameParam!);
        const { data, error } = await adminQuery.eq('customer_name', nameNorm).limit(50);
        if (error) {
          return new Response(JSON.stringify({ error: '查詢失敗' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const filtered = (data || []).filter(r => {
          if (customerEmailParam) return normalizeEmail(r.customer_email || '') === normalizeEmail(customerEmailParam);
          if (customerPhoneParam) return phoneLast3(r.customer_phone || '') === phoneLast3(customerPhoneParam);
          return false;
        });
        return await respondAdmin(filtered, supabaseAdmin);
      }
    }

    // ---------- Anonymous path (strict) ----------
    // Required: full RMA OR full name; AND a second factor (phone last3 OR email exact).
    const hasRma = !!rmaNumberParam && rmaNumberParam.trim().length > 0;
    const hasName = !!customerNameParam && customerNameParam.trim().length > 0;
    const hasPhone = !!customerPhoneParam && customerPhoneParam.trim().length > 0;
    const hasEmail = !!customerEmailParam && customerEmailParam.trim().length > 0;

    if (!hasRma && !hasName) {
      return new Response(
        JSON.stringify({ error: '請提供 RMA 編號或姓名，並搭配電話或 Email 驗證' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!hasPhone && !hasEmail) {
      return new Response(
        JSON.stringify({ error: '需要提供電話或 Email 作為驗證' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build candidate set
    let candidates: any[] = [];

    if (hasRma) {
      const normalized = normalizeRma(rmaNumberParam!);
      // Reject obviously partial inputs (RMA numbers in this system are length 11 like RC7EA060462,
      // but we accept any length and rely on strict equality)
      if (normalized.length < 6) {
        return new Response(
          JSON.stringify({ error: '請輸入完整 RMA 編號' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const { data, error } = await supabaseAdmin
        .from('rma_requests')
        .select('*')
        .ilike('rma_number', `%${normalized.slice(0, 8)}%`)
        .limit(50);
      if (error) {
        console.error('Lookup error:', error);
        return new Response(JSON.stringify({ error: '查詢失敗' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      candidates = (data || []).filter(r => normalizeRma(r.rma_number) === normalized);
    } else {
      // Name path: exact match only
      const nameNorm = normalizeName(customerNameParam!);
      const { data, error } = await supabaseAdmin
        .from('rma_requests')
        .select('*')
        .eq('customer_name', nameNorm)
        .limit(50);
      if (error) {
        return new Response(JSON.stringify({ error: '查詢失敗' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      candidates = data || [];
    }

    // Apply second-factor verification
    const verified = candidates.filter(r => {
      if (hasEmail) {
        if (normalizeEmail(r.customer_email || '') !== normalizeEmail(customerEmailParam!)) return false;
      }
      if (hasPhone) {
        if (phoneLast3(r.customer_phone || '') !== phoneLast3(customerPhoneParam!)) return false;
      }
      return true;
    });

    if (verified.length === 0) {
      return new Response(
        JSON.stringify({ error: '找不到符合的 RMA 申請', results: [] }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (verified.length > 1) {
      // Force user to provide a unique identifier (full RMA number)
      return new Response(
        JSON.stringify({ error: '查詢條件不夠精確，請使用完整 RMA 編號查詢', results: [] }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rma = verified[0];
    const { data: historyData } = await supabaseAdmin
      .from('rma_status_history')
      .select('status, created_at')
      .eq('rma_request_id', rma.id)
      .order('created_at', { ascending: false });

    const safe = buildSafeResult(rma, historyData || []);
    console.log(`Anonymous lookup OK for ${rma.rma_number}`);
    return new Response(
      JSON.stringify({ results: [safe] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in lookup-rma function:', error);
    return new Response(
      JSON.stringify({ error: '伺服器錯誤，請稍後再試' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ---------- Admin response builder (full details) ----------
async function respondAdmin(filtered: any[], supabaseAdmin: any): Promise<Response> {
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
  (historyData || []).forEach((h: any) => {
    if (!historyByRmaId[h.rma_request_id]) historyByRmaId[h.rma_request_id] = [];
    historyByRmaId[h.rma_request_id].push({
      id: h.id, status: h.status, created_at: h.created_at, notes: h.notes,
    });
  });

  const { data: shippingData } = await supabaseAdmin
    .from('rma_shipping')
    .select('id, rma_request_id, direction, carrier, tracking_number, ship_date, delivery_date, notes, photo_url, created_at')
    .in('rma_request_id', rmaIds)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false });

  const inboundByRmaId: Record<string, any> = {};
  (shippingData || []).forEach((s: any) => {
    if (!inboundByRmaId[s.rma_request_id]) inboundByRmaId[s.rma_request_id] = s;
  });

  const results = filtered.map(rma => ({
    id: rma.id,
    rma_number: rma.rma_number,
    status: rma.status,
    product_name: rma.product_name,
    product_model: rma.product_model,
    serial_number: rma.serial_number,
    issue_type: rma.issue_type,
    issue_description: rma.issue_description,
    customer_notes: rma.customer_notes,
    customer_type: rma.customer_type,
    mobile_phone: rma.mobile_phone,
    warranty_date: rma.warranty_date,
    purchase_date: rma.purchase_date,
    created_at: rma.created_at,
    updated_at: rma.updated_at,
    updated_by: rma.updated_by,
    updated_by_email: rma.updated_by_email,
    customer_name: rma.customer_name,
    customer_phone: rma.customer_phone,
    customer_email: rma.customer_email,
    customer_address: rma.customer_address,
    photo_urls: rma.photo_urls,
    status_history: historyByRmaId[rma.id] || [],
    inbound_shipping: inboundByRmaId[rma.id] || null,
  }));

  return new Response(
    JSON.stringify({ results }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
