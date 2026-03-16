

## 首頁載入時顯示通知彈窗

### 修改檔案：`src/pages/Index.tsx`

在首頁元件中加入一個 `AlertDialog`，預設為開啟狀態（`defaultOpen`），顯示醒目的通知訊息，只有一個「確定」按鈕可關閉。

### 具體實作

1. 引入 `AlertDialog` 相關元件和 `useState`
2. 使用 `useState` 控制彈窗開關，初始值為 `true`
3. 彈窗內容以醒目樣式（黃色/橘色警示背景 + 大字）呈現中英文通知
4. 只有一個「確定」按鈕，點擊後關閉彈窗

```tsx
// 新增 imports
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { AlertTriangle } from "lucide-react";

// 在 Index 元件內
const [showNotice, setShowNotice] = useState(true);

// JSX 中加入
<AlertDialog open={showNotice} onOpenChange={setShowNotice}>
  <AlertDialogContent className="max-w-md">
    <AlertDialogHeader>
      <div className="flex justify-center mb-4">
        <AlertTriangle className="h-12 w-12 text-amber-500" />
      </div>
      <AlertDialogTitle className="text-center text-xl">
        重要通知 / Important Notice
      </AlertDialogTitle>
      <AlertDialogDescription asChild>
        <div className="mt-4 space-y-4">
          <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded">
            <p className="text-base text-amber-900 font-medium">
              因應相關資源及人力安排因素，目前暫不支援親送遞交維修件，敬請安排寄送，以免影響後續維修進度，謝謝您。
            </p>
          </div>
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
            <p className="text-base text-blue-900 font-medium">
              Due to manpower constraints, we are currently unable to accept in-person deliveries. Please arrange shipment via courier service instead. Thank you.
            </p>
          </div>
        </div>
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter className="mt-4 sm:justify-center">
      <AlertDialogAction className="px-8">確定</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### 預期結果

- 使用者進入首頁時立即看到醒目的通知彈窗
- 中文訊息以琥珀色底色呈現，英文訊息以藍色底色呈現
- 頂部有三角警示圖示增加醒目度
- 點擊「確定」按鈕後關閉彈窗，正常使用首頁

