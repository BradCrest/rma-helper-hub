import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const Section = ({
  num,
  zh,
  en,
  children,
}: {
  num: number;
  zh: string;
  en: string;
  children: React.ReactNode;
}) => (
  <section className="mb-8">
    <h2 className="text-xl font-bold text-foreground mb-3">
      {num}. {zh} <span className="text-muted-foreground font-normal">/ {en}</span>
    </h2>
    <div className="space-y-3 text-sm text-foreground leading-relaxed">{children}</div>
  </section>
);

const Terms = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 py-10">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="bg-card rounded-lg shadow-sm border border-border p-8 md:p-10">
            <h1 className="text-3xl font-bold text-foreground mb-2">
              服務條款 <span className="text-muted-foreground text-2xl font-normal">/ Terms of Service</span>
            </h1>
            <p className="text-sm text-muted-foreground mb-8">
              最後更新日期 / Last Updated: 2026-04-30
            </p>

            <Section num={1} zh="服務說明" en="Service Description">
              <p>本系統（CREST 產品申請保固服務系統，以下簡稱「本系統」）由 CREST 提供，用於受理潛水電腦錶等產品的保固服務申請、進度查詢與客戶溝通。</p>
              <p className="text-muted-foreground">This system ("the System") is provided by CREST for handling warranty service applications, status tracking, and customer communication for diving computers and related products.</p>
            </Section>

            <Section num={2} zh="適用範圍" en="Scope">
              <p>使用本系統即表示您已閱讀、理解並同意遵守本條款。如不同意，請勿使用本系統。</p>
              <p className="text-muted-foreground">By using the System, you acknowledge that you have read, understood, and agreed to these terms. If you do not agree, please do not use the System.</p>
            </Section>

            <Section num={3} zh="用戶責任" en="User Responsibilities">
              <ul className="list-disc pl-5 space-y-1">
                <li>您應提供真實、準確、完整的個人與產品資料（姓名、電話、Email、寄件地址、產品序號、故障描述等）。</li>
                <li>您不得以任何方式干擾本系統運作，或進行未經授權之存取。</li>
                <li>因您提供錯誤資料導致的保固服務延誤，本公司不負相關責任。</li>
              </ul>
              <p className="text-muted-foreground">You agree to provide truthful, accurate, and complete personal and product information. You shall not interfere with the System's operation or attempt unauthorized access. CREST is not liable for delays caused by inaccurate information you provided.</p>
            </Section>

            <Section num={4} zh="保固服務政策" en="Warranty Service Policy">
              <p>本公司<strong>不提供維修服務</strong>。保固期內符合條件之產品，可選擇下列方式之一：</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>保固更換（同型號或等同產品）</li>
                <li>購買 A/B/C 級整新品（差價依公告為準）</li>
                <li>退回原機</li>
              </ul>
              <p className="text-muted-foreground">CREST does <strong>not</strong> provide repair services. Eligible in-warranty products may choose one of the following: warranty replacement (same or equivalent model), purchase of refurbished A/B/C-grade unit (price difference applies), or return of the original unit.</p>
              <p>
                詳細政策請參閱：
                <a
                  href="https://crestdiving.com/blogs/crest-news/crest-warranty-repair-policy-update"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  CREST 潛水電腦錶保固與維修政策調整公告
                </a>
              </p>
            </Section>

            <Section num={5} zh="寄送方式" en="Shipping">
              <p>為配合人力與作業安排，本公司<strong>目前不接受親送遞交</strong>保固服務件，請務必透過快遞或郵局寄送至本公司公告之收件地址。</p>
              <p className="text-muted-foreground">Due to manpower constraints, in-person delivery is <strong>not accepted</strong>. Please ship products via courier or postal service to the official receiving address.</p>
            </Section>

            <Section num={6} zh="智慧財產權" en="Intellectual Property">
              <p>本系統之所有內容（包含但不限於介面、文字、圖示、程式碼）均屬 CREST 或其授權人所有，未經書面同意不得複製、修改、散佈。</p>
              <p className="text-muted-foreground">All content of the System (interface, text, graphics, code, etc.) belongs to CREST or its licensors. No reproduction, modification, or distribution is permitted without written consent.</p>
            </Section>

            <Section num={7} zh="責任限制" en="Limitation of Liability">
              <p>本系統依「現狀」提供，本公司不保證系統永不中斷或無錯誤。在法律允許範圍內，本公司對因使用或無法使用本系統所產生之任何間接、附隨或衍生性損害不負賠償責任。</p>
              <p className="text-muted-foreground">The System is provided "as is" without warranty of uninterrupted or error-free operation. To the extent permitted by law, CREST shall not be liable for any indirect, incidental, or consequential damages arising from the use or inability to use the System.</p>
            </Section>

            <Section num={8} zh="條款修改" en="Modifications">
              <p>本公司保留隨時修改本條款之權利，修改後將公告於本系統。您於修改後繼續使用，視為同意修改後之條款。</p>
              <p className="text-muted-foreground">CREST reserves the right to modify these terms at any time. Continued use after changes constitutes acceptance of the revised terms.</p>
            </Section>

            <Section num={9} zh="準據法與管轄" en="Governing Law">
              <p>本條款之解釋與適用，以及與本條款有關之爭議，均以中華民國法律為準據法，並以台灣台北地方法院為第一審管轄法院。</p>
              <p className="text-muted-foreground">These terms are governed by the laws of the Republic of China (Taiwan). The Taipei District Court shall have first-instance jurisdiction over any disputes.</p>
            </Section>

            <Section num={10} zh="聯絡方式" en="Contact">
              <p>
                如有任何問題，請聯繫：
                <a href="mailto:service@crestdiving.com" className="text-primary hover:underline">
                  service@crestdiving.com
                </a>
              </p>
              <p className="text-muted-foreground">
                For any questions, please contact:{" "}
                <a href="mailto:service@crestdiving.com" className="text-primary hover:underline">
                  service@crestdiving.com
                </a>
              </p>
            </Section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Terms;
