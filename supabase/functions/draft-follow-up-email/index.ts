import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  rmaId: z.string().uuid(),
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await admin
      .from("user_roles").select("role").eq("user_id", user.id)
      .in("role", ["admin", "super_admin"]).maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { rmaId } = parsed.data;

    const { data: rma, error: rmaErr } = await admin
      .from("rma_requests")
      .select("rma_number, customer_name, product_model, product_name, status, updated_at, follow_up_due_at")
      .eq("id", rmaId)
      .maybeSingle();
    if (rmaErr || !rma) {
      return new Response(JSON.stringify({ error: "RMA not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Recent admin replies for personalization
    const { data: replies } = await admin
      .from("rma_thread_messages")
      .select("subject, body, direction, created_at")
      .eq("rma_request_id", rmaId)
      .order("created_at", { ascending: false })
      .limit(5);

    const repliesText = (replies ?? [])
      .map((r) => `[${r.direction} @ ${r.created_at?.slice(0, 10)}] ${r.subject ?? ""}\n${(r.body ?? "").slice(0, 400)}`)
      .join("\n---\n");

    const fallback = buildFallback(rma);

    if (!lovableKey) {
      return new Response(JSON.stringify({ draft: fallback, model: "fallback" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `你是 CREST 潛水電腦保固服務的客服人員，正在撰寫「後續關懷」信件。
要求：
- 使用繁體中文，語氣親切、專業、簡潔。
- 信件目的：在維修案件結案後，主動關心客戶使用狀況。
- 內容包含：問候、詢問產品使用狀況是否一切正常、表達若有任何問題歡迎隨時聯繫。
- 不要重複客戶姓名抬頭與簽名（這些由系統模板處理）。
- 不要包含問卷連結、電子簽名、客服信箱（系統會自動附加）。
- 直接輸出信件正文，無需標題、Markdown，純文字段落即可。
- 長度控制在 80–150 字之間。`;

    const userPrompt = `客戶資訊：
- 姓名：${rma.customer_name ?? "客戶"}
- RMA 編號：${rma.rma_number}
- 產品：${rma.product_model ?? rma.product_name ?? "—"}
- 目前狀態：${rma.status}
- 最後更新：${rma.updated_at?.slice(0, 10)}

近期通訊紀錄（最多 5 筆）：
${repliesText || "（無紀錄）"}

請撰寫關懷信正文。`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (aiRes.status === 429) {
      return new Response(JSON.stringify({ error: "AI 請求過於頻繁，請稍後再試", draft: fallback }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiRes.status === 402) {
      return new Response(JSON.stringify({ error: "AI 額度不足，請至 Lovable 設定加值", draft: fallback }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiRes.ok) {
      console.error("AI gateway err:", aiRes.status, await aiRes.text());
      return new Response(JSON.stringify({ draft: fallback, model: "fallback" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const aiData = await aiRes.json();
    const draft = aiData?.choices?.[0]?.message?.content?.trim() || fallback;

    return new Response(JSON.stringify({ draft, model: "google/gemini-2.5-flash" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("draft-follow-up-email error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function buildFallback(rma: any): string {
  const product = rma.product_model ?? rma.product_name ?? "產品";
  return `感謝您先前選擇 CREST 的保固服務。距離您的 ${product}（RMA ${rma.rma_number}）案件處理完成已過了一段時間，想關心一下目前的使用狀況是否一切順利？

若使用上有任何疑問或產品狀況需要進一步協助，歡迎隨時與我們聯繫，我們將儘速為您處理。

也懇請您撥冗填寫下方的滿意度問卷，您的回饋是我們持續改進的動力，謝謝您！`;
}
