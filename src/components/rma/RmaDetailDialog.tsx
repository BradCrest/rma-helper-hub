import { useState, useRef, useEffect } from "react";
import { Download, Printer, Pencil, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";
import { isInvalidSerialNumber, INVALID_SERIAL_DESCRIPTION } from "@/lib/serialNumberValidator";
import { getEmailTemplateLabel, getEmailStatusLabel } from "@/lib/emailTemplateLabels";

interface EmailLogEntry {
  message_id: string | null;
  template_name: string;
  recipient_email: string;
  status: string;
  created_at: string;
  error_message: string | null;
}

interface InboundShipping {
  id?: string;
  carrier?: string | null;
  tracking_number?: string | null;
  ship_date?: string | null;
  notes?: string | null;
}

interface RmaData {
  id?: string;
  rma_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  mobile_phone?: string;
  customer_address?: string;
  customer_type?: string;
  product_name: string;
  product_model?: string;
  serial_number?: string;
  purchase_date?: string;
  warranty_date?: string;
  issue_type: string;
  issue_description: string;
  customer_notes?: string;
  status: string;
  created_at: string;
  updated_at?: string;
  updated_by?: string | null;
  updated_by_email?: string | null;
  photo_urls?: string[];
  inbound_shipping?: InboundShipping | null;
}

interface RmaDetailDialogProps {
  rmaNumber: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Escape HTML to prevent XSS when interpolating customer-submitted data into innerHTML
const esc = (s?: string | number | null): string => {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

// Issue type options used by the form (kept in sync with RmaForm)
const ISSUE_TYPE_OPTIONS = [
  "螢幕顯示異常",
  "電池/充電問題",
  "按鍵故障",
  "進水/受潮",
  "外觀損傷",
  "韌體/軟體問題",
  "感測器異常",
  "其他",
];

// Validation schema for editable fields
const editSchema = z.object({
  customer_name: z.string().trim().min(1, "客戶姓名必填").max(100),
  customer_phone: z.string().trim().min(1, "聯絡電話必填").max(50),
  mobile_phone: z.string().trim().max(50).optional().or(z.literal("")),
  customer_email: z.string().trim().email("Email 格式錯誤").max(255),
  customer_address: z.string().trim().max(500).optional().or(z.literal("")),
  product_name: z.string().trim().min(1, "產品名稱必填").max(200),
  product_model: z.string().trim().max(100).optional().or(z.literal("")),
  serial_number: z.string().trim().max(100).optional().or(z.literal("")),
  issue_type: z.string().trim().min(1, "問題類型必填"),
  issue_description: z.string().trim().min(1, "問題描述必填").max(2000),
  customer_notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

type EditableForm = z.infer<typeof editSchema> & {
  shipping_carrier: string;
  shipping_tracking_number: string;
  shipping_ship_date: string;
  shipping_notes: string;
};

const emptyForm = (): EditableForm => ({
  customer_name: "",
  customer_phone: "",
  mobile_phone: "",
  customer_email: "",
  customer_address: "",
  product_name: "",
  product_model: "",
  serial_number: "",
  issue_type: "",
  issue_description: "",
  customer_notes: "",
  shipping_carrier: "",
  shipping_tracking_number: "",
  shipping_ship_date: "",
  shipping_notes: "",
});

const RmaDetailDialog = ({ rmaNumber, open, onOpenChange }: RmaDetailDialogProps) => {
  const { isAdmin, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [rmaData, setRmaData] = useState<RmaData | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditableForm>(emptyForm());
  const [emailLogs, setEmailLogs] = useState<EmailLogEntry[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);

  const fetchEmailLogs = async (customerEmail: string) => {
    if (!customerEmail) {
      setEmailLogs([]);
      return;
    }
    const { data, error } = await supabase
      .from("email_send_log")
      .select("message_id, template_name, recipient_email, status, created_at, error_message")
      .eq("recipient_email", customerEmail)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      console.error("Failed to load email logs:", error);
      setEmailLogs([]);
      return;
    }
    // Dedupe by message_id — keep newest entry (already sorted desc).
    const seen = new Set<string>();
    const deduped: EmailLogEntry[] = [];
    for (const row of (data || []) as EmailLogEntry[]) {
      const key = row.message_id || `${row.template_name}-${row.created_at}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(row);
    }
    setEmailLogs(deduped);
  };

  const fetchRmaData = async () => {
    if (!rmaNumber) return;
    
    setLoading(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      // Pass the admin user's JWT so lookup-rma returns unmasked PII (real email
      // is required to correlate with email_send_log entries).
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token || supabaseKey;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/lookup-rma?rma_number=${encodeURIComponent(rmaNumber)}&full_details=true`,
        {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "apikey": supabaseKey,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch RMA data");
      }

      const result = await response.json();
      
      if (result.results && result.results.length > 0) {
        const rec = result.results[0];
        setRmaData(rec);
        fetchEmailLogs(rec.customer_email);
      } else {
        throw new Error("RMA not found");
      }
    } catch (error) {
      console.error("Error fetching RMA:", error);
      toast.error("無法載入 RMA 資料");
    } finally {
      setLoading(false);
    }
  };

  // Sync form values whenever rmaData changes (also resets edit fields)
  useEffect(() => {
    if (!rmaData) return;
    setForm({
      customer_name: rmaData.customer_name || "",
      customer_phone: rmaData.customer_phone || "",
      mobile_phone: rmaData.mobile_phone || "",
      customer_email: rmaData.customer_email || "",
      customer_address: rmaData.customer_address || "",
      product_name: rmaData.product_name || "",
      product_model: rmaData.product_model || "",
      serial_number: rmaData.serial_number || "",
      issue_type: rmaData.issue_type || "",
      issue_description: rmaData.issue_description || "",
      customer_notes: rmaData.customer_notes || "",
      shipping_carrier: rmaData.inbound_shipping?.carrier || "",
      shipping_tracking_number: rmaData.inbound_shipping?.tracking_number || "",
      shipping_ship_date: rmaData.inbound_shipping?.ship_date || "",
      shipping_notes: rmaData.inbound_shipping?.notes || "",
    });
  }, [rmaData]);

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && rmaNumber) {
      fetchRmaData();
    } else {
      setRmaData(null);
      setEmailLogs([]);
      setEditing(false);
    }
    onOpenChange(isOpen);
  };

  const handleSave = async () => {
    if (!rmaData?.id || !user) return;

    const parsed = editSchema.safeParse(form);
    if (!parsed.success) {
      const firstErr = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
      toast.error(firstErr || "請檢查欄位內容");
      return;
    }

    if (form.serial_number && isInvalidSerialNumber(form.serial_number)) {
      toast.error(INVALID_SERIAL_DESCRIPTION);
      return;
    }

    setSaving(true);
    try {
      const nowIso = new Date().toISOString();

      const { error: updateErr } = await supabase
        .from("rma_requests")
        .update({
          customer_name: form.customer_name.trim(),
          customer_phone: form.customer_phone.trim(),
          mobile_phone: form.mobile_phone?.trim() || null,
          customer_email: form.customer_email.trim(),
          customer_address: form.customer_address?.trim() || null,
          product_name: form.product_name.trim(),
          product_model: form.product_model?.trim() || null,
          serial_number: form.serial_number?.trim() || null,
          issue_type: form.issue_type.trim(),
          issue_description: form.issue_description.trim(),
          customer_notes: form.customer_notes?.trim() || null,
          updated_by: user.id,
          updated_by_email: user.email || null,
          updated_at: nowIso,
        })
        .eq("id", rmaData.id);

      if (updateErr) throw updateErr;

      const hasShippingValue =
        form.shipping_carrier.trim() ||
        form.shipping_tracking_number.trim() ||
        form.shipping_ship_date.trim() ||
        form.shipping_notes.trim();

      if (hasShippingValue || rmaData.inbound_shipping?.id) {
        const shippingPayload = {
          rma_request_id: rmaData.id,
          direction: "inbound",
          carrier: form.shipping_carrier.trim() || null,
          tracking_number: form.shipping_tracking_number.trim() || null,
          ship_date: form.shipping_ship_date.trim() || null,
          notes: form.shipping_notes.trim() || null,
        };

        if (rmaData.inbound_shipping?.id) {
          const { error: shipErr } = await supabase
            .from("rma_shipping")
            .update(shippingPayload)
            .eq("id", rmaData.inbound_shipping.id);
          if (shipErr) throw shipErr;
        } else if (hasShippingValue) {
          const { error: shipErr } = await supabase
            .from("rma_shipping")
            .insert(shippingPayload);
          if (shipErr) throw shipErr;
        }
      }

      toast.success("已儲存修改");
      setEditing(false);
      await fetchRmaData();
    } catch (err: any) {
      console.error("Error saving RMA edits:", err);
      toast.error(err?.message || "儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof EditableForm>(key: K, value: EditableForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };


  const handlePrint = () => {
    if (!rmaData) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("無法開啟列印視窗");
      return;
    }

    printWindow.document.write(generatePrintHtml(rmaData));
    printWindow.document.close();
    printWindow.print();
  };

  const generatePrintHtml = (data: RmaData) => `
    <!DOCTYPE html>
    <html>
      <head>
        <title>RMA ${data.rma_number}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
            padding: 40px; 
            color: #333;
            line-height: 1.5;
          }
          .container { max-width: 800px; margin: 0 auto; }
          .header { 
            text-align: center; 
            padding-bottom: 24px; 
            margin-bottom: 24px;
            border-bottom: 2px solid #0066cc;
          }
          .logo-text { 
            font-size: 24px; 
            font-weight: bold; 
            color: #0066cc;
            margin-bottom: 8px;
          }
          .title { font-size: 20px; color: #333; margin-bottom: 16px; }
          .rma-number { 
            font-size: 32px; 
            font-weight: bold; 
            color: #0066cc; 
            font-family: monospace;
            background: #f0f7ff;
            padding: 12px 24px;
            border-radius: 8px;
            display: inline-block;
          }
          .meta { font-size: 14px; color: #666; margin-top: 12px; }
          .section { 
            margin-bottom: 24px; 
            background: #fafafa;
            border-radius: 8px;
            padding: 20px;
          }
          .section-title { 
            font-size: 16px;
            font-weight: 600; 
            color: #0066cc;
            margin-bottom: 16px; 
            padding-bottom: 8px;
            border-bottom: 1px solid #e0e0e0;
          }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
          .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
          .item { }
          .label { font-size: 12px; color: #888; margin-bottom: 4px; }
          .value { font-size: 14px; font-weight: 500; color: #333; }
          .full-width { grid-column: 1 / -1; }
          .description-box {
            background: #fff;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            padding: 16px;
            font-size: 14px;
            white-space: pre-wrap;
            min-height: 60px;
          }
          .footer {
            margin-top: 32px;
            padding-top: 16px;
            border-top: 1px solid #ddd;
            text-align: center;
            font-size: 12px;
            color: #888;
          }
          .status-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 16px;
            font-size: 12px;
            font-weight: 500;
            background: #e8f5e9;
            color: #2e7d32;
          }
          @media print {
            body { padding: 20px; }
            .section { break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo-text">RMA 保固服務申請單</div>
            <div class="rma-number">${esc(data.rma_number)}</div>
            <div class="meta">
              申請時間：${esc(formatDate(data.created_at))} ｜ 狀態：<span class="status-badge">${esc(getStatusLabel(data.status))}</span>
            </div>
          </div>

          <div class="section">
            <div class="section-title">客戶資訊</div>
            <div class="grid">
              <div class="item">
                <div class="label">客戶姓名</div>
                <div class="value">${esc(data.customer_name)}</div>
              </div>
              <div class="item">
                <div class="label">客戶類型</div>
                <div class="value">${esc(data.customer_type) || "一般客戶"}</div>
              </div>
              <div class="item">
                <div class="label">電子郵件</div>
                <div class="value">${esc(data.customer_email)}</div>
              </div>
              <div class="item">
                <div class="label">聯絡電話</div>
                <div class="value">${esc(data.customer_phone)}</div>
              </div>
              <div class="item">
                <div class="label">手機號碼</div>
                <div class="value">${esc(data.mobile_phone) || "-"}</div>
              </div>
              <div class="item full-width">
                <div class="label">聯絡地址</div>
                <div class="value">${esc(data.customer_address) || "-"}</div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">產品資訊</div>
            <div class="grid">
              <div class="item">
                <div class="label">產品名稱</div>
                <div class="value">${esc(data.product_name)}</div>
              </div>
              <div class="item">
                <div class="label">產品型號</div>
                <div class="value">${esc(data.product_model) || "-"}</div>
              </div>
              <div class="item">
                <div class="label">產品序號</div>
                <div class="value">${esc(data.serial_number) || "-"}</div>
              </div>
              <div class="item">
                <div class="label">購買日期</div>
                <div class="value">${esc(data.purchase_date) || "-"}</div>
              </div>
              <div class="item">
                <div class="label">保固到期日</div>
                <div class="value">${esc(data.warranty_date) || "-"}</div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">問題描述</div>
            <div class="description-box">${esc(data.issue_description) || "-"}</div>
          </div>

          ${data.customer_notes ? `
          <div class="section">
            <div class="section-title">隨附物品 / 備註</div>
            <div class="description-box">${esc(data.customer_notes)}</div>
          </div>
          ` : ""}

          <div class="footer">
            <p>此文件為 RMA 保固服務申請確認單，請妥善保存。</p>
            <p>如有任何問題，請聯繫客服中心。</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const generatePdfHtml = (data: RmaData): string => {
    const notesSection = data.customer_notes ? `
      <div style="background: #fafafa; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
        <div style="font-size: 16px; font-weight: 600; color: #0066cc; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid #e0e0e0;">隨附物品 / 備註</div>
        <div style="background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 16px; font-size: 14px; white-space: pre-wrap;">${esc(data.customer_notes)}</div>
      </div>
    ` : "";

    return `
    <div style="width: 794px; min-height: 1123px; padding: 40px; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Microsoft JhengHei', 'PingFang SC', sans-serif; color: #333; background: white;">
      <div style="background: linear-gradient(135deg, #0066cc, #0052a3); padding: 24px; border-radius: 12px; margin-bottom: 24px; text-align: center;">
        <div style="color: white; font-size: 20px; font-weight: 600; margin-bottom: 8px;">RMA 保固服務申請單</div>
        <div style="color: white; font-size: 28px; font-weight: bold; font-family: monospace;">${esc(data.rma_number)}</div>
      </div>
      
      <div style="display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 14px; color: #666;">
        <span>申請時間：${esc(formatDate(data.created_at))}</span>
        <span style="background: #e8f5e9; color: #2e7d32; padding: 4px 12px; border-radius: 16px; font-size: 12px;">${esc(getStatusLabel(data.status))}</span>
      </div>

      <div style="background: #fafafa; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
        <div style="font-size: 16px; font-weight: 600; color: #0066cc; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid #e0e0e0;">客戶資訊</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div><div style="font-size: 12px; color: #888; margin-bottom: 4px;">客戶姓名</div><div style="font-size: 14px; font-weight: 500;">${esc(data.customer_name)}</div></div>
          <div><div style="font-size: 12px; color: #888; margin-bottom: 4px;">客戶類型</div><div style="font-size: 14px; font-weight: 500;">${esc(data.customer_type) || "一般客戶"}</div></div>
          <div><div style="font-size: 12px; color: #888; margin-bottom: 4px;">電子郵件</div><div style="font-size: 14px; font-weight: 500;">${esc(data.customer_email)}</div></div>
          <div><div style="font-size: 12px; color: #888; margin-bottom: 4px;">聯絡電話</div><div style="font-size: 14px; font-weight: 500;">${esc(data.customer_phone)}</div></div>
          <div><div style="font-size: 12px; color: #888; margin-bottom: 4px;">手機號碼</div><div style="font-size: 14px; font-weight: 500;">${esc(data.mobile_phone) || "-"}</div></div>
          <div style="grid-column: 1 / -1;"><div style="font-size: 12px; color: #888; margin-bottom: 4px;">聯絡地址</div><div style="font-size: 14px; font-weight: 500;">${esc(data.customer_address) || "-"}</div></div>
        </div>
      </div>

      <div style="background: #fafafa; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
        <div style="font-size: 16px; font-weight: 600; color: #0066cc; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid #e0e0e0;">產品資訊</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div><div style="font-size: 12px; color: #888; margin-bottom: 4px;">產品名稱</div><div style="font-size: 14px; font-weight: 500;">${esc(data.product_name)}</div></div>
          <div><div style="font-size: 12px; color: #888; margin-bottom: 4px;">產品型號</div><div style="font-size: 14px; font-weight: 500;">${esc(data.product_model) || "-"}</div></div>
          <div><div style="font-size: 12px; color: #888; margin-bottom: 4px;">產品序號</div><div style="font-size: 14px; font-weight: 500;">${esc(data.serial_number) || "-"}</div></div>
          <div><div style="font-size: 12px; color: #888; margin-bottom: 4px;">購買日期</div><div style="font-size: 14px; font-weight: 500;">${esc(data.purchase_date) || "-"}</div></div>
          <div><div style="font-size: 12px; color: #888; margin-bottom: 4px;">保固到期日</div><div style="font-size: 14px; font-weight: 500;">${esc(data.warranty_date) || "-"}</div></div>
        </div>
      </div>

      <div style="background: #fafafa; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
        <div style="font-size: 16px; font-weight: 600; color: #0066cc; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid #e0e0e0;">問題描述</div>
        <div style="background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 16px; font-size: 14px; white-space: pre-wrap; min-height: 60px;">${esc(data.issue_description) || "-"}</div>
      </div>

      ${notesSection}

      <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #ddd; text-align: center; font-size: 12px; color: #888;">
        <p>此文件為 RMA 保固服務申請確認單，請妥善保存。</p>
        <p>如有任何問題，請聯繫客服中心。</p>
      </div>
    </div>
  `;
  };

  const handleDownloadPdf = async () => {
    if (!rmaData) return;

    setGeneratingPdf(true);
    try {
      const container = document.createElement("div");
      container.style.cssText = "position: absolute; left: -9999px; top: 0;";
      document.body.appendChild(container);

      container.innerHTML = generatePdfHtml(rmaData);

      const canvas = await html2canvas(container.firstElementChild as HTMLElement, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, "JPEG", 0, 0, imgWidth, Math.min(imgHeight, pdfHeight));

      document.body.removeChild(container);

      pdf.save(`RMA_${rmaData.rma_number}.pdf`);
      toast.success("PDF 下載成功");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("PDF 生成失敗");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const formatDate = (dateString: string): string => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusLabel = (status: string): string => {
    const statusMap: Record<string, string> = {
      registered: "已登記",
      shipped: "已寄出",
      received: "已收件",
      inspecting: "檢測中",
      contacting: "聯繫客戶中",
      quote_confirmed: "報價確認",
      paid: "已付款",
      no_repair: "不維修",
      repairing: "維修中",
      shipped_back: "已寄回",
      shipped_back_refurbished: "已寄回(整新品)",
      shipped_back_original: "已寄回(原機)",
      shipped_back_new: "已寄回(新品)",
      follow_up: "售後追蹤",
      closed: "已結案",
      unknown: "未知",
    };
    return statusMap[status] || status;
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <span>RMA 詳細資訊</span>
            {rmaData && isAdmin && !editing && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(true)}
                className="gap-1 mr-6"
              >
                <Pencil className="w-3.5 h-3.5" />
                編輯
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : rmaData ? (
          <>
            <div ref={contentRef} className="space-y-6 p-4 bg-background">
              {/* RMA Number */}
              <div className="text-center pb-4 border-b">
                <p className="text-sm text-muted-foreground mb-1">RMA 編號</p>
                <p className="text-2xl font-bold font-mono text-primary">
                  {rmaData.rma_number}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  申請時間：{formatDate(rmaData.created_at)}
                </p>
                {rmaData.updated_at &&
                  rmaData.updated_at !== rmaData.created_at &&
                  rmaData.updated_by_email && (
                    <p className="text-xs text-muted-foreground mt-1">
                      修改時間：{formatDate(rmaData.updated_at)} ｜ 修改人：{rmaData.updated_by_email}
                    </p>
                  )}
              </div>

              {/* Customer Info */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg border-b pb-2">客戶資訊</h3>
                {editing ? (
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <Label>客戶姓名</Label>
                      <Input
                        value={form.customer_name}
                        onChange={(e) => updateField("customer_name", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>客戶類型</Label>
                      <p className="font-medium pt-2">{rmaData.customer_type || "一般客戶"}</p>
                    </div>
                    <div>
                      <Label>電子郵件</Label>
                      <Input
                        type="email"
                        value={form.customer_email}
                        onChange={(e) => updateField("customer_email", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>聯絡電話</Label>
                      <Input
                        value={form.customer_phone}
                        onChange={(e) => updateField("customer_phone", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>手機號碼</Label>
                      <Input
                        value={form.mobile_phone}
                        onChange={(e) => updateField("mobile_phone", e.target.value)}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label>聯絡地址</Label>
                      <Input
                        value={form.customer_address}
                        onChange={(e) => updateField("customer_address", e.target.value)}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">客戶姓名</p>
                      <p className="font-medium">{rmaData.customer_name}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">客戶類型</p>
                      <p className="font-medium">{rmaData.customer_type || "一般客戶"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">電子郵件</p>
                      <p className="font-medium">{rmaData.customer_email}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">聯絡電話</p>
                      <p className="font-medium">{rmaData.customer_phone}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">手機號碼</p>
                      <p className="font-medium">{rmaData.mobile_phone || "-"}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-muted-foreground">聯絡地址</p>
                      <p className="font-medium">{rmaData.customer_address || "-"}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Product Info */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg border-b pb-2">產品資訊</h3>
                {editing ? (
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <Label>產品名稱</Label>
                      <Input
                        value={form.product_name}
                        onChange={(e) => updateField("product_name", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>產品型號</Label>
                      <Input
                        value={form.product_model}
                        onChange={(e) => updateField("product_model", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>產品序號</Label>
                      <Input
                        value={form.serial_number}
                        onChange={(e) => updateField("serial_number", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>購買日期</Label>
                      <p className="font-medium pt-2">{rmaData.purchase_date || "-"}</p>
                    </div>
                    <div>
                      <Label>保固到期日</Label>
                      <p className="font-medium pt-2">{rmaData.warranty_date || "-"}</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">產品名稱</p>
                      <p className="font-medium">{rmaData.product_name}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">產品型號</p>
                      <p className="font-medium">{rmaData.product_model || "-"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">產品序號</p>
                      <p className="font-medium">{rmaData.serial_number || "-"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">購買日期</p>
                      <p className="font-medium">{rmaData.purchase_date || "-"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">保固到期日</p>
                      <p className="font-medium">{rmaData.warranty_date || "-"}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Issue */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg border-b pb-2">問題描述</h3>
                {editing ? (
                  <div className="space-y-3">
                    <div>
                      <Label>問題類型</Label>
                      <Select
                        value={form.issue_type}
                        onValueChange={(v) => updateField("issue_type", v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="選擇問題類型" />
                        </SelectTrigger>
                        <SelectContent>
                          {ISSUE_TYPE_OPTIONS.map((opt) => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                          {/* Preserve current value if it's not in the standard list */}
                          {form.issue_type && !ISSUE_TYPE_OPTIONS.includes(form.issue_type) && (
                            <SelectItem value={form.issue_type}>{form.issue_type}</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>問題描述</Label>
                      <Textarea
                        rows={4}
                        value={form.issue_description}
                        onChange={(e) => updateField("issue_description", e.target.value)}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-sm">
                      <span className="text-muted-foreground">問題類型：</span>
                      <span className="font-medium">{rmaData.issue_type}</span>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-4">
                      <p className="text-sm whitespace-pre-wrap">{rmaData.issue_description}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Customer Notes */}
              {(editing || rmaData.customer_notes) && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg border-b pb-2">隨附物品 / 備註</h3>
                  {editing ? (
                    <Textarea
                      rows={3}
                      value={form.customer_notes}
                      onChange={(e) => updateField("customer_notes", e.target.value)}
                      placeholder="例如：原包裝、說明書、配件…"
                    />
                  ) : (
                    <div className="bg-muted/50 rounded-lg p-4">
                      <p className="text-sm whitespace-pre-wrap">{rmaData.customer_notes}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Inbound Shipping (customer → company) */}
              {(editing || rmaData.inbound_shipping) && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg border-b pb-2">客戶寄件資訊</h3>
                  {editing ? (
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <Label>物流公司</Label>
                        <Input
                          value={form.shipping_carrier}
                          onChange={(e) => updateField("shipping_carrier", e.target.value)}
                          placeholder="如：黑貓、新竹貨運"
                        />
                      </div>
                      <div>
                        <Label>追蹤號碼</Label>
                        <Input
                          value={form.shipping_tracking_number}
                          onChange={(e) => updateField("shipping_tracking_number", e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>寄件日期</Label>
                        <Input
                          type="date"
                          value={form.shipping_ship_date}
                          onChange={(e) => updateField("shipping_ship_date", e.target.value)}
                        />
                      </div>
                      <div className="col-span-2">
                        <Label>備註</Label>
                        <Textarea
                          rows={2}
                          value={form.shipping_notes}
                          onChange={(e) => updateField("shipping_notes", e.target.value)}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">物流公司</p>
                        <p className="font-medium">{rmaData.inbound_shipping?.carrier || "-"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">追蹤號碼</p>
                        <p className="font-medium">{rmaData.inbound_shipping?.tracking_number || "-"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">寄件日期</p>
                        <p className="font-medium">{rmaData.inbound_shipping?.ship_date || "-"}</p>
                      </div>
                      {rmaData.inbound_shipping?.notes && (
                        <div className="col-span-2">
                          <p className="text-muted-foreground">備註</p>
                          <p className="font-medium whitespace-pre-wrap">{rmaData.inbound_shipping.notes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Email Send History */}
              <div className="space-y-3 pt-4 border-t">
                <h3 className="font-semibold text-lg">Email 寄送記錄</h3>
                {emailLogs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">尚未發送任何 Email</p>
                ) : (
                  <div className="space-y-2">
                    {emailLogs.map((log, idx) => (
                      <div
                        key={`${log.message_id || idx}-${log.created_at}`}
                        className="flex items-start justify-between gap-3 p-3 rounded-md bg-muted/40 border"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm">
                            {getEmailTemplateLabel(log.template_name)}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 truncate">
                            {log.recipient_email}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {new Date(log.created_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
                          </div>
                          {log.error_message && (
                            <div className="text-xs text-destructive mt-1 break-words">
                              {log.error_message}
                            </div>
                          )}
                        </div>
                        <span
                          className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${
                            log.status === "sent"
                              ? "bg-green-100 text-green-700"
                              : log.status === "failed" || log.status === "dlq" || log.status === "bounced"
                              ? "bg-red-100 text-red-700"
                              : log.status === "suppressed" || log.status === "complained"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {getEmailStatusLabel(log.status)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Status */}
              <div className="pt-4 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">目前狀態</span>
                  <span className="px-3 py-1 rounded-full text-sm font-medium bg-primary/10 text-primary">
                    {getStatusLabel(rmaData.status)}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t">
              {editing ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditing(false);
                      // Reset form back to current rmaData
                      if (rmaData) setRmaData({ ...rmaData });
                    }}
                    disabled={saving}
                    className="flex-1 gap-2"
                  >
                    <X className="w-4 h-4" />
                    取消
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1 gap-2"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? "儲存中..." : "儲存"}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={handlePrint} className="flex-1 gap-2">
                    <Printer className="w-4 h-4" />
                    列印
                  </Button>
                  <Button
                    onClick={handleDownloadPdf}
                    disabled={generatingPdf}
                    className="flex-1 gap-2"
                  >
                    <Download className="w-4 h-4" />
                    {generatingPdf ? "生成中..." : "下載 PDF"}
                  </Button>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="py-12 text-center text-muted-foreground">
            無法載入 RMA 資料
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default RmaDetailDialog;
