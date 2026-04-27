import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const gmailKey = Deno.env.get("GOOGLE_MAIL_API_KEY");

    if (!lovableKey) throw new Error("LOVABLE_API_KEY 未設定");
    if (!gmailKey) throw new Error("GOOGLE_MAIL_API_KEY 未設定（Gmail 連線可能未連結）");

    // Auth check
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

    // Parse params
    let q = "in:inbox";
    let maxResults = 30;
    let pageToken: string | undefined;

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (typeof body.q === "string" && body.q.trim()) q = body.q.trim();
      if (typeof body.maxResults === "number") maxResults = Math.min(Math.max(body.maxResults, 1), 100);
      if (typeof body.pageToken === "string") pageToken = body.pageToken;
    }

    // 1) List message IDs
    const listUrl = new URL(`${GATEWAY_URL}/users/me/messages`);
    listUrl.searchParams.set("q", q);
    listUrl.searchParams.set("maxResults", String(maxResults));
    if (pageToken) listUrl.searchParams.set("pageToken", pageToken);

    const listRes = await fetch(listUrl.toString(), {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": gmailKey,
      },
    });
    if (!listRes.ok) {
      const text = await listRes.text();
      throw new Error(`Gmail list 失敗 [${listRes.status}]: ${text}`);
    }
    const listData = await listRes.json();
    const messageRefs: Array<{ id: string; threadId: string }> = listData.messages ?? [];

    // 2) Fetch metadata for each (parallel, limited concurrency)
    const fetchOne = async (id: string) => {
      const url = `${GATEWAY_URL}/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`;
      const r = await fetch(url, {
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": gmailKey,
        },
      });
      if (!r.ok) return null;
      const m = await r.json();
      const headers: Array<{ name: string; value: string }> = m.payload?.headers ?? [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
      return {
        id: m.id,
        threadId: m.threadId,
        snippet: m.snippet ?? "",
        labelIds: m.labelIds ?? [],
        unread: (m.labelIds ?? []).includes("UNREAD"),
        from: getHeader("From"),
        subject: getHeader("Subject"),
        date: getHeader("Date"),
        internalDate: m.internalDate,
      };
    };

    // batch in chunks of 10 to avoid overwhelming
    const messages: any[] = [];
    for (let i = 0; i < messageRefs.length; i += 10) {
      const chunk = messageRefs.slice(i, i + 10);
      const results = await Promise.all(chunk.map((ref) => fetchOne(ref.id)));
      messages.push(...results.filter(Boolean));
    }

    return new Response(
      JSON.stringify({
        messages,
        nextPageToken: listData.nextPageToken ?? null,
        resultSizeEstimate: listData.resultSizeEstimate ?? 0,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("gmail-list-messages error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
