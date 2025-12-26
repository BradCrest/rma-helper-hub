import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt } = await req.json();
    
    if (!prompt) {
      return new Response(
        JSON.stringify({ error: "請輸入分析需求" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI 服務未設定" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Fetching RMA data for analysis...");

    // Fetch RMA data for analysis
    const [
      rmaRequestsResult,
      repairDetailsResult,
      shippingResult,
      statusHistoryResult,
      supplierRepairsResult,
    ] = await Promise.all([
      supabase.from("rma_requests").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("rma_repair_details").select("*").limit(500),
      supabase.from("rma_shipping").select("*").limit(500),
      supabase.from("rma_status_history").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("rma_supplier_repairs").select("*").limit(500),
    ]);

    const rmaData = {
      rma_requests: rmaRequestsResult.data || [],
      repair_details: repairDetailsResult.data || [],
      shipping: shippingResult.data || [],
      status_history: statusHistoryResult.data || [],
      supplier_repairs: supplierRepairsResult.data || [],
      summary: {
        total_requests: rmaRequestsResult.data?.length || 0,
        total_repairs: repairDetailsResult.data?.length || 0,
        total_shipments: shippingResult.data?.length || 0,
      }
    };

    console.log(`Fetched data: ${rmaData.summary.total_requests} requests, ${rmaData.summary.total_repairs} repairs`);

    const systemPrompt = `你是一個專業的 RMA（Return Merchandise Authorization）資料分析助手。
你的任務是根據提供的 RMA 資料回答用戶的問題並提供有價值的分析。

資料結構說明：
- rma_requests: RMA 申請記錄，包含客戶資訊、產品資訊、問題描述、狀態等
- repair_details: 維修詳情，包含維修方式、成本等
- shipping: 物流記錄，包含寄送方向、追蹤編號等
- status_history: 狀態變更歷史
- supplier_repairs: 供應商送修記錄

狀態說明：
- registered: 已登記
- shipped: 已寄出
- received: 已收件
- inspecting: 檢測中
- contacting: 聯繫中
- quote_confirmed: 報價確認
- paid: 已付款
- no_repair: 不維修
- repairing: 維修中
- shipped_back: 已寄回
- shipped_back_refurbished: 已寄回(整新機)
- shipped_back_original: 已寄回(原機)
- shipped_back_new: 已寄回(新品)
- follow_up: 後續追蹤
- closed: 已結案

回答時請：
1. 使用繁體中文回答
2. 提供具體的數據和統計
3. 如果需要，提供視覺化的表格或列表
4. 給出可行的建議
5. 保持專業和簡潔`;

    const userMessage = `以下是目前的 RMA 資料庫資料（JSON 格式）：

${JSON.stringify(rmaData, null, 2)}

用戶的問題：${prompt}

請根據以上資料進行分析並回答問題。`;

    console.log("Sending request to Lovable AI...");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "請求過於頻繁，請稍後再試" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI 服務額度不足" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI 服務錯誤" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Streaming response from AI...");

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("Error in rma-ai-analysis:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "未知錯誤" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
