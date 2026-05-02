import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface StatusUpdateRequest {
  rma_id: string;
  new_status: string;
  notes?: string | null;
  follow_up_due_at?: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: StatusUpdateRequest = await req.json();
    console.log("Received update-rma-status request:", JSON.stringify(body));

    if (!body.rma_id || !body.new_status) {
      return new Response(
        JSON.stringify({ error: "Missing rma_id or new_status" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch current RMA data including old status
    const { data: rmaData, error: fetchError } = await supabase
      .from("rma_requests")
      .select("*")
      .eq("id", body.rma_id)
      .single();

    if (fetchError || !rmaData) {
      console.error("Error fetching RMA:", fetchError);
      return new Response(
        JSON.stringify({ error: "RMA not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const oldStatus = rmaData.status;

    // Build update payload
    const updatePayload: Record<string, unknown> = { status: body.new_status };
    if (body.new_status === "follow_up") {
      // Set follow_up_due_at if provided, else default to now() + 7 days
      updatePayload.follow_up_due_at =
        body.follow_up_due_at ??
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    } else if (body.new_status === "closed") {
      // Clear follow_up_due_at when closing
      updatePayload.follow_up_due_at = null;
    }

    const { error: updateError } = await supabase
      .from("rma_requests")
      .update(updatePayload)
      .eq("id", body.rma_id);

    if (updateError) {
      console.error("Error updating RMA status:", updateError);
      return new Response(
        JSON.stringify({ error: `Failed to update status: ${updateError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`RMA ${rmaData.rma_number} status updated from ${oldStatus} to ${body.new_status}`);

    // Send Slack notification for status change
    try {
      const slackResponse = await fetch(`${supabaseUrl}/functions/v1/slack-notify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          type: "status_change",
          rma_number: rmaData.rma_number,
          customer_name: rmaData.customer_name,
          customer_phone: rmaData.customer_phone,
          product_model: rmaData.product_model,
          serial_number: rmaData.serial_number,
          status: body.new_status,
          old_status: oldStatus,
          issue_description: rmaData.issue_description,
        }),
      });

      if (!slackResponse.ok) {
        console.error("Failed to send Slack notification:", await slackResponse.text());
      } else {
        console.log("Slack notification sent for status change");
      }
    } catch (slackError) {
      console.error("Error sending Slack notification:", slackError);
      // Don't fail the request if Slack notification fails
    }

    return new Response(
      JSON.stringify({ success: true, old_status: oldStatus, new_status: body.new_status }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in update-rma-status function:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
