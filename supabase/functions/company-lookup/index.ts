import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

// Provider: CEIDG (for JDG - sole proprietorships)
async function fetchFromCEIDG(nip: string): Promise<CompanyData | null> {
  const apiKey = Deno.env.get('CEIDG_API_KEY');
  
  try {
    // CEIDG API v2
    const url = `https://dane.biznes.gov.pl/api/ceidg/v2/firmy?nip=${nip}`;
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    const response = await fetch(url, { 
      headers,
      signal: controller.signal 
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.log(`CEIDG returned ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (!data.firmy || data.firmy.length === 0) {
      console.log('CEIDG: No results found');
      return null;
    }
    
    const firma = data.firmy[0];
    const adres = firma.adresDzialalnosci || firma.adresKorespondencyjny || {};
    
    console.log('CEIDG: Found company data');
    
    return {
      nip: nip,
      companyName: firma.nazwa || firma.imie + ' ' + firma.nazwisko,
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
    console.error('CEIDG error:', error instanceof Error ? error.message : error);
    return null;
  }
}

// Provider: KRS (for companies)
async function fetchFromKRS(nip: string): Promise<CompanyData | null> {
  try {
    // KRS public API
    const url = `https://api-krs.ms.gov.pl/api/krs/OdsijNip/${nip}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.log(`KRS returned ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (!data.odpis) {
      console.log('KRS: No results found');
      return null;
    }
    
    const dane = data.odpis.dane;
    const adres = dane?.siedzibaIAdres?.adres || {};
    const pkd = dane?.dzialalnosciPKD || [];
    
    console.log('KRS: Found company data');
    
    return {
      nip: nip,
      companyName: dane?.danePodmiotu?.nazwa || '',
      regon: dane?.danePodmiotu?.regon || null,
      krs: dane?.danePodmiotu?.krs || null,
      status: 'Aktywny',
      pkdMain: pkd[0]?.kodDzial + '.' + pkd[0]?.kodKlasa + '.' + pkd[0]?.kodPodklasa || null,
      pkdList: pkd.slice(1).map((p: any) => p.kodDzial + '.' + p.kodKlasa + '.' + p.kodPodklasa),
      addressLine: [adres.ulica, adres.nrDomu, adres.nrLokalu].filter(Boolean).join(' '),
      postalCode: adres.kodPocztowy || '',
      city: adres.miejscowosc || '',
      source: "KRS"
    };
  } catch (error) {
    console.error('KRS error:', error instanceof Error ? error.message : error);
    return null;
  }
}

// Provider: GUS/REGON (fallback)
async function fetchFromGUS(nip: string): Promise<CompanyData | null> {
  try {
    // Using public REGON API proxy
    const url = `https://wl-api.mf.gov.pl/api/search/nip/${nip}?date=${new Date().toISOString().split('T')[0]}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.log(`GUS/MF returned ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (!data.result?.subject) {
      console.log('GUS: No results found');
      return null;
    }
    
    const subject = data.result.subject;
    
    console.log('GUS: Found company data');
    
    // Parse address from combined field
    const fullAddress = subject.workingAddress || subject.residenceAddress || '';
    const addressParts = fullAddress.split(',').map((p: string) => p.trim());
    const lastPart = addressParts[addressParts.length - 1] || '';
    const postalMatch = lastPart.match(/(\d{2}-\d{3})\s+(.+)/);
    
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
    console.error('GUS error:', error instanceof Error ? error.message : error);
    return null;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const url = new URL(req.url);
    const nip = url.searchParams.get('nip')?.replace(/[\s-]/g, '') || '';
    
    // Get client IP for rate limiting
    const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0] || 
                     req.headers.get('x-real-ip') || 
                     'unknown';
    
    // Validate NIP format
    if (!/^\d{10}$/.test(nip)) {
      return new Response(
        JSON.stringify({ message: 'INVALID_NIP_FORMAT', details: 'NIP musi składać się z 10 cyfr' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Validate NIP checksum
    if (!validateNIP(nip)) {
      return new Response(
        JSON.stringify({ message: 'INVALID_NIP_CHECKSUM', details: 'Nieprawidłowa suma kontrolna NIP' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Check rate limit
    if (!checkRateLimit(clientIP)) {
      return new Response(
        JSON.stringify({ message: 'RATE_LIMIT_EXCEEDED', details: 'Zbyt wiele zapytań. Spróbuj za kilka minut.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Check cache first
    const cached = getFromCache(nip);
    if (cached) {
      console.log(`Cache hit for NIP: ${nip}`);
      return new Response(
        JSON.stringify(cached),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`Fetching data for NIP: ${nip}`);
    
    // Try providers in order (fallback chain)
    let result: CompanyData | null = null;
    
    // 1. Try CEIDG first (for JDG)
    result = await fetchFromCEIDG(nip);
    
    // 2. Try KRS if CEIDG failed
    if (!result) {
      result = await fetchFromKRS(nip);
    }
    
    // 3. Try GUS/MF as fallback
    if (!result) {
      result = await fetchFromGUS(nip);
    }
    
    if (!result) {
      return new Response(
        JSON.stringify({ message: 'NOT_FOUND', details: 'Nie znaleziono podmiotu w rejestrach' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Save to cache
    saveToCache(nip, result);
    
    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ message: 'INTERNAL_ERROR', details: 'Wystąpił błąd serwera' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
