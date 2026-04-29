import { useState } from "react";
import { Map, Info, ChevronDown, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
  RMA_STATUS_LABELS,
  RMA_STATUS_LOCATIONS,
  TAB_STATUS_BUCKETS,
  LOGISTICS_TAB_LABELS,
  DASHBOARD_BUCKET_LABELS,
  KNOWN_GAPS,
  getStatusVisibility,
  type RmaStatus,
  type LogisticsTabKey,
  type DashboardBucketKey,
} from "@/lib/rmaStatusMap";

const ALL_STATUSES = Object.keys(RMA_STATUS_LABELS) as RmaStatus[];

const StatusMapDialog = () => {
  const [showReverse, setShowReverse] = useState(false);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-sm">
          <Map className="w-4 h-4" />
          狀態對照表
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>RMA 狀態 ↔ 分頁對照表</DialogTitle>
          <DialogDescription>
            每筆 RMA 依 <code className="px-1 py-0.5 bg-muted rounded text-xs">status</code> 自動進入對應分頁。
            下表整理目前各分頁與 Dashboard 統計卡的篩選範圍。
          </DialogDescription>
        </DialogHeader>

        {/* 第一張表：Status → 出現位置 */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">主視角：每個狀態出現在哪裡</h3>
          <div className="border border-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-[180px]">狀態</TableHead>
                  <TableHead>後勤分頁</TableHead>
                  <TableHead>Dashboard 統計</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ALL_STATUSES.map((status) => {
                  const loc = RMA_STATUS_LOCATIONS[status];
                  const vis = getStatusVisibility(status);
                  return (
                    <TableRow key={status}>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <code className="text-xs text-muted-foreground">{status}</code>
                          <span className="text-sm font-medium text-foreground">
                            {RMA_STATUS_LABELS[status]}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {loc.tabs.length === 0 ? (
                          <Badge
                            variant="outline"
                            className="text-amber-700 border-amber-300 bg-amber-50"
                          >
                            僅在 RMA 列表
                          </Badge>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {loc.tabs.map((t) => (
                              <Badge key={t} variant="secondary" className="text-xs">
                                {LOGISTICS_TAB_LABELS[t]}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {loc.buckets.length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {loc.buckets.map((b) => (
                              <Badge
                                key={b}
                                variant={b === "dashboardCompleted" ? "default" : "secondary"}
                                className="text-xs"
                              >
                                {DASHBOARD_BUCKET_LABELS[b].replace("Dashboard・", "")}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </section>

        {/* 第二張表：分頁 → 包含哪些 status（可摺疊） */}
        <section className="space-y-2 mt-4">
          <button
            type="button"
            onClick={() => setShowReverse((v) => !v)}
            className="flex items-center gap-1 text-sm font-semibold text-foreground hover:text-primary"
          >
            {showReverse ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            反視角：每個分頁/統計桶包含哪些狀態
          </button>
          {showReverse && (
            <div className="border border-border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-[200px]">分頁／統計桶</TableHead>
                    <TableHead>包含狀態</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(Object.keys(TAB_STATUS_BUCKETS) as (
                    | LogisticsTabKey
                    | DashboardBucketKey
                  )[]).map((key) => {
                    const isDashboard = key.startsWith("dashboard");
                    const label = isDashboard
                      ? DASHBOARD_BUCKET_LABELS[key as DashboardBucketKey]
                      : LOGISTICS_TAB_LABELS[key as LogisticsTabKey];
                    return (
                      <TableRow key={key}>
                        <TableCell className="font-medium text-sm">{label}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {TAB_STATUS_BUCKETS[key].map((s) => (
                              <Badge key={s} variant="outline" className="text-xs font-mono">
                                {s}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        {/* 已知缺口提示 */}
        <section className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-700 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-amber-900">已知對照缺口</p>
              <ul className="text-xs text-amber-800 list-disc list-inside space-y-0.5">
                {KNOWN_GAPS.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
};

export default StatusMapDialog;
