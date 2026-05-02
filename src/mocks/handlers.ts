import { http, HttpResponse } from "msw";

const SUPABASE_URL = "https://xrbvyfoewbwywrwocrpf.supabase.co";

// ── Edge Functions ─────────────────────────────────────────────────────────

export const handlers = [
  // submit-rma：單筆或批量提交，回傳 RMA 號碼
  http.post(`${SUPABASE_URL}/functions/v1/submit-rma`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    // 批量提交（body.products 是陣列）
    if (Array.isArray(body.products)) {
      const results = (body.products as unknown[]).map((_, i) => ({
        rma_number: `RMA-TEST-00${i + 1}`,
        product_model: "TERIC",
        serial_number: `SN${i + 1}`,
      }));
      return HttpResponse.json({ results });
    }
    // 單筆提交
    return HttpResponse.json({ rma_number: "RMA-TEST-001" });
  }),

  // Storage 上傳照片
  http.post(
    `${SUPABASE_URL}/storage/v1/object/rma-photos/:path`,
    () => HttpResponse.json({ Key: "rma-photos/test.jpg" })
  ),

  // Storage 取得公開 URL（Supabase JS 直接組字串，不會實際 fetch，保留以防萬一）
  http.get(
    `${SUPABASE_URL}/storage/v1/object/public/rma-photos/:path`,
    () => HttpResponse.json({})
  ),

  // Supabase Auth token refresh（client 初始化時可能觸發）
  http.post(`${SUPABASE_URL}/auth/v1/token`, () =>
    HttpResponse.json({ access_token: "mock-token", token_type: "bearer" })
  ),

  // update-rma-status
  http.post(`${SUPABASE_URL}/functions/v1/update-rma-status`, () =>
    HttpResponse.json({ success: true })
  ),

  // submit-outbound-shipping
  http.post(`${SUPABASE_URL}/functions/v1/submit-outbound-shipping`, () =>
    HttpResponse.json({ success: true, message: "回寄資訊已成功提交" })
  ),
];

// ── 錯誤情境用的 override handlers ────────────────────────────────────────

export const submitRmaErrorHandler = http.post(
  `${SUPABASE_URL}/functions/v1/submit-rma`,
  () => HttpResponse.json({ error: "Internal server error" }, { status: 500 })
);
