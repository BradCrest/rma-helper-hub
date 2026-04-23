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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "super_admin"])
      .maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use same model setting as draft-email-reply, but fall back to a fast model
    // (this is just for generating a synthetic prompt — no need for top tier)
    const { data: settingRow } = await admin
      .from("ai_settings")
      .select("setting_value")
      .eq("setting_key", "slack_reply_model")
      .maybeSingle();
    let model = (settingRow?.setting_value as string) || "google/gemini-2.5-flash";
    // If admin chose Anthropic for replies, use Lovable AI default for the synthetic prompt
    if (model.startsWith("anthropic/")) {
      model = "google/gemini-2.5-flash";
    }

    // Sample knowledge sources for inspiration
    const { count } = await admin
      .from("email_knowledge_sources")
      .select("id", { count: "exact", head: true });
    const total = count ?? 0;
    if (total === 0) {
      return new Response(
        JSON.stringify({ error: "知識庫目前沒有資料，無法產生模擬來信" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sampleSize = Math.min(5, total);
    const offsets = new Set<number>();
    while (offsets.size < sampleSize) {
      offsets.add(Math.floor(Math.random() * total));
    }
    const samples: { title: string; content: string }[] = [];
    for (const off of offsets) {
      const { data } = await admin
        .from("email_knowledge_sources")
        .select("title, content")
        .range(off, off)
        .maybeSingle();
      if (data) samples.push(data as any);
    }

    // Optional RMA context
    const { count: rmaCount } = await admin
      .from("rma_requests")
      .select("id", { count: "exact", head: true });
    let rmaSnippet: { rma_number: string; product_name: string; customer_name: string } | null = null;
    if ((rmaCount ?? 0) > 0) {
      const off = Math.floor(Math.random() * (rmaCount ?? 1));
      const { data: rma } = await admin
        .from("rma_requests")
        .select("rma_number, product_name, customer_name")
        .range(off, off)
        .maybeSingle();
      if (rma) rmaSnippet = rma as any;
    }

    const refBlock = samples
      .map(
        (s, i) =>
          `[片段 ${i + 1}] 標題: ${s.title}\n內容: ${String(s.content).slice(0, 500)}`
      )
      .join("\n\n---\n\n");

    const rmaHint = rmaSnippet
      ? `\n可參考的真實 RMA 案件（可挑選使用，也可不用）：\nRMA 編號：${rmaSnippet.rma_number}\n產品：${rmaSnippet.product_name}\n客戶名：${rmaSnippet.customer_name}\n`
      : "";

    const systemPrompt = `你是 CREST 客服訓練助理。請根據下方知識庫片段，產生「一封」擬真的客戶來信，讓客服練習回覆。

要求：
- 全部用繁體中文，口語、像真實客戶會寫的方式
- 信件主旨 10-30 字，內文 60-200 字
- 內文要有具體情境（產品問題、寄修、退貨、保固詢問等）
- 寄件人 email 要像真實客戶（用常見姓氏拼音 + @gmail.com / @yahoo.com.tw 等）
- 若情境跟特定 RMA 有關，可填 rmaNumber，否則留空字串
- 不要與某一篇知識庫完全雷同，挑「需要釐清」或「客服容易搞錯」的場景

請以**嚴格 JSON** 輸出（不要任何前後文字、不要 markdown code block）：
{
  "subject": "主旨",
  "body": "內文",
  "sender": "customer@example.com",
  "rmaNumber": ""
}

知識庫片段：
${refBlock}
${rmaHint}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "請產生一封模擬客戶來信。" },
        ],
        response_format: { type: "json_object" },
        stream: false,
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "AI 服務頻率限制，請稍後再試" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI 額度不足，請至 Lovable Cloud 加值" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const raw = aiJson.choices?.[0]?.message?.content?.toString().trim() ?? "";

    let parsed: { subject?: string; body?: string; sender?: string; rmaNumber?: string } = {};
    try {
      // Strip code fences if AI added them despite instructions
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      // Fallback: treat the whole text as body
      parsed = { subject: "", body: raw, sender: "", rmaNumber: "" };
    }

    const subject = String(parsed.subject || "").trim();
    const body = String(parsed.body || "").trim();
    const sender = String(parsed.sender || "").trim();
    const rmaNumber = String(parsed.rmaNumber || "").trim();

    if (!body) {
      return new Response(JSON.stringify({ error: "AI 沒有產生有效內文，請重試" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ subject, body, sender, rmaNumber, model }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-practice-email error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
