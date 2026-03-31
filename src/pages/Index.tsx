import { useState } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import TabNavigation from "@/components/rma/TabNavigation";
import RmaForm from "@/components/rma/RmaForm";
import logo from "@/assets/logo.png";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { AlertTriangle } from "lucide-react";

const Index = () => {
  const [showNotice, setShowNotice] = useState(true);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AlertDialog open={showNotice} onOpenChange={setShowNotice}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <div className="flex justify-center mb-4">
              <AlertTriangle className="h-12 w-12 text-amber-500" />
            </div>
            <AlertDialogTitle className="text-center text-xl">
              重要通知 / Important Notice
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="mt-4 space-y-4">
                <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded">
                  <p className="text-base text-amber-900 font-medium">
                    因應相關資源及人力安排因素，目前暫不支援親送遞交維修件，敬請安排寄送，以免影響後續維修進度，謝謝您。
                  </p>
                </div>
                <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                  <p className="text-base text-blue-900 font-medium">
                    Due to manpower constraints, we are currently unable to accept in-person deliveries. Please arrange shipment via courier service instead. Thank you.
                  </p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 sm:justify-center">
            <AlertDialogAction className="px-8">確定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Header />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-8 md:py-12 border-b border-border bg-card">
          <div className="container mx-auto px-4">
            <div className="flex flex-col md:flex-row gap-8 items-start">
              {/* 左欄 - 現有內容 */}
              <div className="flex-1">
                <div className="mb-4">
                  <img src={logo} alt="CREST Logo" className="h-12 md:h-16 w-auto" />
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-6">
                  CREST 產品申請保固服務系統
                </h2>
                <TabNavigation />
              </div>

              {/* 右欄 - 收件地址資訊 */}
              <div className="w-full md:w-[420px] border-2 border-foreground rounded-lg p-6">
                <p className="text-sm text-foreground mb-4">
                  為避免影響您的保修時程，請將產品正確寄至以下地址。
                </p>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">本公司收件地址如下：</p>
                    <p className="text-sm text-foreground">
                      242039 新北市新莊區化成路11巷86號1樓
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">英文地址：</p>
                    <p className="text-sm text-muted-foreground">
                      No. 86, Ln. 11, Huacheng Rd., Xinzhuang Dist., New Taipei City, Taiwan, 242039
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Form Section */}
        <section className="py-8 md:py-12">
          <div className="container mx-auto px-4">
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold text-foreground mb-2">
                產品維修登記
              </h3>
              <p className="text-muted-foreground">
                請填寫以下資料送出您的RMA申請
              </p>
            </div>

            <div className="max-w-3xl mx-auto">
              <RmaForm />
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Index;
