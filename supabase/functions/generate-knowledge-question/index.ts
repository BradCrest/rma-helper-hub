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

    // Get configured admin chat model
    const { data: settingRow } = await admin
      .from("ai_settings")
      .select("setting_value")
      .eq("setting_key", "admin_chat_model")
      .maybeSingle();
    const model = (settingRow?.setting_value as string) || "google/gemini-2.5-flash";

    // Sample knowledge sources: get total count, pick random offsets
    const { count } = await admin
      .from("email_knowledge_sources")
      .select("id", { count: "exact", head: true });

    const total = count ?? 0;
    const sampleSize = Math.min(5, total);

    let samples: { title: string; content: string }[] = [];
    if (total === 0) {
      return new Response(
        JSON.stringify({ error: "知識庫目前沒有資料，無法產生練習題" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Pick up to sampleSize random offsets
    const offsets = new Set<number>();
    while (offsets.size < sampleSize) {
      offsets.add(Math.floor(Math.random() * total));
    }

    for (const off of offsets) {
      const { data } = await admin
        .from("email_knowledge_sources")
        .select("title, content")
        .range(off, off)
        .maybeSingle();
      if (data) samples.push(data as any);
    }

    const refBlock = samples
      .map(
        (s, i) =>
          `[片段 ${i + 1}] 標題: ${s.title}\n內容: ${String(s.content).slice(0, 600)}`
      )
      .join("\n\n---\n\n");

    const systemPrompt = `你是 CREST 客服訓練助理。請根據下方提供的知識庫片段，產生「一個」實際可能發生的客戶來信情境問題，讓客服練習回覆。

要求：
- 繁體中文、口語化、像真實客戶會問的方式
- 長度 20-60 字
- 只輸出問題本身，不要解釋、不要編號、不要前綴（例如「題目：」）
- 問題要具體、貼近知識庫內容，但不要與某一篇完全雷同
- 可以挑「需要補充說明」或「容易回答錯」的場景

知識庫片段：
${refBlock}`;

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
          { role: "user", content: "請產生一個練習題。" },
        ],
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
    // Strip surrounding quotes / common prefixes
    const question = raw
      .replace(/^["「『]+|["」』]+$/g, "")
      .replace(/^題目[:：]\s*/, "")
      .replace(/^\d+[\.\)、]\s*/, "")
      .trim();

    if (!question) {
      return new Response(JSON.stringify({ error: "AI 沒有產生有效題目，請重試" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ question }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-knowledge-question error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
