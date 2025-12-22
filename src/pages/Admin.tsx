import { useState } from "react";
import { Link } from "react-router-dom";
import { LogIn } from "lucide-react";
import { toast } from "sonner";

const Admin = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("請填寫完整的登入資訊");
      return;
    }
    toast.info("正在登入...");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="rma-card animate-fade-in">
          {/* Title */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-foreground mb-2">
              RMA 管理系統
            </h1>
            <p className="text-muted-foreground">請輸入您的管理員帳號密碼</p>
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
              />
            </div>

            <button
              type="submit"
              className="w-full rma-btn-primary py-4 text-base mt-6"
            >
              <LogIn className="w-5 h-5" />
              登入管理系統
            </button>
          </form>

          {/* Back Link */}
          <div className="text-center mt-6">
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
