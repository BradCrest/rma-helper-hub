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
  { value: "螢幕問題", label: "螢幕問題 / Screen Issue" },
  { value: "電池問題", label: "電池問題 / Battery Issue" },
  { value: "充電問題", label: "充電問題 / Charging Issue" },
  { value: "按鍵問題", label: "按鍵問題 / Button Issue" },
  { value: "軟體問題", label: "軟體問題 / Software Issue" },
  { value: "外觀損壞", label: "外觀損壞 / Cosmetic Damage" },
  { value: "其他", label: "其他 / Other" },
];

const accessoryOptions = [
  { id: "complete", label: "完整包裝 / Complete Package" },
  { id: "box", label: "外包裝盒 / Outer Box" },
  { id: "charger", label: "充電組 / Charger Set" },
  { id: "warranty", label: "保固卡 / Warranty Card" },
  { id: "strap", label: "錶帶 / Strap" },
  { id: "other", label: "其他 / Other" },
  { id: "none", label: "無 / None" },
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
          產品列表 ({products.length} 筆) / Product List ({products.length} item(s))
        </h3>
        <Button
          type="button"
          onClick={addProduct}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <Plus className="w-4 h-4" />
          新增產品 / Add Product
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
                產品 #{index + 1} / Product #{index + 1}
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
                <label className="rma-label">產品型號 / Product Model *</label>
                <Input
                  placeholder="請輸入產品型號 / Enter product model"
                  value={product.productModel}
                  onChange={(e) =>
                    updateProduct(product.id, "productModel", e.target.value)
                  }
                  required
                />
              </div>
              <div>
                <label className="rma-label">產品序號 / Serial Number *</label>
                <Input
                  placeholder="請輸入產品序號 / Enter serial number"
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
                <label className="rma-label">故障問題 / Issue Type</label>
                <Select
                  value={product.issueType}
                  onValueChange={(value) =>
                    updateProduct(product.id, "issueType", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="選擇故障問題 / Select issue type" />
                  </SelectTrigger>
                  <SelectContent>
                    {issueTypes.map((issue) => (
                      <SelectItem key={issue.value} value={issue.value}>
                        {issue.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="rma-label">購買日期 / Purchase Date</label>
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
              <label className="rma-label">問題描述 / Issue Description</label>
              <Textarea
                placeholder="請詳細描述問題... / Please describe the issue in detail..."
                value={product.issueDescription}
                onChange={(e) =>
                  updateProduct(product.id, "issueDescription", e.target.value)
                }
                className="min-h-[80px]"
              />
            </div>

            <div className="mt-4">
              <label className="rma-label">隨附物品 / Included Accessories</label>
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
