import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Get geolocation from IP using ip-api.com (free tier: 45 req/min)
async function getGeoLocation(ip: string): Promise<{
  country: string | null;
  countryCode: string | null;
  city: string | null;
  region: string | null;
}> {
  try {
    // Skip private/local IPs
    if (ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168.") || ip.startsWith("10.") || ip.startsWith("172.")) {
      console.log(`Skipping geolocation for private IP: ${ip}`);
      return { country: null, countryCode: null, city: null, region: null };
    }

    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,city,regionName`);
    const data = await response.json();
    
    if (data.status === "success") {
      console.log(`Geolocation result for ${ip}:`, data);
      return {
        country: data.country || null,
        countryCode: data.countryCode || null,
        city: data.city || null,
        region: data.regionName || null,
      };
    }
    
    console.log(`Geolocation lookup failed for ${ip}:`, data);
    return { country: null, countryCode: null, city: null, region: null };
  } catch (e) {
    console.error("Geo lookup error:", e);
    return { country: null, countryCode: null, city: null, region: null };
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Create admin client to insert logs
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get client IP from request headers
    const forwardedFor = req.headers.get("x-forwarded-for");
    const realIp = req.headers.get("x-real-ip");
    const cfConnectingIp = req.headers.get("cf-connecting-ip");
    
    // Priority: Cloudflare > X-Forwarded-For (first IP) > X-Real-IP
    const clientIp = cfConnectingIp || 
                     (forwardedFor ? forwardedFor.split(",")[0].trim() : null) || 
                     realIp;

    console.log(`Detected client IP: ${clientIp} (cf: ${cfConnectingIp}, xff: ${forwardedFor}, xri: ${realIp})`);

    const body = await req.json();
    const { user_id, email, event_type, user_agent } = body;

    console.log(`Logging ${event_type} event for user: ${email}, IP: ${clientIp}`);

    if (!user_id || !email) {
      return new Response(
        JSON.stringify({ error: "Missing user_id or email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get geolocation if we have an IP
    let geoData: { country: string | null; countryCode: string | null; city: string | null; region: string | null } = { 
      country: null, countryCode: null, city: null, region: null 
    };
    if (clientIp) {
      geoData = await getGeoLocation(clientIp);
    }

    const { error } = await supabaseAdmin
      .from("login_logs")
      .insert({
        user_id,
        email,
        event_type: event_type || "login",
        ip_address: clientIp || null,
        user_agent: user_agent || null,
        country: geoData.country,
        country_code: geoData.countryCode,
        city: geoData.city,
        region: geoData.region,
      });

    if (error) {
      console.error("Error inserting login log:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Successfully logged ${event_type} for ${email} from ${clientIp} (${geoData.country || 'unknown'})`);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in log-login function:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
