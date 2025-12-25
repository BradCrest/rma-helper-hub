// CSV Parser utility for RMA data import

export interface ParsedRmaRecord {
  // Core RMA fields
  rma_number: string;
  status: string;
  received_date: string | null;
  customer_type: string | null;
  customer_name: string;
  customer_phone: string;
  mobile_phone: string | null;
  customer_email: string;
  customer_address: string | null;
  social_account: string | null;
  product_model: string | null;
  serial_number: string | null;
  customer_issue: string | null;
  initial_diagnosis: string | null;
  diagnosis_category: string | null;
  issue_description: string | null;
  customer_notes: string | null;
  purchase_date: string | null;
  warranty_date: string | null;
  warranty_status: string | null;
  
  // Inbound shipping
  inbound_carrier: string | null;
  inbound_tracking_number: string | null;
  
  // Outbound shipping
  outbound_ship_date: string | null;
  outbound_carrier: string | null;
  outbound_tracking_number: string | null;
  
  // Repair details
  planned_method: string | null;
  estimated_cost: number | null;
  actual_method: string | null;
  actual_cost: number | null;
  replacement_model: string | null;
  replacement_serial: string | null;
  internal_reference: string | null;
  
  // Customer contact
  contact_date: string | null;
  contact_notes: string | null;
  
  // Supplier repair
  repair_requirement: string | null;
  supplier_status: string | null;
  sent_to_factory_date: string | null;
  sent_carrier: string | null;
  sent_tracking_number: string | null;
  supplier_warranty_date: string | null;
  production_batch: string | null;
  factory_analysis: string | null;
  factory_repair_method: string | null;
  factory_repair_cost: number | null;
  factory_return_date: string | null;
  inspection_result: string | null;
  repair_count: number | null;
  post_repair_action: string | null;
  
  // Customer feedback
  follow_up_date: string | null;
  follow_up_method: string | null;
  satisfaction_score: number | null;
  feedback: string | null;
}

// CSV column index to field mapping (0-indexed, based on row 2 of CSV)
const CSV_COLUMN_MAP: Record<number, keyof ParsedRmaRecord> = {
  0: 'rma_number',              // 報修單號
  1: 'status',                  // 客戶處理狀態
  2: 'received_date',           // 收件日期
  3: 'customer_type',           // 寄件人身分
  4: 'customer_name',           // 姓名
  5: 'customer_phone',          // 電話
  6: 'mobile_phone',            // 手機
  7: 'customer_email',          // EMAIL
  8: 'customer_address',        // 地址
  9: 'social_account',          // 社群帳號
  10: 'inbound_carrier',        // 物流名稱
  11: 'inbound_tracking_number', // 物流託運單號
  12: 'product_model',          // 電腦錶型號
  13: 'serial_number',          // 電腦錶序號
  14: 'customer_issue',         // 客戶送修時提出的問題狀況
  15: 'initial_diagnosis',      // 初步問題判定描述
  16: 'diagnosis_category',     // 初步問題判定P分類
  17: 'issue_description',      // 問題描述
  18: 'customer_notes',         // 客戶需求備註
  19: 'purchase_date',          // 購買日期
  20: 'warranty_date',          // 對客戶而言: 保固日期
  21: 'contact_date',           // 聯繫客戶日期
  22: 'contact_notes',          // 聯繫客戶內容簡短紀錄
  23: 'planned_method',         // 預計處理方法
  24: 'estimated_cost',         // 預估維修收費
  25: 'actual_method',          // 實際處理方法
  26: 'actual_cost',            // 實際收費
  27: 'replacement_model',      // 替換型號
  28: 'replacement_serial',     // 替換序號
  29: 'internal_reference',     // 內部使用單號
  30: 'outbound_ship_date',     // 寄回給客戶日期
  31: 'outbound_carrier',       // 寄回物流
  32: 'outbound_tracking_number', // 寄回物流追蹤單號
  33: 'repair_requirement',     // 提供給供應商的維修需求
  34: 'supplier_status',        // RMA處理狀態
  35: 'sent_to_factory_date',   // 送回工廠日期
  36: 'sent_carrier',           // 送回工廠物流
  37: 'sent_tracking_number',   // 送回工廠物流單號
  38: 'supplier_warranty_date', // 對供應商而言: 保固日期
  39: 'production_batch',       // 產品生產批次
  40: 'factory_analysis',       // 工廠原因分析
  41: 'factory_repair_method',  // 工廠處置方法
  42: 'factory_repair_cost',    // 工廠維修費用
  43: 'factory_return_date',    // 工廠返回日期
  44: 'inspection_result',      // 維修品返回檢測結果
  45: 'repair_count',           // 維修次數
  46: 'post_repair_action',     // 收到維修品後處理方法
  47: 'follow_up_date',         // 追蹤客戶日期
  48: 'follow_up_method',       // 追蹤客戶方式
  49: 'satisfaction_score',     // 客戶滿意度(1~5)
  50: 'feedback',               // 客戶意見回饋
};

// Status mapping from Chinese to English
const STATUS_MAP: Record<string, string> = {
  '已登記': 'registered',
  '已收件': 'received',
  '已寄出': 'shipped',
  '檢修中': 'inspecting',
  '聯繫中': 'contacting',
  '確認報價': 'quote_confirmed',
  '已付費': 'paid',
  '不維修': 'no_repair',
  '維修中': 'repairing',
  '原錶維修中': 'repairing',
  '已寄出整新品': 'shipped_back_refurbished',
  '已寄回整新品': 'shipped_back_refurbished',
  '已寄出原錶': 'shipped_back_original',
  '已寄回原錶': 'shipped_back_original',
  '已寄出全新品': 'shipped_back_new',
  '已寄回全新品': 'shipped_back_new',
  '已回寄': 'shipped_back',
  '後續關懷': 'follow_up',
  '結案': 'closed',
};

// Parse a date string in various formats
function parseDate(dateStr: string | null): string | null {
  if (!dateStr || dateStr.trim() === '' || dateStr === 'NA') return null;
  
  const trimmed = dateStr.trim();
  
  // Try YYYY/MM/DD or YYYY-MM-DD format
  const match1 = trimmed.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (match1) {
    const [, year, month, day] = match1;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  // Try MM/DD/YYYY format
  const match2 = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (match2) {
    const [, month, day, year] = match2;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  return null;
}

// Parse a number string
function parseNumber(numStr: string | null): number | null {
  if (!numStr || numStr.trim() === '' || numStr === 'NA') return null;
  const cleaned = numStr.replace(/[,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// Clean and normalize a string value
function cleanString(str: string | null): string | null {
  if (!str || str.trim() === '' || str === 'NA') return null;
  return str.trim();
}

// Parse a single CSV line, handling quoted fields
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  
  return result;
}

// Map status from Chinese to database enum
function mapStatus(chineseStatus: string): string {
  const normalized = chineseStatus.trim();
  return STATUS_MAP[normalized] || 'registered';
}

// Derive warranty status from warranty date
function deriveWarrantyStatus(warrantyInfo: string | null): string | null {
  if (!warrantyInfo) return null;
  const lower = warrantyInfo.toLowerCase();
  if (lower.includes('保固內')) return '保固內';
  if (lower.includes('過保')) return '過保';
  if (lower.includes('無法判定')) return '無法判定';
  return null;
}

// Parse CSV content into structured records
export function parseCSV(csvContent: string): ParsedRmaRecord[] {
  const lines = csvContent.split('\n');
  const records: ParsedRmaRecord[] = [];
  
  // Skip header rows (first 2 lines)
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const columns = parseCSVLine(line);
    
    // Skip if no RMA number (allow any format, not just RC prefix)
    const rmaNumber = cleanString(columns[0]);
    if (!rmaNumber) continue;
    
    const record: ParsedRmaRecord = {
      rma_number: rmaNumber,
      status: mapStatus(columns[1] || ''),
      received_date: parseDate(columns[2]),
      customer_type: cleanString(columns[3]),
      customer_name: cleanString(columns[4]) || '',
      customer_phone: cleanString(columns[5]) || '',
      mobile_phone: cleanString(columns[6]),
      customer_email: cleanString(columns[7]) || '',
      customer_address: cleanString(columns[8]),
      social_account: cleanString(columns[9]),
      inbound_carrier: cleanString(columns[10]),
      inbound_tracking_number: cleanString(columns[11]),
      product_model: cleanString(columns[12]),
      serial_number: cleanString(columns[13]),
      customer_issue: cleanString(columns[14]),
      initial_diagnosis: cleanString(columns[15]),
      diagnosis_category: cleanString(columns[16]),
      issue_description: cleanString(columns[17]),
      customer_notes: cleanString(columns[18]),
      purchase_date: parseDate(columns[19]),
      warranty_date: parseDate(columns[20]),
      warranty_status: deriveWarrantyStatus(columns[20]),
      contact_date: parseDate(columns[21]),
      contact_notes: cleanString(columns[22]),
      planned_method: cleanString(columns[23]),
      estimated_cost: parseNumber(columns[24]),
      actual_method: cleanString(columns[25]),
      actual_cost: parseNumber(columns[26]),
      replacement_model: cleanString(columns[27]),
      replacement_serial: cleanString(columns[28]),
      internal_reference: cleanString(columns[29]),
      outbound_ship_date: parseDate(columns[30]),
      outbound_carrier: cleanString(columns[31]),
      outbound_tracking_number: cleanString(columns[32]),
      repair_requirement: cleanString(columns[33]),
      supplier_status: cleanString(columns[34]),
      sent_to_factory_date: parseDate(columns[35]),
      sent_carrier: cleanString(columns[36]),
      sent_tracking_number: cleanString(columns[37]),
      supplier_warranty_date: parseDate(columns[38]),
      production_batch: cleanString(columns[39]),
      factory_analysis: cleanString(columns[40]),
      factory_repair_method: cleanString(columns[41]),
      factory_repair_cost: parseNumber(columns[42]),
      factory_return_date: parseDate(columns[43]),
      inspection_result: cleanString(columns[44]),
      repair_count: parseNumber(columns[45]),
      post_repair_action: cleanString(columns[46]),
      follow_up_date: parseDate(columns[47]),
      follow_up_method: cleanString(columns[48]),
      satisfaction_score: parseNumber(columns[49]),
      feedback: cleanString(columns[50]),
    };
    
    records.push(record);
  }
  
  return records;
}

// Validate a parsed record
export function validateRecord(record: ParsedRmaRecord): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!record.rma_number) {
    errors.push('缺少報修單號');
  }
  
  if (!record.customer_name) {
    errors.push('缺少客戶姓名');
  }
  
  // 電話和 Email 均改為非必填，不再驗證
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

// Get summary of parsed records
export function getParseStats(records: ParsedRmaRecord[]): {
  total: number;
  valid: number;
  invalid: number;
  byStatus: Record<string, number>;
} {
  const stats = {
    total: records.length,
    valid: 0,
    invalid: 0,
    byStatus: {} as Record<string, number>,
  };
  
  for (const record of records) {
    const { valid } = validateRecord(record);
    if (valid) {
      stats.valid++;
    } else {
      stats.invalid++;
    }
    
    const status = record.status || 'unknown';
    stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
  }
  
  return stats;
}
