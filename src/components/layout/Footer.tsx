const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="py-8 border-t border-border bg-card">
      <div className="container mx-auto px-4 text-center">
        <p className="text-muted-foreground text-sm">
          © {currentYear} © {currentYear} CREST 產品申請保固服務系統
        </p>
        <p className="text-muted-foreground text-xs mt-1">v1.2.0</p>
      </div>
    </footer>
  );
};

export default Footer;
