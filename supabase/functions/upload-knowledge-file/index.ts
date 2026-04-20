import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const CHUNK_SIZE = 1500; // chars per chunk
const CHUNK_OVERLAP = 150;

function chunkText(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (clean.length <= size) return [clean];

  // Try to split on paragraph boundaries first
  const paragraphs = clean.split(/\n\s*\n/);
  const chunks: string[] = [];
  let buffer = "";

  for (const p of paragraphs) {
    if ((buffer + "\n\n" + p).length <= size) {
      buffer = buffer ? buffer + "\n\n" + p : p;
    } else {
      if (buffer) chunks.push(buffer);
      if (p.length <= size) {
        buffer = p;
      } else {
        // Hard-split very long paragraphs
        let i = 0;
        while (i < p.length) {
          chunks.push(p.slice(i, i + size));
          i += size - overlap;
        }
        buffer = "";
      }
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks.filter((c) => c.trim().length > 0);
}

async function parsePdfWithGemini(bytes: Uint8Array, fileName: string, apiKey: string): Promise<string> {
  // Convert to base64
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)) as any);
  }
  const base64 = btoa(binary);

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `請從這份 PDF (${fileName}) 中完整擷取所有可讀文字，保留段落結構，不要加任何說明。` },
            { type: "image_url", image_url: { url: `data:application/pdf;base64,${base64}` } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini PDF parse failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content || "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");

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

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const language = (formData.get("language") as string) || "zh-TW";
    const tag = (formData.get("tag") as string) || "";

    if (!file) {
      return new Response(JSON.stringify({ error: "No file provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (file.size > MAX_FILE_SIZE) {
      return new Response(JSON.stringify({ error: "檔案過大（最大 10MB）" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fileName = file.name;
    const ext = fileName.split(".").pop()?.toLowerCase() || "";

    // Sanitize filename for storage key (Supabase Storage only allows ASCII-safe chars)
    const baseName = fileName.replace(/\.[^.]+$/, "");
    const safeBase = baseName
      .normalize("NFKD")
      .replace(/[^\w.\-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 80) || "file";
    const safeFileName = ext ? `${safeBase}.${ext}` : safeBase;
    const supportedText = ["md", "txt", "eml", "markdown"];
    const supportedDoc = ["pdf"];

    if (!supportedText.includes(ext) && !supportedDoc.includes(ext)) {
      return new Response(
        JSON.stringify({ error: `不支援的檔案類型：.${ext}（支援：md, txt, eml, pdf）` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());

    // Upload to storage
    const storagePath = `${user.id}/${crypto.randomUUID()}-${safeFileName}`;
    const { error: uploadErr } = await admin.storage
      .from("knowledge-files")
      .upload(storagePath, bytes, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (uploadErr) throw new Error("Storage upload failed: " + uploadErr.message);

    // Parse content
    let textContent = "";
    if (supportedText.includes(ext)) {
      textContent = new TextDecoder("utf-8").decode(bytes);
    } else if (ext === "pdf") {
      if (!lovableKey) throw new Error("PDF 解析需要 LOVABLE_API_KEY");
      textContent = await parsePdfWithGemini(bytes, fileName, lovableKey);
    }

    if (!textContent || textContent.trim().length === 0) {
      // cleanup
      await admin.storage.from("knowledge-files").remove([storagePath]);
      throw new Error("無法解析檔案內容（檔案可能為空或格式不支援）");
    }

    // Chunk
    const chunks = chunkText(textContent);
    const totalChunks = chunks.length;

    // Insert one knowledge_source per chunk (sharing file_path so we can group/cleanup)
    const inserted: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const baseTitle = fileName.replace(/\.[^.]+$/, "");
      const title =
        totalChunks === 1 ? `📎 ${baseTitle}` : `📎 ${baseTitle} (${i + 1}/${totalChunks})`;

      const { data: src, error: srcErr } = await admin
        .from("email_knowledge_sources")
        .insert({
          source_type: "document",
          title,
          content: chunk,
          file_path: storagePath,
          file_name: fileName,
          file_type: ext,
          file_size: file.size,
          metadata: {
            language,
            tag: tag || undefined,
            chunk_index: i,
            total_chunks: totalChunks,
          },
          created_by: user.id,
        })
        .select("id")
        .single();
      if (srcErr) {
        console.error("Insert source failed:", srcErr);
        continue;
      }
      inserted.push(src.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        file_name: fileName,
        file_path: storagePath,
        chunks: totalChunks,
        sources_created: inserted.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("upload-knowledge-file error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
