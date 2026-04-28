import { Plus, Trash2, Calendar } from "lucide-react";
import { ProductEntry } from "@/lib/rmaMultiCsvParser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isInvalidSerialNumber } from "@/lib/serialNumberValidator";

const issueTypes = [
  "螢幕問題",
  "電池問題",
  "充電問題",
  "按鍵問題",
  "軟體問題",
  "外觀損壞",
  "其他",
];

const accessoryOptions = [
  { id: "complete", label: "完整包裝" },
  { id: "box", label: "外包裝盒" },
  { id: "charger", label: "充電組" },
  { id: "warranty", label: "保固卡" },
  { id: "strap", label: "錶帶" },
  { id: "other", label: "其他" },
  { id: "none", label: "無" },
];

interface MultiProductFormProps {
  products: ProductEntry[];
  onChange: (products: ProductEntry[]) => void;
  onInvalidSerial?: () => void;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

const MultiProductForm = ({ products, onChange, onInvalidSerial }: MultiProductFormProps) => {
  const addProduct = () => {
    onChange([
      ...products,
      {
        id: generateId(),
        productModel: "",
        serialNumber: "",
        issueType: "",
        issueDescription: "",
        purchaseDate: "",
        accessories: [],
      },
    ]);
  };

  const removeProduct = (id: string) => {
    if (products.length <= 1) return;
    onChange(products.filter((p) => p.id !== id));
  };

  const updateProduct = (id: string, field: keyof ProductEntry, value: any) => {
    onChange(
      products.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  const toggleAccessory = (productId: string, accessoryId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    const newAccessories = product.accessories.includes(accessoryId)
      ? product.accessories.filter((a) => a !== accessoryId)
      : [...product.accessories, accessoryId];

    updateProduct(productId, "accessories", newAccessories);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">
          產品列表 ({products.length} 筆)
        </h3>
        <Button
          type="button"
          onClick={addProduct}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <Plus className="w-4 h-4" />
          新增產品
        </Button>
      </div>

      <div className="space-y-4">
        {products.map((product, index) => (
          <div
            key={product.id}
            className="border border-border rounded-lg p-4 bg-card relative"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-muted-foreground">
                產品 #{index + 1}
              </span>
              {products.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeProduct(product.id)}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="rma-label">產品型號 *</label>
                <Input
                  placeholder="請輸入產品型號"
                  value={product.productModel}
                  onChange={(e) =>
                    updateProduct(product.id, "productModel", e.target.value)
                  }
                  required
                />
              </div>
              <div>
                <label className="rma-label">產品序號 *</label>
                <Input
                  placeholder="請輸入產品序號"
                  value={product.serialNumber}
                  onChange={(e) =>
                    updateProduct(product.id, "serialNumber", e.target.value)
                  }
                  onBlur={(e) => {
                    if (isInvalidSerialNumber(e.target.value)) {
                      updateProduct(product.id, "serialNumber", "");
                      onInvalidSerial?.();
                    }
                  }}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="rma-label">故障問題</label>
                <Select
                  value={product.issueType}
                  onValueChange={(value) =>
                    updateProduct(product.id, "issueType", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="選擇故障問題" />
                  </SelectTrigger>
                  <SelectContent>
                    {issueTypes.map((issue) => (
                      <SelectItem key={issue} value={issue}>
                        {issue}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="rma-label">購買日期</label>
                <Input
                  type="date"
                  value={product.purchaseDate}
                  onChange={(e) =>
                    updateProduct(product.id, "purchaseDate", e.target.value)
                  }
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="rma-label">問題描述</label>
              <Textarea
                placeholder="請詳細描述問題..."
                value={product.issueDescription}
                onChange={(e) =>
                  updateProduct(product.id, "issueDescription", e.target.value)
                }
                className="min-h-[80px]"
              />
            </div>

            <div className="mt-4">
              <label className="rma-label">隨附物品</label>
              <div className="flex flex-wrap gap-2">
                {accessoryOptions.map((acc) => (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => toggleAccessory(product.id, acc.id)}
                    className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                      product.accessories.includes(acc.id)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-foreground border-border hover:border-primary/50"
                    }`}
                  >
                    {acc.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MultiProductForm;
