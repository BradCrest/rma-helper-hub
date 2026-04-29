import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GMAIL_GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

const BodySchema = z.object({
  rmaRequestId: z.string().uuid(),
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(20000),
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildRawEmail(opts: {
  to: string;
  subject: string;
  textBody: string;
  htmlBody: string;
}): string {
  const boundary = "crest_boundary_" + crypto.randomUUID().replace(/-/g, "");
  const subjEnc = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(opts.subject)))}?=`;
  const lines = [
    `To: ${opts.to}`,
    `Subject: ${subjEnc}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    opts.textBody,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    opts.htmlBody,
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
  // base64url
  const utf8 = new TextEncoder().encode(lines);
  let bin = "";
  utf8.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const gmailKey = Deno.env.get("GOOGLE_MAIL_API_KEY");
    if (!lovableKey) throw new Error("LOVABLE_API_KEY 未設定");
    if (!gmailKey) throw new Error("GOOGLE_MAIL_API_KEY 未設定（Gmail 連線可能未連結）");

    // Auth
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
      .from("user_roles").select("role")
      .eq("user_id", user.id).in("role", ["admin", "super_admin"]).maybeSingle();
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
    const { rmaRequestId, subject, body } = parsed.data;

    // Fetch RMA
    const { data: rma, error: rmaErr } = await admin
      .from("rma_requests")
      .select("id, rma_number, customer_name, customer_email")
      .eq("id", rmaRequestId)
      .maybeSingle();
    if (rmaErr || !rma) {
      return new Response(JSON.stringify({ error: "找不到 RMA" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!rma.customer_email) {
      return new Response(JSON.stringify({ error: "此 RMA 沒有客戶 Email" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate reply token (30 days)
    const replyToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // Always use the published public domain so the link is not gated behind
    // Lovable's preview-environment login. (Update if a custom domain is set.)
    const PUBLIC_BASE_URL = "https://rma-helper-hub.lovable.app";
    const replyUrl = `${PUBLIC_BASE_URL}/rma-reply/${replyToken}`;

    const customerName = rma.customer_name || "客戶";
    const textBody =
`您好 ${customerName}，

關於您的維修申請 ${rma.rma_number}，我們的回覆如下：

${body}

——
若您針對這個回覆有進一步的疑問或說明，請點擊下方連結填寫：
${replyUrl}
（連結 30 天內有效，僅可使用一次）

CREST 客服團隊`;

    const htmlBody = `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#1f2937;max-width:600px;margin:0 auto;padding:24px;">
<p>您好 ${escapeHtml(customerName)}，</p>
<p>關於您的維修申請 <strong>${escapeHtml(rma.rma_number)}</strong>，我們的回覆如下：</p>
<div style="background:#f9fafb;border-left:4px solid #3b82f6;padding:16px 20px;margin:16px 0;white-space:pre-wrap;">${escapeHtml(body)}</div>
<p style="margin-top:24px;">若您針對這個回覆有進一步的疑問或說明，請點擊下方按鈕：</p>
<p style="text-align:center;margin:24px 0;">
  <a href="${replyUrl}" style="display:inline-block;background:#3b82f6;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">填寫我的回覆</a>
</p>
<p style="font-size:12px;color:#6b7280;">或複製此連結到瀏覽器開啟：<br/><a href="${replyUrl}" style="color:#3b82f6;word-break:break-all;">${replyUrl}</a><br/>（連結 30 天內有效，僅可使用一次）</p>
<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
<p style="color:#6b7280;font-size:14px;">CREST 客服團隊</p>
</body></html>`;

    const raw = buildRawEmail({
      to: rma.customer_email,
      subject,
      textBody,
      htmlBody,
    });

    // Send via Gmail
    const gRes = await fetch(`${GMAIL_GATEWAY}/users/me/messages/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": gmailKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });
    if (!gRes.ok) {
      const t = await gRes.text();
      console.error("Gmail send failed:", gRes.status, t);
      return new Response(JSON.stringify({ error: `Gmail 寄送失敗 (${gRes.status})：${t.slice(0, 500)}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const gJson = await gRes.json();
    const gmailMessageId = gJson?.id || null;

    // Log to rma_thread_messages
    const { data: inserted, error: insErr } = await admin
      .from("rma_thread_messages")
      .insert({
        rma_request_id: rmaRequestId,
        direction: "outbound",
        subject,
        body,
        gmail_message_id: gmailMessageId,
        reply_token: replyToken,
        reply_token_expires_at: expiresAt,
        created_by: user.id,
        from_email: user.email,
      })
      .select("id")
      .single();
    if (insErr) console.error("thread insert err:", insErr);

    // Log to email_send_log (best-effort)
    try {
      await admin.from("email_send_log").insert({
        message_id: gmailMessageId,
        template_name: "rma_reply",
        recipient_email: rma.customer_email,
        status: "sent",
        metadata: {
          rma_number: rma.rma_number,
          rma_request_id: rmaRequestId,
          via: "gmail_connector",
          sent_by: user.email,
        },
      });
    } catch (e) {
      console.error("email_send_log insert err:", e);
    }

    return new Response(
      JSON.stringify({ success: true, threadMessageId: inserted?.id, gmailMessageId, replyUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("send-rma-reply error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
