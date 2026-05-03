import { useState, useEffect } from "react";
import { LogOut, Package, ClipboardList, Settings, Home, Mail } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AiAnalysisChat from "@/components/admin/AiAnalysisChat";
import EmbeddingManager from "@/components/admin/EmbeddingManager";
const AdminDashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    pending: 0,
    processing: 0,
    completed: 0,
    thisMonth: 0,
    atFactory: 0,
    refurbA: 0,
    refurbB: 0,
    refurbC: 0,
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const [p, pr, c, m, factory, refurb] = await Promise.all([
          supabase
            .from("rma_requests")
            .select("id", { count: "exact", head: true })
            .eq("status", "registered"),
          supabase
            .from("rma_requests")
            .select("id", { count: "exact", head: true })
            .in("status", ["shipped", "received", "inspecting", "contacting", "quote_confirmed", "paid"]),
          supabase
            .from("rma_requests")
            .select("id", { count: "exact", head: true })
            .in("status", ["closed", "shipped_back_new", "shipped_back_refurbished", "shipped_back_original", "shipped_back", "follow_up"]),
          supabase
            .from("rma_requests")
            .select("id", { count: "exact", head: true })
            .gte("created_at", startOfMonth.toISOString()),
          supabase
            .from("rma_supplier_repairs")
            .select("id", { count: "exact", head: true })
            .in("supplier_status", ["at_factory", "repaired"]),
          supabase
            .from("refurbished_inventory")
            .select("grade")
            .eq("status", "in_stock"),
        ]);

        const grades = (refurb.data || []) as { grade: string }[];
        setStats({
          pending: p.count || 0,
          processing: pr.count || 0,
          completed: c.count || 0,
          thisMonth: m.count || 0,
          atFactory: factory.count || 0,
          refurbA: grades.filter((g) => g.grade === "A").length,
          refurbB: grades.filter((g) => g.grade === "B").length,
          refurbC: grades.filter((g) => g.grade === "C").length,
        });
      } catch (error) {
        console.error("Error fetching stats:", error);
      }
    };

    fetchStats();
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate("/admin");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card shadow-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <h1 className="text-xl font-bold text-foreground">RMA 管理後台</h1>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">{user?.email}</span>
              <Link
                to="/"
                className="rma-btn-secondary text-sm"
              >
                <Home className="w-4 h-4" />
                首頁
              </Link>
              <button
                onClick={handleSignOut}
                className="rma-btn-secondary text-sm"
              >
                <LogOut className="w-4 h-4" />
                登出
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* RMA 申請列表 */}
          <Link to="/admin/rma-list" className="rma-card hover:shadow-lg transition-shadow cursor-pointer">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                <ClipboardList className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">RMA 申請列表</h3>
                <p className="text-sm text-muted-foreground">查看與管理所有申請</p>
              </div>
            </div>
          </Link>

          {/* 後勤管理 */}
          <Link to="/admin/logistics" className="rma-card hover:shadow-lg transition-shadow cursor-pointer">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                <Package className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">後勤管理</h3>
                <p className="text-sm text-muted-foreground"><p className="text-sm text-muted-foreground">收件處理、客戶聯繫、保固服務追蹤</p></p>
              </div>
            </div>
          </Link>

          {/* Email 知識庫 */}
          <Link to="/admin/email-knowledge" className="rma-card hover:shadow-lg transition-shadow cursor-pointer">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                <Mail className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">客戶回覆及知識庫</h3>
                <p className="text-sm text-muted-foreground">FAQ、客服範本、AI 對話查詢</p>
              </div>
            </div>
          </Link>

          {/* 系統設定 */}
          <Link to="/admin/settings" className="rma-card hover:shadow-lg transition-shadow cursor-pointer">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                <Settings className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">系統設定</h3>
                <p className="text-sm text-muted-foreground">管理系統配置與權限</p>
              </div>
            </div>
          </Link>
        </div>

        {/* Stats Section */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rma-card text-center">
            <p className="text-3xl font-bold text-primary">{stats.pending}</p>
            <p className="text-sm text-muted-foreground mt-1">待處理申請</p>
          </div>
          <div className="rma-card text-center">
            <p className="text-3xl font-bold text-primary">{stats.processing}</p>
            <p className="text-sm text-muted-foreground mt-1">處理中</p>
          </div>
          <div className="rma-card text-center">
            <p className="text-3xl font-bold text-primary">{stats.completed}</p>
            <p className="text-sm text-muted-foreground mt-1">已完成</p>
          </div>
          <div className="rma-card text-center">
            <p className="text-3xl font-bold text-primary">{stats.thisMonth}</p>
            <p className="text-sm text-muted-foreground mt-1">本月總數</p>
          </div>
        </div>

        {/* Embedding Manager & AI Analysis */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <EmbeddingManager />
          <div className="lg:col-span-1">
            <AiAnalysisChat />
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
