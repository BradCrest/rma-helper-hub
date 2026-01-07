import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Phone, Search, Eye, Plus, MessageSquare, DollarSign } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";

type RmaStatus = "closed" | "contacting" | "follow_up" | "inspecting" | "no_repair" | "paid" | "quote_confirmed" | "received" | "registered" | "repairing" | "shipped" | "shipped_back" | "shipped_back_new" | "shipped_back_original" | "shipped_back_refurbished" | "unknown";

interface RmaRequest {
  id: string;
  rma_number: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  product_name: string;
  product_model: string | null;
  serial_number: string | null;
  status: RmaStatus;
  issue_description: string;
  initial_diagnosis: string | null;
  created_at: string;
}

interface CustomerContact {
  id: string;
  rma_request_id: string;
  contact_date: string;
  contact_method: string | null;
  contact_notes: string | null;
  created_at: string;
}

interface RepairDetail {
  planned_method: string | null;
  estimated_cost: number | null;
  actual_cost: number | null;
}

const CustomerHandlingTab = () => {
  const [rmaList, setRmaList] = useState<RmaRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedRma, setSelectedRma] = useState<RmaRequest | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [contacts, setContacts] = useState<CustomerContact[]>([]);
  const [repairDetail, setRepairDetail] = useState<RepairDetail | null>(null);
  
  // New contact form
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactMethod, setContactMethod] = useState("");
  const [contactNotes, setContactNotes] = useState("");
  const [contactDate, setContactDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchRmaList();
  }, [statusFilter]);

  const fetchRmaList = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("rma_requests")
        .select("*")
        .order("created_at", { ascending: false });

      // Filter by statuses relevant to customer handling
      if (statusFilter === "all") {
        query = query.in("status", ["contacting", "quote_confirmed", "paid"]);
      } else {
        query = query.eq("status", statusFilter as RmaStatus);
      }

      const { data, error } = await query;

      if (error) throw error;
      setRmaList(data || []);
    } catch (error) {
      console.error("Error fetching RMA list:", error);
      toast.error("載入資料失敗");
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetail = async (rma: RmaRequest) => {
    setSelectedRma(rma);
    setShowContactForm(false);
    
    // Fetch contact history
    const { data: contactData } = await supabase
      .from("rma_customer_contacts")
      .select("*")
      .eq("rma_request_id", rma.id)
      .order("contact_date", { ascending: false });

    setContacts(contactData || []);

    // Fetch repair details for cost info
    const { data: repairData } = await supabase
      .from("rma_repair_details")
      .select("planned_method, estimated_cost, actual_cost")
      .eq("rma_request_id", rma.id)
      .single();

    setRepairDetail(repairData);
    setDialogOpen(true);
  };

  const handleAddContact = async () => {
    if (!selectedRma || !contactMethod || !contactNotes) {
      toast.error("請填寫完整資訊");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("rma_customer_contacts").insert({
        rma_request_id: selectedRma.id,
        contact_date: contactDate,
        contact_method: contactMethod,
        contact_notes: contactNotes,
      });

      if (error) throw error;

      toast.success("已新增聯繫記錄");
      
      // Refresh contacts
      const { data } = await supabase
        .from("rma_customer_contacts")
        .select("*")
        .eq("rma_request_id", selectedRma.id)
        .order("contact_date", { ascending: false });

      setContacts(data || []);
      setShowContactForm(false);
      setContactMethod("");
      setContactNotes("");
      setContactDate(format(new Date(), "yyyy-MM-dd"));
    } catch (error) {
      console.error("Error adding contact:", error);
      toast.error("新增失敗");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (rmaId: string, newStatus: RmaStatus) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("請先登入");
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-rma-status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            rma_id: rmaId,
            new_status: newStatus,
          }),
        }
      );

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || "更新失敗");
      }

      toast.success(`狀態已更新為：${getStatusLabel(newStatus)}`);
      fetchRmaList();
      
      // Update selected RMA status
      if (selectedRma && selectedRma.id === rmaId) {
        setSelectedRma({ ...selectedRma, status: newStatus });
      }
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("更新狀態失敗");
    }
  };

  const getStatusLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      contacting: "聯繫客戶中",
      quote_confirmed: "報價已確認",
      paid: "已付款",
      repairing: "維修中",
    };
    return statusMap[status] || status;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      contacting: "outline",
      quote_confirmed: "secondary",
      paid: "default",
    };
    return (
      <Badge variant={variants[status] || "default"}>
        {getStatusLabel(status)}
      </Badge>
    );
  };

  const getContactMethodLabel = (method: string | null) => {
    const methodMap: Record<string, string> = {
      phone: "電話",
      sms: "簡訊",
      line: "LINE",
      email: "Email",
      fb: "FB",
      ig: "IG",
      other: "其他",
    };
    return method ? methodMap[method] || method : "-";
  };

  const filteredList = rmaList.filter((rma) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      rma.rma_number.toLowerCase().includes(query) ||
      rma.customer_name.toLowerCase().includes(query) ||
      rma.customer_phone.includes(query) ||
      rma.customer_email.toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="rma-card">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-center gap-2">
            <Phone className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">客戶處理</h2>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="搜尋客戶、電話、Email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="狀態篩選" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部待處理</SelectItem>
                <SelectItem value="contacting">聯繫客戶中</SelectItem>
                <SelectItem value="quote_confirmed">報價已確認</SelectItem>
                <SelectItem value="paid">已付款</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* RMA List Table */}
      <div className="rma-card p-0 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">載入中...</div>
        ) : filteredList.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Phone className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>目前沒有待處理的客戶聯繫</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>RMA 編號</TableHead>
                <TableHead>客戶姓名</TableHead>
                <TableHead>聯絡電話</TableHead>
                <TableHead>產品名稱</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredList.map((rma) => (
                <TableRow key={rma.id}>
                  <TableCell className="font-mono font-medium">{rma.rma_number}</TableCell>
                  <TableCell>{rma.customer_name}</TableCell>
                  <TableCell>{rma.customer_phone}</TableCell>
                  <TableCell>{rma.product_name}</TableCell>
                  <TableCell>{getStatusBadge(rma.status)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewDetail(rma)}
                      className="gap-1"
                    >
                      <Eye className="w-4 h-4" />
                      處理
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="w-5 h-5" />
              客戶處理 - {selectedRma?.rma_number}
            </DialogTitle>
          </DialogHeader>

          {selectedRma && (
            <div className="space-y-6">
              {/* Customer & Product Info */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">客戶姓名</p>
                  <p className="font-medium">{selectedRma.customer_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">聯絡電話</p>
                  <p className="font-medium">{selectedRma.customer_phone}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium text-sm break-all">{selectedRma.customer_email}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">產品名稱</p>
                  <p className="font-medium">{selectedRma.product_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">產品型號</p>
                  <p className="font-medium">{selectedRma.product_model || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">產品序號</p>
                  <p className="font-mono">{selectedRma.serial_number || "-"}</p>
                </div>
              </div>

              {/* Diagnosis & Cost Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 border border-border rounded-lg">
                  <h4 className="font-medium text-foreground mb-2">問題描述</h4>
                  <p className="text-sm text-muted-foreground">{selectedRma.issue_description}</p>
                  {selectedRma.initial_diagnosis && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <h4 className="font-medium text-foreground mb-1">初步診斷</h4>
                      <p className="text-sm text-muted-foreground">{selectedRma.initial_diagnosis}</p>
                    </div>
                  )}
                </div>
                <div className="p-4 border border-border rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <DollarSign className="w-4 h-4 text-primary" />
                    <h4 className="font-medium text-foreground">費用資訊</h4>
                  </div>
                  {repairDetail ? (
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">處理方式</span>
                        <span className="text-sm font-medium">
                          {repairDetail.planned_method === "repair" && "維修"}
                          {repairDetail.planned_method === "replace" && "換貨"}
                          {repairDetail.planned_method === "refund" && "退款"}
                          {repairDetail.planned_method === "return_supplier" && "送回供應商"}
                          {repairDetail.planned_method === "no_issue" && "無問題退回"}
                          {!repairDetail.planned_method && "-"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">預估費用</span>
                        <span className="text-sm font-medium">
                          {repairDetail.estimated_cost
                            ? `NT$ ${repairDetail.estimated_cost.toLocaleString()}`
                            : "-"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">實際費用</span>
                        <span className="text-sm font-medium">
                          {repairDetail.actual_cost
                            ? `NT$ ${repairDetail.actual_cost.toLocaleString()}`
                            : "-"}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">尚無費用資訊</p>
                  )}
                </div>
              </div>

              {/* Status Update */}
              <div className="flex items-center gap-3 p-4 border border-border rounded-lg">
                <span className="text-sm font-medium">目前狀態：</span>
                {getStatusBadge(selectedRma.status)}
                <div className="flex-1" />
                {selectedRma.status === "contacting" && (
                  <Button
                    size="sm"
                    onClick={() => handleUpdateStatus(selectedRma.id, "quote_confirmed")}
                    className="gap-1"
                  >
                    報價確認
                  </Button>
                )}
                {selectedRma.status === "quote_confirmed" && (
                  <Button
                    size="sm"
                    onClick={() => handleUpdateStatus(selectedRma.id, "paid")}
                    className="gap-1"
                  >
                    確認付款
                  </Button>
                )}
                {selectedRma.status === "paid" && (
                  <Button
                    size="sm"
                    onClick={() => handleUpdateStatus(selectedRma.id, "repairing")}
                    className="gap-1"
                  >
                    開始維修
                  </Button>
                )}
              </div>

              {/* Contact History */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    聯繫記錄
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowContactForm(true)}
                    className="gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    新增記錄
                  </Button>
                </div>

                {/* Add Contact Form */}
                {showContactForm && (
                  <div className="p-4 border border-primary/30 rounded-lg bg-primary/5 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="contactDate">聯繫日期</Label>
                        <Input
                          id="contactDate"
                          type="date"
                          value={contactDate}
                          onChange={(e) => setContactDate(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="contactMethod">聯繫方式</Label>
                        <Select value={contactMethod} onValueChange={setContactMethod}>
                          <SelectTrigger id="contactMethod">
                            <SelectValue placeholder="選擇方式" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="phone">電話</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="line">LINE</SelectItem>
                            <SelectItem value="sms">簡訊</SelectItem>
                            <SelectItem value="other">其他</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="contactNotes">聯繫內容</Label>
                      <Textarea
                        id="contactNotes"
                        placeholder="記錄聯繫內容..."
                        value={contactNotes}
                        onChange={(e) => setContactNotes(e.target.value)}
                        rows={3}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowContactForm(false)}
                      >
                        取消
                      </Button>
                      <Button size="sm" onClick={handleAddContact} disabled={saving}>
                        {saving ? "儲存中..." : "儲存"}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Contact List */}
                {contacts.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground border border-dashed border-border rounded-lg">
                    <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>尚無聯繫記錄</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {contacts.map((contact) => (
                      <div
                        key={contact.id}
                        className="p-4 border border-border rounded-lg"
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <Badge variant="outline">
                            {getContactMethodLabel(contact.contact_method)}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {format(new Date(contact.contact_date), "yyyy/MM/dd")}
                          </span>
                        </div>
                        <p className="text-sm text-foreground">{contact.contact_notes}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomerHandlingTab;
