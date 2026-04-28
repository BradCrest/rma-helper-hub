import { useState, useEffect } from "react";
import { z } from "zod";
import { isInvalidSerialNumber, INVALID_SERIAL_DESCRIPTION } from "@/lib/serialNumberValidator";
import { Link } from "react-router-dom";
import { 
  Search, 
  Filter, 
  ChevronLeft, 
  ChevronRight,
  Eye,
  RefreshCw,
  Home,
  LogOut,
  Package,
  Truck,
  Download,
  CalendarIcon,
  X,
  Clock,
  History,
  PackageCheck,
  Send,
  Upload,
  Trash2,
  AlertTriangle,
  MessageSquare,
  Plus,
  Pencil,
  DollarSign
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import type { Database } from "@/integrations/supabase/types";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { getEmailTemplateLabel, getEmailStatusLabel } from "@/lib/emailTemplateLabels";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type RmaStatus = Database["public"]["Enums"]["rma_status"];
type RmaRequest = Database["public"]["Tables"]["rma_requests"]["Row"];
type RmaShipping = Database["public"]["Tables"]["rma_shipping"]["Row"];
type RmaStatusHistory = Database["public"]["Tables"]["rma_status_history"]["Row"];

interface CustomerContact {
  id: string;
  rma_request_id: string;
  contact_date: string;
  contact_method: string | null;
  contact_notes: string | null;
  created_at: string;
}

const statusLabels: Record<RmaStatus, string> = {
  registered: "已登記",
  shipped: "已寄出",
  received: "已收件",
  inspecting: "檢修中",
  contacting: "聯系中",
  quote_confirmed: "確認報價",
  paid: "已付費",
  no_repair: "不維修",
  repairing: "維修中",
  shipped_back: "已回寄",
  shipped_back_refurbished: "已寄回整新品",
  shipped_back_original: "已寄回原錶",
  shipped_back_new: "已寄出全新品",
  follow_up: "後續關懷",
  closed: "已結案",
  unknown: "未知狀態",
};

const statusColors: Record<RmaStatus, string> = {
  registered: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  shipped: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
  received: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  inspecting: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  contacting: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
  quote_confirmed: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  paid: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400",
  no_repair: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  repairing: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  shipped_back: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  shipped_back_refurbished: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  shipped_back_original: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400",
  shipped_back_new: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  follow_up: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400",
  closed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  unknown: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400",
};

const allStatuses: RmaStatus[] = ["registered", "shipped", "received", "inspecting", "contacting", "quote_confirmed", "paid", "no_repair", "repairing", "shipped_back", "shipped_back_refurbished", "shipped_back_original", "shipped_back_new", "follow_up", "closed", "unknown"];

// Status allowed days (null = no limit)
const statusAllowedDays: Record<RmaStatus, number | null> = {
  registered: 7,
  shipped: 7,
  received: 3,
  inspecting: 3,
  contacting: 3,
  quote_confirmed: 3,
  paid: 3,
  no_repair: 2,
  repairing: 14,
  shipped_back: 7,
  shipped_back_refurbished: 7,
  shipped_back_original: 7,
  shipped_back_new: 7,
  follow_up: 14,
  closed: null,
  unknown: null,
};

// Calculate days in current status
const calculateStatusDays = (updatedAt: string): number => {
  const updated = new Date(updatedAt);
  const now = new Date();
  const diffTime = now.getTime() - updated.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

// Get status duration display info
const getStatusDurationInfo = (status: RmaStatus, updatedAt: string): { elapsed: number; remaining: number | null; isOverdue: boolean } => {
  const elapsed = calculateStatusDays(updatedAt);
  const allowed = statusAllowedDays[status];
  
  if (allowed === null) {
    return { elapsed, remaining: null, isOverdue: false };
  }
  
  const remaining = allowed - elapsed;
  const isOverdue = remaining < 0;
  
  return { elapsed, remaining, isOverdue };
};

const AdminRmaList = () => {

  const { user, signOut, isSuperAdmin, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [rmaList, setRmaList] = useState<RmaRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<RmaStatus | "all">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedRma, setSelectedRma] = useState<RmaRequest | null>(null);
  const [selectedRmaShipping, setSelectedRmaShipping] = useState<RmaShipping | null>(null);
  const [outboundShipping, setOutboundShipping] = useState<RmaShipping | null>(null);
  const [statusHistory, setStatusHistory] = useState<RmaStatusHistory[]>([]);
  const [emailLogs, setEmailLogs] = useState<Array<{
    id: string;
    message_id: string | null;
    template_name: string;
    recipient_email: string;
    status: string;
    error_message: string | null;
    metadata: any;
    created_at: string;
  }>>([]);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isConfirmingReceive, setIsConfirmingReceive] = useState(false);
  const [isSubmittingOutbound, setIsSubmittingOutbound] = useState(false);
  const [outboundForm, setOutboundForm] = useState({ carrier: "", tracking_number: "", notes: "", ship_type: "original" as "original" | "refurbished" | "new" });
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [showClearAllDialog, setShowClearAllDialog] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [rmaToDelete, setRmaToDelete] = useState<RmaRequest | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const pageSize = 10;

  // Customer contact states
  const [contacts, setContacts] = useState<CustomerContact[]>([]);
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactMethod, setContactMethod] = useState("");
  const [contactNotes, setContactNotes] = useState("");
  const [contactDate, setContactDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [editingContact, setEditingContact] = useState<CustomerContact | null>(null);
  const [showDeleteContactDialog, setShowDeleteContactDialog] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<CustomerContact | null>(null);
  const [isDeletingContact, setIsDeletingContact] = useState(false);

  // Repair fee states
  const [repairFee, setRepairFee] = useState<string>("");
  const [isSavingFee, setIsSavingFee] = useState(false);

  // Detail edit states (admin)
  const [editingDetail, setEditingDetail] = useState(false);
  const [savingDetail, setSavingDetail] = useState(false);
  const [editForm, setEditForm] = useState({
    customer_name: "",
    customer_phone: "",
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
  });

  // Deletion logs states
  interface DeletionLog {
    id: string;
    rma_number: string;
    customer_name: string;
    product_name: string;
    product_model: string | null;
    deleted_by_email: string;
    deleted_at: string;
  }
  const [showDeletionLogs, setShowDeletionLogs] = useState(false);
  const [deletionLogs, setDeletionLogs] = useState<DeletionLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // Sync edit form whenever selected RMA / shipping changes
  useEffect(() => {
    if (!selectedRma) {
      setEditingDetail(false);
      return;
    }
    setEditForm({
      customer_name: selectedRma.customer_name || "",
      customer_phone: selectedRma.customer_phone || "",
      customer_email: selectedRma.customer_email || "",
      customer_address: selectedRma.customer_address || "",
      product_name: selectedRma.product_name || "",
      product_model: selectedRma.product_model || "",
      serial_number: selectedRma.serial_number || "",
      issue_type: selectedRma.issue_type || "",
      issue_description: selectedRma.issue_description || "",
      customer_notes: selectedRma.customer_notes || "",
      shipping_carrier: selectedRmaShipping?.carrier || "",
      shipping_tracking_number: selectedRmaShipping?.tracking_number || "",
      shipping_ship_date: selectedRmaShipping?.ship_date || "",
    });
  }, [selectedRma, selectedRmaShipping]);

  const detailEditSchema = z.object({
    customer_name: z.string().trim().min(1, "客戶名稱必填").max(200),
    customer_phone: z.string().trim().min(1, "聯絡電話必填").max(50),
    customer_email: z.string().trim().email("Email 格式錯誤").max(255),
    customer_address: z.string().trim().max(500).optional().or(z.literal("")),
    product_name: z.string().trim().min(1, "產品名稱必填").max(200),
    product_model: z.string().trim().max(100).optional().or(z.literal("")),
    serial_number: z.string().trim().max(100).optional().or(z.literal("")),
    issue_type: z.string().trim().min(1, "問題類型必填"),
    issue_description: z.string().trim().min(1, "問題描述必填").max(2000),
    customer_notes: z.string().trim().max(2000).optional().or(z.literal("")),
  });

  const handleSaveDetailEdit = async () => {
    if (!selectedRma || !user) return;

    const parsed = detailEditSchema.safeParse({
      customer_name: editForm.customer_name,
      customer_phone: editForm.customer_phone,
      customer_email: editForm.customer_email,
      customer_address: editForm.customer_address,
      product_name: editForm.product_name,
      product_model: editForm.product_model,
      serial_number: editForm.serial_number,
      issue_type: editForm.issue_type,
      issue_description: editForm.issue_description,
      customer_notes: editForm.customer_notes,
    });
    if (!parsed.success) {
      const firstErr = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
      toast.error(firstErr || "請檢查欄位內容");
      return;
    }

    if (editForm.serial_number && isInvalidSerialNumber(editForm.serial_number)) {
      toast.error(INVALID_SERIAL_DESCRIPTION);
      return;
    }

    setSavingDetail(true);
    try {
      const nowIso = new Date().toISOString();
      const updatePayload = {
        customer_name: editForm.customer_name.trim(),
        customer_phone: editForm.customer_phone.trim(),
        customer_email: editForm.customer_email.trim(),
        customer_address: editForm.customer_address.trim() || null,
        product_name: editForm.product_name.trim(),
        product_model: editForm.product_model.trim() || null,
        serial_number: editForm.serial_number.trim() || null,
        issue_type: editForm.issue_type.trim(),
        issue_description: editForm.issue_description.trim(),
        customer_notes: editForm.customer_notes.trim() || null,
        updated_by: user.id,
        updated_by_email: user.email || null,
        updated_at: nowIso,
      };

      const { error: updateErr } = await supabase
        .from("rma_requests")
        .update(updatePayload)
        .eq("id", selectedRma.id);
      if (updateErr) throw updateErr;

      const hasShippingValue =
        editForm.shipping_carrier.trim() ||
        editForm.shipping_tracking_number.trim() ||
        editForm.shipping_ship_date.trim();

      let nextShipping = selectedRmaShipping;
      if (hasShippingValue || selectedRmaShipping?.id) {
        const shippingPayload = {
          rma_request_id: selectedRma.id,
          direction: "inbound",
          carrier: editForm.shipping_carrier.trim() || null,
          tracking_number: editForm.shipping_tracking_number.trim() || null,
          ship_date: editForm.shipping_ship_date.trim() || null,
        };
        if (selectedRmaShipping?.id) {
          const { data, error: shipErr } = await supabase
            .from("rma_shipping")
            .update(shippingPayload)
            .eq("id", selectedRmaShipping.id)
            .select()
            .maybeSingle();
          if (shipErr) throw shipErr;
          if (data) nextShipping = data as RmaShipping;
        } else if (hasShippingValue) {
          const { data, error: shipErr } = await supabase
            .from("rma_shipping")
            .insert(shippingPayload)
            .select()
            .maybeSingle();
          if (shipErr) throw shipErr;
          if (data) nextShipping = data as RmaShipping;
        }
      }

      toast.success("已儲存修改");
      setSelectedRma({ ...selectedRma, ...updatePayload } as RmaRequest);
      setSelectedRmaShipping(nextShipping);
      setEditingDetail(false);
      fetchRmaList();
    } catch (err: any) {
      console.error("Error saving RMA edits:", err);
      toast.error(err?.message || "儲存失敗");
    } finally {
      setSavingDetail(false);
    }
  };


  const fetchRmaList = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from("rma_requests")
        .select("*", { count: "exact" });

      // Apply status filter
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      // Apply search filter
      if (searchTerm.trim()) {
        query = query.or(
          `rma_number.ilike.%${searchTerm}%,customer_name.ilike.%${searchTerm}%,customer_email.ilike.%${searchTerm}%,customer_phone.ilike.%${searchTerm}%,serial_number.ilike.%${searchTerm}%`
        );
      }

      // Apply date range filter
      if (startDate) {
        query = query.gte("created_at", startDate.toISOString());
      }
      if (endDate) {
        // Set end of day for end date
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.lte("created_at", endOfDay.toISOString());
      }

      // Pagination
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      
      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;

      setRmaList(data || []);
      setTotalCount(count || 0);
    } catch (error) {
      console.error("Error fetching RMA list:", error);
      toast.error("載入 RMA 列表失敗");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRmaList();
  }, [currentPage, statusFilter, searchTerm, startDate, endDate]);

  const handleStatusUpdate = async (rmaId: string, newStatus: RmaStatus) => {
    setIsUpdatingStatus(true);
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

      toast.success(`狀態已更新為「${statusLabels[newStatus]}」`);
      fetchRmaList();
      setSelectedRma(null);
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("更新狀態失敗");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleViewRma = async (rma: RmaRequest) => {
    setSelectedRma(rma);
    setOutboundForm({ carrier: "", tracking_number: "", notes: "", ship_type: "original" });
    setShowContactForm(false);
    setContactMethod("");
    setContactNotes("");
    setContactDate(format(new Date(), "yyyy-MM-dd"));
    setEditingContact(null);
    // Load repair fee
    setRepairFee(rma.repair_fee != null ? String(rma.repair_fee) : "");
    
    // Fetch shipping info (inbound & outbound), status history, contacts, and email logs for this RMA
    try {
      const [inboundResult, outboundResult, historyResult, contactsResult, emailLogsResult] = await Promise.all([
        supabase
          .from("rma_shipping")
          .select("*")
          .eq("rma_request_id", rma.id)
          .eq("direction", "inbound")
          .maybeSingle(),
        supabase
          .from("rma_shipping")
          .select("*")
          .eq("rma_request_id", rma.id)
          .eq("direction", "outbound")
          .maybeSingle(),
        supabase
          .from("rma_status_history")
          .select("*")
          .eq("rma_request_id", rma.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("rma_customer_contacts")
          .select("*")
          .eq("rma_request_id", rma.id)
          .order("contact_date", { ascending: false }),
        rma.customer_email
          ? supabase
              .from("email_send_log")
              .select("*")
              .eq("recipient_email", rma.customer_email)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
      ]);
      
      setSelectedRmaShipping(inboundResult.data);
      setOutboundShipping(outboundResult.data);
      setStatusHistory(historyResult.data || []);
      setContacts(contactsResult.data || []);

      // Deduplicate email logs by message_id (keep latest per message_id),
      // and filter to logs related to this RMA when metadata contains rma_number/rma_request_id.
      const allLogs = (emailLogsResult.data || []) as any[];
      const seen = new Set<string>();
      const dedup: any[] = [];
      for (const log of allLogs) {
        const key = log.message_id || `__no_mid__${log.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        dedup.push(log);
      }
      const filtered = dedup.filter((log) => {
        const meta = log.metadata || {};
        const matchedByRma =
          meta.rma_number === rma.rma_number ||
          meta.rma_request_id === rma.id;
        // If any log carries rma metadata, only keep matching ones; otherwise keep all (legacy logs).
        return matchedByRma || (!meta.rma_number && !meta.rma_request_id);
      });
      setEmailLogs(filtered);
    } catch (error) {
      console.error("Error fetching RMA details:", error);
      setSelectedRmaShipping(null);
      setOutboundShipping(null);
      setStatusHistory([]);
      setContacts([]);
      setEmailLogs([]);
    }
  };

  const handleAddContact = async () => {
    if (!selectedRma || !contactMethod) {
      toast.error("請選擇聯繫方式");
      return;
    }

    setIsSavingContact(true);
    try {
      if (editingContact) {
        // Update existing contact
        const { error } = await supabase
          .from("rma_customer_contacts")
          .update({
            contact_date: contactDate,
            contact_method: contactMethod,
            contact_notes: contactNotes || null,
          })
          .eq("id", editingContact.id);

        if (error) throw error;
        toast.success("已更新聯繫記錄");
      } else {
        // Insert new contact
        const { error } = await supabase.from("rma_customer_contacts").insert({
          rma_request_id: selectedRma.id,
          contact_date: contactDate,
          contact_method: contactMethod,
          contact_notes: contactNotes || null,
        });

        if (error) throw error;
        toast.success("已新增聯繫記錄");
      }
      
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
      setEditingContact(null);
    } catch (error) {
      console.error("Error saving contact:", error);
      toast.error(editingContact ? "更新失敗" : "新增失敗");
    } finally {
      setIsSavingContact(false);
    }
  };

  const handleEditContact = (contact: CustomerContact) => {
    setEditingContact(contact);
    setContactDate(contact.contact_date);
    setContactMethod(contact.contact_method || "");
    setContactNotes(contact.contact_notes || "");
    setShowContactForm(true);
  };

  const handleDeleteContact = async () => {
    if (!contactToDelete || !selectedRma) return;

    setIsDeletingContact(true);
    try {
      const { error } = await supabase
        .from("rma_customer_contacts")
        .delete()
        .eq("id", contactToDelete.id);

      if (error) throw error;

      toast.success("已刪除聯繫記錄");
      
      // Refresh contacts
      const { data } = await supabase
        .from("rma_customer_contacts")
        .select("*")
        .eq("rma_request_id", selectedRma.id)
        .order("contact_date", { ascending: false });

      setContacts(data || []);
      setShowDeleteContactDialog(false);
      setContactToDelete(null);
    } catch (error) {
      console.error("Error deleting contact:", error);
      toast.error("刪除失敗");
    } finally {
      setIsDeletingContact(false);
    }
  };

  const handleSaveRepairFee = async () => {
    if (!selectedRma) return;

    setIsSavingFee(true);
    try {
      const feeValue = repairFee.trim() === "" ? null : parseFloat(repairFee);
      
      const { error } = await supabase
        .from("rma_requests")
        .update({ repair_fee: feeValue })
        .eq("id", selectedRma.id);

      if (error) throw error;

      toast.success("維修費用已儲存");
      setSelectedRma({ ...selectedRma, repair_fee: feeValue });
      fetchRmaList();
    } catch (error) {
      console.error("Error saving repair fee:", error);
      toast.error("儲存失敗");
    } finally {
      setIsSavingFee(false);
    }
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

  const handleConfirmReceive = async () => {
    if (!selectedRma || !selectedRmaShipping) return;
    
    setIsConfirmingReceive(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Update delivery_date in rma_shipping
      const { error: shippingError } = await supabase
        .from("rma_shipping")
        .update({ delivery_date: today })
        .eq("id", selectedRmaShipping.id);

      if (shippingError) throw shippingError;

      // Update RMA status to received
      const { error: rmaError } = await supabase
        .from("rma_requests")
        .update({ status: "received" })
        .eq("id", selectedRma.id);

      if (rmaError) throw rmaError;

      toast.success("已確認收件");
      
      // Refresh data
      setSelectedRmaShipping({ ...selectedRmaShipping, delivery_date: today });
      setSelectedRma({ ...selectedRma, status: "received" });
      fetchRmaList();
    } catch (error) {
      console.error("Error confirming receive:", error);
      toast.error("確認收件失敗");
    } finally {
      setIsConfirmingReceive(false);
    }
  };

  const handleSubmitOutbound = async () => {
    if (!selectedRma) return;
    
    if (!outboundForm.carrier.trim()) {
      toast.error("請填寫物流名稱");
      return;
    }
    if (!outboundForm.tracking_number.trim()) {
      toast.error("請填寫物流單號");
      return;
    }

    setIsSubmittingOutbound(true);
    try {
      const { data, error } = await supabase.functions.invoke("submit-outbound-shipping", {
        body: {
          rma_request_id: selectedRma.id,
          carrier: outboundForm.carrier,
          tracking_number: outboundForm.tracking_number,
          notes: outboundForm.notes || null,
          ship_type: outboundForm.ship_type,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("回寄資訊已成功提交");
      
      // Refresh data - determine the new status based on ship_type
      const newStatusMap: Record<string, RmaStatus> = {
        original: "shipped_back_original",
        refurbished: "shipped_back_refurbished",
        new: "shipped_back_new",
      };
      const newStatus = newStatusMap[outboundForm.ship_type] || "shipped_back";
      
      setOutboundShipping(data.shipping);
      setSelectedRma({ ...selectedRma, status: newStatus });
      setOutboundForm({ carrier: "", tracking_number: "", notes: "", ship_type: "original" });
      fetchRmaList();
    } catch (error: any) {
      console.error("Error submitting outbound shipping:", error);
      toast.error(error.message || "提交回寄資訊失敗");
    } finally {
      setIsSubmittingOutbound(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/admin");
  };

  const handleDeleteRma = async () => {
    if (!rmaToDelete) return;
    
    setIsDeleting(true);
    try {
      // Get current user info for logging
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      
      // Step 1: Log the deletion first
      const { error: logError } = await supabase
        .from("rma_deletion_logs")
        .insert({
          rma_number: rmaToDelete.rma_number,
          customer_name: rmaToDelete.customer_name,
          customer_email: rmaToDelete.customer_email,
          customer_phone: rmaToDelete.customer_phone,
          product_name: rmaToDelete.product_name,
          product_model: rmaToDelete.product_model,
          serial_number: rmaToDelete.serial_number,
          status: rmaToDelete.status,
          deleted_by: currentUser?.id,
          deleted_by_email: currentUser?.email || "未知",
          rma_data: rmaToDelete,
        });
      
      if (logError) throw new Error(`記錄刪除日誌失敗：${logError.message}`);

      // Step 2: Delete related data in order (foreign key constraints)
      const { error: feedbackErr } = await supabase.from("rma_customer_feedback").delete().eq("rma_request_id", rmaToDelete.id);
      if (feedbackErr) throw new Error(`刪除 feedback 失敗：${feedbackErr.message}`);

      const { error: contactsErr } = await supabase.from("rma_customer_contacts").delete().eq("rma_request_id", rmaToDelete.id);
      if (contactsErr) throw new Error(`刪除 contacts 失敗：${contactsErr.message}`);

      const { error: supplierErr } = await supabase.from("rma_supplier_repairs").delete().eq("rma_request_id", rmaToDelete.id);
      if (supplierErr) throw new Error(`刪除 supplier_repairs 失敗：${supplierErr.message}`);

      const { error: repairErr } = await supabase.from("rma_repair_details").delete().eq("rma_request_id", rmaToDelete.id);
      if (repairErr) throw new Error(`刪除 repair_details 失敗：${repairErr.message}`);

      const { error: shippingErr } = await supabase.from("rma_shipping").delete().eq("rma_request_id", rmaToDelete.id);
      if (shippingErr) throw new Error(`刪除 shipping 失敗：${shippingErr.message}`);

      const { error: historyErr } = await supabase.from("rma_status_history").delete().eq("rma_request_id", rmaToDelete.id);
      if (historyErr) throw new Error(`刪除 status_history 失敗：${historyErr.message}`);

      const { error: embeddingsErr } = await supabase.from("rma_embeddings").delete().eq("rma_request_id", rmaToDelete.id);
      if (embeddingsErr) throw new Error(`刪除 embeddings 失敗：${embeddingsErr.message}`);

      const { error: requestsErr } = await supabase.from("rma_requests").delete().eq("id", rmaToDelete.id);
      if (requestsErr) throw new Error(`刪除 RMA 失敗：${requestsErr.message}`);

      toast.success(`已刪除 RMA ${rmaToDelete.rma_number}`);
      setShowDeleteDialog(false);
      setRmaToDelete(null);
      fetchRmaList();
    } catch (error: any) {
      console.error("Error deleting RMA:", error);
      toast.error(error.message || "刪除 RMA 失敗");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenDeletionLogs = async () => {
    setShowDeletionLogs(true);
    setIsLoadingLogs(true);
    try {
      const { data, error } = await supabase
        .from("rma_deletion_logs")
        .select("id, rma_number, customer_name, product_name, product_model, deleted_by_email, deleted_at")
        .order("deleted_at", { ascending: false })
        .limit(100);
      
      if (error) throw error;
      setDeletionLogs(data || []);
    } catch (error) {
      console.error("Error fetching deletion logs:", error);
      toast.error("載入刪除日誌失敗");
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const handleExportAllCsv = async (): Promise<boolean> => {
    try {
      // Fetch ALL RMA records for export (no pagination)
      const { data: allRmaData, error } = await supabase
        .from("rma_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!allRmaData || allRmaData.length === 0) {
        toast.error("沒有資料可匯出");
        return false;
      }

      // CSV headers
      const headers = [
        "RMA編號",
        "客戶名稱",
        "電話",
        "Email",
        "地址",
        "產品名稱",
        "產品型號",
        "序號",
        "購買日期",
        "問題類型",
        "問題描述",
        "狀態",
        "建立日期"
      ];

      // CSV rows
      const rows = allRmaData.map(rma => [
        rma.rma_number,
        rma.customer_name,
        rma.customer_phone,
        rma.customer_email,
        rma.customer_address || "",
        rma.product_name,
        rma.product_model || "",
        rma.serial_number || "",
        rma.purchase_date || "",
        rma.issue_type,
        (rma.issue_description || "").replace(/"/g, '""'),
        statusLabels[rma.status],
        new Date(rma.created_at).toLocaleString("zh-TW")
      ]);

      // Build CSV content with BOM for Excel compatibility
      const BOM = "\uFEFF";
      const csvContent = BOM + [
        headers.join(","),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
      ].join("\n");

      // Download
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `RMA_全部備份_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`已匯出 ${allRmaData.length} 筆 RMA 資料`);
      return true;
    } catch (error) {
      console.error("Error exporting all CSV:", error);
      toast.error("匯出 CSV 失敗");
      return false;
    }
  };

  const handleClearAllData = async () => {
    setIsClearingAll(true);
    try {
      // Step 1: Export all data first
      const exportSuccess = await handleExportAllCsv();
      if (!exportSuccess) {
        setIsClearingAll(false);
        setShowClearAllDialog(false);
        return;
      }

      // Step 2: Delete related data in order (foreign key constraints)
      // Delete from child tables first, then parent table
      const { error: feedbackErr } = await supabase.from("rma_customer_feedback").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (feedbackErr) throw new Error(`刪除 feedback 失敗：${feedbackErr.message}`);

      const { error: contactsErr } = await supabase.from("rma_customer_contacts").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (contactsErr) throw new Error(`刪除 contacts 失敗：${contactsErr.message}`);

      const { error: supplierErr } = await supabase.from("rma_supplier_repairs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (supplierErr) throw new Error(`刪除 supplier_repairs 失敗：${supplierErr.message}`);

      const { error: repairErr } = await supabase.from("rma_repair_details").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (repairErr) throw new Error(`刪除 repair_details 失敗：${repairErr.message}`);

      const { error: shippingErr } = await supabase.from("rma_shipping").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (shippingErr) throw new Error(`刪除 shipping 失敗：${shippingErr.message}`);

      const { error: historyErr } = await supabase.from("rma_status_history").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (historyErr) throw new Error(`刪除 status_history 失敗：${historyErr.message}`);

      const { error: requestsErr } = await supabase.from("rma_requests").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (requestsErr) throw new Error(`刪除 requests 失敗：${requestsErr.message}`);

      toast.success("所有 RMA 資料已清除");
      setShowClearAllDialog(false);
      fetchRmaList();
    } catch (error: any) {
      console.error("Error clearing all data:", error);
      toast.error(error.message || "清除資料失敗");
    } finally {
      setIsClearingAll(false);
    }
  };

  const handleExportCsv = () => {
    if (rmaList.length === 0) {
      toast.error("沒有資料可下載");
      return;
    }

    // CSV headers
    const headers = [
      "RMA編號",
      "客戶名稱",
      "電話",
      "Email",
      "地址",
      "產品名稱",
      "產品型號",
      "序號",
      "購買日期",
      "問題類型",
      "問題描述",
      "狀態",
      "建立日期"
    ];

    // CSV rows
    const rows = rmaList.map(rma => [
      rma.rma_number,
      rma.customer_name,
      rma.customer_phone,
      rma.customer_email,
      rma.customer_address || "",
      rma.product_name,
      rma.product_model || "",
      rma.serial_number || "",
      rma.purchase_date || "",
      rma.issue_type,
      rma.issue_description.replace(/"/g, '""'), // Escape quotes
      statusLabels[rma.status],
      new Date(rma.created_at).toLocaleString("zh-TW")
    ]);

    // Build CSV content with BOM for Excel compatibility
    const BOM = "\uFEFF";
    const csvContent = BOM + [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    // Download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `RMA_列表_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success("CSV 檔案已下載");
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card shadow-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link to="/admin/dashboard" className="text-muted-foreground hover:text-foreground">
                <ChevronLeft className="w-5 h-5" />
              </Link>
              <h1 className="text-xl font-bold text-foreground">RMA 申請列表</h1>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">{user?.email}</span>
              <Link to="/" className="rma-btn-secondary text-sm">
                <Home className="w-4 h-4" />
                首頁
              </Link>
              <button onClick={handleSignOut} className="rma-btn-secondary text-sm">
                <LogOut className="w-4 h-4" />
                登出
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters */}
        <div className="rma-card mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="text"
                placeholder="搜尋 RMA 編號、客戶名稱、電話、郵件或產品序號..."
                className="rma-input pl-10"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-muted-foreground" />
              <select
                className="rma-input w-auto"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as RmaStatus | "all");
                  setCurrentPage(1);
                }}
              >
                <option value="all">所有狀態</option>
                {allStatuses.map((status) => (
                  <option key={status} value={status}>
                    {statusLabels[status]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Date Range Filter */}
          <div className="flex flex-wrap items-center gap-4 mt-4">
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">日期範圍：</span>
            </div>
            
            {/* Start Date */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[160px] justify-start text-left font-normal",
                    !startDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, "yyyy/MM/dd", { locale: zhTW }) : "開始日期"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={(date) => {
                    setStartDate(date);
                    setCurrentPage(1);
                  }}
                  disabled={(date) => endDate ? date > endDate : false}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>

            <span className="text-muted-foreground">至</span>

            {/* End Date */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[160px] justify-start text-left font-normal",
                    !endDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {endDate ? format(endDate, "yyyy/MM/dd", { locale: zhTW }) : "結束日期"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={(date) => {
                    setEndDate(date);
                    setCurrentPage(1);
                  }}
                  disabled={(date) => startDate ? date < startDate : false}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>

            {/* Clear Date Filter */}
            {(startDate || endDate) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStartDate(undefined);
                  setEndDate(undefined);
                  setCurrentPage(1);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4 mr-1" />
                清除日期
              </Button>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 mt-4">
            {/* Refresh */}
            <button
              onClick={fetchRmaList}
              className="rma-btn-secondary"
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
              重新整理
            </button>

            {/* Export CSV */}
            <button
              onClick={handleExportCsv}
              className="rma-btn-secondary"
              disabled={isLoading || rmaList.length === 0}
            >
              <Download className="w-4 h-4" />
              下載 CSV
            </button>

            {/* Import CSV */}
            <Link to="/admin/csv-import" className="rma-btn-secondary inline-flex items-center gap-2">
              <Upload className="w-4 h-4" />
              匯入 CSV
            </Link>

            {/* Deletion Logs */}
            <button
              onClick={handleOpenDeletionLogs}
              className="rma-btn-secondary"
            >
              <History className="w-4 h-4" />
              RMA 刪除 LOG
            </button>

            {/* Clear All Data - Super Admin Only */}
            {isSuperAdmin && (
              <button
                onClick={() => setShowClearAllDialog(true)}
                className="rma-btn-secondary text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                disabled={isLoading || totalCount === 0}
              >
                <Trash2 className="w-4 h-4" />
                清除所有資料
              </button>
            )}
          </div>
        </div>

        {/* Clear All Data Confirmation Dialog - Super Admin Only */}
        {isSuperAdmin && (
          <AlertDialog open={showClearAllDialog} onOpenChange={setShowClearAllDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-red-600">
                  <AlertTriangle className="w-5 h-5" />
                  確認清除所有資料
                </AlertDialogTitle>
                <AlertDialogDescription className="space-y-2">
                  <p>此操作將會：</p>
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li><strong>先匯出</strong>所有 RMA 資料為 CSV 備份檔</li>
                    <li><strong>再刪除</strong>資料庫中所有 RMA 相關資料</li>
                  </ol>
                  <p className="text-red-600 font-medium mt-4">
                    ⚠️ 刪除後資料將無法復原，請確認已下載備份檔案！
                  </p>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isClearingAll}>取消</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleClearAllData}
                  disabled={isClearingAll}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {isClearingAll ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      處理中...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4 mr-2" />
                      匯出並清除
                    </>
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {/* Delete Single RMA Confirmation Dialog (Super Admin only) */}
        <AlertDialog 
          open={showDeleteDialog} 
          onOpenChange={(open) => {
            setShowDeleteDialog(open);
            if (!open) {
              setDeleteConfirmInput("");
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-5 h-5" />
                確認刪除 RMA
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p>您確定要刪除以下 RMA 嗎？</p>
                  {rmaToDelete && (
                    <div className="bg-muted p-3 rounded-md mt-2">
                      <p><strong>RMA 編號：</strong>{rmaToDelete.rma_number}</p>
                      <p><strong>客戶名稱：</strong>{rmaToDelete.customer_name}</p>
                      <p><strong>產品型號：</strong>{rmaToDelete.product_model || "-"}</p>
                    </div>
                  )}
                  <p className="text-destructive font-medium mt-4">
                    ⚠️ 此操作將同時刪除所有相關資料（物流、狀態歷史等），刪除後無法復原！
                  </p>
                  
                  <div className="mt-4 space-y-2">
                    <label className="text-sm font-medium text-foreground block">
                      請輸入 RMA 編號 <span className="font-mono text-destructive">{rmaToDelete?.rma_number}</span> 以確認刪除：
                    </label>
                    <input
                      type="text"
                      value={deleteConfirmInput}
                      onChange={(e) => setDeleteConfirmInput(e.target.value)}
                      placeholder="輸入 RMA 編號"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                    />
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteRma}
                disabled={isDeleting || deleteConfirmInput !== rmaToDelete?.rma_number}
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    刪除中...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    確認刪除
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Deletion Logs Dialog */}
        {showDeletionLogs && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <History className="w-5 h-5" />
                  RMA 刪除記錄
                </h2>
                <button
                  onClick={() => setShowDeletionLogs(false)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-4 overflow-y-auto max-h-[calc(80vh-80px)]">
                {isLoadingLogs ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                    載入中...
                  </div>
                ) : deletionLogs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    目前沒有刪除記錄
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">RMA 編號</th>
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">客戶名稱</th>
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">產品</th>
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">刪除者</th>
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">刪除時間</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deletionLogs.map((log) => (
                          <tr key={log.id} className="border-b border-border hover:bg-muted/50">
                            <td className="py-2 px-3 font-mono text-foreground">{log.rma_number}</td>
                            <td className="py-2 px-3 text-foreground">{log.customer_name}</td>
                            <td className="py-2 px-3 text-foreground">
                              {log.product_name}
                              {log.product_model && <span className="text-muted-foreground"> ({log.product_model})</span>}
                            </td>
                            <td className="py-2 px-3 text-muted-foreground">{log.deleted_by_email}</td>
                            <td className="py-2 px-3 text-muted-foreground">
                              {format(new Date(log.deleted_at), "yyyy/MM/dd HH:mm", { locale: zhTW })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Delete Contact Confirmation Dialog */}
        <AlertDialog open={showDeleteContactDialog} onOpenChange={setShowDeleteContactDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-5 h-5" />
                確認刪除聯繫記錄
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <p>您確定要刪除此聯繫記錄嗎？</p>
                {contactToDelete && (
                  <div className="bg-muted p-3 rounded-md mt-2">
                    <p><strong>日期：</strong>{contactToDelete.contact_date}</p>
                    <p><strong>方式：</strong>{getContactMethodLabel(contactToDelete.contact_method)}</p>
                    {contactToDelete.contact_notes && (
                      <p><strong>內容：</strong>{contactToDelete.contact_notes}</p>
                    )}
                  </div>
                )}
                <p className="text-destructive font-medium mt-4">
                  ⚠️ 刪除後無法復原！
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeletingContact}>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteContact}
                disabled={isDeletingContact}
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              >
                {isDeletingContact ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    刪除中...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    確認刪除
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="rma-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">RMA 編號</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">客戶名稱</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">聯絡電話</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">產品型號</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">問題類型</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">狀態</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">建立日期</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        載入中...
                      </div>
                    </td>
                  </tr>
                ) : rmaList.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-muted-foreground">
                      沒有找到符合條件的 RMA 申請
                    </td>
                  </tr>
                ) : (
                  rmaList.map((rma) => {
                    const durationInfo = getStatusDurationInfo(rma.status, rma.updated_at);
                    return (
                    <tr key={rma.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          {/* Status Duration Badge */}
                          {durationInfo.remaining !== null && (
                            <div 
                              className={cn(
                                "flex flex-col items-center justify-center min-w-[40px] px-1.5 py-1 rounded text-xs font-medium",
                                durationInfo.isOverdue 
                                  ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" 
                                  : "bg-muted text-muted-foreground"
                              )}
                              title={`已過 ${durationInfo.elapsed} 天，${durationInfo.isOverdue ? `超時 ${Math.abs(durationInfo.remaining)} 天` : `剩餘 ${durationInfo.remaining} 天`}`}
                            >
                              <span className={cn(durationInfo.isOverdue && "text-red-600 dark:text-red-400")}>
                                {durationInfo.elapsed}天
                              </span>
                              <span className={cn(
                                "text-[10px]",
                                durationInfo.isOverdue ? "text-red-500 dark:text-red-400" : "text-muted-foreground/70"
                              )}>
                                {durationInfo.isOverdue ? `超${Math.abs(durationInfo.remaining)}` : `剩${durationInfo.remaining}`}
                              </span>
                            </div>
                          )}
                          <span className="font-mono text-sm text-primary">{rma.rma_number}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-foreground">{rma.customer_name}</td>
                      <td className="py-3 px-4 text-sm text-foreground">{rma.customer_phone}</td>
                      <td className="py-3 px-4 text-sm text-foreground">{rma.product_model || "-"}</td>
                      <td className="py-3 px-4 text-sm text-foreground">{rma.issue_type}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${statusColors[rma.status]}`}>
                          {statusLabels[rma.status]}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-muted-foreground">{formatDate(rma.created_at)}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleViewRma(rma)}
                            className="text-primary hover:text-primary/80 transition-colors"
                          >
                            <Eye className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => {
                              setRmaToDelete(rma);
                              setShowDeleteDialog(true);
                            }}
                            className="text-destructive hover:text-destructive/80 transition-colors"
                            title="刪除此 RMA"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-sm text-muted-foreground">
                共 {totalCount} 筆，第 {currentPage} / {totalPages} 頁
              </p>
              <div className="flex items-center gap-1">
                {/* Previous button */}
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="rma-btn-secondary text-sm disabled:opacity-50 px-2"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                
                {/* Page numbers */}
              {(() => {
                  const pages: number[] = [];
                  
                  // Show 3 pages before and after current page
                  for (let i = currentPage - 3; i <= currentPage + 3; i++) {
                    if (i >= 1 && i <= totalPages) {
                      pages.push(i);
                    }
                  }
                  
                  return (
                    <>
                      {/* Show first page and ellipsis if needed */}
                      {pages[0] > 1 && (
                        <>
                          <button
                            onClick={() => setCurrentPage(1)}
                            className="min-w-[32px] h-8 px-2 text-sm rounded-md transition-colors hover:bg-muted text-muted-foreground hover:text-foreground"
                          >
                            1
                          </button>
                          {pages[0] > 2 && (
                            <span className="px-1 text-muted-foreground">...</span>
                          )}
                        </>
                      )}
                      
                      {/* Show pages around current */}
                      {pages.map((page) => (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={cn(
                            "min-w-[32px] h-8 px-2 text-sm rounded-md transition-colors",
                            currentPage === page
                              ? "bg-primary text-primary-foreground font-medium"
                              : "hover:bg-muted text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {page}
                        </button>
                      ))}
                      
                      {/* Show ellipsis and last page if needed */}
                      {pages[pages.length - 1] < totalPages && (
                        <>
                          {pages[pages.length - 1] < totalPages - 1 && (
                            <span className="px-1 text-muted-foreground">...</span>
                          )}
                          <button
                            onClick={() => setCurrentPage(totalPages)}
                            className="min-w-[32px] h-8 px-2 text-sm rounded-md transition-colors hover:bg-muted text-muted-foreground hover:text-foreground"
                          >
                            {totalPages}
                          </button>
                        </>
                      )}
                    </>
                  );
                })()}
                
                {/* Next button */}
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="rma-btn-secondary text-sm disabled:opacity-50 px-2"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              
              {/* Page input field */}
              <div className="flex items-center gap-2 mt-3 justify-center">
                <span className="text-sm text-muted-foreground">跳至第</span>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={currentPage}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    if (value >= 1 && value <= totalPages) {
                      setCurrentPage(value);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const value = parseInt((e.target as HTMLInputElement).value);
                      if (value >= 1 && value <= totalPages) {
                        setCurrentPage(value);
                      }
                    }
                  }}
                  className="w-16 h-8 px-2 text-sm text-center border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <span className="text-sm text-muted-foreground">頁，共 {totalPages} 頁</span>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Detail Modal */}
      {selectedRma && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-border">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-bold text-foreground">RMA 詳細資訊</h2>
                <div className="flex items-center gap-2">
                  {isAdmin && !editingDetail && (
                    <button
                      type="button"
                      onClick={() => setEditingDetail(true)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-border bg-background hover:bg-muted text-foreground transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      編輯
                    </button>
                  )}
                  {isAdmin && editingDetail && (
                    <>
                      <button
                        type="button"
                        onClick={handleSaveDetailEdit}
                        disabled={savingDetail}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        {savingDetail ? "儲存中..." : "儲存"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingDetail(false)}
                        disabled={savingDetail}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-border bg-background hover:bg-muted text-foreground transition-colors"
                      >
                        取消
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setSelectedRma(null)}
                    className="text-muted-foreground hover:text-foreground ml-1"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">RMA 編號</p>
                  <p className="font-mono text-primary">{selectedRma.rma_number}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">目前狀態</p>
                  <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${statusColors[selectedRma.status]}`}>
                    {statusLabels[selectedRma.status]}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">客戶名稱</p>
                  {editingDetail ? (
                    <input
                      className="rma-input"
                      value={editForm.customer_name}
                      onChange={(e) => setEditForm({ ...editForm, customer_name: e.target.value })}
                    />
                  ) : (
                    <p className="text-foreground">{selectedRma.customer_name}</p>
                  )}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">聯絡電話</p>
                  {editingDetail ? (
                    <input
                      className="rma-input"
                      value={editForm.customer_phone}
                      onChange={(e) => setEditForm({ ...editForm, customer_phone: e.target.value })}
                    />
                  ) : (
                    <p className="text-foreground">{selectedRma.customer_phone}</p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">電子郵件</p>
                {editingDetail ? (
                  <input
                    type="email"
                    className="rma-input"
                    value={editForm.customer_email}
                    onChange={(e) => setEditForm({ ...editForm, customer_email: e.target.value })}
                  />
                ) : (
                  <p className="text-foreground">{selectedRma.customer_email}</p>
                )}
              </div>

              {(editingDetail || selectedRma.customer_address) && (
                <div>
                  <p className="text-sm text-muted-foreground">客戶地址</p>
                  {editingDetail ? (
                    <input
                      className="rma-input"
                      value={editForm.customer_address}
                      onChange={(e) => setEditForm({ ...editForm, customer_address: e.target.value })}
                    />
                  ) : (
                    <p className="text-foreground">{selectedRma.customer_address}</p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">產品名稱</p>
                  {editingDetail ? (
                    <input
                      className="rma-input"
                      value={editForm.product_name}
                      onChange={(e) => setEditForm({ ...editForm, product_name: e.target.value })}
                    />
                  ) : (
                    <p className="text-foreground">{selectedRma.product_name}</p>
                  )}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">產品型號</p>
                  {editingDetail ? (
                    <input
                      className="rma-input"
                      value={editForm.product_model}
                      onChange={(e) => setEditForm({ ...editForm, product_model: e.target.value })}
                    />
                  ) : (
                    <p className="text-foreground">{selectedRma.product_model || "-"}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">序號</p>
                  {editingDetail ? (
                    <input
                      className="rma-input"
                      value={editForm.serial_number}
                      onChange={(e) => setEditForm({ ...editForm, serial_number: e.target.value })}
                    />
                  ) : (
                    <p className="text-foreground">{selectedRma.serial_number || "-"}</p>
                  )}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">購買日期</p>
                  <p className="text-foreground">{selectedRma.purchase_date || "-"}</p>
                </div>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">問題類型</p>
                {editingDetail ? (
                  <select
                    className="rma-input"
                    value={editForm.issue_type}
                    onChange={(e) => setEditForm({ ...editForm, issue_type: e.target.value })}
                  >
                    {["螢幕顯示異常","電池/充電問題","按鍵故障","按鍵問題","進水/受潮","外觀損傷","韌體/軟體問題","感測器異常","其他"].map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                    {editForm.issue_type && !["螢幕顯示異常","電池/充電問題","按鍵故障","按鍵問題","進水/受潮","外觀損傷","韌體/軟體問題","感測器異常","其他"].includes(editForm.issue_type) && (
                      <option value={editForm.issue_type}>{editForm.issue_type}</option>
                    )}
                  </select>
                ) : (
                  <p className="text-foreground">{selectedRma.issue_type}</p>
                )}
              </div>

              <div>
                <p className="text-sm text-muted-foreground">問題描述</p>
                {editingDetail ? (
                  <Textarea
                    rows={4}
                    value={editForm.issue_description}
                    onChange={(e) => setEditForm({ ...editForm, issue_description: e.target.value })}
                  />
                ) : (
                  <p className="text-foreground whitespace-pre-wrap">{selectedRma.issue_description}</p>
                )}
              </div>

              {(editingDetail || selectedRma.customer_notes) && (
                <div>
                  <p className="text-sm text-muted-foreground">隨附物品 / 備註</p>
                  {editingDetail ? (
                    <Textarea
                      rows={3}
                      value={editForm.customer_notes}
                      onChange={(e) => setEditForm({ ...editForm, customer_notes: e.target.value })}
                    />
                  ) : (
                    <p className="text-foreground whitespace-pre-wrap">{selectedRma.customer_notes}</p>
                  )}
                </div>
              )}

              <div>
                <p className="text-sm text-muted-foreground">建立日期</p>
                <p className="text-foreground">{formatDate(selectedRma.created_at)}</p>
                {selectedRma.updated_at &&
                  selectedRma.updated_at !== selectedRma.created_at &&
                  selectedRma.updated_by_email && (
                    <p className="text-xs text-muted-foreground mt-1">
                      修改日期：{formatDate(selectedRma.updated_at)} ｜ 修改人：{selectedRma.updated_by_email}
                    </p>
                  )}
              </div>

              {/* Shipping Info */}
              {editingDetail ? (
                <div className="pt-4 border-t border-border">
                  <div className="flex items-center gap-2 mb-3">
                    <Truck className="w-4 h-4 text-primary" />
                    <p className="text-sm font-medium text-foreground">客戶寄件資訊</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">物流名稱</p>
                        <input
                          className="rma-input"
                          value={editForm.shipping_carrier}
                          onChange={(e) => setEditForm({ ...editForm, shipping_carrier: e.target.value })}
                        />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">物流單號</p>
                        <input
                          className="rma-input"
                          value={editForm.shipping_tracking_number}
                          onChange={(e) => setEditForm({ ...editForm, shipping_tracking_number: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">寄出日期</p>
                      <input
                        type="date"
                        className="rma-input"
                        value={editForm.shipping_ship_date}
                        onChange={(e) => setEditForm({ ...editForm, shipping_ship_date: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              ) : selectedRmaShipping ? (
                <div className="pt-4 border-t border-border">
                  <div className="flex items-center gap-2 mb-3">
                    <Truck className="w-4 h-4 text-primary" />
                    <p className="text-sm font-medium text-foreground">客戶寄件資訊</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">物流名稱</p>
                        <p className="text-foreground font-medium">{selectedRmaShipping.carrier}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">物流單號</p>
                        <p className="text-foreground font-mono">{selectedRmaShipping.tracking_number}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {selectedRmaShipping.ship_date && (
                        <div>
                          <p className="text-xs text-muted-foreground">寄出日期</p>
                          <p className="text-foreground">{selectedRmaShipping.ship_date}</p>
                        </div>
                      )}
                      {selectedRmaShipping.delivery_date && (
                        <div>
                          <p className="text-xs text-muted-foreground">收件日期</p>
                          <p className="text-foreground text-green-600 dark:text-green-400 font-medium">
                            ✓ {selectedRmaShipping.delivery_date}
                          </p>
                        </div>
                      )}
                    </div>
                    {selectedRmaShipping.photo_url && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">寄件單據照片</p>
                        <a 
                          href={selectedRmaShipping.photo_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="block"
                        >
                          <img 
                            src={selectedRmaShipping.photo_url} 
                            alt="寄件單據" 
                            className="w-full max-h-48 object-cover rounded-lg border border-border hover:opacity-80 transition-opacity"
                          />
                        </a>
                      </div>
                    )}
                    
                    {/* Confirm Receive Button */}
                    {selectedRma.status === "shipped" && !selectedRmaShipping.delivery_date && (
                      <button
                        onClick={handleConfirmReceive}
                        disabled={isConfirmingReceive}
                        className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                      >
                        <PackageCheck className="w-4 h-4" />
                        {isConfirmingReceive ? "處理中..." : "確認收件"}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="pt-4 border-t border-border">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Package className="w-4 h-4" />
                    <p className="text-sm">客戶尚未提供寄件資訊</p>
                  </div>
                </div>
              )}


              {/* Outbound Shipping Section */}
              <div className="pt-4 border-t border-border">
                <div className="flex items-center gap-2 mb-3">
                  <Send className="w-4 h-4 text-primary" />
                  <p className="text-sm font-medium text-foreground">回寄資訊</p>
                </div>
                
                {outboundShipping ? (
                  // Display existing outbound shipping info
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">物流名稱</p>
                        <p className="text-foreground font-medium">{outboundShipping.carrier}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">物流單號</p>
                        <p className="text-foreground font-mono">{outboundShipping.tracking_number}</p>
                      </div>
                    </div>
                    {outboundShipping.ship_date && (
                      <div>
                        <p className="text-xs text-muted-foreground">寄出日期</p>
                        <p className="text-foreground">{outboundShipping.ship_date}</p>
                      </div>
                    )}
                    {outboundShipping.notes && (
                      <div>
                        <p className="text-xs text-muted-foreground">備註</p>
                        <p className="text-foreground">{outboundShipping.notes}</p>
                      </div>
                    )}
                  </div>
                ) : (selectedRma.status === "received" || selectedRma.status === "inspecting" || selectedRma.status === "contacting" || selectedRma.status === "quote_confirmed" || selectedRma.status === "paid" || selectedRma.status === "repairing") ? (
                  // Show form for adding outbound shipping
                  <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">回寄類型 *</label>
                      <select
                        className="rma-input"
                        value={outboundForm.ship_type}
                        onChange={(e) => setOutboundForm({ ...outboundForm, ship_type: e.target.value as "original" | "refurbished" | "new" })}
                      >
                        <option value="original">寄回原錶</option>
                        <option value="refurbished">寄回整新品</option>
                        <option value="new">寄出全新品</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">物流名稱 *</label>
                        <input
                          type="text"
                          className="rma-input"
                          placeholder="例：黑貓宅急便"
                          value={outboundForm.carrier}
                          onChange={(e) => setOutboundForm({ ...outboundForm, carrier: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">物流單號 *</label>
                        <input
                          type="text"
                          className="rma-input"
                          placeholder="請輸入物流單號"
                          value={outboundForm.tracking_number}
                          onChange={(e) => setOutboundForm({ ...outboundForm, tracking_number: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">備註（選填）</label>
                      <input
                        type="text"
                        className="rma-input"
                        placeholder="例：已更換新品"
                        value={outboundForm.notes}
                        onChange={(e) => setOutboundForm({ ...outboundForm, notes: e.target.value })}
                      />
                    </div>
                    <button
                      onClick={handleSubmitOutbound}
                      disabled={isSubmittingOutbound}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" />
                      {isSubmittingOutbound ? "處理中..." : "確認回寄"}
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {selectedRma.status === "registered" || selectedRma.status === "shipped"
                      ? "需先確認收件後才能填寫回寄資訊"
                      : selectedRma.status === "no_repair"
                      ? "此 RMA 不維修"
                      : "尚無回寄記錄"}
                  </p>
                )}
              </div>

              {/* Status History Timeline */}
              <div className="pt-4 border-t border-border">
                <div className="flex items-center gap-2 mb-3">
                  <History className="w-4 h-4 text-primary" />
                  <p className="text-sm font-medium text-foreground">狀態歷史記錄</p>
                </div>
                {statusHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">尚無狀態變更記錄</p>
                ) : (
                  <div className="relative pl-4 space-y-4">
                    {/* Timeline line */}
                    <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-border" />
                    
                    {statusHistory.map((history, index) => (
                      <div key={history.id} className="relative flex items-start gap-3">
                        {/* Timeline dot */}
                        <div className={`absolute left-[-8px] w-4 h-4 rounded-full border-2 border-card ${
                          index === 0 ? 'bg-primary' : 'bg-muted-foreground/30'
                        }`} />
                        
                        <div className="flex-1 ml-4">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[history.status]}`}>
                              {statusLabels[history.status]}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {formatDate(history.created_at)}
                          </div>
                          {history.notes && (
                            <p className="mt-1 text-sm text-muted-foreground">{history.notes}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Customer Contact Records */}
              <div className="pt-4 border-t border-border">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-primary" />
                    <p className="text-sm font-medium text-foreground">客戶聯繫記錄</p>
                  </div>
                  <button
                    onClick={() => {
                      setEditingContact(null);
                      setContactDate(format(new Date(), "yyyy-MM-dd"));
                      setContactMethod("");
                      setContactNotes("");
                      setShowContactForm(!showContactForm);
                    }}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 rounded transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    新增記錄
                  </button>
                </div>

                {/* Add/Edit Contact Form */}
                {showContactForm && (
                  <div className="bg-muted/50 rounded-lg p-4 mb-4 space-y-3">
                    <div className="text-xs font-medium text-foreground mb-2">
                      {editingContact ? "編輯聯繫記錄" : "新增聯繫記錄"}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">聯繫日期</label>
                        <input
                          type="date"
                          value={contactDate}
                          onChange={(e) => setContactDate(e.target.value)}
                          className="rma-input"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">聯繫方式 *</label>
                        <Select value={contactMethod} onValueChange={setContactMethod}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="請選擇" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="phone">電話</SelectItem>
                            <SelectItem value="sms">簡訊</SelectItem>
                            <SelectItem value="line">LINE</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="fb">FB</SelectItem>
                            <SelectItem value="ig">IG</SelectItem>
                            <SelectItem value="other">其它</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">備註內容</label>
                      <Textarea
                        value={contactNotes}
                        onChange={(e) => setContactNotes(e.target.value)}
                        placeholder="記錄與客戶溝通的內容..."
                        className="min-h-[80px]"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => {
                          setShowContactForm(false);
                          setContactMethod("");
                          setContactNotes("");
                          setEditingContact(null);
                        }}
                        className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        取消
                      </button>
                      <button
                        onClick={handleAddContact}
                        disabled={isSavingContact || !contactMethod}
                        className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      >
                        {isSavingContact ? "儲存中..." : editingContact ? "更新" : "儲存"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Contact History List */}
                {contacts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">尚無聯繫記錄</p>
                ) : (
                  <div className="space-y-3">
                    {contacts.map((contact) => (
                      <div key={contact.id} className="bg-muted/30 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{contact.contact_date}</span>
                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                              {getContactMethodLabel(contact.contact_method)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleEditContact(contact)}
                              className="p-1 text-muted-foreground hover:text-primary transition-colors"
                              title="編輯"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setContactToDelete(contact);
                                setShowDeleteContactDialog(true);
                              }}
                              className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                              title="刪除"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        {contact.contact_notes && (
                          <p className="text-sm text-foreground whitespace-pre-wrap">{contact.contact_notes}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Repair Fee Section */}
              <div className="pt-4 border-t border-border">
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign className="w-4 h-4 text-primary" />
                  <p className="text-sm font-medium text-foreground">維修費用</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-sm text-muted-foreground">NT$</span>
                    <input
                      type="number"
                      value={repairFee}
                      onChange={(e) => setRepairFee(e.target.value)}
                      placeholder="輸入費用金額"
                      className="rma-input flex-1"
                      min="0"
                      step="1"
                    />
                  </div>
                  <button
                    onClick={handleSaveRepairFee}
                    disabled={isSavingFee}
                    className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {isSavingFee ? "儲存中..." : "儲存"}
                  </button>
                </div>
              </div>

              {/* Status Update */}
              <div className="pt-4 border-t border-border">
                <p className="text-sm font-medium text-foreground mb-3">更新狀態</p>
                <div className="flex flex-wrap gap-2">
                  {allStatuses.map((status) => (
                    <button
                      key={status}
                      onClick={() => handleStatusUpdate(selectedRma.id, status)}
                      disabled={isUpdatingStatus || selectedRma.status === status}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                        selectedRma.status === status
                          ? statusColors[status]
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      {statusLabels[status]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminRmaList;
