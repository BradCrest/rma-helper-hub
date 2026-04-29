import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReceivingTab from "./ReceivingTab";

// ── Hoist mocks ────────────────────────────────────────────────────────────
const {
  mockFrom, mockInvoke,
  mockStorageUpload, mockStorageRemove, mockStorageFrom,
  mockToastSuccess, mockToastError,
} = vi.hoisted(() => {
  const mockStorageUpload = vi.fn().mockResolvedValue({ error: null });
  const mockStorageRemove = vi.fn().mockResolvedValue({ data: null, error: null });
  const mockStorageFrom = vi.fn().mockReturnValue({
    upload: mockStorageUpload,
    remove: mockStorageRemove,
  });
  return {
    mockFrom: vi.fn(),
    mockInvoke: vi.fn(),
    mockStorageUpload,
    mockStorageRemove,
    mockStorageFrom,
    mockToastSuccess: vi.fn(),
    mockToastError: vi.fn(),
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mockFrom,
    functions: { invoke: mockInvoke },
    storage: { from: mockStorageFrom },
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "mock-token" } },
        error: null,
      }),
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      }),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}));

// ── Fixtures ───────────────────────────────────────────────────────────────
const BASE_RMA = {
  id: "rma-001",
  rma_number: "RMA-2024-001",
  customer_name: "王小明",
  customer_email: "wang@example.com",
  product_name: "CR-4",
  product_model: "CR-4",
  serial_number: "SN12345",
  status: "inspecting",
  received_date: "2024-01-15",
  warranty_date: null,
  issue_type: "功能異常",
  issue_description: "顯示器不亮",
  initial_diagnosis: "電池接觸不良",
  diagnosis_category: "功能異常",
  created_at: "2024-01-15T00:00:00Z",
};

const BASE_REPAIR = {
  id: "detail-001",
  rma_request_id: "rma-001",
  planned_method: "repair",
  actual_method: "維修",
  internal_reference: null,
  estimated_cost: 1500,
  actual_cost: null,
  replacement_model: null,
  replacement_serial: null,
};

// ── Supabase mock factory ──────────────────────────────────────────────────
function setupSupabaseMock({
  rmaList = [BASE_RMA],
  repairDetail = BASE_REPAIR,
  rmaDetail = { initial_diagnosis: BASE_RMA.initial_diagnosis, diagnosis_category: BASE_RMA.diagnosis_category },
} = {}) {
  const mockInsert = vi.fn().mockResolvedValue({ error: null });
  const mockUpdateRma = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });

  mockFrom.mockImplementation((table: string) => {
    if (table === "rma_repair_details") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: repairDetail, error: null }),
          }),
        }),
        insert: mockInsert,
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      };
    }
    // rma_requests
    return {
      select: vi.fn().mockImplementation((fields: string) => {
        if (fields === "initial_diagnosis, diagnosis_category") {
          return {
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: rmaDetail, error: null }),
            }),
          };
        }
        return {
          order: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: rmaList, error: null }),
            eq: vi.fn().mockResolvedValue({ data: rmaList, error: null }),
          }),
        };
      }),
      update: mockUpdateRma,
    };
  });

  return { mockInsert, mockUpdateRma };
}

// ── Helper: open the detail dialog ────────────────────────────────────────
async function openDialog() {
  const viewBtn = await screen.findByRole("button", { name: /檢視/ });
  fireEvent.click(viewBtn);
  await screen.findByText(/收件處理 - RMA-2024-001/);
}

// ── Helper: open notify AlertDialog ───────────────────────────────────────
async function openNotifyDialog() {
  await openDialog();
  const notifyBtn = screen.getByRole("button", { name: /通知客戶診斷結果/ });
  fireEvent.click(notifyBtn);
  await screen.findByText("寄送診斷通知給客戶");
}

// ══════════════════════════════════════════════════════════════════════════
// Phase 1：基本欄位
// ══════════════════════════════════════════════════════════════════════════
describe("ReceivingTab - Phase 1 診斷欄位", () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockInvoke.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }));
  });

  it("列表正常載入並顯示 RMA 資料", async () => {
    setupSupabaseMock();
    render(<ReceivingTab />);
    expect(await screen.findByText("RMA-2024-001")).toBeInTheDocument();
    expect(screen.getByText("王小明")).toBeInTheDocument();
  });

  it("點擊「檢視」後開啟對話框，顯示診斷分類和實際處理方式欄位", async () => {
    setupSupabaseMock();
    render(<ReceivingTab />);
    await openDialog();
    expect(screen.getByText("診斷分類")).toBeInTheDocument();
    expect(screen.getByText("實際處理方式")).toBeInTheDocument();
  });

  it("對話框預設不顯示替換欄位", async () => {
    setupSupabaseMock({ repairDetail: { ...BASE_REPAIR, actual_method: null } });
    render(<ReceivingTab />);
    await openDialog();
    expect(screen.queryByLabelText("替換型號")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("替換序號")).not.toBeInTheDocument();
  });

  it("選擇「換新」後顯示替換型號和替換序號欄位", async () => {
    const user = userEvent.setup();
    setupSupabaseMock({ repairDetail: { ...BASE_REPAIR, actual_method: null } });
    render(<ReceivingTab />);
    await openDialog();

    await user.click(screen.getByLabelText("實際處理方式"));
    await user.click(await screen.findByRole("option", { name: "換新" }));

    expect(screen.getByLabelText("替換型號")).toBeInTheDocument();
    expect(screen.getByLabelText("替換序號")).toBeInTheDocument();
  });

  it("選擇非「換新」時不顯示替換欄位", async () => {
    const user = userEvent.setup();
    setupSupabaseMock({ repairDetail: { ...BASE_REPAIR, actual_method: null } });
    render(<ReceivingTab />);
    await openDialog();

    await user.click(screen.getByLabelText("實際處理方式"));
    await user.click(await screen.findByRole("option", { name: "維修" }));

    expect(screen.queryByLabelText("替換型號")).not.toBeInTheDocument();
  });

  it("選擇「換新」並填入資料後，儲存 payload 包含 replacement_model 和 replacement_serial", async () => {
    const user = userEvent.setup();
    const { mockInsert } = setupSupabaseMock({ repairDetail: null });
    render(<ReceivingTab />);
    await openDialog();

    await user.click(screen.getByLabelText("實際處理方式"));
    await user.click(await screen.findByRole("option", { name: "換新" }));
    await user.type(screen.getByLabelText("替換型號"), "TERIC-NEW");
    await user.type(screen.getByLabelText("替換序號"), "SN99999");

    fireEvent.click(screen.getByRole("button", { name: "儲存記錄" }));

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          actual_method: "換新",
          replacement_model: "TERIC-NEW",
          replacement_serial: "SN99999",
        })
      );
    });
  });

  it("選擇「維修」時儲存的 replacement 欄位為 null", async () => {
    const user = userEvent.setup();
    const { mockInsert } = setupSupabaseMock({ repairDetail: null });
    render(<ReceivingTab />);
    await openDialog();

    await user.click(screen.getByLabelText("實際處理方式"));
    await user.click(await screen.findByRole("option", { name: "維修" }));
    fireEvent.click(screen.getByRole("button", { name: "儲存記錄" }));

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          actual_method: "維修",
          replacement_model: null,
          replacement_serial: null,
        })
      );
    });
  });

  it("選擇 diagnosis_category 後儲存時更新至 rma_requests", async () => {
    const user = userEvent.setup();
    const { mockUpdateRma } = setupSupabaseMock({ repairDetail: null });
    render(<ReceivingTab />);
    await openDialog();

    await user.click(screen.getByLabelText("診斷分類"));
    await user.click(await screen.findByRole("option", { name: "外觀損壞" }));
    fireEvent.click(screen.getByRole("button", { name: "儲存記錄" }));

    await waitFor(() => {
      expect(mockUpdateRma).toHaveBeenCalledWith(
        expect.objectContaining({ diagnosis_category: "外觀損壞" })
      );
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Phase 2：通知客戶診斷結果
// ══════════════════════════════════════════════════════════════════════════
describe("ReceivingTab - Phase 2 通知客戶診斷結果", () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockInvoke.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }));
  });

  // ── 按鈕 disable 條件 ───────────────────────────────────────────────────
  it("RMA 有 email 且有 initial_diagnosis 時，通知按鈕為啟用", async () => {
    setupSupabaseMock();
    render(<ReceivingTab />);
    await openDialog();
    expect(screen.getByRole("button", { name: /通知客戶診斷結果/ })).not.toBeDisabled();
  });

  it("RMA 沒有 customer_email 時，通知按鈕為 disabled", async () => {
    setupSupabaseMock({ rmaList: [{ ...BASE_RMA, customer_email: null }] });
    render(<ReceivingTab />);
    await openDialog();
    expect(screen.getByRole("button", { name: /通知客戶診斷結果/ })).toBeDisabled();
  });

  it("RMA 沒有 initial_diagnosis 時，通知按鈕為 disabled", async () => {
    setupSupabaseMock({ rmaList: [{ ...BASE_RMA, initial_diagnosis: null }] });
    render(<ReceivingTab />);
    await openDialog();
    expect(screen.getByRole("button", { name: /通知客戶診斷結果/ })).toBeDisabled();
  });

  it("initial_diagnosis 為空字串時，通知按鈕為 disabled", async () => {
    setupSupabaseMock({ rmaList: [{ ...BASE_RMA, initial_diagnosis: "   " }] });
    render(<ReceivingTab />);
    await openDialog();
    expect(screen.getByRole("button", { name: /通知客戶診斷結果/ })).toBeDisabled();
  });

  // ── AlertDialog 預覽內容 ────────────────────────────────────────────────
  it("點擊通知按鈕後開啟 AlertDialog，顯示收件人 email", async () => {
    setupSupabaseMock();
    render(<ReceivingTab />);
    await openNotifyDialog();
    expect(screen.getByText("wang@example.com")).toBeInTheDocument();
  });

  it("AlertDialog 主旨 input 包含 RMA 編號", async () => {
    setupSupabaseMock();
    render(<ReceivingTab />);
    await openNotifyDialog();
    // 主旨現在是可編輯的 input，用 getByDisplayValue
    expect(
      screen.getByDisplayValue(/RMA-2024-001.*產品檢測結果與處理方式確認/)
    ).toBeInTheDocument();
  });

  it("過保固時，信件預覽含診斷描述和 CR-4 三級整新機價格", async () => {
    // BASE_RMA: product_model="CR-4", warranty_date=null (過保固)
    setupSupabaseMock();
    render(<ReceivingTab />);
    await openNotifyDialog();
    // body 現在是可編輯 textarea，價格來自 buildDiagnosisNotificationBody
    const bodyInput = screen.getByLabelText(/信件內容/) as HTMLTextAreaElement;
    expect(bodyInput.value).toContain("電池接觸不良");
    expect(bodyInput.value).toContain("NT$ 3,680"); // CR-4 A級
    expect(bodyInput.value).toContain("NT$ 3,180"); // CR-4 B級
    expect(bodyInput.value).toContain("原錶退回");
  });

  it("保固內時，信件預覽顯示免費換新模板，不顯示 ABC 價格", async () => {
    const warrantyRma = { ...BASE_RMA, warranty_date: "2099-12-31" };
    setupSupabaseMock({ rmaList: [warrantyRma] });
    render(<ReceivingTab />);
    await openNotifyDialog();
    const bodyInput = screen.getByLabelText(/信件內容/) as HTMLTextAreaElement;
    expect(bodyInput.value).toContain("更換整新機");
    expect(bodyInput.value).toContain("免費");
    expect(bodyInput.value).not.toContain("NT$ 3,680");
  });

  // ── send-rma-reply invoke payload ───────────────────────────────────────
  it("確認寄出後，以正確 payload 呼叫 send-rma-reply", async () => {
    mockInvoke.mockResolvedValue({ data: {}, error: null });
    setupSupabaseMock();
    render(<ReceivingTab />);
    await openNotifyDialog();

    fireEvent.click(screen.getByRole("button", { name: "確認寄出" }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "send-rma-reply",
        expect.objectContaining({
          body: expect.objectContaining({
            rmaRequestId: "rma-001",
            subject: "[RMA-2024-001] 產品檢測結果與處理方式確認",
            attachments: [],
          }),
        })
      );
    });
    // body 內容驗證（過保固 CR-4：含診斷描述和 A 級價格）
    const invokeCall = mockInvoke.mock.calls[0][1];
    expect(invokeCall.body.body).toContain("電池接觸不良");
    expect(invokeCall.body.body).toContain("NT$ 3,680");
  });

  // ── 寄出後狀態切換 ─────────────────────────────────────────────────────
  it("寄出成功後顯示 success toast 並呼叫 update-rma-status", async () => {
    mockInvoke.mockResolvedValue({ data: {}, error: null });
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", mockFetch);
    setupSupabaseMock();
    render(<ReceivingTab />);
    await openNotifyDialog();

    fireEvent.click(screen.getByRole("button", { name: "確認寄出" }));

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith(
        expect.stringContaining("wang@example.com")
      );
    });

    // update-rma-status 呼叫包含 new_status: contacting
    const statusCall = mockFetch.mock.calls.find((c) =>
      String(c[0]).includes("update-rma-status")
    );
    expect(statusCall).toBeDefined();
    const callBody = JSON.parse(statusCall[1].body);
    expect(callBody).toMatchObject({ rma_id: "rma-001", new_status: "contacting" });
  });

  // ── 失敗時的處理 ────────────────────────────────────────────────────────
  it("send-rma-reply 失敗時顯示 error toast，不呼叫 update-rma-status", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error("network error") });
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", mockFetch);
    setupSupabaseMock();
    render(<ReceivingTab />);
    await openNotifyDialog();

    fireEvent.click(screen.getByRole("button", { name: "確認寄出" }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        expect.stringContaining("寄送失敗")
      );
    });
    expect(mockToastSuccess).not.toHaveBeenCalled();

    const statusCall = mockFetch.mock.calls.find((c) =>
      String(c[0]).includes("update-rma-status")
    );
    expect(statusCall).toBeUndefined();
  });

  it("send-rma-reply 回傳 error 物件時顯示 error toast", async () => {
    mockInvoke.mockResolvedValue({
      data: { error: "Quota exceeded" },
      error: null,
    });
    setupSupabaseMock();
    render(<ReceivingTab />);
    await openNotifyDialog();

    fireEvent.click(screen.getByRole("button", { name: "確認寄出" }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        expect.stringContaining("寄送失敗")
      );
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Phase 3：附件上傳
// ══════════════════════════════════════════════════════════════════════════

// ── Helpers ────────────────────────────────────────────────────────────────
function makeFile(name: string, sizeBytes = 1024, type = "image/jpeg"): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

function getFileInput(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

async function uploadFile(file: File) {
  const input = getFileInput();
  fireEvent.change(input, { target: { files: [file] } });
  // wait for async upload to settle
  await waitFor(() => expect(mockStorageUpload).toHaveBeenCalled());
}

describe("ReceivingTab - Phase 3 附件上傳", () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockInvoke.mockReset();
    mockStorageUpload.mockReset();
    mockStorageRemove.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
    mockStorageUpload.mockResolvedValue({ error: null });
    mockStorageRemove.mockResolvedValue({ data: null, error: null });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }));
  });

  // ── 上傳成功 ───────────────────────────────────────────────────────────
  it("上傳有效檔案後顯示檔名與大小，storage.upload 路徑含 rma id", async () => {
    setupSupabaseMock();
    render(<ReceivingTab />);
    await openNotifyDialog();

    const file = makeFile("photo.jpg", 2048);
    await uploadFile(file);

    expect(screen.getByText("photo.jpg")).toBeInTheDocument();
    expect(screen.getByText(/2\.0 KB/)).toBeInTheDocument();
    expect(mockStorageUpload).toHaveBeenCalledWith(
      expect.stringMatching(/^rma-replies\/rma-001\/.+photo\.jpg$/),
      expect.any(File),
      expect.objectContaining({ upsert: false })
    );
    expect(mockToastSuccess).toHaveBeenCalledWith("已上傳 1 個附件");
  });

  it("上傳多個有效檔案，顯示計數 (n/5)", async () => {
    setupSupabaseMock();
    render(<ReceivingTab />);
    await openNotifyDialog();

    const input = getFileInput();
    const files = [makeFile("a.jpg"), makeFile("b.pdf", 512, "application/pdf")];
    fireEvent.change(input, { target: { files } });
    await waitFor(() => expect(screen.getByText(/2\/5/)).toBeInTheDocument());
  });

  it("formatBytes：< 1 KB 顯示 B，>= 1 KB 顯示 KB，>= 1 MB 顯示 MB", async () => {
    setupSupabaseMock();
    render(<ReceivingTab />);
    await openNotifyDialog();

    const input = getFileInput();

    // 500 B
    fireEvent.change(input, { target: { files: [makeFile("small.jpg", 500)] } });
    await waitFor(() => expect(screen.getByText(/500 B/)).toBeInTheDocument());

    mockStorageUpload.mockReset();
    mockStorageUpload.mockResolvedValue({ error: null });

    // 1.5 MB
    fireEvent.change(input, { target: { files: [makeFile("big.jpg", 1.5 * 1024 * 1024)] } });
    await waitFor(() => expect(screen.getByText(/1\.5 MB/)).toBeInTheDocument());
  });

  // ── 驗證失敗 ────────────────────────────────────────────────────────────
  it("無效副檔名（.exe）→ toast error，不加入清單，不呼叫 storage.upload", async () => {
    setupSupabaseMock();
    render(<ReceivingTab />);
    await openNotifyDialog();

    const input = getFileInput();
    fireEvent.change(input, { target: { files: [makeFile("virus.exe", 100, "application/x-msdownload")] } });

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining("不支援的檔案類型"))
    );
    expect(mockStorageUpload).not.toHaveBeenCalled();
    expect(screen.queryByText("virus.exe")).not.toBeInTheDocument();
  });

  it("單檔超過 25 MB → toast error，不加入清單", async () => {
    setupSupabaseMock();
    render(<ReceivingTab />);
    await openNotifyDialog();

    const bigFile = makeFile("huge.jpg", 26 * 1024 * 1024);
    const input = getFileInput();
    fireEvent.change(input, { target: { files: [bigFile] } });

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining("超過 25 MB"))
    );
    expect(mockStorageUpload).not.toHaveBeenCalled();
  });

  it("附件總數超過 5 → toast error，提早返回，不呼叫 storage.upload", async () => {
    setupSupabaseMock();
    render(<ReceivingTab />);
    await openNotifyDialog();

    // 先上傳 4 個
    const input = getFileInput();
    const four = Array.from({ length: 4 }, (_, i) => makeFile(`f${i}.jpg`));
    fireEvent.change(input, { target: { files: four } });
    await waitFor(() => expect(screen.getByText(/4\/5/)).toBeInTheDocument());

    mockStorageUpload.mockReset();
    mockToastError.mockReset();

    // 再嘗試加 2 個（4 + 2 > 5）
    fireEvent.change(input, { target: { files: [makeFile("x.jpg"), makeFile("y.jpg")] } });

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining("最多只能附加 5 個"))
    );
    expect(mockStorageUpload).not.toHaveBeenCalled();
  });

  it("storage.upload 失敗 → toast error，不加入清單", async () => {
    mockStorageUpload.mockResolvedValue({ error: { message: "bucket full" } });
    setupSupabaseMock();
    render(<ReceivingTab />);
    await openNotifyDialog();

    const input = getFileInput();
    fireEvent.change(input, { target: { files: [makeFile("photo.jpg")] } });

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining("上傳失敗"))
    );
    expect(screen.queryByText("photo.jpg")).not.toBeInTheDocument();
  });

  // ── 移除附件 ────────────────────────────────────────────────────────────
  it("點擊移除按鈕 → 呼叫 storage.remove，附件從清單消失", async () => {
    setupSupabaseMock();
    render(<ReceivingTab />);
    await openNotifyDialog();

    await uploadFile(makeFile("photo.jpg"));
    expect(screen.getByText("photo.jpg")).toBeInTheDocument();

    // 點 X 移除
    const removeBtn = screen.getByRole("button", { name: "" }); // X icon button
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(mockStorageRemove).toHaveBeenCalledWith(
        expect.arrayContaining([expect.stringContaining("photo")])
      );
    });
    expect(screen.queryByText("photo.jpg")).not.toBeInTheDocument();
  });

  // ── 取消 dialog 清理孤兒檔案 ───────────────────────────────────────────
  it("取消 dialog 時，已上傳附件透過 storage.remove 批次刪除", async () => {
    setupSupabaseMock();
    render(<ReceivingTab />);
    await openNotifyDialog();

    await uploadFile(makeFile("photo.jpg"));
    mockStorageRemove.mockReset();
    mockStorageRemove.mockResolvedValue({ data: null, error: null });

    fireEvent.click(screen.getByRole("button", { name: /取消/ }));

    await waitFor(() => {
      expect(mockStorageRemove).toHaveBeenCalledWith(
        expect.arrayContaining([expect.stringContaining("photo")])
      );
    });
  });

  // ── 寄出含附件 ─────────────────────────────────────────────────────────
  it("寄出時 payload 包含 notifyAttachments 陣列", async () => {
    mockInvoke.mockResolvedValue({ data: {}, error: null });
    setupSupabaseMock();
    render(<ReceivingTab />);
    await openNotifyDialog();

    await uploadFile(makeFile("report.pdf", 1024, "application/pdf"));

    fireEvent.click(screen.getByRole("button", { name: "確認寄出" }));

    await waitFor(() => {
      const body = mockInvoke.mock.calls[0][1].body;
      expect(body.attachments).toHaveLength(1);
      expect(body.attachments[0]).toMatchObject({
        name: "report.pdf",
        size: 1024,
      });
    });
  });

  it("寄出成功後 attachments state 清空（storage 檔案保留）", async () => {
    mockInvoke.mockResolvedValue({ data: {}, error: null });
    setupSupabaseMock();
    render(<ReceivingTab />);
    await openNotifyDialog();

    await uploadFile(makeFile("photo.jpg"));
    mockStorageRemove.mockReset();

    fireEvent.click(screen.getByRole("button", { name: "確認寄出" }));

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
    // 寄出成功不刪 storage
    expect(mockStorageRemove).not.toHaveBeenCalled();
  });

  // ── 上傳中 disabled 狀態 ────────────────────────────────────────────────
  it("上傳中，「確認寄出」與「選擇檔案」按鈕都 disabled", async () => {
    // Upload never resolves → uploadingFiles stays true
    let resolveUpload!: () => void;
    mockStorageUpload.mockReturnValue(
      new Promise<{ error: null }>((res) => { resolveUpload = () => res({ error: null }); })
    );

    setupSupabaseMock();
    render(<ReceivingTab />);
    await openNotifyDialog();

    const input = getFileInput();
    fireEvent.change(input, { target: { files: [makeFile("photo.jpg")] } });

    // While upload is pending, both buttons should be disabled
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "確認寄出" })).toBeDisabled()
    );
    expect(screen.getByRole("button", { name: /選擇檔案/ })).toBeDisabled();

    // Resolve to let the component clean up
    resolveUpload();
  });
});
