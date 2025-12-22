import { Link, useLocation } from "react-router-dom";
import { ArrowRight, Search, Globe } from "lucide-react";

interface TabItem {
  id: string;
  label: string;
  path: string;
  icon: React.ReactNode;
  variant: "primary" | "secondary";
}

const tabs: TabItem[] = [
  {
    id: "submit",
    label: "送出RMA申請",
    path: "/",
    icon: <ArrowRight className="w-4 h-4" />,
    variant: "primary",
  },
  {
    id: "track",
    label: "狀態追蹤",
    path: "/track",
    icon: <Search className="w-4 h-4" />,
    variant: "secondary",
  },
  {
    id: "shipping",
    label: "新增寄件資訊",
    path: "/shipping",
    icon: <Globe className="w-4 h-4" />,
    variant: "secondary",
  },
];

const TabNavigation = () => {
  const location = useLocation();

  return (
    <div className="flex flex-wrap gap-3 mb-8">
      {tabs.map((tab) => {
        const isActive = location.pathname === tab.path;

        return (
          <Link
            key={tab.id}
            to={tab.path}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-all ${
              isActive || tab.variant === "primary"
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-card text-foreground border border-border hover:bg-secondary"
            }`}
          >
            {tab.label}
            {tab.icon}
          </Link>
        );
      })}
    </div>
  );
};

export default TabNavigation;
