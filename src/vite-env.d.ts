/// <reference types="vite/client" />

declare global {
  interface Window {
    html2canvas?: (element: HTMLElement, options?: any) => Promise<HTMLCanvasElement>;
    jspdf?: {
      jsPDF: new (...args: any[]) => any;
    };
    jsPDF?: new (...args: any[]) => any;
  }
}

export {};
