import { Link, useLocation } from "react-router-dom";
import { ChevronRight } from "lucide-react";

const Header = () => {
  const location = useLocation();
  const isHomePage = location.pathname === "/";

  return (
    <header className="sticky top-0 z-50 bg-card border-b border-border">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {!isHomePage && (
            <Link
              to="/"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← 返回首頁 / Home
            </Link>
          )}
          {isHomePage && (
            <span className="text-sm text-muted-foreground">中文 / English</span>
          )}
        </div>

        {!isHomePage && (
          <div className="flex items-center gap-3">
            <span className="font-semibold text-foreground">RMA 狀態追蹤 / Status Tracking</span>
          </div>
        )}

        <Link
          to="/admin"
          className="inline-flex items-center gap-1 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
        >
          進入管理系統 / Admin
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </header>
  );
};

export default Header;
