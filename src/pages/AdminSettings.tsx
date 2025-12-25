import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { 
  ChevronLeft, 
  Home, 
  LogOut, 
  UserPlus, 
  Trash2, 
  RefreshCw,
  Shield,
  Loader2,
  AlertCircle,
  Clock,
  Check,
  X,
  Crown
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Admin {
  id: string;
  user_id: string;
  email: string;
  role: string;
  created_at: string;
}

interface PendingRegistration {
  id: string;
  user_id: string;
  email: string;
  requested_at: string;
  status: string;
}

const AdminSettings = () => {
  const { user, signOut, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [pendingRegistrations, setPendingRegistrations] = useState<PendingRegistration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPendingLoading, setIsPendingLoading] = useState(true);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchAdmins = async () => {
    setIsLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        toast.error("請先登入");
        return;
      }

      const { data, error } = await supabase.functions.invoke('list-admins', {
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`
        }
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      setAdmins(data.admins || []);
    } catch (error: any) {
      console.error("Error fetching admins:", error);
      toast.error("載入管理員列表失敗");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPendingRegistrations = async () => {
    setIsPendingLoading(true);
    try {
      const { data, error } = await supabase
        .from("pending_admin_registrations")
        .select("*")
        .eq("status", "pending")
        .order("requested_at", { ascending: false });

      if (error) throw error;
      setPendingRegistrations(data || []);
    } catch (error: any) {
      console.error("Error fetching pending registrations:", error);
    } finally {
      setIsPendingLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
    fetchPendingRegistrations();
  }, []);

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newAdminEmail.trim()) {
      toast.error("請輸入電子郵件");
      return;
    }

    setIsAdding(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        toast.error("請先登入");
        return;
      }

      // First, look up the user by email
      const { data: lookupData, error: lookupError } = await supabase.functions.invoke('lookup-user', {
        body: { email: newAdminEmail.trim() },
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`
        }
      });

      if (lookupError) throw lookupError;

      if (lookupData.error) {
        if (lookupData.error === 'User not found') {
          toast.error("找不到此電子郵件的用戶，請確認用戶已註冊");
        } else {
          throw new Error(lookupData.error);
        }
        return;
      }

      // Check if already an admin
      const existingAdmin = admins.find(a => a.user_id === lookupData.user_id);
      if (existingAdmin) {
        toast.error("此用戶已經是管理員");
        return;
      }

      // Add the admin role
      const { error: insertError } = await supabase
        .from('user_roles')
        .insert({
          user_id: lookupData.user_id,
          role: 'admin'
        });

      if (insertError) throw insertError;

      toast.success(`已將 ${lookupData.email} 新增為管理員`);
      setNewAdminEmail("");
      fetchAdmins();
    } catch (error: any) {
      console.error("Error adding admin:", error);
      toast.error("新增管理員失敗：" + (error.message || "請稍後再試"));
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveAdmin = async (admin: Admin) => {
    if (admin.role === 'super_admin') {
      toast.error("無法移除超級管理員");
      return;
    }

    if (!isSuperAdmin) {
      toast.error("只有超級管理員可以移除管理員");
      return;
    }

    setDeletingId(admin.id);
    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('id', admin.id);

      if (error) throw error;

      toast.success(`已移除 ${admin.email} 的管理員權限`);
      fetchAdmins();
    } catch (error: any) {
      console.error("Error removing admin:", error);
      toast.error("移除管理員失敗");
    } finally {
      setDeletingId(null);
    }
  };

  const handleApproveRegistration = async (registration: PendingRegistration) => {
    setProcessingId(registration.id);
    try {
      // Add the admin role
      const { error: insertError } = await supabase
        .from('user_roles')
        .insert({
          user_id: registration.user_id,
          role: 'admin'
        });

      if (insertError) throw insertError;

      // Update the pending registration status
      const { error: updateError } = await supabase
        .from('pending_admin_registrations')
        .update({
          status: 'approved',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', registration.id);

      if (updateError) throw updateError;

      toast.success(`已批准 ${registration.email} 為管理員`);
      fetchAdmins();
      fetchPendingRegistrations();
    } catch (error: any) {
      console.error("Error approving registration:", error);
      toast.error("批准失敗：" + (error.message || "請稍後再試"));
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectRegistration = async (registration: PendingRegistration) => {
    setProcessingId(registration.id);
    try {
      const { error } = await supabase
        .from('pending_admin_registrations')
        .update({
          status: 'rejected',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', registration.id);

      if (error) throw error;

      toast.success(`已拒絕 ${registration.email} 的管理員申請`);
      fetchPendingRegistrations();
    } catch (error: any) {
      console.error("Error rejecting registration:", error);
      toast.error("拒絕失敗");
    } finally {
      setProcessingId(null);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/admin");
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card shadow-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link to="/admin/dashboard" className="text-muted-foreground hover:text-foreground">
                <ChevronLeft className="w-5 h-5" />
              </Link>
              <h1 className="text-xl font-bold text-foreground">系統設定</h1>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">{user?.email}</span>
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

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Add Admin Form */}
        <div className="rma-card mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            新增管理員
          </h2>
          <form onSubmit={handleAddAdmin} className="flex gap-3">
            <input
              type="email"
              value={newAdminEmail}
              onChange={(e) => setNewAdminEmail(e.target.value)}
              placeholder="輸入用戶電子郵件"
              className="rma-input flex-1"
              disabled={isAdding}
            />
            <button
              type="submit"
              disabled={isAdding}
              className="rma-btn-primary px-6 disabled:opacity-50"
            >
              {isAdding ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  新增中...
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  新增
                </>
              )}
            </button>
          </form>
          <p className="text-sm text-muted-foreground mt-3 flex items-center gap-1">
            <AlertCircle className="w-4 h-4" />
            用戶必須先在管理登入頁面註冊帳號，才能被新增為管理員
          </p>
        </div>

        {/* Pending Registrations */}
        <div className="rma-card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Clock className="w-5 h-5" />
              待審核申請
              {pendingRegistrations.length > 0 && (
                <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {pendingRegistrations.length}
                </span>
              )}
            </h2>
            <button
              onClick={fetchPendingRegistrations}
              disabled={isPendingLoading}
              className="rma-btn-secondary text-sm"
            >
              <RefreshCw className={`w-4 h-4 ${isPendingLoading ? "animate-spin" : ""}`} />
              重新整理
            </button>
          </div>

          {isPendingLoading ? (
            <div className="text-center py-8">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
              <p className="text-muted-foreground mt-2 text-sm">載入中...</p>
            </div>
          ) : pendingRegistrations.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground text-sm">目前沒有待審核的申請</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingRegistrations.map((reg) => (
                <div
                  key={reg.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/50 flex items-center justify-center">
                      <UserPlus className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{reg.email}</p>
                      <p className="text-sm text-muted-foreground">
                        申請於 {formatDate(reg.requested_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleApproveRegistration(reg)}
                      disabled={processingId === reg.id}
                      className="flex items-center gap-1 px-3 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors text-sm font-medium"
                      title="批准"
                    >
                      {processingId === reg.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      批准
                    </button>
                    <button
                      onClick={() => handleRejectRegistration(reg)}
                      disabled={processingId === reg.id}
                      className="flex items-center gap-1 px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors text-sm font-medium"
                      title="拒絕"
                    >
                      <X className="w-4 h-4" />
                      拒絕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Admin List */}
        <div className="rma-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Shield className="w-5 h-5" />
              管理員列表
            </h2>
            <button
              onClick={fetchAdmins}
              disabled={isLoading}
              className="rma-btn-secondary text-sm"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
              重新整理
            </button>
          </div>

          {isLoading ? (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
              <p className="text-muted-foreground mt-2">載入中...</p>
            </div>
          ) : admins.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">尚無管理員</p>
            </div>
          ) : (
            <div className="space-y-3">
              {admins.map((admin) => (
                <div
                  key={admin.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/30"
                >
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      admin.role === 'super_admin' 
                        ? 'bg-yellow-500/20' 
                        : 'bg-primary/10'
                    }`}>
                      {admin.role === 'super_admin' ? (
                        <Crown className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                      ) : (
                        <Shield className="w-5 h-5 text-primary" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{admin.email}</p>
                      <p className="text-sm text-muted-foreground">
                        新增於 {formatDate(admin.created_at)}
                      </p>
                    </div>
                    {admin.role === 'super_admin' && (
                      <span className="text-xs bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 px-2 py-1 rounded-full font-medium">
                        超級管理員
                      </span>
                    )}
                    {admin.user_id === user?.id && (
                      <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                        您
                      </span>
                    )}
                  </div>
                  {isSuperAdmin && admin.role !== 'super_admin' && (
                    <button
                      onClick={() => handleRemoveAdmin(admin)}
                      disabled={deletingId === admin.id}
                      className="text-destructive hover:text-destructive/80 disabled:opacity-50 disabled:cursor-not-allowed p-2 rounded-lg hover:bg-destructive/10 transition-colors"
                      title="移除管理員"
                    >
                      {deletingId === admin.id ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Trash2 className="w-5 h-5" />
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default AdminSettings;
