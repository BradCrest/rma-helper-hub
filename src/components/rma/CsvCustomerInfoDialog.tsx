import { useState, forwardRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AlertCircle, CheckCircle } from "lucide-react";
import { ParseError } from "@/lib/rmaMultiCsvParser";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CustomerInfo {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
}

interface CsvCustomerInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (info: CustomerInfo) => void;
  productCount: number;
  errors?: ParseError[];
}

const CsvCustomerInfoDialog = forwardRef<HTMLDivElement, CsvCustomerInfoDialogProps>(({
  open,
  onOpenChange,
  onConfirm,
  productCount,
  errors = [],
}, ref) => {
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");

  const handleConfirm = () => {
    if (!customerName.trim()) {
      toast.error("請輸入客戶姓名");
      return;
    }
    if (!customerEmail.trim()) {
      toast.error("請輸入電子郵件");
      return;
    }
    // Simple email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      toast.error("請輸入有效的電子郵件");
      return;
    }
    if (!customerPhone.trim()) {
      toast.error("請輸入手機號碼");
      return;
    }

    onConfirm({
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim(),
      customerPhone: customerPhone.trim(),
      customerAddress: customerAddress.trim(),
    });

    // Reset form
    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setCustomerAddress("");
  };

  const handleCancel = () => {
    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setCustomerAddress("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={ref} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>填寫客戶資訊</DialogTitle>
          <DialogDescription>
            已成功解析 {productCount} 筆產品，請填寫客戶資訊以繼續
          </DialogDescription>
        </DialogHeader>

        {/* Display errors if any */}
        {errors.length > 0 && (
          <div className="border border-destructive/50 rounded-lg p-3 bg-destructive/10">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive mb-2">
              <AlertCircle className="w-4 h-4" />
              解析錯誤：{errors.length} 筆資料無法匯入
            </div>
            <ScrollArea className="max-h-24">
              <div className="space-y-1">
                {errors.map((error, index) => (
                  <p key={index} className="text-xs text-destructive">
                    第 {error.row} 行：{error.message}
                  </p>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Success count */}
        {productCount > 0 && (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <CheckCircle className="w-4 h-4" />
            成功解析：{productCount} 筆
          </div>
        )}

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="csv-customer-name">客戶姓名 *</Label>
            <Input
              id="csv-customer-name"
              placeholder="請輸入客戶姓名"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="csv-customer-email">電子郵件 *</Label>
            <Input
              id="csv-customer-email"
              type="email"
              placeholder="請輸入電子郵件"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="csv-customer-phone">手機號碼 *</Label>
            <Input
              id="csv-customer-phone"
              type="tel"
              placeholder="請輸入手機號碼"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="csv-customer-address">通訊地址</Label>
            <Input
              id="csv-customer-address"
              placeholder="請輸入通訊地址（選填）"
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleCancel}>
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={productCount === 0}>
            確認並繼續
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
});

CsvCustomerInfoDialog.displayName = "CsvCustomerInfoDialog";

export default CsvCustomerInfoDialog;
