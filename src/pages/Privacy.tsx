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

const Privacy = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 py-10">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="bg-card rounded-lg shadow-sm border border-border p-8 md:p-10">
            <h1 className="text-3xl font-bold text-foreground mb-2">
              隱私政策 <span className="text-muted-foreground text-2xl font-normal">/ Privacy Policy</span>
            </h1>
            <p className="text-sm text-muted-foreground mb-8">
              最後更新日期 / Last Updated: 2026-04-30
            </p>

            <Section num={1} zh="前言" en="Introduction">
              <p>CREST（以下簡稱「本公司」）非常重視您的個人資料保護。本政策說明本系統蒐集、使用、保存與保護您個人資料之方式。</p>
              <p className="text-muted-foreground">CREST ("we", "us") values your privacy. This policy explains how we collect, use, store, and protect your personal information through this System.</p>
            </Section>

            <Section num={2} zh="蒐集之資料類型" en="Information We Collect">
              <p>為提供保固服務，我們蒐集以下資料：</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>身分識別</strong>：姓名、聯絡電話、電子郵件</li>
                <li><strong>寄送資訊</strong>：寄件地址、收件地址</li>
                <li><strong>產品資訊</strong>：產品型號、序號、購買日期、購買通路</li>
                <li><strong>故障資訊</strong>：故障描述、產品照片（最多 5 張）</li>
                <li><strong>通訊紀錄</strong>：您與客服間的訊息往來、Email 內容</li>
                <li><strong>技術資料</strong>：登入時的 IP 位址（僅限管理員帳號）、瀏覽器類型</li>
              </ul>
              <p className="text-muted-foreground">To provide warranty services, we collect: identification (name, phone, email), shipping information (addresses), product information (model, serial number, purchase date and channel), defect details (description, up to 5 photos), communication records, and technical data (IP address for admin accounts, browser type).</p>
            </Section>

            <Section num={3} zh="使用目的" en="Purposes">
              <p>您的資料僅用於：</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>處理及追蹤您的保固服務申請</li>
                <li>與您聯絡告知處理進度</li>
                <li>安排物流寄送</li>
                <li>統計分析以改善服務品質</li>
                <li>法令遵循與爭議處理</li>
              </ul>
              <p className="text-muted-foreground">Your data is used solely for: processing and tracking your warranty application, contacting you about progress, arranging logistics, statistical analysis to improve service quality, and legal compliance.</p>
            </Section>

            <Section num={4} zh="第三方共享" en="Third-Party Sharing">
              <p>我們僅在以下情況分享您的資料：</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>物流業者</strong>：為寄送產品所必需（提供姓名、電話、地址）</li>
                <li><strong>雲端服務供應商</strong>：本系統使用 Lovable Cloud 與 Supabase 提供資料儲存與運算服務</li>
                <li><strong>AI 服務供應商</strong>：為產生客服回信草稿，可能將去識別化之內容傳送至 OpenAI 等 AI 模型供應商</li>
                <li><strong>法律要求</strong>：依法院命令或政府機關合法要求</li>
              </ul>
              <p className="text-muted-foreground">We share data only with: shipping carriers (name, phone, address as needed for delivery), cloud service providers (Lovable Cloud, Supabase for storage and compute), AI providers (de-identified content may be sent to OpenAI for draft email generation), and legal authorities when required.</p>
              <p>我們<strong>絕不會</strong>將您的個人資料販售或租賃給第三方作行銷用途。</p>
              <p className="text-muted-foreground">We <strong>never</strong> sell or rent your personal data to third parties for marketing purposes.</p>
            </Section>

            <Section num={5} zh="資料保存期限" en="Data Retention">
              <ul className="list-disc pl-5 space-y-1">
                <li>已完成之保固服務紀錄：保存 5 年</li>
                <li>上傳之產品照片與附件：保固服務完成後 90 天自動清除</li>
                <li>Email 通訊紀錄：保存 2 年</li>
              </ul>
              <p className="text-muted-foreground">Completed warranty records: 5 years. Uploaded photos and attachments: auto-deleted 90 days after completion. Email correspondence: 2 years.</p>
            </Section>

            <Section num={6} zh="Cookie 與追蹤" en="Cookies">
              <p>本系統僅使用必要之技術 Cookie 維持登入狀態與表單資料，不使用第三方廣告追蹤 Cookie。</p>
              <p className="text-muted-foreground">We use only essential technical cookies to maintain login sessions and form data. We do not use third-party advertising tracking cookies.</p>
            </Section>

            <Section num={7} zh="您的權利" en="Your Rights">
              <p>依個人資料保護法，您有權：</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>查詢或請求閱覽</li>
                <li>請求製給複本</li>
                <li>請求補充或更正</li>
                <li>請求停止蒐集、處理或利用</li>
                <li>請求刪除</li>
              </ul>
              <p>
                如需行使上述權利，請來信{" "}
                <a href="mailto:service@crestdiving.com" className="text-primary hover:underline">
                  service@crestdiving.com
                </a>
                ，我們將於 30 日內回覆。
              </p>
              <p className="text-muted-foreground">Under applicable data protection laws, you have the right to: access, request copies, request correction, request to stop processing, and request deletion of your personal data. To exercise these rights, email service@crestdiving.com — we will respond within 30 days.</p>
            </Section>

            <Section num={8} zh="資料安全" en="Security">
              <p>我們採行業界標準之安全措施保護您的資料，包括：HTTPS 加密傳輸、資料庫存取權限控管（Row-Level Security）、敏感欄位於客戶查詢時遮罩處理。</p>
              <p className="text-muted-foreground">We adopt industry-standard security measures: HTTPS encryption, database access control (Row-Level Security), and PII masking on customer-facing lookups.</p>
            </Section>

            <Section num={9} zh="退訂" en="Unsubscribe">
              <p>若您不希望再收到非交易性 Email，可點擊任一封 Email 底部之「取消訂閱」連結，或來信告知。</p>
              <p className="text-muted-foreground">To stop receiving non-transactional emails, click the "Unsubscribe" link at the bottom of any email, or contact us.</p>
            </Section>

            <Section num={10} zh="政策修改" en="Changes">
              <p>本政策如有修改將公告於本系統，重大變更將另行通知。</p>
              <p className="text-muted-foreground">Policy updates will be posted on this System; material changes will be notified separately.</p>
            </Section>

            <Section num={11} zh="聯絡方式" en="Contact">
              <p>
                個資保護事務聯絡窗口：
                <a href="mailto:service@crestdiving.com" className="text-primary hover:underline">
                  service@crestdiving.com
                </a>
              </p>
              <p className="text-muted-foreground">
                Data protection contact:{" "}
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

export default Privacy;
