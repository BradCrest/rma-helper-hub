import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25 MB
const SIGNED_URL_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const ATTACHMENT_BUCKET = "rma-attachments";
const LIBRARY_BUCKET = "shared-library";

const AttachmentSchema = z.object({
  name: z.string().min(1).max(255),
  path: z.string().min(1).max(500),
  size: z.number().int().nonnegative().max(MAX_ATTACHMENT_SIZE),
  contentType: z.string().max(200).optional(),
  source: z.enum(["upload", "library"]).default("upload"),
  libraryFileId: z.string().uuid().optional(),
});

const BodySchema = z.object({
  rmaRequestId: z.string().uuid(),
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(20000),
  attachments: z.array(AttachmentSchema).max(5).default([]),
});

// Always use the published public domain so the reply link is not gated
// behind Lovable's preview-environment login.
const PUBLIC_BASE_URL = "https://rma-helper-hub.lovable.app";

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Auth: require admin
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
    const {
      data: { user },
    } = await userClient.auth.getUser();
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

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const { rmaRequestId, subject, body, attachments } = parsed.data;

    // Validate attachment paths per source:
    //  - upload  → must be scoped under rma-replies/{rmaRequestId}/
    //  - library → must exist in shared_library_files (path match)
    const expectedPrefix = `rma-replies/${rmaRequestId}/`;
    const libraryPaths = attachments
      .filter((a) => a.source === "library")
      .map((a) => a.path);
    let validLibraryPaths = new Set<string>();
    if (libraryPaths.length > 0) {
      const { data: libRows } = await admin
        .from("shared_library_files")
        .select("path")
        .in("path", libraryPaths);
      validLibraryPaths = new Set((libRows ?? []).map((r: any) => r.path));
    }
    for (const a of attachments) {
      if (a.source === "library") {
        if (!validLibraryPaths.has(a.path)) {
          return new Response(
            JSON.stringify({
              error: `檔案庫附件無效：${a.name}（檔案不存在或已刪除）`,
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      } else {
        if (!a.path.startsWith(expectedPrefix)) {
          return new Response(
            JSON.stringify({
              error: `附件路徑無效：${a.name}（必須屬於本筆 RMA）`,
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      }
    }

    // Fetch RMA
    const { data: rma, error: rmaErr } = await admin
      .from("rma_requests")
      .select("id, rma_number, customer_name, customer_email")
      .eq("id", rmaRequestId)
      .maybeSingle();
    if (rmaErr || !rma) {
      return new Response(JSON.stringify({ error: "找不到 RMA" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!rma.customer_email) {
      return new Response(
        JSON.stringify({ error: "此 RMA 沒有客戶 Email" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Generate reply token (30 days)
    const replyToken =
      crypto.randomUUID().replace(/-/g, "") +
      crypto.randomUUID().replace(/-/g, "");
    const expiresAt = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const replyUrl = `${PUBLIC_BASE_URL}/rma-reply/${replyToken}`;

    // Build attachment metadata to persist (without signed URLs — those expire)
    const uploadedAt = new Date().toISOString();
    const attachmentMetadata = attachments.map((a) => ({
      name: a.name,
      path: a.path,
      size: a.size,
      contentType: a.contentType ?? null,
      uploadedAt,
    }));

    // Insert thread message FIRST so we have an id for idempotency
    const { data: inserted, error: insErr } = await admin
      .from("rma_thread_messages")
      .insert({
        rma_request_id: rmaRequestId,
        direction: "outbound",
        subject,
        body,
        reply_token: replyToken,
        reply_token_expires_at: expiresAt,
        created_by: user.id,
        from_email: user.email,
        attachments: attachmentMetadata,
      })
      .select("id")
      .single();
    if (insErr || !inserted) {
      console.error("thread insert err:", insErr);
      return new Response(
        JSON.stringify({ error: "無法建立回覆紀錄" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Generate 30-day signed download URLs for each attachment
    const templateAttachments: Array<{ name: string; url: string; size: number }> = [];
    for (const a of attachments) {
      const { data: signed, error: signErr } = await admin.storage
        .from(ATTACHMENT_BUCKET)
        .createSignedUrl(a.path, SIGNED_URL_TTL_SECONDS, {
          download: a.name,
        });
      if (signErr || !signed?.signedUrl) {
        console.error("signed url err:", a.path, signErr);
        return new Response(
          JSON.stringify({
            error: `無法產生附件下載連結：${a.name}`,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      templateAttachments.push({
        name: a.name,
        url: signed.signedUrl,
        size: a.size,
      });
    }


    // Send via the transactional email system (noreply@notify.crestdiving.com)
    // Call via fetch directly so we can forward the user's JWT (admin.functions.invoke
    // would send the service-role key, which the gateway rejects as invalid JWT format).
    const sendRes = await fetch(
      `${supabaseUrl}/functions/v1/send-transactional-email`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
          apikey: anonKey,
        },
        body: JSON.stringify({
          templateName: "rma-reply",
          recipientEmail: rma.customer_email,
          idempotencyKey: `rma-reply-${inserted.id}`,
          templateData: {
            subject,
            customerName: rma.customer_name || "客戶",
            rmaNumber: rma.rma_number,
            replyBody: body,
            replyUrl,
            attachments: templateAttachments,
          },
        }),
      },
    );

    if (!sendRes.ok) {
      const errText = await sendRes.text();
      console.error("send-transactional-email error:", sendRes.status, errText);
      return new Response(
        JSON.stringify({
          error: `寄送失敗 (${sendRes.status})：${errText.slice(0, 500)}`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const sendData = await sendRes.json().catch(() => null);

    return new Response(
      JSON.stringify({
        success: true,
        threadMessageId: inserted.id,
        replyUrl,
        send: sendData ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("send-rma-reply error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
