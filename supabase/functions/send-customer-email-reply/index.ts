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
  gmailMessageId: z.string().min(1).max(200),
  recipientEmail: z.string().email().max(320),
  recipientName: z.string().max(200).optional(),
  rmaNumber: z.string().max(50).optional(),
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(20000),
  attachments: z.array(AttachmentSchema).max(5).default([]),
});

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
    const {
      gmailMessageId,
      recipientEmail,
      recipientName,
      rmaNumber,
      subject,
      body,
      attachments,
    } = parsed.data;

    // Validate attachment paths per source:
    //  - upload  → must be scoped under email-replies/{gmailMessageId}/
    //  - library → must exist in shared_library_files (path match)
    const expectedPrefix = `email-replies/${gmailMessageId}/`;
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
              error: `附件路徑無效：${a.name}（必須屬於本封來信回覆）`,
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      }
    }

    // Generate 30-day signed download URLs for each attachment.
    const templateAttachments: Array<{ name: string; url: string; size: number }> = [];
    for (const a of attachments) {
      const bucket = a.source === "library" ? LIBRARY_BUCKET : ATTACHMENT_BUCKET;
      const { data: signed, error: signErr } = await admin.storage
        .from(bucket)
        .createSignedUrl(a.path, SIGNED_URL_TTL_SECONDS, {
          download: a.name,
        });
      if (signErr || !signed?.signedUrl) {
        console.error("signed url err:", bucket, a.path, signErr);
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

    // Send via the transactional email system.
    // idempotencyKey includes a timestamp so the same admin can send multiple
    // distinct replies to the same Gmail thread.
    const idempotencyKey = `customer-email-reply-${gmailMessageId}-${Date.now()}`;
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
          templateName: "customer-email-reply",
          recipientEmail,
          idempotencyKey,
          templateData: {
            subject,
            customerName: recipientName || "您好",
            rmaNumber: rmaNumber ?? "",
            replyBody: body,
            attachments: templateAttachments,
          },
        }),
      },
    );

    if (!sendRes.ok) {
      const errText = await sendRes.text();
      console.error(
        "send-transactional-email error:",
        sendRes.status,
        errText,
      );
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
        send: sendData ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("send-customer-email-reply error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
