import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Upload, Camera, Loader2, Check, X, AlertCircle, CheckCircle2 } from "lucide-react";
import Footer from "@/components/layout/Footer";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface RmaResult {
  id: string;
  rma_number: string;
  status: string;
  product_name: string;
}

type ViewState = "loading" | "form" | "success" | "error";

const ShippingForm = () => {
  const [view, setView] = useState<ViewState>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [foundRma, setFoundRma] = useState<RmaResult | null>(null);
  const [submittedRmaNumber, setSubmittedRmaNumber] = useState<string>("");

  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rmaParam = params.get("rma")?.trim();

    if (!rmaParam) {
      setErrorMessage("URL 中未提供 RMA 編號，請從信件按鈕重新進入。\nNo RMA number provided in URL. Please re-enter from the email button.");
      setView("error");
      return;
    }

    (async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lookup-rma?rma_number=${encodeURIComponent(rmaParam)}&purpose=email_link`,
          { method: "GET", headers: { "Content-Type": "application/json" } }
        );
        const result = await response.json();

        if (!response.ok || !result.results || result.results.length === 0) {
          setErrorMessage(`找不到 RMA 編號：${rmaParam}\nRMA number not found: ${rmaParam}`);
          setView("error");
          return;
        }

        const rma = result.results[0];

        if (rma.status !== "registered") {
          setErrorMessage(
            rma.status === "shipped" || rma.status === "received"
              ? `此 RMA（${rma.rma_number}）已收到您的寄件資訊，無需重複填寫。\nThis RMA (${rma.rma_number}) has already received your shipping info, no need to resubmit.`
              : `此 RMA（${rma.rma_number}）目前狀態不允許新增寄件資訊。\nThis RMA (${rma.rma_number}) is not in a state that allows adding shipping info.`
          );
          setView("error");
          return;
        }

        setFoundRma({
          id: rma.id,
          rma_number: rma.rma_number,
          status: rma.status,
          product_name: rma.product_name,
        });
        setView("form");
      } catch (err) {
        console.error("Lookup error:", err);
        setErrorMessage("查詢失敗，請稍後再試或聯繫客服。\nLookup failed. Please try again later or contact customer service.");
        setView("error");
      }
    })();
  }, []);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("照片大小不能超過 5MB / Photo size cannot exceed 5MB");
      return;
    }
    setPhoto(file);
    const reader = new FileReader();
    reader.onloadend = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!foundRma) return;
    if (!carrier.trim()) return toast.error("請輸入物流名稱 / Please enter carrier name");
    if (!trackingNumber.trim()) return toast.error("請輸入物流單號 / Please enter tracking number");

    setIsSubmitting(true);
    try {
      let photoUrl: string | null = null;

      if (photo) {
        const fileExt = photo.name.split(".").pop();
        const fileName = `rma/${foundRma.rma_number}-shipping-${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from("rma-photos").upload(fileName, photo);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("rma-photos").getPublicUrl(fileName);
        photoUrl = urlData.publicUrl;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-shipping`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rma_request_id: foundRma.id,
            carrier: carrier.trim(),
            tracking_number: trackingNumber.trim(),
            photo_url: photoUrl,
          }),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "提交失敗");

      setSubmittedRmaNumber(foundRma.rma_number);
      setView("success");
    } catch (err) {
      console.error("Submit error:", err);
      const msg = err instanceof Error ? err.message : "提交失敗，請稍後再試 / Submission failed, please try again later";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            返回首頁 / Home
          </Link>
          <span className="font-semibold text-foreground">填寫寄件資訊 / Add Shipping Info</span>
          <div className="w-20" />
        </div>
      </header>

      <main className="flex-1 py-12">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto">
            {view === "loading" && (
              <div className="rma-card animate-fade-in flex flex-col items-center justify-center py-16">
                <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
                <p className="text-muted-foreground">正在查詢您的 RMA… / Looking up your RMA…</p>
              </div>
            )}

            {view === "error" && (
              <div className="rma-card animate-fade-in text-center py-12">
                <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
                <h1 className="text-xl font-bold text-foreground mb-2">無法填寫寄件資訊 / Cannot Add Shipping Info</h1>
                <p className="text-muted-foreground mb-6 whitespace-pre-line">{errorMessage}</p>
                <Link to="/" className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-colors">
                  返回首頁 / Home
                </Link>
              </div>
            )}

            {view === "success" && (
              <div className="rma-card animate-fade-in text-center py-12">
                <CheckCircle2 className="w-14 h-14 text-primary mx-auto mb-4" />
                <h1 className="text-2xl font-bold text-foreground mb-2">寄件資訊已成功送出！/ Shipping Info Submitted!</h1>
                <p className="text-muted-foreground mb-1">RMA 編號 / RMA Number: <span className="font-mono text-primary">{submittedRmaNumber}</span></p>
                <p className="text-muted-foreground mb-8">我們收到產品後會盡快處理並更新狀態。<br/>We will process and update the status as soon as we receive the product.</p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Link to="/track" className="inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-secondary transition-colors">
                    查詢保固服務進度 / Track Warranty Service
                  </Link>
                  <Link to="/" className="inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-colors">
                    返回首頁 / Home
                  </Link>
                </div>
              </div>
            )}

            {view === "form" && foundRma && (
              <div className="rma-card animate-fade-in">
                <div className="text-center mb-6">
                  <h1 className="text-2xl font-bold text-foreground mb-2">新增寄件資訊 / Add Shipping Info</h1>
                  <p className="text-sm text-muted-foreground">請填寫您寄出產品的物流資訊<br/>Please fill in the shipping information for the product you sent</p>
                </div>

                <div className="bg-secondary rounded-lg p-4 mb-6 space-y-1">
                  <p className="text-sm text-muted-foreground">RMA 編號 / RMA Number</p>
                  <p className="font-mono text-lg font-semibold text-primary">{foundRma.rma_number}</p>
                  <p className="text-sm text-muted-foreground mt-2">產品 / Product</p>
                  <p className="text-sm font-medium text-foreground">{foundRma.product_name}</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="rma-label">物流名稱 / Carrier Name *</label>
                    <input
                      type="text"
                      value={carrier}
                      onChange={(e) => setCarrier(e.target.value)}
                      placeholder="例如：黑貓宅急便、7-11 交貨便 / e.g. FedEx, DHL, UPS"
                      className="rma-input"
                    />
                  </div>

                  <div>
                    <label className="rma-label">物流單號 / Tracking Number *</label>
                    <input
                      type="text"
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                      placeholder="請輸入物流追蹤號碼 / Enter tracking number"
                      className="rma-input"
                    />
                  </div>

                  <div>
                    <label className="rma-label">寄件照片（選填）/ Shipping Photo (Optional)</label>
                    <input type="file" ref={fileInputRef} onChange={handlePhotoChange} accept="image/*" className="hidden" />
                    {photoPreview ? (
                      <div className="relative">
                        <img src={photoPreview} alt="寄件照片預覽 / Shipping photo preview" className="w-full h-48 object-cover rounded-lg border border-border" />
                        <button
                          type="button"
                          onClick={() => { setPhoto(null); setPhotoPreview(null); }}
                          className="absolute top-2 right-2 p-1 bg-destructive text-destructive-foreground rounded-full hover:bg-destructive/90"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full h-32 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Camera className="w-5 h-5" />
                          <Upload className="w-5 h-5" />
                        </div>
                        <span className="text-sm">點擊上傳寄件單據照片 / Click to upload shipping receipt photo</span>
                      </button>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">支援 JPG、PNG 格式，最大 5MB / JPG/PNG, max 5MB</p>
                  </div>

                  <div className="bg-muted/50 rounded-lg p-4">
                    <h3 className="font-semibold text-foreground mb-2">寄件須知 / Shipping Instructions</h3>
                    <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                      <li>請將產品妥善包裝，附上此 RMA 編號 / Please pack the product properly and include this RMA number</li>
                      <li>寄送至本公司收件地址：242039 新北市新莊區化成路11巷86號1樓 / Ship to: No. 86, Ln. 11, Huacheng Rd., Xinzhuang Dist., New Taipei City, Taiwan, 242039</li>
                      <li>我們收到產品後會盡快處理並更新狀態 / We will process and update the status as soon as we receive the product</li>
                      <li>您可以隨時使用 RMA 編號查詢保固服務進度 / You can check warranty service progress anytime using your RMA number</li>
                      <li>因人力因素及保固服務中心無對外開放，<strong>無法支援親送</strong>，敬請見諒。/ Due to manpower constraints, <strong>in-person delivery is not accepted</strong>. We appreciate your understanding.</li>
                    </ol>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 text-base font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                    確認送出 / Confirm & Submit
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default ShippingForm;
