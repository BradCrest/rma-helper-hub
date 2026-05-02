export interface TransactionalEmailPayload {
  templateName: string;
  recipientEmail: string;
  idempotencyKey: string;
  templateData?: Record<string, unknown>;
  logMetadata?: Record<string, unknown>;
}

export interface TransactionalEmailResult {
  ok: boolean;
  status: number;
  /** Parsed JSON when possible, raw text fallback, or null. */
  data: unknown;
  /** Raw response text when !ok, otherwise null. */
  errorText: string | null;
}

/**
 * Server-to-server invoke of the central send-transactional-email function.
 *
 * send-transactional-email enforces an in-code service-role check (it accepts
 * the key in either `Authorization: Bearer <key>` or `apikey: <key>`).
 * Always send BOTH headers from here so every caller is uniform; never forward
 * a user JWT for this hop.
 */
export async function invokeTransactionalEmail(
  payload: TransactionalEmailPayload,
): Promise<TransactionalEmailResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "invokeTransactionalEmail: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  const res = await fetch(
    `${supabaseUrl}/functions/v1/send-transactional-email`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
        "apikey": serviceKey,
      },
      body: JSON.stringify(payload),
    },
  );

  // Read body exactly once, then try JSON, fall back to text.
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text || null;
  }

  return {
    ok: res.ok,
    status: res.status,
    data,
    errorText: res.ok ? null : text,
  };
}
