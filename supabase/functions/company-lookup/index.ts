import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// In-memory cache with TTL (24 hours)
const cache = new Map<string, { data: CompanyData; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in ms

// Rate limiting (30 requests per 5 minutes per IP)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 30;
const RATE_WINDOW = 5 * 60 * 1000; // 5 minutes

const REQUEST_TIMEOUT = 10000; // 10 seconds

interface CompanyData {
  nip: string;
  companyName: string;
  regon: string | null;
  krs: string | null;
  status: string;
  pkdMain: string | null;
  pkdList: string[];
  addressLine: string;
  postalCode: string;
  city: string;
  source: "CEIDG" | "KRS" | "GUS";
}

interface ProviderDebug {
  attempted: boolean;
  httpStatus: number | null;
  errorMessage: string | null;
  durationMs: number | null;
  success: boolean;
}

interface DebugInfo {
  gus: ProviderDebug;
  ceidg: ProviderDebug;
  krs: ProviderDebug;
  cached: boolean;
  totalDurationMs: number;
}

function createEmptyProviderDebug(): ProviderDebug {
  return {
    attempted: false,
    httpStatus: null,
    errorMessage: null,
    durationMs: null,
    success: false,
  };
}

// Validate NIP checksum
function validateNIP(nip: string): boolean {
  if (!/^\d{10}$/.test(nip)) return false;
  
  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  let sum = 0;
  
  for (let i = 0; i < 9; i++) {
    sum += parseInt(nip[i]) * weights[i];
  }
  
  const checkDigit = sum % 11;
  return checkDigit === parseInt(nip[9]);
}

// Check rate limit
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  
  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_WINDOW });
    return true;
  }
  
  if (entry.count >= RATE_LIMIT) {
    return false;
  }
  
  entry.count++;
  return true;
}

// Get from cache
function getFromCache(nip: string): CompanyData | null {
  const entry = cache.get(nip);
  if (!entry) return null;
  
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(nip);
    return null;
  }
  
  return entry.data;
}

// Save to cache
function saveToCache(nip: string, data: CompanyData): void {
  cache.set(nip, { data, timestamp: Date.now() });
}

// Provider: GUS/MF (Ministry of Finance - most reliable, covers JDG + companies)
async function fetchFromGUS(nip: string, debug: ProviderDebug): Promise<CompanyData | null> {
  debug.attempted = true;
  const startTime = Date.now();
  
  try {
    const url = `https://wl-api.mf.gov.pl/api/search/nip/${nip}?date=${new Date().toISOString().split('T')[0]}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    
    console.log(`[GUS] Fetching: ${url}`);
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    debug.durationMs = Date.now() - startTime;
    debug.httpStatus = response.status;
    
    if (!response.ok) {
      debug.errorMessage = `HTTP ${response.status}`;
      console.log(`[GUS] Error: HTTP ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    console.log(`[GUS] Response received, subject: ${data.result?.subject ? 'found' : 'null'}`);
    
    if (!data.result?.subject) {
      debug.errorMessage = 'No subject in response';
      console.log('[GUS] No results found');
      return null;
    }
    
    const subject = data.result.subject;
    
    // Parse address from combined field
    const fullAddress = subject.workingAddress || subject.residenceAddress || '';
    const addressParts = fullAddress.split(',').map((p: string) => p.trim());
    const lastPart = addressParts[addressParts.length - 1] || '';
    const postalMatch = lastPart.match(/(\d{2}-\d{3})\s+(.+)/);
    
    debug.success = true;
    console.log('[GUS] Successfully parsed company data');
    
    return {
      nip: nip,
      companyName: subject.name || '',
      regon: subject.regon || null,
      krs: subject.krs || null,
      status: subject.statusVat === 'Czynny' ? 'Aktywny' : subject.statusVat || 'Nieznany',
      pkdMain: null,
      pkdList: [],
      addressLine: addressParts.slice(0, -1).join(', ') || fullAddress,
      postalCode: postalMatch?.[1] || '',
      city: postalMatch?.[2] || '',
      source: "GUS"
    };
  } catch (error) {
    debug.durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    debug.errorMessage = errorMessage.includes('abort') ? 'Timeout (10s)' : errorMessage;
    console.error(`[GUS] Error: ${debug.errorMessage}`);
    return null;
  }
}

// Provider: CEIDG (for JDG - sole proprietorships)
async function fetchFromCEIDG(nip: string, debug: ProviderDebug): Promise<CompanyData | null> {
  debug.attempted = true;
  const startTime = Date.now();
  
  try {
    const url = `https://dane.biznes.gov.pl/api/ceidg/v2/firmy?nip=${nip}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    
    console.log(`[CEIDG] Fetching: ${url}`);
    
    const response = await fetch(url, { 
      headers: { 'Accept': 'application/json' },
      signal: controller.signal 
    });
    
    clearTimeout(timeoutId);
    debug.durationMs = Date.now() - startTime;
    debug.httpStatus = response.status;
    
    if (!response.ok) {
      debug.errorMessage = `HTTP ${response.status}`;
      console.log(`[CEIDG] Error: HTTP ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    console.log(`[CEIDG] Response received, firmy count: ${data.firmy?.length || 0}`);
    
    if (!data.firmy || data.firmy.length === 0) {
      debug.errorMessage = 'No results in response';
      console.log('[CEIDG] No results found');
      return null;
    }
    
    const firma = data.firmy[0];
    const adres = firma.adresDzialalnosci || firma.adresKorespondencyjny || {};
    
    debug.success = true;
    console.log('[CEIDG] Successfully parsed company data');
    
    return {
      nip: nip,
      companyName: firma.nazwa || `${firma.imie || ''} ${firma.nazwisko || ''}`.trim(),
      regon: firma.regon || null,
      krs: null,
      status: firma.status === 'AKTYWNY' ? 'Aktywny' : firma.status || 'Nieznany',
      pkdMain: firma.pkdGlowny || null,
      pkdList: firma.pkdPozostale || [],
      addressLine: [adres.ulica, adres.budynek, adres.lokal].filter(Boolean).join(' ') || adres.ulica || '',
      postalCode: adres.kodPocztowy || '',
      city: adres.miasto || adres.miejscowosc || '',
      source: "CEIDG"
    };
  } catch (error) {
    debug.durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    debug.errorMessage = errorMessage.includes('abort') ? 'Timeout (10s)' : errorMessage;
    console.error(`[CEIDG] Error: ${debug.errorMessage}`);
    return null;
  }
}

// Provider: KRS (for companies)
async function fetchFromKRS(nip: string, debug: ProviderDebug): Promise<CompanyData | null> {
  debug.attempted = true;
  const startTime = Date.now();
  
  try {
    const url = `https://api-krs.ms.gov.pl/api/krs/OdsijNip/${nip}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    
    console.log(`[KRS] Fetching: ${url}`);
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    debug.durationMs = Date.now() - startTime;
    debug.httpStatus = response.status;
    
    if (!response.ok) {
      debug.errorMessage = `HTTP ${response.status}`;
      console.log(`[KRS] Error: HTTP ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    console.log(`[KRS] Response received, odpis: ${data.odpis ? 'found' : 'null'}`);
    
    if (!data.odpis) {
      debug.errorMessage = 'No odpis in response';
      console.log('[KRS] No results found');
      return null;
    }
    
    const dane = data.odpis.dane;
    const adres = dane?.siedzibaIAdres?.adres || {};
    const pkd = dane?.dzialalnosciPKD || [];
    
    debug.success = true;
    console.log('[KRS] Successfully parsed company data');
    
    return {
      nip: nip,
      companyName: dane?.danePodmiotu?.nazwa || '',
      regon: dane?.danePodmiotu?.regon || null,
      krs: dane?.danePodmiotu?.krs || null,
      status: 'Aktywny',
      pkdMain: pkd[0] ? `${pkd[0].kodDzial}.${pkd[0].kodKlasa}.${pkd[0].kodPodklasa}` : null,
      pkdList: pkd.slice(1).map((p: { kodDzial: string; kodKlasa: string; kodPodklasa: string }) => 
        `${p.kodDzial}.${p.kodKlasa}.${p.kodPodklasa}`
      ),
      addressLine: [adres.ulica, adres.nrDomu, adres.nrLokalu].filter(Boolean).join(' '),
      postalCode: adres.kodPocztowy || '',
      city: adres.miejscowosc || '',
      source: "KRS"
    };
  } catch (error) {
    debug.durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    debug.errorMessage = errorMessage.includes('abort') ? 'Timeout (10s)' : errorMessage;
    console.error(`[KRS] Error: ${debug.errorMessage}`);
    return null;
  }
}

serve(async (req) => {
  const totalStartTime = Date.now();
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  // Initialize debug info
  const debug: DebugInfo = {
    gus: createEmptyProviderDebug(),
    ceidg: createEmptyProviderDebug(),
    krs: createEmptyProviderDebug(),
    cached: false,
    totalDurationMs: 0,
  };
  
  try {
    const url = new URL(req.url);
    const nip = url.searchParams.get('nip')?.replace(/[\s-]/g, '') || '';
    
    console.log(`[Request] NIP: "${nip}"`);
    
    // Get client IP for rate limiting
    const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0] || 
                     req.headers.get('x-real-ip') || 
                     'unknown';
    
    // Validate NIP format
    if (!/^\d{10}$/.test(nip)) {
      debug.totalDurationMs = Date.now() - totalStartTime;
      console.log(`[Validation] Invalid NIP format: "${nip}"`);
      return new Response(
        JSON.stringify({ 
          message: 'INVALID_NIP_FORMAT', 
          details: 'NIP musi składać się z 10 cyfr',
          debug 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Validate NIP checksum
    if (!validateNIP(nip)) {
      debug.totalDurationMs = Date.now() - totalStartTime;
      console.log(`[Validation] Invalid NIP checksum: "${nip}"`);
      return new Response(
        JSON.stringify({ 
          message: 'INVALID_NIP_CHECKSUM', 
          details: 'Nieprawidłowa suma kontrolna NIP',
          debug 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Check rate limit
    if (!checkRateLimit(clientIP)) {
      debug.totalDurationMs = Date.now() - totalStartTime;
      return new Response(
        JSON.stringify({ 
          message: 'RATE_LIMIT_EXCEEDED', 
          details: 'Zbyt wiele zapytań. Spróbuj za kilka minut.',
          debug 
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Check cache first
    const cached = getFromCache(nip);
    if (cached) {
      debug.cached = true;
      debug.totalDurationMs = Date.now() - totalStartTime;
      console.log(`[Cache] Hit for NIP: ${nip}`);
      return new Response(
        JSON.stringify({ ...cached, debug }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`[Fetch] Starting provider chain for NIP: ${nip}`);
    
    // Try providers in order (fallback chain)
    // Priority: GUS (primary) → CEIDG (secondary) → KRS (tertiary)
    let result: CompanyData | null = null;
    
    // 1. Try GUS/MF first (most reliable, works for all types)
    result = await fetchFromGUS(nip, debug.gus);
    
    // 2. Try CEIDG if GUS failed
    if (!result) {
      result = await fetchFromCEIDG(nip, debug.ceidg);
    }
    
    // 3. Try KRS as fallback
    if (!result) {
      result = await fetchFromKRS(nip, debug.krs);
    }
    
    debug.totalDurationMs = Date.now() - totalStartTime;
    
    // Check if all providers failed with errors (not just no results)
    const allProvidersFailed = 
      debug.gus.attempted && debug.gus.errorMessage && !debug.gus.success &&
      debug.ceidg.attempted && debug.ceidg.errorMessage && !debug.ceidg.success &&
      debug.krs.attempted && debug.krs.errorMessage && !debug.krs.success;
    
    // Check if all had connection/timeout errors (not 404s)
    const hasConnectionErrors = 
      (debug.gus.errorMessage?.includes('Timeout') || debug.gus.errorMessage?.includes('fetch')) ||
      (debug.ceidg.errorMessage?.includes('Timeout') || debug.ceidg.errorMessage?.includes('fetch')) ||
      (debug.krs.errorMessage?.includes('Timeout') || debug.krs.errorMessage?.includes('fetch'));
    
    if (!result) {
      // Determine if it's a "not found" or "providers failed" scenario
      if (allProvidersFailed && hasConnectionErrors) {
        console.log(`[Result] All providers failed with errors for NIP: ${nip}`);
        return new Response(
          JSON.stringify({ 
            message: 'PROVIDERS_FAILED', 
            details: 'Nie udało się połączyć z rejestrami. Spróbuj ponownie później.',
            debug 
          }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log(`[Result] Not found in any registry for NIP: ${nip}`);
      return new Response(
        JSON.stringify({ 
          message: 'NOT_FOUND', 
          details: 'Nie znaleziono podmiotu w rejestrach',
          debug 
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Save to cache
    saveToCache(nip, result);
    
    console.log(`[Result] Success for NIP: ${nip} from ${result.source}`);
    
    return new Response(
      JSON.stringify({ ...result, debug }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    debug.totalDurationMs = Date.now() - totalStartTime;
    console.error('[Error] Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        message: 'INTERNAL_ERROR', 
        details: 'Wystąpił nieoczekiwany błąd serwera',
        debug 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
