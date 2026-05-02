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
  messageBody: z.string().min(1).max(10000),
  subject: z.string().max(300).optional(),
  includeSurvey: z.boolean().optional().default(true),
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

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
    const { rmaId, messageBody, subject, includeSurvey } = parsed.data;

    const { data: rma, error: rmaErr } = await admin
      .from("rma_requests")
      .select("rma_number, customer_name, customer_email, product_model")
      .eq("id", rmaId)
      .maybeSingle();
    if (rmaErr || !rma) {
      return new Response(JSON.stringify({ error: "RMA not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!rma.customer_email) {
      return new Response(JSON.stringify({ error: "客戶 Email 缺失，無法寄出" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create or reuse a survey token if needed
    let surveyUrl = "";
    if (includeSurvey) {
      const createRes = await fetch(
        `${supabaseUrl}/functions/v1/create-follow-up-survey`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
            apikey: anonKey,
            origin: req.headers.get("origin") ?? "",
          },
          body: JSON.stringify({ rmaId, reuseExisting: true }),
        },
      );
      if (createRes.ok) {
        const createData = await createRes.json();
        surveyUrl = createData?.surveyUrl ?? "";
      } else {
        console.error("create-follow-up-survey failed:", await createRes.text());
      }
    }

    const finalSubject =
      subject?.trim() ||
      `CREST 保固服務 — 關於您 RMA ${rma.rma_number} 的後續關懷`;

    const idempotencyKey = `follow-up-care-${rmaId}-${Date.now()}`;
    const sendRes = await fetch(
      `${supabaseUrl}/functions/v1/send-transactional-email`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
        body: JSON.stringify({
          templateName: "follow-up-care",
          recipientEmail: rma.customer_email,
          idempotencyKey,
          templateData: {
            subject: finalSubject,
            customerName: rma.customer_name ?? "您好",
            rmaNumber: rma.rma_number,
            productModel: rma.product_model ?? "",
            messageBody,
            surveyUrl,
          },
        }),
      },
    );

    if (!sendRes.ok) {
      const errText = await sendRes.text();
      console.error("send-transactional-email error:", sendRes.status, errText);
      return new Response(JSON.stringify({
        error: `寄送失敗 (${sendRes.status})：${errText.slice(0, 500)}`,
      }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sendData = await sendRes.json().catch(() => null);

    return new Response(JSON.stringify({
      success: true, send: sendData ?? null, surveyUrl,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("send-follow-up-email error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
