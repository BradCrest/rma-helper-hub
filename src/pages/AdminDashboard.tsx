import { LogOut, Package, ClipboardList, Settings, Home } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate, Link } from "react-router-dom";

const AdminDashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

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
          <div className="rma-card hover:shadow-lg transition-shadow cursor-pointer">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                <ClipboardList className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">RMA 申請列表</h3>
                <p className="text-sm text-muted-foreground">查看與管理所有申請</p>
              </div>
            </div>
          </div>

          {/* 出貨管理 */}
          <div className="rma-card hover:shadow-lg transition-shadow cursor-pointer">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                <Package className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">出貨管理</h3>
                <p className="text-sm text-muted-foreground">處理寄件資訊與追蹤</p>
              </div>
            </div>
          </div>

          {/* 系統設定 */}
          <div className="rma-card hover:shadow-lg transition-shadow cursor-pointer">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                <Settings className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">系統設定</h3>
                <p className="text-sm text-muted-foreground">管理系統配置與權限</p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Section */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rma-card text-center">
            <p className="text-3xl font-bold text-primary">0</p>
            <p className="text-sm text-muted-foreground mt-1">待處理申請</p>
          </div>
          <div className="rma-card text-center">
            <p className="text-3xl font-bold text-primary">0</p>
            <p className="text-sm text-muted-foreground mt-1">處理中</p>
          </div>
          <div className="rma-card text-center">
            <p className="text-3xl font-bold text-primary">0</p>
            <p className="text-sm text-muted-foreground mt-1">已完成</p>
          </div>
          <div className="rma-card text-center">
            <p className="text-3xl font-bold text-primary">0</p>
            <p className="text-sm text-muted-foreground mt-1">本月總數</p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
