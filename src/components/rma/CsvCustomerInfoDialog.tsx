import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

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
}

const CsvCustomerInfoDialog = ({
  open,
  onOpenChange,
  onConfirm,
  productCount,
}: CsvCustomerInfoDialogProps) => {
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>填寫客戶資訊</DialogTitle>
          <DialogDescription>
            已成功解析 {productCount} 筆產品，請填寫客戶資訊以繼續
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
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

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleCancel}>
            取消
          </Button>
          <Button onClick={handleConfirm}>確認並繼續</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CsvCustomerInfoDialog;
