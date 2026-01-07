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
  registered: "已登記",
  shipped: "已寄出",
  received: "已收貨",
  inspecting: "檢測中",
  contacting: "聯繫客戶中",
  quote_confirmed: "報價確認",
  paid: "已付款",
  no_repair: "不維修",
  repairing: "維修中",
  waiting_parts: "等待零件",
  completed: "維修完成",
  shipped_back: "寄回中",
  shipped_back_refurbished: "寄回（整新機）",
  shipped_back_original: "寄回（原機）",
  shipped_back_new: "寄回（新品）",
  follow_up: "追蹤中",
  closed: "已結案",
  cancelled: "已取消",
  unknown: "未知",
};

// 格式化電話號碼，確保保留前導 0
const formatPhone = (phone: string): string => {
  if (!phone) return "未提供";
  
  // 如果是純數字且長度為 9-10 碼（台灣手機去掉 0），補回 0
  if (/^\d{9,10}$/.test(phone) && !phone.startsWith('0')) {
    return '0' + phone;
  }
  
  return phone;
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
📞 電話：${formatPhone(notification.customer_phone)}
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
📞 電話：${formatPhone(notification.customer_phone)}
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
