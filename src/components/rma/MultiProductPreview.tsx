import { forwardRef } from "react";
import { ArrowLeft, Send, Package, User, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductEntry, ParseError } from "@/lib/rmaMultiCsvParser";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CustomerInfo {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
}

interface MultiProductPreviewProps {
  customerInfo: CustomerInfo;
  products: ProductEntry[];
  photoCount: number;
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  errors?: ParseError[];
}

const MultiProductPreview = forwardRef<HTMLDivElement, MultiProductPreviewProps>(({
  customerInfo,
  products,
  photoCount,
  onBack,
  onSubmit,
  isSubmitting,
  errors = [],
}, ref) => {
  return (
    <div ref={ref} className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          返回編輯
        </Button>
        <h2 className="text-xl font-bold text-foreground">預覽確認</h2>
      </div>

      {/* Display errors if any */}
      {errors.length > 0 && (
        <div className="border border-destructive/50 rounded-lg p-4 bg-destructive/10">
          <div className="flex items-center gap-2 text-sm font-medium text-destructive mb-2">
            <AlertCircle className="w-4 h-4" />
            以下資料有錯誤，將不會被提交：
          </div>
          <ScrollArea className="max-h-32">
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

      {/* Customer Info Card */}
      <div className="border border-border rounded-lg p-4 bg-card">
        <div className="flex items-center gap-2 mb-3">
          <User className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">客戶資訊</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">姓名：</span>
            <span className="text-foreground font-medium">
              {customerInfo.customerName}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">電子郵件：</span>
            <span className="text-foreground font-medium">
              {customerInfo.customerEmail}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">手機號碼：</span>
            <span className="text-foreground font-medium">
              {customerInfo.customerPhone}
            </span>
          </div>
          {customerInfo.customerAddress && (
            <div>
              <span className="text-muted-foreground">通訊地址：</span>
              <span className="text-foreground font-medium">
                {customerInfo.customerAddress}
              </span>
            </div>
          )}
        </div>
        {photoCount > 0 && (
          <div className="mt-3 text-sm">
            <span className="text-muted-foreground">共用照片：</span>
            <span className="text-foreground font-medium">{photoCount} 張</span>
          </div>
        )}
      </div>

      {/* Products Summary */}
      <div className="border border-border rounded-lg bg-card overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">
              產品列表（共 {products.length} 筆）
            </h3>
          </div>
        </div>

        <ScrollArea className="max-h-[400px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>產品型號</TableHead>
                <TableHead>產品序號</TableHead>
                <TableHead>故障問題</TableHead>
                <TableHead className="hidden md:table-cell">購買日期</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product, index) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">{index + 1}</TableCell>
                  <TableCell>{product.productModel}</TableCell>
                  <TableCell>{product.serialNumber}</TableCell>
                  <TableCell>{product.issueType || "-"}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {product.purchaseDate || "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onBack}>
          返回編輯
        </Button>
        <Button
          type="button"
          onClick={onSubmit}
          disabled={isSubmitting || products.length === 0}
          className="gap-2"
        >
          {isSubmitting ? (
            <>
              <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              提交中...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              確認送出 ({products.length} 筆)
            </>
          )}
        </Button>
      </div>
    </div>
  );
});

MultiProductPreview.displayName = "MultiProductPreview";

export default MultiProductPreview;
