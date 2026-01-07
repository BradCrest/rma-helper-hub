import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SlackNotification {
  type: "new_rma" | "status_change";
  rma_number: string;
  customer_name: string;
  customer_phone: string;
  product_model?: string;
  serial_number?: string;
  status: string;
  old_status?: string;
  issue_description: string;
}

const statusLabels: Record<string, string> = {
  pending: "待收貨",
  shipped: "已寄出",
  received: "已收貨",
  inspecting: "檢測中",
  contacting: "聯繫客戶中",
  repairing: "維修中",
  waiting_parts: "等待零件",
  completed: "維修完成",
  returning: "寄回中",
  closed: "已結案",
  cancelled: "已取消",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const webhookUrl = Deno.env.get("SLACK_WEBHOOK_URL");
    
    if (!webhookUrl) {
      console.error("SLACK_WEBHOOK_URL not configured");
      return new Response(
        JSON.stringify({ error: "Slack webhook not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const notification: SlackNotification = await req.json();
    console.log("Received notification:", JSON.stringify(notification));

    let message: string;
    
    if (notification.type === "new_rma") {
      message = `🆕 *有新的RMA*
━━━━━━━━━━━━━━━━━━
📋 編號：${notification.rma_number}
👤 客戶：${notification.customer_name}
📞 電話：${notification.customer_phone}
📱 型號：${notification.product_model || "未指定"}
🔢 序號：${notification.serial_number || "未指定"}
📊 狀態：${statusLabels[notification.status] || notification.status}
❓ 問題：${notification.issue_description}`;
    } else {
      const oldStatusLabel = statusLabels[notification.old_status || ""] || notification.old_status || "未知";
      const newStatusLabel = statusLabels[notification.status] || notification.status;
      
      message = `🔄 *有RMA狀態改變*
━━━━━━━━━━━━━━━━━━
📋 編號：${notification.rma_number}
👤 客戶：${notification.customer_name}
📞 電話：${notification.customer_phone}
📱 型號：${notification.product_model || "未指定"}
🔢 序號：${notification.serial_number || "未指定"}
📊 狀態改變：${oldStatusLabel} ➜ ${newStatusLabel}
❓ 問題：${notification.issue_description}`;
    }

    const slackPayload = {
      text: message,
      mrkdwn: true,
    };

    console.log("Sending to Slack:", JSON.stringify(slackPayload));

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slackPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Slack API error:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to send Slack notification" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Slack notification sent successfully");
    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in slack-notify function:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
