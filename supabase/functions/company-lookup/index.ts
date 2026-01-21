import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============ CONFIGURATION ============
const REQUEST_TIMEOUT = 10000; // 10 seconds
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const RATE_LIMIT = 30;
const RATE_WINDOW = 5 * 60 * 1000; // 5 minutes

// GUS SOAP endpoints (ver11)
const GUS_WSDL_URL_PROD = "https://wyszukiwarkaregon.stat.gov.pl/wsBIR/wsdl/UslugaBIRzewnPubl-ver11-prod.wsdl";
const GUS_SERVICE_URL_PROD = "https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc";
const GUS_WSDL_URL_TEST = "https://wyszukiwarkaregontest.stat.gov.pl/wsBIR/wsdl/UslugaBIRzewnPubl-ver11-test.wsdl";
const GUS_SERVICE_URL_TEST = "https://wyszukiwarkaregontest.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc";

// Test API key for GUS sandbox
const GUS_TEST_API_KEY = "abcde12345abcde12345";

// ============ TYPES ============
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
  source: "GUS" | "CEIDG" | "KRS" | "GUS_SOAP";
}

interface ProviderDebug {
  attempted: boolean;
  httpStatus: number | null;
  errorMessage: string | null;
  durationMs: number | null;
  success: boolean;
}

interface GusDebug extends ProviderDebug {
  mode: "prod" | "test" | null;
  sessionRenewed: boolean;
  hasApiKey: boolean;
}

interface DebugInfo {
  gus: GusDebug;
  ceidg: ProviderDebug;
  krs: ProviderDebug;
  cached: boolean;
  totalDurationMs: number;
}

// ============ CACHES ============
const dataCache = new Map<string, { data: CompanyData; timestamp: number }>();
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

// GUS Session cache
let gusSessionId: string | null = null;
let gusSessionTimestamp: number = 0;
const GUS_SESSION_TTL = 60 * 60 * 1000; // 1 hour (GUS session expires after ~1h)

// ============ HELPERS ============
function createEmptyProviderDebug(): ProviderDebug {
  return {
    attempted: false,
    httpStatus: null,
    errorMessage: null,
    durationMs: null,
    success: false,
  };
}

function createEmptyGusDebug(): GusDebug {
  return {
    ...createEmptyProviderDebug(),
    mode: null,
    sessionRenewed: false,
    hasApiKey: false,
  };
}

function validateNIP(nip: string): boolean {
  if (!/^\d{10}$/.test(nip)) return false;
  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(nip[i]) * weights[i];
  }
  return sum % 11 === parseInt(nip[9]);
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

function getFromCache(nip: string): CompanyData | null {
  const entry = dataCache.get(nip);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    dataCache.delete(nip);
    return null;
  }
  return entry.data;
}

function saveToCache(nip: string, data: CompanyData): void {
  dataCache.set(nip, { data, timestamp: Date.now() });
}

// ============ GUS SOAP CLIENT (BIR1.1/ver11) ============
function getGusConfig() {
  const apiKey = Deno.env.get("GUS_API_KEY");
  const mode = (Deno.env.get("GUS_MODE") || "prod").toLowerCase() as "prod" | "test";
  
  const isTest = mode === "test";
  const serviceUrl = isTest ? GUS_SERVICE_URL_TEST : GUS_SERVICE_URL_PROD;
  const effectiveApiKey = isTest ? GUS_TEST_API_KEY : apiKey;
  
  return {
    apiKey: effectiveApiKey,
    mode,
    serviceUrl,
    hasApiKey: !!effectiveApiKey,
  };
}

function buildSoapEnvelope(action: string, body: string, sessionId?: string): string {
  const sidHeader = sessionId 
    ? `<wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
         <sid>${sessionId}</sid>
       </wsse:Security>`
    : '';
    
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" 
               xmlns:ns="http://CIS/BIR/PUBL/2014/07">
  <soap:Header>
    ${sidHeader}
  </soap:Header>
  <soap:Body>
    ${body}
  </soap:Body>
</soap:Envelope>`;
}

async function soapRequest(
  serviceUrl: string, 
  action: string, 
  envelope: string, 
  sessionId?: string
): Promise<{ status: number; body: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/soap+xml;charset=UTF-8',
    'SOAPAction': `http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/${action}`,
  };
  
  if (sessionId) {
    headers['sid'] = sessionId;
  }
  
  try {
    const response = await fetch(serviceUrl, {
      method: 'POST',
      headers,
      body: envelope,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    const body = await response.text();
    return { status: response.status, body };
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

function extractFromXml(xml: string, tag: string): string | null {
  // Handle both with and without namespace prefix
  const patterns = [
    new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i'),
    new RegExp(`<[^:]+:${tag}[^>]*>([^<]*)</[^:]+:${tag}>`, 'i'),
    new RegExp(`<${tag}><!\\[CDATA\\[([^\\]]*)]\\]></${tag}>`, 'i'),
  ];
  
  for (const pattern of patterns) {
    const match = xml.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

function extractCData(xml: string): string | null {
  const match = xml.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return match ? match[1] : null;
}

async function gusLogin(apiKey: string, serviceUrl: string): Promise<string | null> {
  console.log('[GUS SOAP] Attempting login...');
  
  const body = `<ns:Zaloguj><ns:pKluczUzytkownika>${apiKey}</ns:pKluczUzytkownika></ns:Zaloguj>`;
  const envelope = buildSoapEnvelope('Zaloguj', body);
  
  const result = await soapRequest(serviceUrl, 'Zaloguj', envelope);
  
  if (result.status !== 200) {
    console.log(`[GUS SOAP] Login failed with HTTP ${result.status}`);
    return null;
  }
  
  // Extract session ID from response
  const sessionId = extractFromXml(result.body, 'ZalogujResult');
  
  if (!sessionId) {
    console.log('[GUS SOAP] No session ID in response');
    console.log('[GUS SOAP] Response body:', result.body.substring(0, 500));
    return null;
  }
  
  console.log('[GUS SOAP] Login successful, session obtained');
  return sessionId;
}

async function gusSearchByNip(
  nip: string, 
  sessionId: string, 
  serviceUrl: string
): Promise<string | null> {
  console.log(`[GUS SOAP] Searching for NIP: ${nip}`);
  
  const body = `<ns:DaneSzukajPodmioty>
    <ns:pParametryWyszukiwania>
      <ns:Nip>${nip}</ns:Nip>
    </ns:pParametryWyszukiwania>
  </ns:DaneSzukajPodmioty>`;
  
  const envelope = buildSoapEnvelope('DaneSzukajPodmioty', body, sessionId);
  const result = await soapRequest(serviceUrl, 'DaneSzukajPodmioty', envelope, sessionId);
  
  if (result.status !== 200) {
    console.log(`[GUS SOAP] Search failed with HTTP ${result.status}`);
    return null;
  }
  
  // Extract result - it's usually in CDATA
  const searchResult = extractFromXml(result.body, 'DaneSzukajPodmiotyResult');
  if (!searchResult) {
    // Try extracting CDATA directly
    const cdata = extractCData(result.body);
    if (cdata) return cdata;
    console.log('[GUS SOAP] No search result in response');
    return null;
  }
  
  return searchResult;
}

function parseGusResult(xmlData: string): CompanyData | null {
  // Parse the XML result from GUS
  // The result is typically a <root><dane>...</dane></root> structure
  
  const nip = extractFromXml(xmlData, 'Nip') || '';
  const companyName = extractFromXml(xmlData, 'Nazwa') || '';
  const regon = extractFromXml(xmlData, 'Regon') || extractFromXml(xmlData, 'Regon14') || extractFromXml(xmlData, 'Regon9');
  
  if (!companyName) {
    return null;
  }
  
  const street = extractFromXml(xmlData, 'Ulica') || '';
  const buildingNum = extractFromXml(xmlData, 'NrNieruchomosci') || '';
  const apartmentNum = extractFromXml(xmlData, 'NrLokalu') || '';
  const postalCode = extractFromXml(xmlData, 'KodPocztowy') || '';
  const city = extractFromXml(xmlData, 'Miejscowosc') || '';
  
  const addressLine = [street, buildingNum, apartmentNum]
    .filter(Boolean)
    .join(' ')
    .trim();
  
  return {
    nip,
    companyName,
    regon: regon || null,
    krs: null,
    status: 'Aktywny',
    pkdMain: extractFromXml(xmlData, 'PKD') || null,
    pkdList: [],
    addressLine,
    postalCode,
    city,
    source: 'GUS_SOAP',
  };
}

async function getGusSession(apiKey: string, serviceUrl: string, forceRenew: boolean = false): Promise<string | null> {
  const now = Date.now();
  
  // Check if we have a valid cached session
  if (!forceRenew && gusSessionId && (now - gusSessionTimestamp) < GUS_SESSION_TTL) {
    console.log('[GUS SOAP] Using cached session');
    return gusSessionId;
  }
  
  // Login to get new session
  const newSessionId = await gusLogin(apiKey, serviceUrl);
  if (newSessionId) {
    gusSessionId = newSessionId;
    gusSessionTimestamp = now;
  }
  
  return newSessionId;
}

async function fetchFromGusSoap(nip: string, debug: GusDebug): Promise<CompanyData | null> {
  debug.attempted = true;
  const startTime = Date.now();
  
  const config = getGusConfig();
  debug.mode = config.mode;
  debug.hasApiKey = config.hasApiKey;
  
  if (!config.hasApiKey) {
    debug.errorMessage = 'MISSING_API_KEY';
    debug.durationMs = Date.now() - startTime;
    console.log('[GUS SOAP] No API key configured');
    return null;
  }
  
  try {
    // Get or renew session
    let sessionId = await getGusSession(config.apiKey!, config.serviceUrl);
    
    if (!sessionId) {
      debug.errorMessage = 'LOGIN_FAILED';
      debug.durationMs = Date.now() - startTime;
      return null;
    }
    
    // Search for company
    let searchResult = await gusSearchByNip(nip, sessionId, config.serviceUrl);
    
    // If failed, try renewing session once
    if (!searchResult) {
      console.log('[GUS SOAP] Retrying with new session...');
      debug.sessionRenewed = true;
      sessionId = await getGusSession(config.apiKey!, config.serviceUrl, true);
      
      if (!sessionId) {
        debug.errorMessage = 'SESSION_RENEWAL_FAILED';
        debug.durationMs = Date.now() - startTime;
        return null;
      }
      
      searchResult = await gusSearchByNip(nip, sessionId, config.serviceUrl);
    }
    
    if (!searchResult || searchResult.trim() === '') {
      debug.errorMessage = 'NO_DATA';
      debug.durationMs = Date.now() - startTime;
      debug.httpStatus = 200;
      console.log('[GUS SOAP] No data found for NIP');
      return null;
    }
    
    // Parse result
    const companyData = parseGusResult(searchResult);
    
    if (!companyData) {
      debug.errorMessage = 'PARSE_ERROR';
      debug.durationMs = Date.now() - startTime;
      debug.httpStatus = 200;
      console.log('[GUS SOAP] Failed to parse result');
      return null;
    }
    
    debug.success = true;
    debug.httpStatus = 200;
    debug.durationMs = Date.now() - startTime;
    console.log('[GUS SOAP] Successfully retrieved company data');
    
    return companyData;
    
  } catch (error) {
    debug.durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    debug.errorMessage = errorMessage.includes('abort') ? 'Timeout (10s)' : errorMessage;
    console.error(`[GUS SOAP] Error: ${debug.errorMessage}`);
    return null;
  }
}

// ============ FALLBACK PROVIDERS ============
async function fetchFromGusRest(nip: string, debug: ProviderDebug): Promise<CompanyData | null> {
  debug.attempted = true;
  const startTime = Date.now();
  
  try {
    const url = `https://wl-api.mf.gov.pl/api/search/nip/${nip}?date=${new Date().toISOString().split('T')[0]}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    
    console.log(`[GUS REST] Fetching: ${url}`);
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    debug.durationMs = Date.now() - startTime;
    debug.httpStatus = response.status;
    
    if (!response.ok) {
      debug.errorMessage = `HTTP ${response.status}`;
      return null;
    }
    
    const data = await response.json();
    
    if (!data.result?.subject) {
      debug.errorMessage = 'No subject in response';
      return null;
    }
    
    const subject = data.result.subject;
    const fullAddress = subject.workingAddress || subject.residenceAddress || '';
    const addressParts = fullAddress.split(',').map((p: string) => p.trim());
    const lastPart = addressParts[addressParts.length - 1] || '';
    const postalMatch = lastPart.match(/(\d{2}-\d{3})\s+(.+)/);
    
    debug.success = true;
    
    return {
      nip,
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
    return null;
  }
}

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
      return null;
    }
    
    const data = await response.json();
    
    if (!data.firmy || data.firmy.length === 0) {
      debug.errorMessage = 'No results';
      return null;
    }
    
    const firma = data.firmy[0];
    const adres = firma.adresDzialalnosci || firma.adresKorespondencyjny || {};
    
    debug.success = true;
    
    return {
      nip,
      companyName: firma.nazwa || `${firma.imie || ''} ${firma.nazwisko || ''}`.trim(),
      regon: firma.regon || null,
      krs: null,
      status: firma.status === 'AKTYWNY' ? 'Aktywny' : firma.status || 'Nieznany',
      pkdMain: firma.pkdGlowny || null,
      pkdList: firma.pkdPozostale || [],
      addressLine: [adres.ulica, adres.budynek, adres.lokal].filter(Boolean).join(' '),
      postalCode: adres.kodPocztowy || '',
      city: adres.miasto || adres.miejscowosc || '',
      source: "CEIDG"
    };
  } catch (error) {
    debug.durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    debug.errorMessage = errorMessage.includes('abort') ? 'Timeout (10s)' : errorMessage;
    return null;
  }
}

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
      return null;
    }
    
    const data = await response.json();
    
    if (!data.odpis) {
      debug.errorMessage = 'No odpis';
      return null;
    }
    
    const dane = data.odpis.dane;
    const adres = dane?.siedzibaIAdres?.adres || {};
    const pkd = dane?.dzialalnosciPKD || [];
    
    debug.success = true;
    
    return {
      nip,
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
    return null;
  }
}

// ============ MAIN HANDLER ============
serve(async (req) => {
  const totalStartTime = Date.now();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  const debug: DebugInfo = {
    gus: createEmptyGusDebug(),
    ceidg: createEmptyProviderDebug(),
    krs: createEmptyProviderDebug(),
    cached: false,
    totalDurationMs: 0,
  };
  
  try {
    const url = new URL(req.url);
    const nip = url.searchParams.get('nip')?.replace(/[\s-]/g, '') || '';
    
    console.log(`[Request] NIP: "${nip}"`);
    
    const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0] || 
                     req.headers.get('x-real-ip') || 'unknown';
    
    // Validate NIP format
    if (!/^\d{10}$/.test(nip)) {
      debug.totalDurationMs = Date.now() - totalStartTime;
      return new Response(
        JSON.stringify({ message: 'INVALID_NIP_FORMAT', details: 'NIP musi składać się z 10 cyfr', debug }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Validate NIP checksum
    if (!validateNIP(nip)) {
      debug.totalDurationMs = Date.now() - totalStartTime;
      return new Response(
        JSON.stringify({ message: 'INVALID_NIP_CHECKSUM', details: 'Nieprawidłowa suma kontrolna NIP', debug }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Rate limit
    if (!checkRateLimit(clientIP)) {
      debug.totalDurationMs = Date.now() - totalStartTime;
      return new Response(
        JSON.stringify({ message: 'RATE_LIMIT_EXCEEDED', details: 'Zbyt wiele zapytań', debug }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Check cache
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
    
    let result: CompanyData | null = null;
    
    // 1. Try GUS SOAP (primary - official API)
    result = await fetchFromGusSoap(nip, debug.gus);
    
    // 2. Fallback to GUS REST (Ministry of Finance)
    if (!result) {
      const gusRestDebug = createEmptyProviderDebug();
      result = await fetchFromGusRest(nip, gusRestDebug);
      // Merge REST debug into main GUS debug if SOAP failed
      if (!debug.gus.success && gusRestDebug.attempted) {
        debug.gus.httpStatus = gusRestDebug.httpStatus;
        if (gusRestDebug.success) {
          debug.gus.success = true;
          debug.gus.errorMessage = null;
        }
      }
    }
    
    // 3. Try CEIDG
    if (!result) {
      result = await fetchFromCEIDG(nip, debug.ceidg);
    }
    
    // 4. Try KRS
    if (!result) {
      result = await fetchFromKRS(nip, debug.krs);
    }
    
    debug.totalDurationMs = Date.now() - totalStartTime;
    
    if (!result) {
      const hasConnectionErrors = 
        debug.gus.errorMessage?.includes('Timeout') ||
        debug.ceidg.errorMessage?.includes('Timeout') ||
        debug.krs.errorMessage?.includes('Timeout');
      
      if (hasConnectionErrors) {
        return new Response(
          JSON.stringify({ message: 'PROVIDERS_FAILED', details: 'Nie udało się połączyć z rejestrami', debug }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ message: 'NOT_FOUND', details: 'Nie znaleziono podmiotu w rejestrach', debug }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    saveToCache(nip, result);
    console.log(`[Result] Success for NIP: ${nip} from ${result.source}`);
    
    return new Response(
      JSON.stringify({ ...result, debug }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    debug.totalDurationMs = Date.now() - totalStartTime;
    console.error('[Error]', error);
    return new Response(
      JSON.stringify({ message: 'INTERNAL_ERROR', details: 'Wystąpił nieoczekiwany błąd', debug }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
