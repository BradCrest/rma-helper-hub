import "@testing-library/jest-dom";
import { server } from "./mocks/server";

// Radix UI uses pointer capture and scroll APIs not available in jsdom
window.HTMLElement.prototype.hasPointerCapture = () => false;
window.HTMLElement.prototype.setPointerCapture = () => {};
window.HTMLElement.prototype.releasePointerCapture = () => {};
window.HTMLElement.prototype.scrollIntoView = () => {};

// 每次測試開始前啟動 MSW，未處理的請求印警告（不報錯）
beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));

// 每個測試結束後重置 handlers，避免測試間互相污染
afterEach(() => server.resetHandlers());

// 全部測試結束後關閉 server
afterAll(() => server.close());
