// Mapping of email template names (technical) → 中文顯示名稱
// 新增模板時請在此擴充。
export const EMAIL_TEMPLATE_LABELS: Record<string, string> = {
  "shipping-reminder": "未寄件提醒",
};

export function getEmailTemplateLabel(templateName: string): string {
  return EMAIL_TEMPLATE_LABELS[templateName] ?? templateName;
}

export const EMAIL_STATUS_LABELS: Record<string, string> = {
  pending: "排隊中",
  sent: "已寄出",
  failed: "失敗",
  suppressed: "已封鎖",
  dlq: "失敗(DLQ)",
  bounced: "退信",
  complained: "客訴",
};

export function getEmailStatusLabel(status: string): string {
  return EMAIL_STATUS_LABELS[status] ?? status;
}
