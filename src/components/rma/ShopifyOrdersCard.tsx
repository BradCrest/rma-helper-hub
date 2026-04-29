import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ShoppingBag,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  RefreshCw,
  CalendarCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  evaluateWarranty,
  type ProductionBatch,
} from "@/lib/warrantyPolicy";

interface ShopifyLineItem {
  title: string;
  quantity: number;
  sku: string | null;
  variantTitle: string | null;
}

interface ShopifyOrder {
  id: string;
  legacyId: string;
  name: string; // e.g. #1001
  processedAt: string | null;
  createdAt: string;
  totalPrice: { amount: string; currencyCode: string };
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  lineItems: ShopifyLineItem[];
  adminUrl: string;
}

interface Props {
  rmaId: string;
  email: string | null | undefined;
  currentPurchaseDate?: string | null;
  serialNumber?: string | null;
  productModel?: string | null;
  warrantyDate?: string | null;
  onPurchaseDateApplied?: () => void;
}

const ShopifyOrdersCard = ({
  rmaId,
  email,
  currentPurchaseDate,
  serialNumber,
  productModel,
  warrantyDate,
  onPurchaseDateApplied,
}: Props) => {
  const [open, setOpen] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);

  const enabled = Boolean(email && open);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["shopify-orders", email],
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "shopify-find-orders-by-email",
        { body: { email } },
      );
      if (error) throw error;
      return data as { orders: ShopifyOrder[]; shopDomain: string };
    },
  });

  if (!email) return null;

  const orders = data?.orders ?? [];
  const orderCount = orders.length;

  const handleApplyPurchaseDate = async (order: ShopifyOrder) => {
    if (!rmaId) return;
    const dateIso = order.processedAt || order.createdAt;
    if (!dateIso) {
      toast.error("此訂單缺少日期資訊");
      return;
    }
    const purchaseDate = format(new Date(dateIso), "yyyy-MM-dd");

    // Recalc warranty using existing warrantyPolicy logic.
    const decision = evaluateWarranty({
      serialNumber,
      productModel,
      warrantyDate,
    });

    let newWarrantyDate: string | null = null;
    if (decision.batch !== "unknown" && decision.batch !== "legacy_2018_2022") {
      const years = decision.batch === "v2_2022_2025" ? 2 : 1;
      const expiry = new Date(purchaseDate);
      expiry.setFullYear(expiry.getFullYear() + years);
      newWarrantyDate = format(expiry, "yyyy-MM-dd");
    }

    setApplying(order.id);
    try {
      const updates: { purchase_date: string; warranty_date?: string } = {
        purchase_date: purchaseDate,
      };
      if (newWarrantyDate) updates.warranty_date = newWarrantyDate;

      const { error: updErr } = await supabase
        .from("rma_requests")
        .update(updates)
        .eq("id", rmaId);
      if (updErr) throw updErr;

      // Best-effort contact log; don't block on failure
      const noteParts = [
        `從 Shopify 訂單 ${order.name} 帶入購買日 ${purchaseDate}`,
      ];
      if (newWarrantyDate) {
        noteParts.push(
          `自動重算保固到期日：${newWarrantyDate}（批次 ${decision.batch}）`,
        );
      } else if (decision.batch === "legacy_2018_2022") {
        noteParts.push("批次為 Legacy（已過保），未重算到期日");
      } else {
        noteParts.push("批次未確定，未重算到期日，請於保固判定區手動確認");
      }

      await supabase.from("rma_customer_contacts").insert({
        rma_request_id: rmaId,
        contact_date: format(new Date(), "yyyy-MM-dd"),
        contact_method: "shopify_order_linked",
        contact_notes: noteParts.join("\n"),
      });

      toast.success("已帶入購買日");
      onPurchaseDateApplied?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "更新失敗";
      console.error("Apply purchase date failed:", err);
      toast.error(msg);
    } finally {
      setApplying(null);
    }
  };

  const formatMoney = (m: { amount: string; currencyCode: string }) => {
    const num = parseFloat(m.amount);
    if (Number.isNaN(num)) return `${m.amount} ${m.currencyCode}`;
    return `${m.currencyCode} ${num.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
  };

  return (
    <div className="rounded-lg border bg-card shadow-sm">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors rounded-lg"
          >
            <div className="flex items-center gap-2">
              {open ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
              <ShoppingBag className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-base">Shopify 訂單記錄</h3>
              {data && (
                <Badge variant="secondary" className="ml-1">
                  {orderCount}
                </Badge>
              )}
            </div>
            <span className="text-xs text-muted-foreground truncate max-w-[180px]">
              {email}
            </span>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-3 border-t pt-3">
            {isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />
                載入 Shopify 訂單中…
              </div>
            )}

            {isError && (
              <div className="flex items-center justify-between text-sm text-destructive py-3 px-3 bg-destructive/5 rounded-md">
                <span>暫時無法載入 Shopify 訂單</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => refetch()}
                  disabled={isFetching}
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  重試
                </Button>
              </div>
            )}

            {!isLoading && !isError && orderCount === 0 && (
              <div className="text-sm text-muted-foreground text-center py-4">
                此 Email 在 Shopify 找不到訂單記錄
              </div>
            )}

            {orders.map((order) => {
              const orderDate = order.processedAt || order.createdAt;
              const orderDateStr = orderDate
                ? format(new Date(orderDate), "yyyy/MM/dd")
                : "—";
              const isCurrent =
                currentPurchaseDate &&
                orderDate &&
                format(new Date(orderDate), "yyyy-MM-dd") ===
                  currentPurchaseDate;

              return (
                <div
                  key={order.id}
                  className="rounded-md border bg-background p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-medium text-sm">
                          {order.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {orderDateStr}
                        </span>
                        {order.financialStatus && (
                          <Badge variant="outline" className="text-[10px] py-0">
                            {order.financialStatus}
                          </Badge>
                        )}
                        {order.fulfillmentStatus && (
                          <Badge variant="outline" className="text-[10px] py-0">
                            {order.fulfillmentStatus}
                          </Badge>
                        )}
                      </div>
                      <ul className="mt-1.5 space-y-0.5">
                        {order.lineItems.slice(0, 4).map((li, idx) => (
                          <li
                            key={idx}
                            className="text-xs text-muted-foreground truncate"
                          >
                            • {li.title}
                            {li.variantTitle && li.variantTitle !== "Default Title"
                              ? ` (${li.variantTitle})`
                              : ""}
                            {li.quantity > 1 ? ` × ${li.quantity}` : ""}
                            {li.sku ? ` — ${li.sku}` : ""}
                          </li>
                        ))}
                        {order.lineItems.length > 4 && (
                          <li className="text-xs text-muted-foreground italic">
                            …還有 {order.lineItems.length - 4} 項
                          </li>
                        )}
                      </ul>
                    </div>
                    <div className="text-right text-sm font-medium whitespace-nowrap">
                      {formatMoney(order.totalPrice)}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <a
                      href={order.adminUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Shopify 後台
                    </a>
                    <Button
                      size="sm"
                      variant={isCurrent ? "secondary" : "outline"}
                      disabled={Boolean(isCurrent) || applying === order.id}
                      onClick={() => handleApplyPurchaseDate(order)}
                    >
                      {applying === order.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <CalendarCheck className="w-3 h-3 mr-1" />
                      )}
                      {isCurrent ? "目前使用中" : "使用此訂單日為購買日"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default ShopifyOrdersCard;
