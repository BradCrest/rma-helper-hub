import { useState, useEffect } from "react";
import { LogOut, Home, Package, Inbox, Factory, ClipboardCheck, Heart, FileSpreadsheet, ShieldCheck, CreditCard, Truck, CheckSquare } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ReceivingTab from "@/components/logistics/ReceivingTab";
import AwaitingConfirmationTab from "@/components/logistics/AwaitingConfirmationTab";
import PaymentConfirmationTab from "@/components/logistics/PaymentConfirmationTab";
import OutboundShippingTab from "@/components/logistics/OutboundShippingTab";
import ClosingTab from "@/components/logistics/ClosingTab";
import FollowUpTab from "@/components/logistics/FollowUpTab";
import StatusMapDialog from "@/components/logistics/StatusMapDialog";

const VALID_TABS = ["receiving", "customer", "payment", "outbound", "closing", "followup", "supplier", "fault", "sales", "warranty"];
const MOVED_TABS = ["rma-reply", "email"];

const AdminLogistics = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(
    initialTab && VALID_TABS.includes(initialTab) ? initialTab : "receiving"
  );

  // Redirect old bookmarks: rma-reply / email tabs moved to /admin/email-knowledge
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t && MOVED_TABS.includes(t)) {
      navigate(`/admin/email-knowledge?tab=${t}`, { replace: true });
      return;
    }
    if (t && VALID_TABS.includes(t) && t !== activeTab) setActiveTab(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleTabChange = (next: string) => {
    setActiveTab(next);
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/admin");
  };

  const tabs = [
    { id: "receiving", label: "收件處理", icon: Package },
    { id: "customer", label: "待客戶確認", icon: Inbox },
    { id: "payment", label: "付款確認", icon: CreditCard },
    { id: "outbound", label: "出貨處理", icon: Truck },
    { id: "closing", label: "結案追蹤", icon: CheckSquare },
    { id: "followup", label: "客戶關懷", icon: Heart },
    { id: "supplier", label: "供應商維修", icon: Factory, disabled: true },
    { id: "fault", label: "故障登記", icon: ClipboardCheck, disabled: true },
    { id: "sales", label: "銷貨匯入", icon: FileSpreadsheet, disabled: true },
    { id: "warranty", label: "保固審核", icon: ShieldCheck, disabled: true },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card shadow-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Link to="/admin/dashboard" className="text-muted-foreground hover:text-foreground">
                ← 返回
              </Link>
              <h1 className="text-xl font-bold text-foreground">後勤管理</h1>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">{user?.email}</span>
              <StatusMapDialog />
              <Link to="/" className="rma-btn-secondary text-sm">
                <Home className="w-4 h-4" />
                首頁
              </Link>
              <button onClick={handleSignOut} className="rma-btn-secondary text-sm">
                <LogOut className="w-4 h-4" />
                登出
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="w-full flex flex-wrap h-auto gap-1 bg-muted/50 p-1 rounded-lg mb-6">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                disabled={tab.disabled}
                className="flex items-center gap-2 px-4 py-2 data-[state=active]:bg-card data-[state=active]:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <tab.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="receiving" className="mt-0">
            <ReceivingTab />
          </TabsContent>

          <TabsContent value="customer" className="mt-0">
            <AwaitingConfirmationTab />
          </TabsContent>

          <TabsContent value="payment" className="mt-0">
            <PaymentConfirmationTab />
          </TabsContent>

          <TabsContent value="outbound" className="mt-0">
            <OutboundShippingTab />
          </TabsContent>

          <TabsContent value="closing" className="mt-0">
            <ClosingTab />
          </TabsContent>

          <TabsContent value="supplier" className="mt-0">
            <div className="rma-card text-center py-12">
              <Factory className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground">供應商維修管理</h3>
              <p className="text-muted-foreground mt-2">此功能將在後續階段實作</p>
            </div>
          </TabsContent>

          <TabsContent value="fault" className="mt-0">
            <div className="rma-card text-center py-12">
              <ClipboardCheck className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground">故障登記</h3>
              <p className="text-muted-foreground mt-2">此功能將在後續階段實作</p>
            </div>
          </TabsContent>

          <TabsContent value="followup" className="mt-0">
            <FollowUpTab />
          </TabsContent>

          <TabsContent value="sales" className="mt-0">
            <div className="rma-card text-center py-12">
              <FileSpreadsheet className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground">銷貨紀錄匯入</h3>
              <p className="text-muted-foreground mt-2">此功能將在後續階段實作</p>
            </div>
          </TabsContent>

          <TabsContent value="warranty" className="mt-0">
            <div className="rma-card text-center py-12">
              <ShieldCheck className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground">保固審核</h3>
              <p className="text-muted-foreground mt-2">此功能將在後續階段實作</p>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default AdminLogistics;
