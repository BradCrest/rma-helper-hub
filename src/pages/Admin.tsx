import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogIn, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("請輸入有效的電子郵件"),
  password: z.string().min(6, "密碼至少需要 6 個字元"),
});

const Admin = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const { user, isAdmin, isLoading, signIn, signUp } = useAuth();
  const navigate = useNavigate();

  // Redirect if already logged in as admin
  useEffect(() => {
    if (!isLoading && user && isAdmin) {
      navigate("/admin/dashboard");
    }
  }, [user, isAdmin, isLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate input
    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return;
    }

    setIsSubmitting(true);

    try {
      if (isSignUp) {
        const { error, userId } = await signUp(email, password);

        if (error) {
          if (error.message.includes("already registered")) {
            toast.error("此信箱已註冊過");
          } else {
            toast.error("註冊失敗：" + error.message);
          }
          return;
        }

        toast.success("註冊成功！請聯繫系統管理員授權管理員權限", {
          description: `用戶 ID: ${userId}`,
          duration: 10000,
        });
        setIsSignUp(false);
      } else {
        const { error } = await signIn(email, password);

        if (error) {
          if (error.message.includes("Invalid login credentials")) {
            toast.error("帳號或密碼錯誤");
          } else {
            toast.error("登入失敗，請稍後再試");
          }
          return;
        }

        // Wait for admin check to complete
        setTimeout(() => {
          toast.success("登入成功");
        }, 500);
      }
    } catch (err) {
      toast.error("發生錯誤，請稍後再試");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="rma-card animate-fade-in">
          {/* Title */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-foreground mb-2">
              RMA 管理系統
            </h1>
            <p className="text-muted-foreground">
              {isSignUp ? "建立管理員帳號" : "請輸入您的管理員帳號密碼"}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="rma-label">電子郵件</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                className="rma-input"
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label className="rma-label">密碼</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder=""
                className="rma-input"
                disabled={isSubmitting}
              />
            </div>

            <button
              type="submit"
              className="w-full rma-btn-primary py-4 text-base mt-6"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : isSignUp ? (
                <UserPlus className="w-5 h-5" />
              ) : (
                <LogIn className="w-5 h-5" />
              )}
              {isSubmitting 
                ? (isSignUp ? "註冊中..." : "登入中...") 
                : (isSignUp ? "註冊帳號" : "登入管理系統")
              }
            </button>
          </form>

          {/* Toggle Sign Up / Sign In */}
          <div className="text-center mt-4">
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm text-primary hover:text-primary/80 transition-colors font-medium"
            >
              {isSignUp ? "已有帳號？登入" : "還沒有帳號？註冊"}
            </button>
          </div>

          {/* Back Link */}
          <div className="text-center mt-4">
            <Link
              to="/"
              className="text-sm text-foreground hover:text-primary transition-colors font-medium"
            >
              返回首頁
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Admin;
