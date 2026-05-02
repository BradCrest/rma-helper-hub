# 修正 AdminDashboard 統計數字

## 變更內容（`src/pages/AdminDashboard.tsx`，第 18–73 行）

合併兩輪 fetch 為單一 `Promise.all`，全部使用 `count: exact, head: true`，並修正「已完成」分類：

```tsx
useEffect(() => {
  const fetchStats = async () => {
    try {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const [p, pr, c, m] = await Promise.all([
        supabase
          .from("rma_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "registered"),
        supabase
          .from("rma_requests")
          .select("id", { count: "exact", head: true })
          .in("status", ["shipped", "received", "inspecting", "contacting", "quote_confirmed", "paid"]),
        supabase
          .from("rma_requests")
          .select("id", { count: "exact", head: true })
          .in("status", ["closed", "shipped_back_new", "shipped_back_refurbished", "shipped_back_original", "shipped_back", "follow_up"]),
        supabase
          .from("rma_requests")
          .select("id", { count: "exact", head: true })
          .gte("created_at", startOfMonth.toISOString()),
      ]);

      setStats({
        pending: p.count || 0,
        processing: pr.count || 0,
        completed: c.count || 0,
        thisMonth: m.count || 0,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  fetchStats();
}, []);
```

## 修正項目對照

1. **處理中**：原本陣列已不含 `repairing`（先前 cleanup 已處理），維持移除狀態。
2. **已完成**：從只計 `closed` 擴大為 `closed` / `shipped_back_new` / `shipped_back_refurbished` / `shipped_back_original` / `shipped_back` / `follow_up`，正確涵蓋已出貨的案件。
3. **效能**：移除第二輪 `.select("id")` + `.length` 的重複 fetch，將四個查詢合併為單一 `Promise.all`，全部用 `count: exact, head: true`（不傳輸 row 資料）。
4. **本月新增（thisMonth）**：一併納入同一個 `Promise.all`，避免序列等待。

## 不變更

- UI 卡片、版面、其他 stats key 全保留。
- 重新 fetch 的觸發時機（mount 一次）不變。
