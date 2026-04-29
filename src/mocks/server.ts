import { setupServer } from "msw/node";
import { handlers } from "./handlers";

// Node 環境（Vitest / jsdom）使用 setupServer，不是 Service Worker
export const server = setupServer(...handlers);
