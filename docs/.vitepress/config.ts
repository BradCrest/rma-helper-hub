import { defineConfig } from "vitepress";

export default defineConfig({
  title: "CREST RMA 管理員手冊",
  description: "CREST 潛水電腦錶 RMA 保固管理系統 — 管理員完整操作指南",
  lang: "zh-TW",
  base: "/rma-helper-hub/",

  head: [
    ["link", { rel: "icon", href: "/rma-helper-hub/favicon.ico" }],
    ["meta", { name: "theme-color", content: "#1d4ed8" }],
  ],

  themeConfig: {
    logo: "/logo.png",
    siteTitle: "CREST RMA 管理員手冊",

    nav: [
      { text: "快速入門", link: "/guide/getting-started" },
      { text: "RMA 管理", link: "/rma/overview" },
      { text: "物流作業", link: "/logistics/overview" },
      { text: "後台工具", link: "/admin/knowledge-base" },
      { text: "參考資料", link: "/reference/status-codes" },
    ],

    sidebar: [
      {
        text: "🚀 快速入門",
        items: [
          { text: "系統簡介", link: "/guide/getting-started" },
          { text: "首次登入", link: "/guide/first-login" },
          { text: "Dashboard 總覽", link: "/guide/dashboard" },
        ],
      },
      {
        text: "📋 RMA 管理",
        items: [
          { text: "RMA 是什麼？", link: "/rma/overview" },
          { text: "完整生命週期", link: "/rma/lifecycle" },
          { text: "保固政策與判斷", link: "/rma/warranty" },
          { text: "搜尋與篩選", link: "/rma/search-and-filter" },
        ],
      },
      {
        text: "🚚 物流作業",
        collapsed: false,
        items: [
          { text: "物流總覽", link: "/logistics/overview" },
          { text: "① 收件處理", link: "/logistics/receiving" },
          { text: "② 故障登記", link: "/logistics/damage-registration" },
          { text: "③ 待客戶確認", link: "/logistics/awaiting-confirmation" },
          { text: "④ 付款確認", link: "/logistics/payment-confirmation" },
          { text: "⑤ 出貨處理", link: "/logistics/outbound-shipping" },
          { text: "⑥ 結案追蹤", link: "/logistics/case-closing" },
          { text: "⑦ 客戶關懷", link: "/logistics/customer-care" },
          { text: "⑧ 供應商維修", link: "/logistics/supplier-repair" },
          { text: "⑨ 銷貨匯入", link: "/logistics/sales-import" },
          { text: "⑩ 保固審核", link: "/logistics/warranty-review" },
        ],
      },
      {
        text: "📧 Email 系統",
        items: [
          { text: "Email 佇列運作", link: "/email/overview" },
          { text: "信件模板說明", link: "/email/templates" },
        ],
      },
      {
        text: "⚙️ 後台工具",
        items: [
          { text: "知識庫 & 客戶回覆", link: "/admin/knowledge-base" },
          { text: "系統設定", link: "/admin/settings" },
          { text: "CSV 批次匯入", link: "/admin/csv-import" },
          { text: "使用者管理", link: "/admin/user-management" },
        ],
      },
      {
        text: "📖 參考資料",
        items: [
          { text: "狀態碼一覽", link: "/reference/status-codes" },
          { text: "常見問題 FAQ", link: "/reference/faq" },
        ],
      },
    ],

    socialLinks: [
      { icon: "github", link: "https://github.com/BradCrest/rma-helper-hub" },
    ],

    footer: {
      message: "CREST Diving Computers — RMA Management System",
      copyright: "© 2025 CREST. Internal use only.",
    },

    search: {
      provider: "local",
    },

    editLink: {
      pattern:
        "https://github.com/BradCrest/rma-helper-hub/edit/main/docs/:path",
      text: "在 GitHub 上編輯此頁",
    },

    lastUpdated: {
      text: "最後更新",
    },

    outline: {
      label: "本頁目錄",
      level: [2, 3],
    },

    docFooter: {
      prev: "上一頁",
      next: "下一頁",
    },

    returnToTopLabel: "回到頂部",
    sidebarMenuLabel: "選單",
    darkModeSwitchLabel: "深色模式",
  },

  markdown: {
    lineNumbers: true,
  },
});
