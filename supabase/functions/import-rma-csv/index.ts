import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ParsedRmaRecord {
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
  inbound_carrier: string | null;
  inbound_tracking_number: string | null;
  outbound_ship_date: string | null;
  outbound_carrier: string | null;
  outbound_tracking_number: string | null;
  planned_method: string | null;
  estimated_cost: number | null;
  actual_method: string | null;
  actual_cost: number | null;
  replacement_model: string | null;
  replacement_serial: string | null;
  internal_reference: string | null;
  contact_date: string | null;
  contact_notes: string | null;
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
  follow_up_date: string | null;
  follow_up_method: string | null;
  satisfaction_score: number | null;
  feedback: string | null;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin authentication
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: '未授權的請求' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: '認證失敗' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check admin role
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleError || !roleData) {
      return new Response(
        JSON.stringify({ error: '需要管理員權限' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { records, mode = 'skip' } = await req.json() as { 
      records: ParsedRmaRecord[]; 
      mode: 'skip' | 'update' | 'replace';
    };

    if (!records || !Array.isArray(records)) {
      return new Response(
        JSON.stringify({ error: '無效的資料格式' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Starting import of ${records.length} records with mode: ${mode}`);

    const results = {
      total: records.length,
      success: 0,
      skipped: 0,
      updated: 0,
      failed: 0,
      errors: [] as { rma_number: string; error: string }[],
    };

    for (const record of records) {
      try {
        // Check if RMA already exists
        const { data: existingRma, error: checkError } = await supabase
          .from('rma_requests')
          .select('id')
          .eq('rma_number', record.rma_number)
          .maybeSingle();

        if (checkError) {
          throw new Error(`查詢失敗: ${checkError.message}`);
        }

        if (existingRma) {
          if (mode === 'skip') {
            results.skipped++;
            continue;
          } else if (mode === 'update') {
            // Update existing RMA
            const { error: updateError } = await supabase
              .from('rma_requests')
              .update({
                status: record.status,
                customer_type: record.customer_type,
                customer_name: record.customer_name,
                customer_phone: record.customer_phone,
                mobile_phone: record.mobile_phone,
                customer_email: record.customer_email,
                customer_address: record.customer_address,
                social_account: record.social_account,
                product_model: record.product_model,
                serial_number: record.serial_number,
                customer_issue: record.customer_issue,
                initial_diagnosis: record.initial_diagnosis,
                diagnosis_category: record.diagnosis_category,
                issue_description: record.issue_description,
                issue_type: record.diagnosis_category || '其他',
                customer_notes: record.customer_notes,
                purchase_date: record.purchase_date,
                warranty_date: record.warranty_date,
                warranty_status: record.warranty_status,
                received_date: record.received_date,
              })
              .eq('id', existingRma.id);

            if (updateError) {
              throw new Error(`更新失敗: ${updateError.message}`);
            }

            // Update related tables
            await updateRelatedTables(supabase, existingRma.id, record);
            
            results.updated++;
            continue;
          }
        }

        // Insert new RMA request
        const { data: newRma, error: insertError } = await supabase
          .from('rma_requests')
          .insert({
            rma_number: record.rma_number,
            status: record.status,
            customer_type: record.customer_type,
            customer_name: record.customer_name,
            customer_phone: record.customer_phone,
            mobile_phone: record.mobile_phone,
            customer_email: record.customer_email,
            customer_address: record.customer_address,
            social_account: record.social_account,
            product_name: record.product_model || '未知產品',
            product_model: record.product_model,
            serial_number: record.serial_number,
            customer_issue: record.customer_issue,
            initial_diagnosis: record.initial_diagnosis,
            diagnosis_category: record.diagnosis_category,
            issue_description: record.issue_description || '無描述',
            issue_type: record.diagnosis_category || '其他',
            customer_notes: record.customer_notes,
            purchase_date: record.purchase_date,
            warranty_date: record.warranty_date,
            warranty_status: record.warranty_status,
            received_date: record.received_date,
          })
          .select('id')
          .single();

        if (insertError) {
          throw new Error(`新增失敗: ${insertError.message}`);
        }

        // Insert related tables
        await insertRelatedTables(supabase, newRma.id, record);

        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          rma_number: record.rma_number,
          error: error instanceof Error ? error.message : '未知錯誤',
        });
        console.error(`Error processing ${record.rma_number}:`, error);
      }
    }

    console.log('Import completed:', results);

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Import error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : '匯入失敗' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function insertRelatedTables(supabase: any, rmaId: string, record: ParsedRmaRecord) {
  // Insert inbound shipping if available
  if (record.inbound_carrier || record.inbound_tracking_number) {
    await supabase.from('rma_shipping').insert({
      rma_request_id: rmaId,
      direction: 'inbound',
      carrier: record.inbound_carrier,
      tracking_number: record.inbound_tracking_number,
      delivery_date: record.received_date,
    });
  }

  // Insert outbound shipping if available
  if (record.outbound_carrier || record.outbound_tracking_number || record.outbound_ship_date) {
    await supabase.from('rma_shipping').insert({
      rma_request_id: rmaId,
      direction: 'outbound',
      carrier: record.outbound_carrier,
      tracking_number: record.outbound_tracking_number,
      ship_date: record.outbound_ship_date,
    });
  }

  // Insert repair details if available
  if (record.planned_method || record.actual_method || record.estimated_cost || record.actual_cost) {
    await supabase.from('rma_repair_details').insert({
      rma_request_id: rmaId,
      planned_method: record.planned_method,
      estimated_cost: record.estimated_cost,
      actual_method: record.actual_method,
      actual_cost: record.actual_cost,
      replacement_model: record.replacement_model,
      replacement_serial: record.replacement_serial,
      internal_reference: record.internal_reference,
    });
  }

  // Insert customer contact if available
  if (record.contact_date || record.contact_notes) {
    await supabase.from('rma_customer_contacts').insert({
      rma_request_id: rmaId,
      contact_date: record.contact_date || new Date().toISOString().split('T')[0],
      contact_notes: record.contact_notes,
    });
  }

  // Insert supplier repair if available
  if (record.repair_requirement || record.supplier_status || record.sent_to_factory_date) {
    await supabase.from('rma_supplier_repairs').insert({
      rma_request_id: rmaId,
      repair_requirement: record.repair_requirement,
      supplier_status: record.supplier_status,
      sent_to_factory_date: record.sent_to_factory_date,
      sent_carrier: record.sent_carrier,
      sent_tracking_number: record.sent_tracking_number,
      supplier_warranty_date: record.supplier_warranty_date,
      production_batch: record.production_batch,
      factory_analysis: record.factory_analysis,
      factory_repair_method: record.factory_repair_method,
      factory_repair_cost: record.factory_repair_cost,
      factory_return_date: record.factory_return_date,
      inspection_result: record.inspection_result,
      repair_count: record.repair_count,
      post_repair_action: record.post_repair_action,
    });
  }

  // Insert customer feedback if available
  if (record.follow_up_date || record.satisfaction_score || record.feedback) {
    await supabase.from('rma_customer_feedback').insert({
      rma_request_id: rmaId,
      follow_up_date: record.follow_up_date,
      follow_up_method: record.follow_up_method,
      satisfaction_score: record.satisfaction_score,
      feedback: record.feedback,
    });
  }
}

async function updateRelatedTables(supabase: any, rmaId: string, record: ParsedRmaRecord) {
  // Update or insert repair details
  if (record.planned_method || record.actual_method || record.estimated_cost || record.actual_cost) {
    const { data: existingRepair } = await supabase
      .from('rma_repair_details')
      .select('id')
      .eq('rma_request_id', rmaId)
      .maybeSingle();

    if (existingRepair) {
      await supabase.from('rma_repair_details').update({
        planned_method: record.planned_method,
        estimated_cost: record.estimated_cost,
        actual_method: record.actual_method,
        actual_cost: record.actual_cost,
        replacement_model: record.replacement_model,
        replacement_serial: record.replacement_serial,
        internal_reference: record.internal_reference,
      }).eq('id', existingRepair.id);
    } else {
      await supabase.from('rma_repair_details').insert({
        rma_request_id: rmaId,
        planned_method: record.planned_method,
        estimated_cost: record.estimated_cost,
        actual_method: record.actual_method,
        actual_cost: record.actual_cost,
        replacement_model: record.replacement_model,
        replacement_serial: record.replacement_serial,
        internal_reference: record.internal_reference,
      });
    }
  }

  // For shipping, contacts, feedback - we append new records rather than update
  // This preserves history
}
