import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Generate embedding using OpenAI API
async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
      dimensions: 1536,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error("OpenAI Embedding API error:", error);
    throw new Error(`Embedding API error: ${response.status}`);
  }
  
  const data = await response.json();
  return data.data[0].embedding;
}

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
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI 服務未設定" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let contextData: string;
    let searchMethod: string;

    // Check if we have embeddings and can use RAG
    const { count: embeddingCount } = await supabase
      .from("rma_embeddings")
      .select("*", { count: "exact", head: true });

    if (OPENAI_API_KEY && embeddingCount && embeddingCount > 0) {
      // Use RAG: Semantic search for relevant data
      console.log("Using RAG with semantic search...");
      searchMethod = "RAG";
      
      // Generate embedding for the user's prompt
      const promptEmbedding = await generateEmbedding(prompt, OPENAI_API_KEY);
      
      // Search for relevant RMA records
      const { data: relevantRecords, error: searchError } = await supabase
        .rpc("search_rma_embeddings", {
          query_embedding: `[${promptEmbedding.join(",")}]`,
          match_threshold: 0.3,
          match_count: 20,
        });
      
      if (searchError) {
        console.error("Semantic search error:", searchError);
        throw searchError;
      }
      
      if (relevantRecords && relevantRecords.length > 0) {
        console.log(`Found ${relevantRecords.length} relevant records via semantic search`);
        
        // Format the relevant records for the AI
        contextData = relevantRecords.map((record: any, index: number) => {
          return `--- 相關記錄 ${index + 1} (相似度: ${(record.similarity * 100).toFixed(1)}%) ---\n${record.content}`;
        }).join("\n\n");
      } else {
        console.log("No relevant records found, falling back to recent data");
        // Fallback to recent records if no semantic matches
        const { data: recentRmas } = await supabase
          .from("rma_requests")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(20);
        
        contextData = recentRmas ? JSON.stringify(recentRmas, null, 2) : "無資料";
      }
    } else {
      // Fallback: Traditional approach (limited data dump)
      console.log("Using traditional approach (no embeddings available)...");
      searchMethod = "Traditional";
      
      const [rmaRequestsResult, repairDetailsResult] = await Promise.all([
        supabase.from("rma_requests").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("rma_repair_details").select("*").limit(100),
      ]);

      const rmaData = {
        rma_requests: rmaRequestsResult.data || [],
        repair_details: repairDetailsResult.data || [],
        summary: {
          total_requests: rmaRequestsResult.data?.length || 0,
          total_repairs: repairDetailsResult.data?.length || 0,
        }
      };

      contextData = JSON.stringify(rmaData, null, 2);
    }

    console.log(`Search method: ${searchMethod}, Context length: ${contextData.length} chars`);

    const systemPrompt = `你是一個專業的 RMA（Return Merchandise Authorization）資料分析助手。
你的任務是根據提供的 RMA 資料回答用戶的問題並提供有價值的分析。

${searchMethod === "RAG" ? `
注意：以下資料是透過語意搜尋找到的「最相關」記錄。
這些記錄是根據用戶問題的語意相似度篩選出來的，不是全部資料。
如果用戶詢問的是統計數據（如總數、比例），請提醒他們這些數據僅基於相關記錄，不代表整體資料庫。
` : `
注意：以下資料是最近的 RMA 記錄（有數量限制），不是全部資料。
`}

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
2. 提供具體的數據和統計（基於提供的資料）
3. 如果需要，提供視覺化的表格或列表
4. 給出可行的建議
5. 保持專業和簡潔`;

    const userMessage = `以下是${searchMethod === "RAG" ? "透過語意搜尋找到的相關" : "最近的"} RMA 資料：

${contextData}

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
