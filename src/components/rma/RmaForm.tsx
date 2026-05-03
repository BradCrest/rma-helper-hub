import { useState, useRef } from "react";
import { Upload, Check, Loader2, X, Eye } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, Link } from "react-router-dom";
import { ProductEntry, ParseError } from "@/lib/rmaMultiCsvParser";
import MultiProductForm from "./MultiProductForm";
import CsvImportSection from "./CsvImportSection";
import CsvCustomerInfoDialog from "./CsvCustomerInfoDialog";
import MultiProductPreview from "./MultiProductPreview";
import {
  isInvalidSerialNumber,
  INVALID_SERIAL_TITLE,
  INVALID_SERIAL_DESCRIPTION,
} from "@/lib/serialNumberValidator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle } from "lucide-react";

const customerTypes = [
  { id: "consumer", label: "一般消費者 / Consumer" },
  { id: "dealer", label: "經銷商 / Dealer" },
  { id: "agent", label: "代理商 / Agent" },
  { id: "dealer-agent", label: "經銷/代理商多筆 / Dealer/Agent (Multi)" },
];

const issueTypes: { value: string; label: string }[] = [
  { value: "螢幕問題", label: "螢幕問題 / Screen Issue" },
  { value: "電池問題", label: "電池問題 / Battery Issue" },
  { value: "充電問題", label: "充電問題 / Charging Issue" },
  { value: "按鍵問題", label: "按鍵問題 / Button Issue" },
  { value: "軟體問題", label: "軟體問題 / Software Issue" },
  { value: "外觀損壞", label: "外觀損壞 / Cosmetic Damage" },
  { value: "其他", label: "其他 / Other" },
];

const accessories = [
  { id: "complete", label: "完整包裝 / Complete Package" },
  { id: "box", label: "外包裝盒 / Outer Box" },
  { id: "charger", label: "充電組 / Charger Set" },
  { id: "warranty", label: "保固卡 / Warranty Card" },
  { id: "strap", label: "錶帶 / Strap" },
  { id: "other", label: "其他 / Other" },
  { id: "none", label: "無 / None" },
];

const RmaForm = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customerType, setCustomerType] = useState("consumer");
  const [selectedAccessories, setSelectedAccessories] = useState<string[]>([]);
  const [agreed, setAgreed] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);

  // Form fields
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [productModel, setProductModel] = useState("");
  const [issueType, setIssueType] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [issueDescription, setIssueDescription] = useState("");

  // Multi-product mode states
  const isMultiMode = customerType === "dealer-agent";
  const [multiProducts, setMultiProducts] = useState<ProductEntry[]>([
    {
      id: "initial",
      productModel: "",
      serialNumber: "",
      issueType: "",
      issueDescription: "",
      purchaseDate: "",
      accessories: [],
    },
  ]);
  const [showCsvDialog, setShowCsvDialog] = useState(false);
  const [csvProducts, setCsvProducts] = useState<ProductEntry[]>([]);
  const [csvErrors, setCsvErrors] = useState<ParseError[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [showInvalidSerialDialog, setShowInvalidSerialDialog] = useState(false);

  const handleSerialBlur = (value: string, clear: () => void) => {
    if (isInvalidSerialNumber(value)) {
      setShowInvalidSerialDialog(true);
      clear();
    }
  };

  const handleAccessoryToggle = (id: string) => {
    setSelectedAccessories((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  // Single product submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isMultiMode) {
      // For multi-mode, show preview instead of submitting
      handleShowPreview();
      return;
    }

    if (!agreed) {
      toast.error("請先同意服務條款和隱私政策 / Please agree to the Terms of Service and Privacy Policy first");
      return;
    }

    // Validate required fields
    if (!customerName.trim()) {
      toast.error("請輸入客戶姓名 / Please enter customer name");
      return;
    }
    if (!customerEmail.trim()) {
      toast.error("請輸入電子郵件 / Please enter email address");
      return;
    }
    if (!customerPhone.trim()) {
      toast.error("請輸入客戶電話 / Please enter customer phone");
      return;
    }
    if (!issueType) {
      toast.error("請選擇故障問題 / Please select an issue type");
      return;
    }
    if (!issueDescription.trim()) {
      toast.error("請描述問題 / Please describe the issue");
      return;
    }
    if (isInvalidSerialNumber(serialNumber)) {
      setShowInvalidSerialDialog(true);
      return;
    }

    setIsSubmitting(true);

    try {
      // Build product name from customer type and model
      const customerTypeLabel =
        customerTypes.find((t) => t.id === customerType)?.label || customerType;
      const productName = productModel.trim() || "未指定型號 / Unspecified Model";

      // Upload photos to storage
      const photoUrls: string[] = [];
      for (const file of uploadedFiles) {
        const fileExt = file.name.split(".").pop();
        const fileName = `rma/${Date.now()}-${Math.random()
          .toString(36)
          .substring(2)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("rma-photos")
          .upload(fileName, file);

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from("rma-photos")
            .getPublicUrl(fileName);

          if (urlData?.publicUrl) {
            photoUrls.push(urlData.publicUrl);
          }
        }
      }

      // Call edge function to submit RMA (bypasses RLS)
      const response = await supabase.functions.invoke("submit-rma", {
        body: {
          customer_name: customerName.trim(),
          customer_email: customerEmail.trim(),
          customer_phone: customerPhone.trim(),
          customer_address: customerAddress.trim() || null,
          product_name: productName,
          product_model: productModel.trim() || null,
          serial_number: serialNumber.trim() || null,
          issue_type: issueType,
          issue_description: `[${customerTypeLabel}] ${issueDescription.trim()}${
            selectedAccessories.length > 0
              ? `\n\n隨附物品: ${selectedAccessories
                  .map((id) => accessories.find((a) => a.id === id)?.label)
                  .join(", ")}`
              : ""
          }`,
          purchase_date: purchaseDate || null,
          photo_urls: photoUrls.length > 0 ? photoUrls : null,
          customer_type: customerTypeLabel,
        },
      });

      if (response.error) throw response.error;
      const data = response.data;

      // Navigate to confirmation page with the RMA number
      navigate(`/rma-confirmation?rma=${data.rma_number}`);
    } catch (error: any) {
      console.error("Error submitting RMA:", error);
      toast.error("提交失敗，請稍後再試 / Submission failed, please try again later");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Multi-product preview handler
  const handleShowPreview = () => {
    if (!agreed) {
      toast.error("請先同意服務條款和隱私政策 / Please agree to the Terms of Service and Privacy Policy first");
      return;
    }

    // Validate customer info
    if (!customerName.trim()) {
      toast.error("請輸入客戶姓名 / Please enter customer name");
      return;
    }
    if (!customerEmail.trim()) {
      toast.error("請輸入電子郵件 / Please enter email address");
      return;
    }
    if (!customerPhone.trim()) {
      toast.error("請輸入客戶電話 / Please enter customer phone");
      return;
    }

    // Validate products
    const validProducts = multiProducts.filter(
      (p) => p.productModel.trim() && p.serialNumber.trim()
    );

    if (validProducts.length === 0) {
      toast.error("請至少新增一筆有效的產品資料（產品型號和序號為必填）/ Please add at least one valid product (model and serial number required)");
      return;
    }

    const hasInvalidSerial = validProducts.some((p) =>
      isInvalidSerialNumber(p.serialNumber)
    );
    if (hasInvalidSerial) {
      setShowInvalidSerialDialog(true);
      return;
    }

    setShowPreview(true);
  };

  // Multi-product submit
  const handleMultiSubmit = async () => {
    setIsSubmitting(true);

    try {
      // Upload photos (shared across all products)
      const photoUrls: string[] = [];
      for (const file of uploadedFiles) {
        const fileExt = file.name.split(".").pop();
        const fileName = `rma/${Date.now()}-${Math.random()
          .toString(36)
          .substring(2)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("rma-photos")
          .upload(fileName, file);

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from("rma-photos")
            .getPublicUrl(fileName);

          if (urlData?.publicUrl) {
            photoUrls.push(urlData.publicUrl);
          }
        }
      }

      const validProducts = multiProducts.filter(
        (p) => p.productModel.trim() && p.serialNumber.trim()
      );

      // Build products array for edge function
      const productsPayload = validProducts.map((product) => {
        const accessoriesLabel =
          product.accessories.length > 0
            ? product.accessories
                .map((id) => accessories.find((a) => a.id === id)?.label || id)
                .join(", ")
            : "";

        return {
          customer_name: customerName.trim(),
          customer_email: customerEmail.trim(),
          customer_phone: customerPhone.trim(),
          customer_address: customerAddress.trim() || null,
          product_name: product.productModel,
          product_model: product.productModel,
          serial_number: product.serialNumber,
          issue_type: product.issueType || "其他",
          issue_description: `[經銷/代理商多筆] ${product.issueDescription || "批量送修"}${
            accessoriesLabel ? `\n\n隨附物品: ${accessoriesLabel}` : ""
          }`,
          purchase_date: product.purchaseDate || null,
          photo_urls: photoUrls.length > 0 ? photoUrls : null,
          customer_type: "經銷/代理商多筆",
        };
      });

      // Call edge function to submit all RMAs
      const response = await supabase.functions.invoke("submit-rma", {
        body: { products: productsPayload },
      });

      if (response.error) throw response.error;

      const apiResults = response.data.results as { rma_number: string; product_model?: string; serial_number?: string }[];

      if (!apiResults || apiResults.length === 0) {
        toast.error("所有產品提交失敗");
        return;
      }

      const results = apiResults.map((r) => ({
        rmaNumber: r.rma_number,
        productModel: r.product_model || "",
        serialNumber: r.serial_number || "",
      }));

      // Navigate to multi-confirmation page
      navigate("/rma-multi-confirmation", { state: { results } });
    } catch (error: unknown) {
      console.error("Error submitting multi RMA:", error);
      toast.error("提交失敗，請稍後再試");
    } finally {
      setIsSubmitting(false);
    }
  };

  // CSV import handlers
  const handleCsvImport = (products: ProductEntry[], errors: ParseError[]) => {
    setCsvProducts(products);
    setCsvErrors(errors);
    setShowCsvDialog(true);
  };

  const handleCsvCustomerConfirm = (info: {
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    customerAddress: string;
  }) => {
    setCustomerName(info.customerName);
    setCustomerEmail(info.customerEmail);
    setCustomerPhone(info.customerPhone);
    setCustomerAddress(info.customerAddress);
    setMultiProducts(csvProducts);
    setShowCsvDialog(false);
    setCsvProducts([]);
    setAgreed(true); // Auto-agree after CSV import
    setShowPreview(true);
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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      handleFiles(files);
    }
  };

  const handleFiles = (files: File[]) => {
    const validFiles = files.filter((file) => {
      // Check file type
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name} 不是有效的圖片格式 / is not a valid image format`);
        return false;
      }
      // Check file size (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} 超過 10MB 限制 / exceeds 10MB limit`);
        return false;
      }
      return true;
    });

    if (validFiles.length > 0) {
      setUploadedFiles((prev) => [...prev, ...validFiles].slice(0, 5)); // Max 5 files
      if (uploadedFiles.length + validFiles.length > 5) {
        toast.info("最多只能上傳 5 張照片 / Maximum 5 photos allowed");
      }
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // Show preview mode
  if (showPreview && isMultiMode) {
    return (
      <div className="rma-card animate-fade-in">
        <MultiProductPreview
          customerInfo={{
            customerName,
            customerEmail,
            customerPhone,
            customerAddress,
          }}
          products={multiProducts.filter(
            (p) => p.productModel.trim() && p.serialNumber.trim()
          )}
          photoCount={uploadedFiles.length}
          onBack={() => setShowPreview(false)}
          onSubmit={handleMultiSubmit}
          isSubmitting={isSubmitting}
          errors={csvErrors}
        />
      </div>
    );
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="rma-card animate-fade-in">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-foreground">建立新的 RMA / Create New RMA</h2>
          <p className="text-sm text-muted-foreground mt-1">
            請填寫以下資訊以申請保固<br/>
            <span className="text-xs">Please fill in the following information to apply for warranty service</span>
          </p>
        </div>

        {/* Customer Type */}
        <div className="mb-6">
          <label className="rma-label">寄件人身分 / Sender Type</label>
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
                  onChange={(e) => {
                    setCustomerType(e.target.value);
                    setShowPreview(false);
                  }}
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
            <label className="rma-label">客戶姓名 / Customer Name *</label>
            <input
              type="text"
              placeholder="請輸入客戶姓名 / Enter customer name"
              className="rma-input"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="rma-label">電子郵件 / Email *</label>
            <input
              type="email"
              placeholder="請輸入電子郵件 / Enter email address"
              className="rma-input"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="rma-label">客戶電話 / Phone *</label>
            <input
              type="tel"
              placeholder="請輸入客戶電話 / Enter customer phone"
              className="rma-input"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              required
            />
          </div>
          {!isMultiMode && (
            <div>
              <label className="rma-label">產品序號 / Serial Number</label>
              <input
                type="text"
                placeholder="請輸入產品序號 / Enter serial number"
                className="rma-input"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                onBlur={(e) =>
                  handleSerialBlur(e.target.value, () => setSerialNumber(""))
                }
              />
            </div>
          )}
        </div>

        <div className="mb-4">
          <label className="rma-label">客戶地址 / Address</label>
          <textarea
            placeholder="請輸入客戶地址 / Enter customer address"
            className="rma-input min-h-[80px] resize-none"
            value={customerAddress}
            onChange={(e) => setCustomerAddress(e.target.value)}
          />
        </div>

        {/* Multi-Product Mode */}
        {isMultiMode ? (
          <>
            {/* CSV Import Section */}
            <div className="mb-6">
              <CsvImportSection onImport={handleCsvImport} />
            </div>

            {/* Manual Multi-Product Form */}
            <div className="mb-6">
              <MultiProductForm
                products={multiProducts}
                onChange={setMultiProducts}
                onInvalidSerial={() => setShowInvalidSerialDialog(true)}
              />
            </div>
          </>
        ) : (
          <>
            {/* Product Info - Single Mode */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="rma-label">產品型號 / Product Model</label>
                <input
                  type="text"
                  placeholder="請輸入產品型號 / Enter product model"
                  className="rma-input"
                  value={productModel}
                  onChange={(e) => setProductModel(e.target.value)}
                />
              </div>
              <div>
                <label className="rma-label">故障問題 / Issue Type *</label>
                <select
                  className="rma-input"
                  value={issueType}
                  onChange={(e) => setIssueType(e.target.value)}
                  required
                >
                  <option value="">選擇故障問題 / Select issue type</option>
                  {issueTypes.map((issue) => (
                    <option key={issue.value} value={issue.value}>
                      {issue.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mb-4">
              <label className="rma-label">購買日期 / Purchase Date</label>
              <input
                type="date"
                className="rma-input"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
              />
            </div>

            <div className="mb-4">
              <label className="rma-label">問題描述 / Issue Description *</label>
              <textarea
                placeholder="請詳細描述問題... / Please describe the issue in detail..."
                className="rma-input min-h-[120px] resize-none"
                value={issueDescription}
                onChange={(e) => setIssueDescription(e.target.value)}
                required
              />
            </div>

            {/* Accessories - Single Mode Only */}
            <div className="mb-6">
              <label className="rma-label">隨附寄出物品 / Included Accessories</label>
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
          </>
        )}

        {/* Photo Upload - Common for both modes */}
        <div className="mb-6">
          <label className="rma-label">
            產品照片 / Product Photos {isMultiMode && "(共用所有產品 / Shared across all products)"}
          </label>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileInput}
            accept="image/*"
            multiple
            className="hidden"
          />
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
              dragActive
                ? "border-primary bg-accent"
                : "border-border hover:border-primary/50"
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={handleUploadClick}
          >
            <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              <span className="text-primary font-medium hover:underline">
                點擊上傳照片 / Click to upload
              </span>{" "}
              或拖放到此處 / or drag and drop here
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              PNG, JPG, GIF 最大 10MB，最多 5 張 / Max 10MB, up to 5 photos
            </p>
          </div>

          {/* Uploaded Files Preview */}
          {uploadedFiles.length > 0 && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {uploadedFiles.map((file, index) => (
                <div key={index} className="relative group">
                  <div className="aspect-square rounded-lg border border-border overflow-hidden bg-muted">
                    <img
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(index);
                    }}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    {file.name}
                  </p>
                </div>
              ))}
            </div>
          )}
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
              我同意 / I agree to
              <Link
                to="/terms"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-primary hover:underline mx-1"
              >
                服務條款 / Terms of Service
              </Link>
              和 / and
              <Link
                to="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-primary hover:underline mx-1"
              >
                隱私政策 / Privacy Policy
              </Link>
              *
            </span>
          </label>
        </div>

        {/* Submit */}
        <button
          type="submit"
          className="w-full rma-btn-primary py-4 text-base disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              提交中... / Submitting...
            </>
          ) : isMultiMode ? (
            <>
              <Eye className="w-5 h-5" />
              預覽 / Preview (
              {
                multiProducts.filter(
                  (p) => p.productModel.trim() && p.serialNumber.trim()
                ).length
              }{" "}
              筆 items)
            </>
          ) : (
            "建立RMA / Create RMA"
          )}
        </button>
      </form>

      {/* CSV Customer Info Dialog */}
      <CsvCustomerInfoDialog
        open={showCsvDialog}
        onOpenChange={setShowCsvDialog}
        onConfirm={handleCsvCustomerConfirm}
        productCount={csvProducts.length}
        errors={csvErrors}
      />

      <AlertDialog
        open={showInvalidSerialDialog}
        onOpenChange={setShowInvalidSerialDialog}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <div className="flex justify-center mb-2">
              <AlertTriangle className="h-12 w-12 text-amber-500" />
            </div>
            <AlertDialogTitle className="text-center text-xl">
              {INVALID_SERIAL_TITLE}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="mt-2 whitespace-pre-line text-sm text-foreground bg-amber-50 border-l-4 border-amber-500 p-4 rounded">
                {INVALID_SERIAL_DESCRIPTION}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center">
            <AlertDialogAction className="px-8">我知道了 / Got it</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default RmaForm;
