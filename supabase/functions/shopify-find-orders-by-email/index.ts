// Admin-only edge function: look up recent Shopify orders by customer email.
// Returns slim payload suitable for the RmaDetailDialog ShopifyOrdersCard.
// Uses Shopify Admin GraphQL API (2025-07).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SHOPIFY_API_VERSION = "2025-07";
const MAX_ORDERS = 5;

// In-memory rate limit (per-instance; not production-grade but adequate here).
const RATE_LIMIT_PER_MINUTE = 30;
const callsByUser = new Map<string, number[]>();

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const windowStart = now - 60_000;
  const arr = (callsByUser.get(userId) || []).filter((t) => t > windowStart);
  if (arr.length >= RATE_LIMIT_PER_MINUTE) return true;
  arr.push(now);
  callsByUser.set(userId, arr);
  return false;
}

const BodySchema = z.object({
  email: z.string().trim().email().max(255),
});

interface ShopifyLineItem {
  title: string;
  quantity: number;
  sku: string | null;
  variantTitle: string | null;
}

interface SimplifiedOrder {
  id: string;
  legacyId: string;
  name: string;
  processedAt: string | null;
  createdAt: string;
  totalPrice: { amount: string; currencyCode: string };
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  lineItems: ShopifyLineItem[];
  adminUrl: string;
}

const ORDERS_QUERY = `
  query OrdersByEmail($query: String!, $first: Int!) {
    orders(first: $first, query: $query, sortKey: PROCESSED_AT, reverse: true) {
      edges {
        node {
          id
          legacyResourceId
          name
          processedAt
          createdAt
          displayFinancialStatus
          displayFulfillmentStatus
          totalPriceSet {
            shopMoney { amount currencyCode }
          }
          lineItems(first: 20) {
            edges {
              node {
                title
                quantity
                sku
                variantTitle
              }
            }
          }
        }
      }
    }
  }
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SHOPIFY_DOMAIN = Deno.env.get("SHOPIFY_STORE_PERMANENT_DOMAIN") ||
      "newnewcrest.myshopify.com";
    // Prefer user-scoped online token (granted via shopify--connect_shopify_account
    // which inherits the connecting user's full scope set including read_orders).
    // Fall back to the store-level token if no online token is configured.
    let SHOPIFY_TOKEN = Deno.env.get("SHOPIFY_ONLINE_ACCESS_TOKEN");
    if (!SHOPIFY_TOKEN) {
      // Find any env var matching SHOPIFY_ONLINE_ACCESS_TOKEN:user:* (single-user setup).
      for (const [k, v] of Object.entries(Deno.env.toObject())) {
        if (k.startsWith("SHOPIFY_ONLINE_ACCESS_TOKEN") && v) {
          SHOPIFY_TOKEN = v;
          break;
        }
      }
    }
    if (!SHOPIFY_TOKEN) {
      SHOPIFY_TOKEN = Deno.env.get("SHOPIFY_ACCESS_TOKEN") ?? undefined;
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: "Server not configured" }, 500);
    }
    if (!SHOPIFY_TOKEN) {
      return json({ error: "Shopify integration not configured" }, 500);
    }

    // Verify caller is an authenticated admin.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = userData.user.id;

    const { data: isAdminData, error: roleErr } = await supabase.rpc(
      "is_admin",
      { _user_id: userId },
    );
    if (roleErr || !isAdminData) {
      return json({ error: "Forbidden" }, 403);
    }

    if (rateLimited(userId)) {
      return json({ error: "Too many requests, try again in a moment" }, 429);
    }

    // Validate input
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return json({ error: parsed.error.flatten().fieldErrors }, 400);
    }
    const { email } = parsed.data;

    // Call Shopify Admin GraphQL
    const shopifyEndpoint =
      `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
    const resp = await fetch(shopifyEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": SHOPIFY_TOKEN,
      },
      body: JSON.stringify({
        query: ORDERS_QUERY,
        variables: {
          query: `email:${email}`,
          first: MAX_ORDERS,
        },
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      console.error("Shopify API error", resp.status, body);
      return json({
        error: `Shopify API failed (${resp.status})`,
        details: body.slice(0, 500),
      }, 502);
    }

    const payload = await resp.json();
    if (payload.errors) {
      console.error("Shopify GraphQL errors", payload.errors);
      return json({ error: "Shopify GraphQL error", details: payload.errors }, 502);
    }

    const edges = payload?.data?.orders?.edges ?? [];
    const orders: SimplifiedOrder[] = edges.map((e: any) => {
      const n = e.node;
      const legacyId = n.legacyResourceId;
      return {
        id: n.id,
        legacyId,
        name: n.name,
        processedAt: n.processedAt,
        createdAt: n.createdAt,
        totalPrice: {
          amount: n.totalPriceSet?.shopMoney?.amount ?? "0",
          currencyCode: n.totalPriceSet?.shopMoney?.currencyCode ?? "",
        },
        financialStatus: n.displayFinancialStatus ?? null,
        fulfillmentStatus: n.displayFulfillmentStatus ?? null,
        lineItems: (n.lineItems?.edges ?? []).map((li: any) => ({
          title: li.node.title,
          quantity: li.node.quantity,
          sku: li.node.sku ?? null,
          variantTitle: li.node.variantTitle ?? null,
        })),
        adminUrl: `https://${SHOPIFY_DOMAIN.replace(".myshopify.com", "")}.myshopify.com/admin/orders/${legacyId}`,
      };
    });

    return json({ orders, shopDomain: SHOPIFY_DOMAIN });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("shopify-find-orders-by-email error:", message);
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
