

## 在首頁 Hero 區域右側新增收件地址資訊框

### 分析

從截圖可以看到，Hero 區域右側有一個帶邊框的空白區塊，需要在此放置收件地址資訊。

### 修改內容

**檔案：`src/pages/Index.tsx`（第 14-28 行）**

將 Hero Section 的內容改為左右兩欄佈局：

- **左欄**：保留現有的 Logo、標題、TabNavigation
- **右欄**：新增帶邊框的地址資訊框，內容包含：
  - 提醒文字：「為避免影響您的保修時程，請將產品正確寄至以下地址。」
  - 中文地址：「本公司收件地址如下：242039 新北市新莊區化成路11巷86號1樓」
  - 英文地址：「No. 86, Ln. 11, Huacheng Rd., Xinzhuang Dist., New Taipei City, Taiwan, 242039」

```tsx
<section className="py-8 md:py-12 border-b border-border bg-card">
  <div className="container mx-auto px-4">
    <div className="flex flex-col md:flex-row gap-8 items-start">
      {/* 左欄 - 現有內容 */}
      <div className="flex-1">
        <div className="mb-4">
          <img src={logo} alt="CREST Logo" className="h-12 md:h-16 w-auto" />
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-6">
          CREST 產品申請報修系統
        </h2>
        <TabNavigation />
      </div>

      {/* 右欄 - 收件地址資訊 */}
      <div className="w-full md:w-[420px] border-2 border-foreground rounded-lg p-6">
        <p className="text-sm text-foreground mb-4">
          為避免影響您的保修時程，請將產品正確寄至以下地址。
        </p>
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground">本公司收件地址如下：</p>
            <p className="text-sm text-foreground">
              242039 新北市新莊區化成路11巷86號1樓
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">英文地址：</p>
            <p className="text-sm text-muted-foreground">
              No. 86, Ln. 11, Huacheng Rd., Xinzhuang Dist., New Taipei City, Taiwan, 242039
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
```

### 預期結果

- 桌面版：左側顯示 Logo/標題/導航，右側顯示帶黑色邊框的地址框（與截圖一致）
- 手機版：兩欄垂直堆疊，地址框顯示在導航按鈕下方

