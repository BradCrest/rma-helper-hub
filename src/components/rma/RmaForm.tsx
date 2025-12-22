import { useState } from "react";
import { Upload, Check } from "lucide-react";
import { toast } from "sonner";

const customerTypes = [
  { id: "consumer", label: "一般消費者" },
  { id: "dealer", label: "經銷商" },
  { id: "agent", label: "代理商" },
  { id: "dealer-agent", label: "經銷/代理商多筆" },
];

const issueTypes = [
  "螢幕問題",
  "電池問題",
  "充電問題",
  "按鍵問題",
  "軟體問題",
  "外觀損壞",
  "其他",
];

const accessories = [
  { id: "complete", label: "完整包裝" },
  { id: "box", label: "外包裝盒" },
  { id: "charger", label: "充電組" },
  { id: "warranty", label: "保固卡" },
  { id: "strap", label: "錶帶" },
  { id: "other", label: "其他" },
  { id: "none", label: "無" },
];

const RmaForm = () => {
  const [customerType, setCustomerType] = useState("consumer");
  const [selectedAccessories, setSelectedAccessories] = useState<string[]>([]);
  const [agreed, setAgreed] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const handleAccessoryToggle = (id: string) => {
    setSelectedAccessories((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) {
      toast.error("請先同意服務條款和隱私政策");
      return;
    }
    toast.success("RMA 申請已成功提交！");
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rma-card animate-fade-in">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-foreground">建立新的 RMA</h2>
        <p className="text-sm text-muted-foreground mt-1">
          請填寫以下資訊以建立維修申請
        </p>
      </div>

      {/* Customer Type */}
      <div className="mb-6">
        <label className="rma-label">寄件人身分</label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {customerTypes.map((type) => (
            <label
              key={type.id}
              className="flex items-center gap-2 cursor-pointer"
            >
              <input
                type="radio"
                name="customerType"
                value={type.id}
                checked={customerType === type.id}
                onChange={(e) => setCustomerType(e.target.value)}
                className="w-4 h-4 text-primary border-border focus:ring-primary"
              />
              <span className="text-sm text-foreground">{type.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Customer Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="rma-label">客戶姓名</label>
          <input
            type="text"
            placeholder="請輸入客戶姓名"
            className="rma-input"
          />
        </div>
        <div>
          <label className="rma-label">電子郵件</label>
          <input
            type="email"
            placeholder="請輸入電子郵件"
            className="rma-input"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="rma-label">客戶電話</label>
          <input
            type="tel"
            placeholder="請輸入客戶電話"
            className="rma-input"
          />
        </div>
        <div>
          <label className="rma-label">產品序號</label>
          <input
            type="text"
            placeholder="請輸入產品序號"
            className="rma-input"
          />
        </div>
      </div>

      <div className="mb-4">
        <label className="rma-label">客戶地址</label>
        <textarea
          placeholder="請輸入客戶地址"
          className="rma-input min-h-[80px] resize-none"
        />
      </div>

      {/* Product Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="rma-label">電腦錶型號</label>
          <input
            type="text"
            placeholder="請輸入電腦錶型號"
            className="rma-input"
          />
        </div>
        <div>
          <label className="rma-label">故障問題</label>
          <select className="rma-input">
            <option value="">選擇故障問題</option>
            {issueTypes.map((issue) => (
              <option key={issue} value={issue}>
                {issue}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-4">
        <label className="rma-label">購買日期</label>
        <input type="date" className="rma-input" />
      </div>

      <div className="mb-4">
        <label className="rma-label">問題描述</label>
        <textarea
          placeholder="請詳細描述問題..."
          className="rma-input min-h-[120px] resize-none"
        />
      </div>

      {/* Photo Upload */}
      <div className="mb-6">
        <label className="rma-label">產品照片</label>
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragActive
              ? "border-primary bg-accent"
              : "border-border hover:border-primary/50"
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
          }}
        >
          <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            <span className="text-primary font-medium cursor-pointer hover:underline">
              上傳照片
            </span>{" "}
            或拖放到此處
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            PNG, JPG, GIF 最大 10MB
          </p>
        </div>
      </div>

      {/* Accessories */}
      <div className="mb-6">
        <label className="rma-label">隨附寄出物品</label>
        <div className="space-y-2">
          {accessories.map((acc) => (
            <label
              key={acc.id}
              className="flex items-center gap-2 cursor-pointer"
            >
              <div
                className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                  selectedAccessories.includes(acc.id)
                    ? "bg-primary border-primary"
                    : "border-border bg-card"
                }`}
                onClick={() => handleAccessoryToggle(acc.id)}
              >
                {selectedAccessories.includes(acc.id) && (
                  <Check className="w-3 h-3 text-primary-foreground" />
                )}
              </div>
              <span className="text-sm text-foreground">{acc.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Agreement */}
      <div className="mb-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <div
            className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
              agreed ? "bg-primary border-primary" : "border-border bg-card"
            }`}
            onClick={() => setAgreed(!agreed)}
          >
            {agreed && <Check className="w-3 h-3 text-primary-foreground" />}
          </div>
          <span className="text-sm text-foreground">
            我同意服務條款和隱私政策 *
          </span>
        </label>
      </div>

      {/* Submit */}
      <button type="submit" className="w-full rma-btn-primary py-4 text-base">
        建立RMA
      </button>
    </form>
  );
};

export default RmaForm;
