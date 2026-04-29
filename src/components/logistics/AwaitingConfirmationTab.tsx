import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Search,
  Eye,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Clock,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Inbox,
  ArrowRight,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import { zhTW } from "date-fns/locale";
import {
  isWithinWarranty,
  getRefurbPrices,
  formatNT,
  type ActualMethod,
  ACTUAL_METHOD_LABELS,
} from "@/lib/refurbishedPricing";
import { evaluateWarranty } from "@/lib/warrantyPolicy";

interface RmaRequest {
  id: string;
  rma_number: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  product_name: string;
  product_model: string | null;
  serial_number: string | null;
  status: string;
  warranty_date: string | null;
  initial_diagnosis: string | null;
  has_unread_customer_reply: boolean;
  created_at: string;
}

interface ThreadMessage {
  id: string;
  rma_request_id: string;
  direction: string; // 'outbound' | 'inbound'
  subject: string | null;
  body: string;
  from_name: string | null;
  from_email: string | null;
  attachments: { name: string; path: string; size?: number }[] | null;
  created_at: string;
}

interface RmaListItem extends RmaRequest {
  lastOutboundAt: string | null;
  lastInboundAt: string | null;
}

const OVERDUE_DAYS = 7;

const AwaitingConfirmationTab = () => {
  const [rmaList, setRmaList] = useState<RmaListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRma, setSelectedRma] = useState<RmaListItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Decision form state
  const [warrantyOverride, setWarrantyOverride] = useState<boolean | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<ActualMethod | "">("");
  const [feeOverride, setFeeOverride] = useState<string>("");
  const [decisionNotes, setDecisionNotes] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  useEffect(() => {
    fetchList();
  }, []);

  const fetchList = async () => {
    setLoading(true);
    try {
      const { data: rmas, error } = await supabase
        .from("rma_requests")
        .select("*")
        .eq("status", "contacting")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const list = (rmas || []) as unknown as RmaRequest[];

      // 抓最後 outbound / inbound 訊息日期
      const ids = list.map((r) => r.id);
      let lastMap: Record<string, { out: string | null; in: string | null }> = {};
      if (ids.length > 0) {
        const { data: msgs } = await supabase
          .from("rma_thread_messages")
          .select("rma_request_id, direction, created_at")
          .in("rma_request_id", ids)
          .order("created_at", { ascending: false });
        for (const m of msgs || []) {
          const key = m.rma_request_id;
          if (!lastMap[key]) lastMap[key] = { out: null, in: null };
          if (m.direction === "outbound" && !lastMap[key].out) {
            lastMap[key].out = m.created_at;
          }
          if (m.direction === "inbound" && !lastMap[key].in) {
            lastMap[key].in = m.created_at;
          }
        }
      }

      setRmaList(
        list.map((r) => ({
          ...r,
          lastOutboundAt: lastMap[r.id]?.out ?? null,
          lastInboundAt: lastMap[r.id]?.in ?? null,
        }))
      );
    } catch (e) {
      console.error("fetchList error", e);
      toast.error("載入待客戶確認列表失敗");
    } finally {
      setLoading(false);
    }
  };

  const openDetail = async (rma: RmaListItem) => {
    setSelectedRma(rma);
    setWarrantyOverride(null);
    setSelectedMethod("");
    setFeeOverride("");
    setDecisionNotes("");
    setCancelReason("");
    setDialogOpen(true);

    setLoadingMessages(true);
    try {
      const { data, error } = await supabase
        .from("rma_thread_messages")
        .select("*")
        .eq("rma_request_id", rma.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      setMessages((data || []) as unknown as ThreadMessage[]);

      // 標記客戶回覆為已讀
      if (rma.has_unread_customer_reply) {
        await supabase
          .from("rma_requests")
          .update({ has_unread_customer_reply: false })
          .eq("id", rma.id);
      }
    } catch (e) {
      console.error("load messages error", e);
    } finally {
      setLoadingMessages(false);
    }
  };

  const warrantyDecision = selectedRma
    ? evaluateWarranty({
        serialNumber: selectedRma.serial_number,
        productModel: selectedRma.product_model,
        warrantyDate: selectedRma.warranty_date,
      })
    : null;
  const systemWithinWarranty = warrantyDecision
    ? warrantyDecision.withinWarranty
    : selectedRma
    ? isWithinWarranty(selectedRma.warranty_date)
    : false;
  const isLegacyBatch = warrantyDecision?.isLegacyBatch ?? false;
  const effectiveWithinWarranty =
    warrantyOverride === null ? systemWithinWarranty : warrantyOverride;

  const refurbPrices = useMemo(
    () => getRefurbPrices(selectedRma?.product_model),
    [selectedRma?.product_model]
  );

  const methodToFee = (m: ActualMethod): number => {
    switch (m) {
      case "warranty_replace":
        return 0;
      case "purchase_a":
        return refurbPrices.A;
      case "purchase_b":
        return refurbPrices.B;
      case "purchase_c":
        return refurbPrices.C;
      case "return_original":
        return 0;
    }
  };

  const handleSelectMethod = (m: ActualMethod) => {
    setSelectedMethod(m);
    setFeeOverride(String(methodToFee(m)));
  };

  const handleSubmitDecision = async () => {
    if (!selectedRma || !selectedMethod) {
      toast.error("請選擇客戶決定");
      return;
    }
    if (selectedMethod === "return_original" && !cancelReason.trim()) {
      toast.error("原錶退回需填寫原因");
      return;
    }
    setSubmitting(true);
    try {
      const fee = feeOverride ? parseFloat(feeOverride) : methodToFee(selectedMethod);

      // 1. upsert rma_repair_details
      const { data: existingDetail } = await supabase
        .from("rma_repair_details")
        .select("id")
        .eq("rma_request_id", selectedRma.id)
        .maybeSingle();

      const replacementModel =
        selectedMethod === "warranty_replace"
          ? "整新機（保固換新）"
          : selectedMethod === "purchase_a"
          ? "A 級整新機"
          : selectedMethod === "purchase_b"
          ? "B 級整新機"
          : selectedMethod === "purchase_c"
          ? "C 級整新機"
          : null;

      const detailPayload = {
        rma_request_id: selectedRma.id,
        actual_method: selectedMethod,
        replacement_model: replacementModel,
      };

      if (existingDetail?.id) {
        await supabase
          .from("rma_repair_details")
          .update(detailPayload)
          .eq("id", existingDetail.id);
      } else {
        await supabase.from("rma_repair_details").insert(detailPayload);
      }

      // 2. 更新 repair_fee
      await supabase
        .from("rma_requests")
        .update({ repair_fee: fee })
        .eq("id", selectedRma.id);

      // 3. 寫 contact log
      const summary = [
        `決定：${ACTUAL_METHOD_LABELS[selectedMethod]}`,
        `保固：${effectiveWithinWarranty ? "保固內" : "已過保"}${
          warrantyOverride !== null && warrantyOverride !== systemWithinWarranty
            ? "（admin 覆寫）"
            : ""
        }`,
        fee > 0 ? `金額：${formatNT(fee)}` : null,
        decisionNotes ? `備註：${decisionNotes}` : null,
        selectedMethod === "return_original" && cancelReason
          ? `取消原因：${cancelReason}`
          : null,
      ]
        .filter(Boolean)
        .join("\n");

      await supabase.from("rma_customer_contacts").insert({
        rma_request_id: selectedRma.id,
        contact_date: format(new Date(), "yyyy-MM-dd"),
        contact_method: "decision_logged",
        contact_notes: summary,
      });

      // 4. 更新 RMA 狀態
      const newStatus =
        selectedMethod === "return_original" ? "no_repair" : "quote_confirmed";

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("請先登入");
        setSubmitting(false);
        return;
      }
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-rma-status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            rma_id: selectedRma.id,
            new_status: newStatus,
            notes: summary,
          }),
        }
      );
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err?.error || "狀態更新失敗");
      }

      toast.success(
        `已記錄決定：${ACTUAL_METHOD_LABELS[selectedMethod]}（${
          newStatus === "no_repair" ? "標記為不維修" : "標記為已確認報價"
        }）`
      );
      setDialogOpen(false);
      fetchList();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "未知錯誤";
      console.error("submit decision error", e);
      toast.error(`提交失敗：${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = rmaList.filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.rma_number.toLowerCase().includes(q) ||
      r.customer_name.toLowerCase().includes(q) ||
      r.product_name.toLowerCase().includes(q) ||
      (r.serial_number && r.serial_number.toLowerCase().includes(q))
    );
  });

  const getReplyStatus = (r: RmaListItem) => {
    if (r.lastInboundAt && (!r.lastOutboundAt || r.lastInboundAt > r.lastOutboundAt)) {
      return { label: "客戶已回覆", variant: "default" as const, icon: MessageSquare };
    }
    if (r.lastOutboundAt) {
      const days = differenceInDays(new Date(), new Date(r.lastOutboundAt));
      if (days >= OVERDUE_DAYS) {
        return {
          label: `等待 ${days} 天`,
          variant: "destructive" as const,
          icon: AlertTriangle,
        };
      }
      return { label: `等待 ${days} 天`, variant: "secondary" as const, icon: Clock };
    }
    return { label: "尚未通知", variant: "outline" as const, icon: Mail };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rma-card">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-center gap-2">
            <Inbox className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">待客戶確認</h2>
            <Badge variant="secondary" className="ml-2">
              {rmaList.length} 筆
            </Badge>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="搜尋 RMA 編號、客戶、產品、序號..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          列出所有處於「聯繫客戶中」狀態的 RMA，等待客戶決定處理方式（保固換新 / 購買整新機 / 原錶退回）。
        </p>
      </div>

      {/* List */}
      <div className="rma-card p-0 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">載入中...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Inbox className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>目前沒有待客戶確認的 RMA</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>RMA 編號</TableHead>
                <TableHead>客戶</TableHead>
                <TableHead>產品</TableHead>
                <TableHead>保固</TableHead>
                <TableHead>最後通知</TableHead>
                <TableHead>客戶回覆</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((rma) => {
                const within = isWithinWarranty(rma.warranty_date);
                const reply = getReplyStatus(rma);
                const ReplyIcon = reply.icon;
                return (
                  <TableRow
                    key={rma.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => openDetail(rma)}
                  >
                    <TableCell className="font-mono font-medium">
                      {rma.rma_number}
                      {rma.has_unread_customer_reply && (
                        <Badge variant="destructive" className="ml-2 text-[10px]">
                          新回覆
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{rma.customer_name}</TableCell>
                    <TableCell>
                      <div>{rma.product_name}</div>
                      {rma.product_model && (
                        <div className="text-xs text-muted-foreground font-mono">
                          {rma.product_model}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {within ? (
                        <Badge variant="default" className="gap-1">
                          <ShieldCheck className="w-3 h-3" /> 保固內
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <ShieldAlert className="w-3 h-3" /> 已過保
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {rma.lastOutboundAt
                        ? formatDistanceToNow(new Date(rma.lastOutboundAt), {
                            addSuffix: true,
                            locale: zhTW,
                          })
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={reply.variant} className="gap-1">
                        <ReplyIcon className="w-3 h-3" />
                        {reply.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDetail(rma);
                        }}
                      >
                        <Eye className="w-4 h-4" />
                        檢視
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Inbox className="w-5 h-5" />
              待客戶確認 - {selectedRma?.rma_number}
            </DialogTitle>
          </DialogHeader>

          {selectedRma && (
            <div className="space-y-5">
              {/* RMA 資訊 */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-muted/50 rounded-lg text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">客戶</p>
                  <p className="font-medium">{selectedRma.customer_name}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {selectedRma.customer_email}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">產品</p>
                  <p className="font-medium">
                    {selectedRma.product_name}
                    {selectedRma.product_model && ` / ${selectedRma.product_model}`}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {selectedRma.serial_number || "—"}
                  </p>
                </div>
                {selectedRma.initial_diagnosis && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">初步診斷</p>
                    <p className="text-sm">{selectedRma.initial_diagnosis}</p>
                  </div>
                )}
              </div>

              {/* 1. 保固判斷 */}
              <div className="space-y-2">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" />
                  保固判斷
                </h3>
                <div className="flex items-center justify-between gap-3 p-3 border border-border rounded-lg flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={systemWithinWarranty ? "default" : "secondary"}>
                      系統判斷：{systemWithinWarranty ? "保固內" : "已過保"}
                    </Badge>
                    {isLegacyBatch && (
                      <Badge variant="destructive" className="text-[10px]">
                        Legacy 批次
                      </Badge>
                    )}
                    {selectedRma.warranty_date && (
                      <span className="text-[10px] text-muted-foreground">
                        ({format(new Date(selectedRma.warranty_date), "yyyy/MM/dd")} 到期)
                      </span>
                    )}
                    {warrantyOverride !== null &&
                      warrantyOverride !== systemWithinWarranty && (
                        <Badge variant="destructive" className="text-[10px]">
                          已覆寫
                        </Badge>
                      )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">以保固內處理</span>
                    <Switch
                      checked={effectiveWithinWarranty}
                      onCheckedChange={(v) => {
                        setWarrantyOverride(v);
                        setSelectedMethod("");
                        setFeeOverride("");
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* 2. 訊息時間軸 */}
              <div className="space-y-2">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  客戶往來訊息 ({messages.length})
                </h3>
                <div className="space-y-2 max-h-64 overflow-y-auto border border-border rounded-lg p-2">
                  {loadingMessages ? (
                    <p className="text-xs text-muted-foreground p-2">載入中...</p>
                  ) : messages.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-2">尚無往來訊息</p>
                  ) : (
                    messages.map((m) => (
                      <div
                        key={m.id}
                        className={`p-2 rounded text-xs ${
                          m.direction === "outbound"
                            ? "bg-primary/10 border-l-2 border-primary"
                            : "bg-amber-50 dark:bg-amber-950/20 border-l-2 border-amber-400"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium">
                            {m.direction === "outbound" ? "📤 我們" : "📥 客戶"}
                            {m.from_name && ` · ${m.from_name}`}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(m.created_at), "yyyy/MM/dd HH:mm")}
                          </span>
                        </div>
                        {m.subject && (
                          <p className="font-medium text-[11px] mb-1">{m.subject}</p>
                        )}
                        <p className="whitespace-pre-wrap line-clamp-4">{m.body}</p>
                        {m.attachments && m.attachments.length > 0 && (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            📎 {m.attachments.length} 個附件
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 3. 客戶決定 */}
              <div className="space-y-3">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <ArrowRight className="w-4 h-4" />
                  記錄客戶決定
                </h3>

                {effectiveWithinWarranty ? (
                  // 保固內：單一選項
                  <div className="grid grid-cols-1 gap-2">
                    <DecisionCard
                      selected={selectedMethod === "warranty_replace"}
                      onClick={() => handleSelectMethod("warranty_replace")}
                      icon={<CheckCircle2 className="w-5 h-5 text-green-600" />}
                      title="客戶同意換整新機（免費）"
                      subtitle="保固範圍內 — 寄出整新機，無需收費"
                    />
                  </div>
                ) : (
                  // 過保固：4 選 1（含 legacy 提醒）
                  <>
                    {isLegacyBatch && (
                      <div className="p-2 rounded text-xs bg-destructive/10 border border-destructive/30 text-destructive">
                        ⚠️ 此產品為 2018–2022 老批次，依 2025/11/12 公告為特殊換購方案，價格沿用一般 A/B/C 整新機。
                      </div>
                    )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <DecisionCard
                      selected={selectedMethod === "purchase_a"}
                      onClick={() => handleSelectMethod("purchase_a")}
                      icon={<span className="text-lg font-bold text-blue-600">A</span>}
                      title="購買 A 級整新機"
                      subtitle={formatNT(refurbPrices.A)}
                    />
                    <DecisionCard
                      selected={selectedMethod === "purchase_b"}
                      onClick={() => handleSelectMethod("purchase_b")}
                      icon={<span className="text-lg font-bold text-indigo-600">B</span>}
                      title="購買 B 級整新機"
                      subtitle={formatNT(refurbPrices.B)}
                    />
                    <DecisionCard
                      selected={selectedMethod === "purchase_c"}
                      onClick={() => handleSelectMethod("purchase_c")}
                      icon={<span className="text-lg font-bold text-purple-600">C</span>}
                      title="購買 C 級整新機"
                      subtitle={formatNT(refurbPrices.C)}
                    />
                    <DecisionCard
                      selected={selectedMethod === "return_original"}
                      onClick={() => handleSelectMethod("return_original")}
                      icon={<XCircle className="w-5 h-5 text-red-600" />}
                      title="原錶退回"
                      subtitle="客戶不購買，原錶寄回"
                    />
                  </div>
                )}

                {/* 金額覆寫 */}
                {selectedMethod &&
                  selectedMethod !== "return_original" &&
                  selectedMethod !== "warranty_replace" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="feeOverride" className="text-xs">
                          金額（可覆寫）
                        </Label>
                        <Input
                          id="feeOverride"
                          type="number"
                          value={feeOverride}
                          onChange={(e) => setFeeOverride(e.target.value)}
                          className="text-sm"
                        />
                      </div>
                    </div>
                  )}

                {/* 取消原因 */}
                {selectedMethod === "return_original" && (
                  <div>
                    <Label htmlFor="cancelReason" className="text-xs">
                      取消原因 *
                    </Label>
                    <Textarea
                      id="cancelReason"
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      rows={2}
                      placeholder="例如：客戶覺得價格過高、客戶決定報廢..."
                    />
                  </div>
                )}

                {/* 備註 */}
                {selectedMethod && (
                  <div>
                    <Label htmlFor="decisionNotes" className="text-xs">
                      備註（選填）
                    </Label>
                    <Textarea
                      id="decisionNotes"
                      value={decisionNotes}
                      onChange={(e) => setDecisionNotes(e.target.value)}
                      rows={2}
                      placeholder="客戶要求、特殊處理..."
                    />
                  </div>
                )}
              </div>

              {/* 操作按鈕 */}
              <div className="flex justify-between gap-3 pt-3 border-t">
                <Button
                  variant="outline"
                  onClick={() => {
                    toast.info("請至「RMA 回覆」分頁回覆客戶");
                    setDialogOpen(false);
                  }}
                  className="gap-1"
                >
                  <MessageSquare className="w-4 h-4" />
                  再次聯繫客戶
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    取消
                  </Button>
                  <Button
                    onClick={handleSubmitDecision}
                    disabled={!selectedMethod || submitting}
                    className="gap-1"
                  >
                    {submitting ? "提交中..." : "✓ 確認客戶決定"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

interface DecisionCardProps {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}

const DecisionCard = ({ selected, onClick, icon, title, subtitle }: DecisionCardProps) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all ${
      selected
        ? "border-primary bg-primary/5 shadow-sm"
        : "border-border hover:border-primary/50 hover:bg-muted/30"
    }`}
  >
    <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">{icon}</div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </div>
    {selected && <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />}
  </button>
);

export default AwaitingConfirmationTab;
