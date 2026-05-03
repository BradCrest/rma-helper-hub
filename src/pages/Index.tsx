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
import { AlertTriangle, ExternalLink, Megaphone } from "lucide-react";

const POLICY_URL = "https://crestdiving.com/blogs/crest-news/crest-warranty-repair-policy-update?srsltid=AfmBOooKlXrXFW6s3doVBFQ3uTxkt4jOHtALfSlmoU4RxRqDQTgAHbLU";

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
                    因應相關資源及人力安排因素，目前暫不支援親送遞交保固服務件，敬請安排寄送，以免影響後續保固服務進度，謝謝您。
                  </p>
                </div>
                <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                  <p className="text-base text-blue-900 font-medium">
                    Due to manpower constraints, we are currently unable to accept in-person deliveries. Please arrange shipment via courier service instead. Thank you.
                  </p>
                </div>
                <a
                  href={POLICY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-4 rounded border-2 border-primary bg-primary/5 hover:bg-primary/10 transition-colors group"
                >
                  <Megaphone className="h-5 w-5 text-primary shrink-0" />
                  <div className="flex-1 text-left">
                    <p className="text-sm font-semibold text-primary">
                      CREST 潛水電腦錶保固與維修政策調整公告
                    </p>
                    <p className="text-xs text-primary/70 mt-0.5">
                      CREST Dive Computer Warranty &amp; Repair Policy Update
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      點擊查看完整公告 / View Full Announcement
                    </p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-primary shrink-0 group-hover:translate-x-0.5 transition-transform" />
                </a>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 sm:justify-center">
            <AlertDialogAction className="px-8">確定 / OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Header />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-8 md:py-12 border-b border-border bg-card">
          <div className="container mx-auto px-4">
            <div className="flex flex-col md:flex-row gap-8 items-start">
              {/* Left column */}
              <div className="flex-1">
                <div className="mb-4">
                  <img src={logo} alt="CREST Logo" className="h-12 md:h-16 w-auto" />
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-1">
                  CREST 產品申請保固服務系統
                </h2>
                <p className="text-base text-muted-foreground mb-4">
                  CREST Product Warranty Service Portal
                </p>
                <a
                  href={POLICY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-lg border-2 border-primary bg-primary/5 hover:bg-primary/10 transition-colors group"
                >
                  <Megaphone className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm font-semibold text-primary">
                    CREST 潛水電腦錶保固與維修政策調整公告
                    <span className="block text-xs font-normal text-primary/70 mt-0.5">
                      CREST Dive Computer Warranty &amp; Repair Policy Update
                    </span>
                  </span>
                  <ExternalLink className="h-4 w-4 text-primary shrink-0 group-hover:translate-x-0.5 transition-transform" />
                </a>
                <TabNavigation />
              </div>

              {/* Right column - shipping address */}
              <div className="w-full md:w-[420px] border-2 border-foreground rounded-lg p-6">
                <p className="text-sm text-foreground mb-4">
                  為避免影響您的保修時程，請將產品正確寄至以下地址。<br />
                  <span className="text-muted-foreground">To avoid delays, please ship your product to the address below.</span>
                </p>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">本公司收件地址：</p>
                    <p className="text-sm text-foreground">
                      242039 新北市新莊區化成路11巷86號1樓
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">English address:</p>
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
              <h3 className="text-2xl font-bold text-foreground mb-1">
                產品保固服務登記
              </h3>
              <p className="text-muted-foreground mb-1">
                Product Warranty Service Registration
              </p>
              <p className="text-muted-foreground">
                請填寫以下資料送出您的 RMA 申請 / Please complete the form below to submit your RMA application
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
