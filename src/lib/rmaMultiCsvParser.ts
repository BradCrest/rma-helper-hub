import * as XLSX from 'xlsx';

export interface ProductEntry {
  id: string;
  productModel: string;
  serialNumber: string;
  issueType: string;
  issueDescription: string;
  purchaseDate: string;
  accessories: string[];
}

export interface ParseError {
  row: number;
  message: string;
}

export interface ParseResult {
  success: ProductEntry[];
  errors: ParseError[];
}

const VALID_ISSUE_TYPES = [
  "螢幕問題",
  "電池問題",
  "充電問題",
  "按鍵問題",
  "軟體問題",
  "外觀損壞",
  "其他",
];

const COLUMN_MAPPING: Record<string, keyof ProductEntry> = {
  '產品型號': 'productModel',
  '產品序號': 'serialNumber',
  '問題描述': 'issueDescription',
  '購買日期': 'purchaseDate',
  '隨附物品': 'accessories',
};

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function parseAccessories(value: string): string[] {
  if (!value || value.trim() === '') return [];
  return value.split(/[,，、]/).map(s => s.trim()).filter(Boolean);
}

function formatDate(value: any): string {
  if (!value) return '';
  
  // Handle Excel date serial number
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
    }
  }
  
  // Handle string date
  if (typeof value === 'string') {
    // Try to parse various formats
    const dateStr = value.trim();
    
    // YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }
    
    // YYYY/MM/DD format
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(dateStr)) {
      return dateStr.replace(/\//g, '-');
    }
    
    // Try Date parsing
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
  }
  
  return '';
}

export function parseCsvContent(content: string): ParseResult {
  const lines = content.split('\n').map(line => line.trim()).filter(Boolean);
  
  if (lines.length < 2) {
    return { success: [], errors: [{ row: 0, message: '檔案為空或缺少資料列' }] };
  }
  
  // Parse header
  const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
  const columnIndices: Record<string, number> = {};
  
  headers.forEach((header, index) => {
    const key = COLUMN_MAPPING[header];
    if (key) {
      columnIndices[key] = index;
    }
  });
  
  // Validate required columns
  if (columnIndices.productModel === undefined) {
    return { success: [], errors: [{ row: 1, message: '缺少必填欄位：產品型號' }] };
  }
  if (columnIndices.serialNumber === undefined) {
    return { success: [], errors: [{ row: 1, message: '缺少必填欄位：產品序號' }] };
  }
  
  const success: ProductEntry[] = [];
  const errors: { row: number; message: string }[] = [];
  
  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const values = parseCSVLine(line);
    const rowNum = i + 1;
    
    const productModel = values[columnIndices.productModel]?.trim() || '';
    const serialNumber = values[columnIndices.serialNumber]?.trim() || '';
    
    // Validate required fields
    if (!productModel) {
      errors.push({ row: rowNum, message: '產品型號為必填' });
      continue;
    }
    if (!serialNumber) {
      errors.push({ row: rowNum, message: '產品序號為必填' });
      continue;
    }
    
    const issueDescription = values[columnIndices.issueDescription ?? -1]?.trim() || '';
    const purchaseDate = formatDate(values[columnIndices.purchaseDate ?? -1]?.trim() || '');
    const accessoriesStr = values[columnIndices.accessories ?? -1]?.trim() || '';
    
    success.push({
      id: generateId(),
      productModel,
      serialNumber,
      issueType: '', // Keep empty, database column preserved
      issueDescription,
      purchaseDate,
      accessories: parseAccessories(accessoriesStr),
    });
  }
  
  return { success, errors };
}

export function parseExcelContent(buffer: ArrayBuffer): ParseResult {
  try {
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    // Convert to JSON with header
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    
    if (jsonData.length < 2) {
      return { success: [], errors: [{ row: 0, message: '檔案為空或缺少資料列' }] };
    }
    
    // Get headers from first row
    const headers = jsonData[0].map(h => String(h || '').trim());
    const columnIndices: Record<string, number> = {};
    
    headers.forEach((header, index) => {
      const key = COLUMN_MAPPING[header];
      if (key) {
        columnIndices[key] = index;
      }
    });
    
    // Validate required columns
    if (columnIndices.productModel === undefined) {
      return { success: [], errors: [{ row: 1, message: '缺少必填欄位：產品型號' }] };
    }
    if (columnIndices.serialNumber === undefined) {
      return { success: [], errors: [{ row: 1, message: '缺少必填欄位：產品序號' }] };
    }
    
    const success: ProductEntry[] = [];
    const errors: { row: number; message: string }[] = [];
    
    // Parse data rows
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      const rowNum = i + 1;
      
      if (!row || row.every(cell => cell === null || cell === undefined || cell === '')) {
        continue; // Skip empty rows
      }
      
      const productModel = String(row[columnIndices.productModel] || '').trim();
      const serialNumber = String(row[columnIndices.serialNumber] || '').trim();
      
      // Validate required fields
      if (!productModel) {
        errors.push({ row: rowNum, message: '產品型號為必填' });
        continue;
      }
      if (!serialNumber) {
        errors.push({ row: rowNum, message: '產品序號為必填' });
        continue;
      }
      
      const issueDescription = String(row[columnIndices.issueDescription ?? -1] || '').trim();
      const purchaseDate = formatDate(row[columnIndices.purchaseDate ?? -1]);
      const accessoriesStr = String(row[columnIndices.accessories ?? -1] || '').trim();
      
      success.push({
        id: generateId(),
        productModel,
        serialNumber,
        issueType: '', // Keep empty, database column preserved
        issueDescription,
        purchaseDate,
        accessories: parseAccessories(accessoriesStr),
      });
    }
    
    return { success, errors };
  } catch (error) {
    return { success: [], errors: [{ row: 0, message: '無法解析 Excel 檔案' }] };
  }
}

// Helper to parse CSV line handling quoted values
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"' && (i === 0 || line[i - 1] !== '\\')) {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

export function generateCsvTemplate(): string {
  const BOM = '\uFEFF';
  const headers = ['產品型號', '產品序號', '問題描述', '購買日期', '隨附物品'];
  const exampleRow = ['RC-PRO-500', 'SN2024001234', '螢幕有白點', '2024-06-15', '充電器,說明書'];
  
  return BOM + headers.join(',') + '\n' + exampleRow.join(',');
}

export function downloadCsvTemplate(): void {
  const content = generateCsvTemplate();
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'RMA批量匯入範本.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
