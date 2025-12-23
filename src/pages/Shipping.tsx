import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { Search, ArrowLeft, Globe, X, Upload, Camera, Loader2, Check } from "lucide-react";
import Footer from "@/components/layout/Footer";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type RmaRequest = Database["public"]["Tables"]["rma_requests"]["Row"];

const Shipping = () => {
  const [showModal, setShowModal] = useState(false);
  const [rmaNumber, setRmaNumber] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [foundRma, setFoundRma] = useState<RmaRequest | null>(null);
  const [step, setStep] = useState<"search" | "form">("search");
  
  // Shipping form state
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rmaNumber) {
      toast.error("請輸入RMA號碼");
      return;
    }
    toast.info("正在搜尋...");
  };

  const resetModal = () => {
    setShowModal(false);
    setRmaNumber("");
    setFoundRma(null);
    setStep("search");
    setCarrier("");
    setTrackingNumber("");
    setPhoto(null);
    setPhotoPreview(null);
  };

  const handleModalSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rmaNumber.trim()) {
      toast.error("請輸入RMA號碼");
      return;
    }

    setIsSearching(true);
    try {
      const normalizedInput = rmaNumber.trim().toUpperCase();
      
      let query = supabase.from("rma_requests").select("*");
      
      if (normalizedInput.includes("-")) {
        query = query.ilike("rma_number", `%${normalizedInput}%`);
      } else {
        query = query.ilike("rma_number", `%${normalizedInput.replace(/RMA/i, "").replace(/(\d{8})(\d{3})/, "$1-$2")}%`);
      }

      const { data, error } = await query;

      if (error) throw error;

      const inputWithoutDashes = normalizedInput.replace(/-/g, "");
      const filtered = data?.filter(r => 
        r.rma_number.replace(/-/g, "").toUpperCase().includes(inputWithoutDashes)
      ) || [];

      if (filtered.length === 0) {
        toast.error("找不到此 RMA 編號");
        return;
      }

      // Check if already has shipping info
      const { data: shippingData } = await supabase
        .from("rma_shipping")
        .select("*")
        .eq("rma_request_id", filtered[0].id)
        .eq("direction", "inbound")
        .maybeSingle();

      if (shippingData) {
        toast.error("此 RMA 已有寄件資訊，無法重複新增");
        return;
      }

      setFoundRma(filtered[0]);
      setStep("form");
      toast.success("已找到 RMA，請填寫寄件資訊");
    } catch (error) {
      console.error("Search error:", error);
      toast.error("搜尋失敗，請稍後再試");
    } finally {
      setIsSearching(false);
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("照片大小不能超過 5MB");
        return;
      }
      setPhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!carrier.trim()) {
      toast.error("請輸入物流名稱");
      return;
    }
    if (!trackingNumber.trim()) {
      toast.error("請輸入物流單號");
      return;
    }
    if (!foundRma) {
      toast.error("請先搜尋 RMA");
      return;
    }

    setIsSubmitting(true);
    try {
      let photoUrl: string | null = null;

      // Upload photo if exists
      if (photo) {
        const fileExt = photo.name.split(".").pop();
        const fileName = `${foundRma.rma_number}-shipping-${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from("rma-photos")
          .upload(fileName, photo);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("rma-photos")
          .getPublicUrl(fileName);

        photoUrl = urlData.publicUrl;
      }

      // Insert shipping record
      const { error: insertError } = await supabase
        .from("rma_shipping")
        .insert({
          rma_request_id: foundRma.id,
          direction: "inbound",
          carrier: carrier.trim(),
          tracking_number: trackingNumber.trim(),
          photo_url: photoUrl,
          ship_date: new Date().toISOString().split("T")[0],
        });

      if (insertError) throw insertError;

      // Update RMA status to shipped
      await supabase
        .from("rma_requests")
        .update({ status: "shipped" })
        .eq("id", foundRma.id);

      toast.success("寄件資訊已新增成功！");
      resetModal();
    } catch (error) {
      console.error("Submit error:", error);
      toast.error("提交失敗，請稍後再試");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            返回首頁
          </Link>

          <div className="flex items-center gap-3">
            <span className="font-semibold text-foreground">RMA 狀態追蹤</span>
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-card text-foreground text-sm font-medium rounded-lg border border-border hover:bg-secondary transition-colors"
            >
              <Globe className="w-4 h-4" />
              新增寄件資訊
            </button>
          </div>

          <div className="w-20" />
        </div>
      </header>

      <main className="flex-1 py-12">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto">
            <div className="rma-card animate-fade-in">
              {/* Title */}
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold text-foreground mb-2">
                  查詢您的RMA維修狀態
                </h1>
                <p className="text-muted-foreground">
                  請輸入您的相關資訊，查看您的維修進度
                </p>
              </div>

              {/* Tabs */}
              <div className="flex bg-secondary rounded-lg p-1 mb-8">
                <Link
                  to="/track"
                  className="flex-1 py-3 px-4 text-sm font-medium rounded-md text-muted-foreground hover:text-foreground text-center transition-all"
                >
                  使用客戶資訊查詢
                </Link>
                <button
                  className="flex-1 py-3 px-4 text-sm font-medium rounded-md bg-card text-foreground shadow-sm transition-all"
                >
                  使用RMA編號查詢
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSearch}>
                <div>
                  <label className="rma-label">RMA編號</label>
                  <input
                    type="text"
                    value={rmaNumber}
                    onChange={(e) => setRmaNumber(e.target.value)}
                    placeholder="請輸入您的RMA編號"
                    className="rma-input"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    輸入RMA編號時，可以省略中間的「-」符號
                  </p>
                </div>

                <button
                  type="submit"
                  className="w-full mt-6 rma-btn-primary py-4 text-base"
                >
                  <Search className="w-5 h-5" />
                  查詢
                </button>
              </form>
            </div>
          </div>
        </div>
      </main>

      <Footer />

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-foreground/50"
            onClick={resetModal}
          />
          <div className="relative bg-card rounded-xl p-6 w-full max-w-md shadow-xl animate-fade-in max-h-[90vh] overflow-y-auto">
            <button
              onClick={resetModal}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {step === "search" ? (
              <>
                <h2 className="text-xl font-bold text-foreground mb-2">
                  輸入RMA號碼
                </h2>
                <p className="text-sm text-muted-foreground mb-6">
                  請輸入已登記但尚未寄出的RMA號碼以新增寄件資訊
                </p>

                <form onSubmit={handleModalSearch}>
                  <input
                    type="text"
                    value={rmaNumber}
                    onChange={(e) => setRmaNumber(e.target.value)}
                    placeholder="RMA號碼"
                    className="rma-input mb-6"
                  />

                  <div className="flex gap-3 justify-end">
                    <button
                      type="button"
                      onClick={resetModal}
                      className="px-6 py-2.5 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-secondary transition-colors"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      disabled={isSearching}
                      className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {isSearching ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                      搜尋
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold text-foreground mb-2">
                  新增寄件資訊
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                  RMA 編號：<span className="font-mono text-primary">{foundRma?.rma_number}</span>
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="rma-label">物流名稱 *</label>
                    <input
                      type="text"
                      value={carrier}
                      onChange={(e) => setCarrier(e.target.value)}
                      placeholder="例如：黑貓宅急便、7-11 交貨便"
                      className="rma-input"
                    />
                  </div>

                  <div>
                    <label className="rma-label">物流單號 *</label>
                    <input
                      type="text"
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                      placeholder="請輸入物流追蹤號碼"
                      className="rma-input"
                    />
                  </div>

                  <div>
                    <label className="rma-label">寄件照片（選填）</label>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handlePhotoChange}
                      accept="image/*"
                      className="hidden"
                    />
                    
                    {photoPreview ? (
                      <div className="relative">
                        <img
                          src={photoPreview}
                          alt="寄件照片預覽"
                          className="w-full h-48 object-cover rounded-lg border border-border"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setPhoto(null);
                            setPhotoPreview(null);
                          }}
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
                        <span className="text-sm">點擊上傳寄件單據照片</span>
                      </button>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      支援 JPG、PNG 格式，最大 5MB
                    </p>
                  </div>

                  <div className="flex gap-3 justify-end pt-4">
                    <button
                      type="button"
                      onClick={() => setStep("search")}
                      className="px-6 py-2.5 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-secondary transition-colors"
                    >
                      返回
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      確認送出
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Shipping;
