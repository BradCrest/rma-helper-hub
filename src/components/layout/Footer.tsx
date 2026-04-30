import { Link } from "react-router-dom";

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="py-8 border-t border-border bg-card">
      <div className="container mx-auto px-4 text-center space-y-2">
        <p className="text-muted-foreground text-sm">
          © {currentYear} CREST 產品申請保固服務系統
        </p>
        <div className="flex items-center justify-center gap-3 text-xs">
          <Link to="/terms" className="text-muted-foreground hover:text-primary transition-colors">
            服務條款
          </Link>
          <span className="text-muted-foreground/50">|</span>
          <Link to="/privacy" className="text-muted-foreground hover:text-primary transition-colors">
            隱私政策
          </Link>
        </div>
        <p className="text-muted-foreground text-xs">v1.2.0</p>
      </div>
    </footer>
  );
};

export default Footer;
