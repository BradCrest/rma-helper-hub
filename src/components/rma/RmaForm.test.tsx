import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import RmaForm from "./RmaForm";

// ── Mocks ──────────────────────────────────────────────────────────────────
// vi.mock 會被 hoisted，factory 內不能直接引用外部變數，需用 vi.hoisted

const { mockNavigate, mockInvoke, mockToastError, mockToastInfo } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockInvoke: vi.fn(),
  mockToastError: vi.fn(),
  mockToastInfo: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://example.com/photo.jpg" } }),
      }),
    },
    functions: { invoke: mockInvoke },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    info: (...args: unknown[]) => mockToastInfo(...args),
  },
}));

global.URL.createObjectURL = vi.fn(() => "blob:mock");

// ── Helper ─────────────────────────────────────────────────────────────────

function renderForm() {
  const utils = render(
    <MemoryRouter>
      <RmaForm />
    </MemoryRouter>
  );
  // jsdom 的原生 required 驗證會攔截 button click，改用 fireEvent.submit 直接測試 JS 驗證邏輯
  const form = utils.container.querySelector("form")!;
  // 同意 checkbox 是 <div onClick>，需打到 div 本身而非外層 label
  const clickAgree = () => {
    // 條款文字已拆成連結，改用連結文字定位 label
    const label = screen.getByText(/服務條款/).closest("label")!;
    const div = label.querySelector("div")!;
    fireEvent.click(div);
  };
  return { ...utils, form, clickAgree };
}

// ── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RmaForm 渲染", () => {
  it("應顯示表單標題", () => {
    renderForm();
    expect(screen.getByText("建立新的 RMA")).toBeInTheDocument();
  });

  it("應顯示四個寄件人身分選項", () => {
    renderForm();
    expect(screen.getByLabelText("一般消費者")).toBeInTheDocument();
    expect(screen.getByLabelText("經銷商")).toBeInTheDocument();
    expect(screen.getByLabelText("代理商")).toBeInTheDocument();
    expect(screen.getByLabelText("經銷/代理商多筆")).toBeInTheDocument();
  });

  it("預設選取「一般消費者」", () => {
    renderForm();
    expect(screen.getByLabelText<HTMLInputElement>("一般消費者").checked).toBe(true);
  });

  it("應顯示必填欄位（姓名、Email、電話、問題描述）", () => {
    renderForm();
    expect(screen.getByPlaceholderText("請輸入客戶姓名 / Enter customer name")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("請輸入電子郵件 / Enter email address")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("請輸入客戶電話 / Enter customer phone")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("請詳細描述問題... / Please describe the issue in detail...")).toBeInTheDocument();
  });

  it("應顯示提交按鈕「建立RMA」", () => {
    renderForm();
    expect(screen.getByRole("button", { name: /建立RMA/ })).toBeInTheDocument();
  });

  it("故障問題 select 應包含所有問題類型", () => {
    renderForm();
    expect(screen.getByRole("option", { name: "螢幕問題" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "電池問題" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "其他" })).toBeInTheDocument();
  });
});

describe("RmaForm 驗證 — 未填必填欄位", () => {
  it("未同意條款時應顯示 toast 錯誤", () => {
    const { form } = renderForm();
    // 使用 fireEvent.submit 繞過 jsdom 原生 required 驗證，直接測試 JS 邏輯
    fireEvent.submit(form);
    expect(mockToastError).toHaveBeenCalledWith("請先同意服務條款和隱私政策");
  });

  it("同意條款但未填姓名時應顯示錯誤", () => {
    const { form, clickAgree } = renderForm();
    clickAgree();
    fireEvent.submit(form);
    expect(mockToastError).toHaveBeenCalledWith("請輸入客戶姓名 / Please enter customer name");
  });

  it("填姓名但未填 Email 時應顯示錯誤", async () => {
    const user = userEvent.setup();
    const { form, clickAgree } = renderForm();
    clickAgree();
    await user.type(screen.getByPlaceholderText("請輸入客戶姓名 / Enter customer name"), "王小明");
    fireEvent.submit(form);
    expect(mockToastError).toHaveBeenCalledWith("請輸入電子郵件 / Please enter email address");
  });

  it("填 Email 但未填電話時應顯示錯誤", async () => {
    const user = userEvent.setup();
    const { form, clickAgree } = renderForm();
    clickAgree();
    await user.type(screen.getByPlaceholderText("請輸入客戶姓名 / Enter customer name"), "王小明");
    await user.type(screen.getByPlaceholderText("請輸入電子郵件 / Enter email address"), "test@example.com");
    fireEvent.submit(form);
    expect(mockToastError).toHaveBeenCalledWith("請輸入客戶電話 / Please enter customer phone");
  });

  it("未選故障問題時應顯示錯誤", async () => {
    const user = userEvent.setup();
    const { form, clickAgree } = renderForm();
    clickAgree();
    await user.type(screen.getByPlaceholderText("請輸入客戶姓名 / Enter customer name"), "王小明");
    await user.type(screen.getByPlaceholderText("請輸入電子郵件 / Enter email address"), "test@example.com");
    await user.type(screen.getByPlaceholderText("請輸入客戶電話 / Enter customer phone"), "0912345678");
    fireEvent.submit(form);
    expect(mockToastError).toHaveBeenCalledWith("請選擇故障問題");
  });

  it("未填問題描述時應顯示錯誤", async () => {
    const user = userEvent.setup();
    const { form, clickAgree } = renderForm();
    clickAgree();
    await user.type(screen.getByPlaceholderText("請輸入客戶姓名 / Enter customer name"), "王小明");
    await user.type(screen.getByPlaceholderText("請輸入電子郵件 / Enter email address"), "test@example.com");
    await user.type(screen.getByPlaceholderText("請輸入客戶電話 / Enter customer phone"), "0912345678");
    await user.selectOptions(screen.getByRole("combobox"), "螢幕問題");
    fireEvent.submit(form);
    expect(mockToastError).toHaveBeenCalledWith("請描述問題");
  });
});

describe("RmaForm — 序號驗證 Dialog", () => {
  it("輸入 EN13319 後 blur 應清空欄位並顯示警告 Dialog", async () => {
    const user = userEvent.setup();
    renderForm();
    const serialInput = screen.getByPlaceholderText("請輸入產品序號 / Enter serial number");
    await user.type(serialInput, "EN13319");
    fireEvent.blur(serialInput);
    expect(serialInput).toHaveValue("");
    expect(screen.getByText("這不是產品序號")).toBeInTheDocument();
  });

  it("輸入 CCA 開頭序號後 blur 應顯示警告 Dialog", async () => {
    const user = userEvent.setup();
    renderForm();
    const serialInput = screen.getByPlaceholderText("請輸入產品序號 / Enter serial number");
    await user.type(serialInput, "CCA-1234567890");
    fireEvent.blur(serialInput);
    expect(screen.getByText("這不是產品序號")).toBeInTheDocument();
  });

  it("正常序號 blur 後不應出現 Dialog", async () => {
    const user = userEvent.setup();
    renderForm();
    const serialInput = screen.getByPlaceholderText("請輸入產品序號 / Enter serial number");
    await user.type(serialInput, "CREST-ABC123");
    fireEvent.blur(serialInput);
    expect(screen.queryByText("這不是產品序號")).not.toBeInTheDocument();
  });
});

describe("RmaForm — 寄件人身分切換", () => {
  it("切換到「經銷/代理商多筆」後按鈕文字應變為「預覽」", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByLabelText("經銷/代理商多筆"));
    expect(screen.getByRole("button", { name: /預覽/ })).toBeInTheDocument();
  });

  it("切換到「經銷/代理商多筆」後單筆「故障問題 *」label 應消失", async () => {
    const user = userEvent.setup();
    renderForm();
    // 單筆模式有「故障問題 *」（含星號），MultiProductForm 只有「故障問題」（無星號）
    expect(screen.getByText("故障問題 / Issue Type *")).toBeInTheDocument();
    await user.click(screen.getByLabelText("經銷/代理商多筆"));
    expect(screen.queryByText("故障問題 / Issue Type *")).not.toBeInTheDocument();
  });

  it("切換到「經銷/代理商多筆」後單筆故障問題 select 應消失", async () => {
    const user = userEvent.setup();
    renderForm();
    // 單筆模式的原生 <select> 有 <option>選擇故障問題</option>
    expect(screen.getByRole("option", { name: "選擇故障問題" })).toBeInTheDocument();
    await user.click(screen.getByLabelText("經銷/代理商多筆"));
    expect(screen.queryByRole("option", { name: "選擇故障問題" })).not.toBeInTheDocument();
  });

  it("切換回「一般消費者」後問題描述欄位應重新出現", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByLabelText("經銷/代理商多筆"));
    await user.click(screen.getByLabelText("一般消費者"));
    expect(screen.getByPlaceholderText("請詳細描述問題... / Please describe the issue in detail...")).toBeInTheDocument();
  });
});

describe("RmaForm — 成功提交", () => {
  it("填齊所有必填欄位後應呼叫 supabase functions.invoke", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({
      data: { rma_number: "RMA-2024-001" },
      error: null,
    });

    const { form, clickAgree } = renderForm();
    clickAgree();
    await user.type(screen.getByPlaceholderText("請輸入客戶姓名 / Enter customer name"), "王小明");
    await user.type(screen.getByPlaceholderText("請輸入電子郵件 / Enter email address"), "test@example.com");
    await user.type(screen.getByPlaceholderText("請輸入客戶電話 / Enter customer phone"), "0912345678");
    await user.selectOptions(screen.getByRole("combobox"), "螢幕問題");
    await user.type(screen.getByPlaceholderText("請詳細描述問題... / Please describe the issue in detail..."), "螢幕出現黑點");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "submit-rma",
        expect.objectContaining({
          body: expect.objectContaining({
            customer_name: "王小明",
            customer_email: "test@example.com",
            customer_phone: "0912345678",
          }),
        })
      );
    });
  });

  it("提交成功後應導向確認頁", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({
      data: { rma_number: "RMA-2024-001" },
      error: null,
    });

    const { form, clickAgree } = renderForm();
    clickAgree();
    await user.type(screen.getByPlaceholderText("請輸入客戶姓名 / Enter customer name"), "王小明");
    await user.type(screen.getByPlaceholderText("請輸入電子郵件 / Enter email address"), "test@example.com");
    await user.type(screen.getByPlaceholderText("請輸入客戶電話 / Enter customer phone"), "0912345678");
    await user.selectOptions(screen.getByRole("combobox"), "螢幕問題");
    await user.type(screen.getByPlaceholderText("請詳細描述問題... / Please describe the issue in detail..."), "螢幕出現黑點");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/rma-confirmation?rma=RMA-2024-001");
    });
  });

  it("API 回傳錯誤時應顯示失敗 toast", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: new Error("Server error"),
    });

    const { form, clickAgree } = renderForm();
    clickAgree();
    await user.type(screen.getByPlaceholderText("請輸入客戶姓名 / Enter customer name"), "王小明");
    await user.type(screen.getByPlaceholderText("請輸入電子郵件 / Enter email address"), "test@example.com");
    await user.type(screen.getByPlaceholderText("請輸入客戶電話 / Enter customer phone"), "0912345678");
    await user.selectOptions(screen.getByRole("combobox"), "螢幕問題");
    await user.type(screen.getByPlaceholderText("請詳細描述問題... / Please describe the issue in detail..."), "螢幕出現黑點");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("提交失敗，請稍後再試");
    });
  });
});
