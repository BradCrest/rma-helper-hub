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
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

    // Auth
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

    const { subject, body, sender, rmaNumber } = await req.json();
    if (!body || typeof body !== "string" || body.trim().length === 0) {
      return new Response(JSON.stringify({ error: "缺少客戶 Email 內文" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Read configured model
    const { data: settingRow } = await admin
      .from("ai_settings")
      .select("setting_value")
      .eq("setting_key", "slack_reply_model")
      .maybeSingle();
    const model = (settingRow?.setting_value as string) || "google/gemini-2.5-pro";

    // RAG retrieval
    const queryText = [subject, body].filter(Boolean).join("\n").slice(0, 8000);
    let ragContext = "";
    let ragCount = 0;
    if (openaiKey) {
      try {
        const embRes = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "text-embedding-3-small",
            input: queryText,
          }),
        });
        if (embRes.ok) {
          const embJson = await embRes.json();
          const queryVec = embJson.data?.[0]?.embedding;
          if (queryVec) {
            const { data: matches } = await admin.rpc("search_email_embeddings", {
              query_embedding: queryVec,
              match_threshold: 0.3,
              match_count: 8,
            });
            if (matches && matches.length > 0) {
              ragCount = matches.length;
              ragContext = matches
                .map((m: any, i: number) =>
                  `[參考 ${i + 1}] 類型: ${m.source_type} | 標題: ${m.title}\n${m.content}\n`
                )
                .join("\n---\n");
            }
          }
        }
      } catch (e) {
        console.error("RAG error:", e);
      }
    }

    // Optional RMA context
    let rmaContext = "";
    if (rmaNumber) {
      const { data: rma } = await admin
        .from("rma_requests")
        .select("rma_number, customer_name, product_name, product_model, issue_description, status, created_at")
        .ilike("rma_number", String(rmaNumber).replace(/-/g, ""))
        .maybeSingle();
      if (rma) {
        rmaContext = `\n相關 RMA 案件：\nRMA 編號：${rma.rma_number}\n客戶：${rma.customer_name}\n產品：${rma.product_name} ${rma.product_model || ""}\n問題：${rma.issue_description}\n狀態：${rma.status}\n建立時間：${rma.created_at}\n`;
      }
    }

    const systemPrompt = `你是 CREST 客服回覆助手。請依據客戶來信內容，草擬一封專業、親切、簡潔的繁體中文回覆信件。

回覆原則：
- 開頭以「您好」或「Dear ${sender || "客戶"}」開場
- 直接回應客戶的問題或訴求
- 若知識庫中有相似情境的歷史回覆，請參考其用語與處理方式
- 結尾署名「CREST 客服團隊」
- 不要用 Markdown 標題符號（#、**），保持純文字 Email 格式
- 若客戶情緒激動，先表達理解再說明
${rmaContext ? `\n${rmaContext}` : ""}
${ragContext ? `\n知識庫參考內容（共 ${ragCount} 筆）：\n${ragContext}` : "（知識庫中未找到高相似度的歷史回覆，請依一般客服語氣回覆）"}`;

    const userMessage = `客戶來信
寄件人：${sender || "(未提供)"}
主旨：${subject || "(無主旨)"}

內文：
${body}

請草擬回覆。`;

    let draft = "";

    if (model.startsWith("anthropic/")) {
      // Anthropic Messages API
      if (!anthropicKey) {
        return new Response(JSON.stringify({ error: "尚未設定 ANTHROPIC_API_KEY，無法使用 Claude 模型" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const claudeModel = model.replace(/^anthropic\//, "");
      const aRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: claudeModel,
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: "user", content: userMessage }],
        }),
      });
      if (!aRes.ok) {
        const t = await aRes.text();
        console.error("Anthropic error:", aRes.status, t);
        return new Response(JSON.stringify({ error: `Anthropic API 錯誤 (${aRes.status})：${t.slice(0, 500)}` }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const aJson = await aRes.json();
      draft = (aJson.content || []).map((c: any) => c.text || "").join("");
    } else {
      // Lovable AI Gateway (Gemini / GPT-5)
      if (!lovableKey) {
        return new Response(JSON.stringify({ error: "LOVABLE_API_KEY 未設定" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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
            { role: "user", content: userMessage },
          ],
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
        console.error("Lovable AI error:", aiRes.status, t);
        return new Response(JSON.stringify({ error: `AI gateway 錯誤 (${aiRes.status})` }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const aiJson = await aiRes.json();
      draft = aiJson.choices?.[0]?.message?.content || "";
    }

    return new Response(
      JSON.stringify({
        draft,
        model,
        ragCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("draft-email-reply error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
