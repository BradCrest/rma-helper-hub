/**
 * RmaForm 整合測試（MSW 版）
 *
 * 與 RmaForm.test.tsx 的差異：
 *   - 不 mock @/integrations/supabase/client
 *   - 真實的 Supabase JS client 執行，fetch 由 MSW 在 Node 層攔截
 *   - 測試整個 HTTP 請求/回應流程，而非只測試 React 狀態
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { server } from "../../mocks/server";
import { submitRmaErrorHandler } from "../../mocks/handlers";
import RmaForm from "./RmaForm";

// ── 僅 mock 路由和 toast，supabase client 使用真實版本 ──────────────────────

const { mockNavigate, mockToastError } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));

global.URL.createObjectURL = vi.fn(() => "blob:mock");

// ── Helper ─────────────────────────────────────────────────────────────────

function renderForm() {
  const utils = render(
    <MemoryRouter>
      <RmaForm />
    </MemoryRouter>
  );
  const form = utils.container.querySelector("form")!;
  const clickAgree = () => {
    // 條款文字已拆成連結，改用連結文字定位 label
    const label = screen.getByText(/服務條款/).closest("label")!;
    fireEvent.click(label.querySelector("div")!);
  };
  return { ...utils, form, clickAgree };
}

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  form: HTMLFormElement,
  clickAgree: () => void
) {
  clickAgree();
  await user.type(screen.getByPlaceholderText("請輸入客戶姓名 / Enter customer name"), "王小明");
  await user.type(screen.getByPlaceholderText("請輸入電子郵件 / Enter email address"), "test@example.com");
  await user.type(screen.getByPlaceholderText("請輸入客戶電話 / Enter customer phone"), "0912345678");
  await user.selectOptions(screen.getByRole("combobox"), "螢幕問題");
  await user.type(screen.getByPlaceholderText("請詳細描述問題..."), "螢幕出現黑點");
  fireEvent.submit(form);
}

// ── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RmaForm 整合測試 — 成功流程", () => {
  it("提交後應導向確認頁（RMA 號碼來自 MSW 回應）", async () => {
    const user = userEvent.setup();
    const { form, clickAgree } = renderForm();
    await fillAndSubmit(user, form, clickAgree);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        "/rma-confirmation?rma=RMA-TEST-001"
      );
    });
  });

  it("提交時應帶正確的客戶資料到 Edge Function", async () => {
    const user = userEvent.setup();
    // 用自訂 handler 捕捉請求內容
    let capturedBody: unknown;
    server.use(
      (await import("msw")).http.post(
        "https://xrbvyfoewbwywrwocrpf.supabase.co/functions/v1/submit-rma",
        async ({ request }) => {
          capturedBody = await request.json();
          return (await import("msw")).HttpResponse.json({ rma_number: "RMA-TEST-001" });
        }
      )
    );

    const { form, clickAgree } = renderForm();
    await fillAndSubmit(user, form, clickAgree);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());

    expect(capturedBody).toMatchObject({
      customer_name: "王小明",
      customer_email: "test@example.com",
      customer_phone: "0912345678",
      issue_type: "螢幕問題",
    });
  });

  it("問題描述應包含寄件人身分前綴", async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> = {};
    server.use(
      (await import("msw")).http.post(
        "https://xrbvyfoewbwywrwocrpf.supabase.co/functions/v1/submit-rma",
        async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return (await import("msw")).HttpResponse.json({ rma_number: "RMA-TEST-001" });
        }
      )
    );

    const { form, clickAgree } = renderForm();
    await fillAndSubmit(user, form, clickAgree);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    expect(capturedBody.issue_description as string).toContain("[一般消費者]");
  });
});

describe("RmaForm 整合測試 — 錯誤處理", () => {
  it("Edge Function 回傳 500 時應顯示失敗 toast", async () => {
    // 用錯誤 handler 覆蓋預設 handler
    server.use(submitRmaErrorHandler);

    const user = userEvent.setup();
    const { form, clickAgree } = renderForm();
    await fillAndSubmit(user, form, clickAgree);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("提交失敗，請稍後再試");
    });
  });

  it("API 錯誤後不應導向確認頁", async () => {
    server.use(submitRmaErrorHandler);

    const user = userEvent.setup();
    const { form, clickAgree } = renderForm();
    await fillAndSubmit(user, form, clickAgree);

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe("RmaForm 整合測試 — 序號欄位", () => {
  it("序號欄位有填值時應帶進請求", async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> = {};
    server.use(
      (await import("msw")).http.post(
        "https://xrbvyfoewbwywrwocrpf.supabase.co/functions/v1/submit-rma",
        async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return (await import("msw")).HttpResponse.json({ rma_number: "RMA-TEST-001" });
        }
      )
    );

    const { form, clickAgree } = renderForm();
    clickAgree();
    await user.type(screen.getByPlaceholderText("請輸入客戶姓名 / Enter customer name"), "王小明");
    await user.type(screen.getByPlaceholderText("請輸入電子郵件 / Enter email address"), "test@example.com");
    await user.type(screen.getByPlaceholderText("請輸入客戶電話 / Enter customer phone"), "0912345678");
    await user.type(screen.getByPlaceholderText("請輸入產品序號 / Enter serial number"), "CREST-ABC123");
    await user.selectOptions(screen.getByRole("combobox"), "螢幕問題");
    await user.type(screen.getByPlaceholderText("請詳細描述問題..."), "螢幕出現黑點");
    fireEvent.submit(form);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    expect(capturedBody.serial_number).toBe("CREST-ABC123");
  });

  it("序號欄位空白時 serial_number 應為 null", async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> = {};
    server.use(
      (await import("msw")).http.post(
        "https://xrbvyfoewbwywrwocrpf.supabase.co/functions/v1/submit-rma",
        async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return (await import("msw")).HttpResponse.json({ rma_number: "RMA-TEST-001" });
        }
      )
    );

    const { form, clickAgree } = renderForm();
    await fillAndSubmit(user, form, clickAgree);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    expect(capturedBody.serial_number).toBeNull();
  });
});
