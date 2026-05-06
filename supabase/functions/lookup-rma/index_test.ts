import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
// Set to a known-existing RMA in the env you run tests against.
// Defaults to the customer-reported case from the bug report.
const VALID_RMA = Deno.env.get("TEST_RMA_NUMBER") ?? "RC7EA001463";

const FN_URL = `${SUPABASE_URL}/functions/v1/lookup-rma`;

function call(qs: string) {
  return fetch(`${FN_URL}?${qs}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
}

Deno.test("email_link + valid RMA returns minimal fields, no PII", async () => {
  const res = await call(`rma_number=${encodeURIComponent(VALID_RMA)}&purpose=email_link`);
  const body = await res.json();
  assertEquals(res.status, 200, JSON.stringify(body));
  assert(Array.isArray(body.results) && body.results.length === 1);
  const r = body.results[0];
  assertEquals(r.rma_number, VALID_RMA.toUpperCase().replace(/-/g, ""));
  assert("id" in r);
  assert("status" in r);
  assert("product_name" in r);
  assert("status_history" in r);
  // PII must not be present
  assertEquals(r.customer_name, undefined);
  assertEquals(r.customer_phone, undefined);
  assertEquals(r.customer_email, undefined);
  assertEquals(r.customer_address, undefined);
  assertEquals(r.serial_number, undefined);
  assertEquals(r.warranty_date, undefined);
});

Deno.test("email_link without rma_number returns 400", async () => {
  const res = await call(`purpose=email_link`);
  await res.text();
  assertEquals(res.status, 400);
});

Deno.test("email_link with too-short rma_number returns 400", async () => {
  const res = await call(`rma_number=ABC&purpose=email_link`);
  await res.text();
  assertEquals(res.status, 400);
});

Deno.test("email_link with non-existent rma returns 404", async () => {
  const res = await call(`rma_number=RCZZZZ999999&purpose=email_link`);
  await res.text();
  assertEquals(res.status, 404);
});

Deno.test("strict anonymous (no purpose) with only rma_number returns 400", async () => {
  const res = await call(`rma_number=${encodeURIComponent(VALID_RMA)}`);
  await res.text();
  assertEquals(res.status, 400);
});

Deno.test("full_details=true without admin token returns 403", async () => {
  const res = await call(`rma_number=${encodeURIComponent(VALID_RMA)}&full_details=true`);
  await res.text();
  assertEquals(res.status, 403);
});
