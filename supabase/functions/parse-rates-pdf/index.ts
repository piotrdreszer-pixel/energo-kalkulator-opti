import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ExtractedRate {
  tariff_code: string
  rate_type: string
  value: number
  unit: string
  zone_number: number | null
  season: string
  description: string | null
  needsReview?: boolean
}

interface ExtractionResult {
  success: boolean
  rates: ExtractedRate[]
  raw_text?: string
  error?: string
  parserUsed?: string
  diagnostics?: {
    tariffsDetected: string[]
    recordCount: number
    parseErrors: string[]
  }
}

// Unit normalization based on header patterns
function normalizeUnit(rawUnit: string): string {
  const unit = rawUnit.toLowerCase().trim()
  if (unit.includes('zł/mwh') || unit.includes('zl/mwh')) return 'zł/MWh'
  if (unit.includes('zł/kwh') || unit.includes('zl/kwh')) return 'zł/kWh'
  if (unit.includes('zł/kw/m') || unit.includes('zl/kw/m') || unit.includes('zł/kw/mies')) return 'zł/kW/mies'
  if (unit.includes('zł/m-c') || unit.includes('zl/m-c') || unit.includes('zł/mies')) return 'zł/mies'
  if (unit.includes('zł/kvar') || unit.includes('zl/kvar')) return 'zł/kvarh'
  return rawUnit
}

// Map zone names to zone numbers
function parseZoneFromDescription(desc: string): { zone_number: number | null, zone_name: string } {
  const lower = desc.toLowerCase()
  
  // Energa-specific zone patterns
  if (lower.includes('szczyt przedpołudniowy') || lower.includes('szczyt przedpoludniowy')) {
    return { zone_number: 1, zone_name: 'szczyt przedpołudniowy' }
  }
  if (lower.includes('szczyt popołudniowy') || lower.includes('szczyt popoludniowy')) {
    return { zone_number: 2, zone_name: 'szczyt popołudniowy' }
  }
  if (lower.includes('pozostałe godziny') || lower.includes('pozostale godziny') || lower.includes('poza szczytem')) {
    return { zone_number: 3, zone_name: 'pozostałe godziny' }
  }
  if (lower.includes('dzienna') || lower.includes('dzień') || lower.includes('dzien')) {
    return { zone_number: 1, zone_name: 'dzienna' }
  }
  if (lower.includes('nocna') || lower.includes('noc')) {
    return { zone_number: 2, zone_name: 'nocna' }
  }
  if (lower.includes('szczyt') && !lower.includes('poza')) {
    return { zone_number: 1, zone_name: 'szczyt' }
  }
  
  return { zone_number: null, zone_name: '' }
}

// Parse season from text
function parseSeason(text: string): string {
  const lower = text.toLowerCase()
  if (lower.includes('zima') || lower.includes('zimow') || lower.includes('winter')) return 'WINTER'
  if (lower.includes('lato') || lower.includes('letni') || lower.includes('summer')) return 'SUMMER'
  return 'ALL'
}

// Map component names to rate types
function mapComponentToRateType(component: string, zoneNumber: number | null): string {
  const lower = component.toLowerCase()
  
  if (lower.includes('stał') || lower.includes('stala') || lower.includes('składnik stały')) {
    return 'SIEC_STALA'
  }
  if (lower.includes('zmienn') || lower.includes('skladnik zmienny')) {
    if (zoneNumber === 1) return 'SIEC_ZMIENNA_STREFA1'
    if (zoneNumber === 2) return 'SIEC_ZMIENNA_STREFA2'
    if (zoneNumber === 3) return 'SIEC_ZMIENNA_STREFA3'
    return 'SIEC_ZMIENNA_STREFA1'
  }
  if (lower.includes('mocow')) return 'OPLATA_MOCOWA'
  if (lower.includes('jakościow') || lower.includes('jakosciow')) return 'OPLATA_JAKOSCIOWA'
  if (lower.includes('abonament')) return 'OPLATA_ABONAMENTOWA'
  if (lower.includes('przejściow') || lower.includes('przejsciow')) return 'OPLATA_PRZEJSCIOWA'
  if (lower.includes('biern') || lower.includes('reaktywn')) return 'ENERGIA_BIERNA'
  
  return 'SIEC_ZMIENNA_STREFA1'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')

    if (!lovableApiKey) {
      console.error('LOVABLE_API_KEY not configured')
      return new Response(
        JSON.stringify({ success: false, error: 'AI nie jest skonfigurowane' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Brak autoryzacji' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create admin client for storage access
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Create user client for auth check using getClaims for better reliability
    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    })

    // Verify user using getClaims (more reliable than getUser)
    const token = authHeader.replace('Bearer ', '')
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token)
    if (claimsError || !claimsData?.claims) {
      console.error('[parse-rates-pdf] Auth error:', claimsError)
      return new Response(
        JSON.stringify({ success: false, error: 'Nieautoryzowany użytkownik - zaloguj się ponownie' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const userId = claimsData.claims.sub as string

    // Verify user is admin
    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle()

    if (!roleData) {
      return new Response(
        JSON.stringify({ success: false, error: 'Brak uprawnień administratora' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { filePath, osdName, tariffCodes, parserMode } = await req.json()

    if (!filePath) {
      return new Response(
        JSON.stringify({ success: false, error: 'Brak ścieżki do pliku' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[parse-rates-pdf] Processing file: ${filePath} for OSD: ${osdName}, mode: ${parserMode || 'auto'}`)

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabaseAdmin
      .storage
      .from('rate-documents')
      .download(filePath)

    if (downloadError || !fileData) {
      console.error('[parse-rates-pdf] Download error:', downloadError)
      return new Response(
        JSON.stringify({ success: false, error: 'Nie udało się pobrać pliku' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Convert PDF to base64 for AI processing
    const arrayBuffer = await fileData.arrayBuffer()
    
    // Convert to base64 in chunks to avoid stack overflow
    const uint8Array = new Uint8Array(arrayBuffer)
    const chunkSize = 0x8000 // 32KB chunks
    const chunks: string[] = []
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, i + chunkSize)
      chunks.push(String.fromCharCode.apply(null, chunk as unknown as number[]))
    }
    const base64 = btoa(chunks.join(''))

    console.log(`[parse-rates-pdf] File size: ${arrayBuffer.byteLength} bytes`)

    // Detect if this is Energa based on OSD name
    const isEnerga = osdName?.toLowerCase().includes('energa')

    // Build specialized prompt based on OSD type
    let systemPrompt = `Jesteś ekspertem od polskich taryf energetycznych OSD (Operatorów Sieci Dystrybucyjnych).
Twoim zadaniem jest analiza dokumentu PDF zawierającego taryfę dystrybucyjną i wyekstrahowanie wszystkich stawek opłat sieciowych.

WAŻNE INSTRUKCJE:
1. Znajdź sekcję "Tabela stawek opłat sieciowych" (np. nagłówek "9.2. Tabela stawek opłat sieciowych")
2. Wyodrębnij wiersze tabeli według grup taryfowych

Dla każdej stawki określ:
- tariff_code: kod taryfy (np. A23, B11, B21, B22, B23, C11, C12a, C12b, C21, C22a, C22b, C23, G11, G12)
- rate_type: rodzaj stawki w formacie:
  - SIEC_STALA - składnik stały stawki sieciowej
  - SIEC_ZMIENNA_STREFA1 - składnik zmienny strefa 1 (szczyt/dzienna/szczyt przedpołudniowy)
  - SIEC_ZMIENNA_STREFA2 - składnik zmienny strefa 2 (nocna/szczyt popołudniowy)
  - SIEC_ZMIENNA_STREFA3 - składnik zmienny strefa 3 (pozostałe godziny)
  - OPLATA_MOCOWA - opłata mocowa
  - OPLATA_JAKOSCIOWA - opłata jakościowa
  - OPLATA_ABONAMENTOWA - opłata abonamentowa
  - OPLATA_PRZEJSCIOWA - opłata przejściowa
  - ENERGIA_BIERNA - energia bierna
- value: wartość liczbowa stawki (użyj kropki jako separatora dziesiętnego)
- unit: jednostka w znormalizowanym formacie:
  - "zł/MWh" dla [zł/MWh]
  - "zł/kWh" dla [zł/kWh]
  - "zł/kW/mies" dla [zł/kW/m-c] lub [zł/kW/miesiąc]
  - "zł/mies" dla [zł/m-c] lub [zł/miesiąc]
  - "zł/kvarh" dla opłat za energię bierną
- zone_number: numer strefy (1, 2 lub 3) dla stawek zmiennych, null dla stawek stałych
- season: sezon taryfowy:
  - "ALL" dla stawek całorocznych
  - "SUMMER" dla stawek letnich (LATO)
  - "WINTER" dla stawek zimowych (ZIMA)
- description: opis strefy czasowej (np. "szczyt przedpołudniowy", "nocna")
- needsReview: true jeśli wartość jest niepewna lub wymaga weryfikacji

ROZPOZNAWANIE STREF CZASOWYCH:
- "szczyt przedpołudniowy" → zone_number: 1
- "szczyt popołudniowy" → zone_number: 2
- "pozostałe godziny" / "poza szczytem" → zone_number: 3
- "strefa dzienna" → zone_number: 1
- "strefa nocna" → zone_number: 2

ROZPOZNAWANIE SEZONÓW:
- Jeśli tabela ma kolumny ZIMA/LATO, utwórz osobne rekordy z odpowiednim season
- Jeśli nie ma podziału na sezony, użyj season: "ALL"

Każdy wiersz taryfy powinien wygenerować:
- 1 rekord SIEC_STALA (składnik stały)
- N rekordów SIEC_ZMIENNA_STREFAX (po jednym na każdą strefę czasową)`

    if (isEnerga) {
      systemPrompt += `

SPECYFIKA ENERGA:
- Szukaj sekcji "9.2. Tabela stawek opłat sieciowych" lub podobnej
- Tabele Energa często mają strukturę:
  - Kolumny: Grupa taryfowa | Jednostka | Składnik stały | Składnik zmienny (strefy)
  - Podział na strefy: szczyt przedpołudniowy, szczyt popołudniowy, pozostałe godziny
  - Możliwy podział sezonowy: ZIMA, LATO
- Taryfy Energa: A23, B11, B21, B22, B23, C11, C12a, C12b, C12w, C21, C22a, C22b, C23, G11, G12, G12w`
    }

    systemPrompt += `

WYNIK:
Zwróć TYLKO tablicę JSON bez żadnych dodatkowych komentarzy ani formatowania markdown.
Upewnij się że JSON jest kompletny i poprawny składniowo.`

    const userPrompt = `Przeanalizuj załączony dokument PDF z taryfą operatora ${osdName || 'OSD'}.
${tariffCodes?.length ? `Skoncentruj się na taryfach: ${tariffCodes.join(', ')}` : 'Wyekstrahuj stawki dla wszystkich dostępnych taryf.'}

Zwróć wyłącznie tablicę JSON ze stawkami w opisanym formacie.`

    console.log('[parse-rates-pdf] Calling AI gateway with specialized prompt...')

    // Helper function to call AI with retry logic
    async function callAIWithRetry(maxRetries = 2): Promise<{ success: boolean; data?: any; error?: string }> {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`[parse-rates-pdf] AI attempt ${attempt}/${maxRetries}`)
          
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 180000) // 3 minute timeout
          
          const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${lovableApiKey}`,
              'Content-Type': 'application/json',
            },
            signal: controller.signal,
            body: JSON.stringify({
              model: 'google/gemini-2.5-pro',
              messages: [
                { role: 'system', content: systemPrompt },
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: userPrompt },
                    {
                      type: 'image_url',
                      image_url: {
                        url: `data:application/pdf;base64,${base64}`
                      }
                    }
                  ]
                }
              ],
              temperature: 0.1,
              max_tokens: 32000,
            }),
          })
          
          clearTimeout(timeoutId)

          if (!aiResponse.ok) {
            const errorText = await aiResponse.text()
            console.error('[parse-rates-pdf] AI error:', aiResponse.status, errorText)

            if (aiResponse.status === 429) {
              return { success: false, error: 'Przekroczono limit zapytań AI. Spróbuj ponownie za chwilę.' }
            }
            if (aiResponse.status === 402) {
              return { success: false, error: 'Brak środków na AI. Doładuj konto.' }
            }
            
            // Retry on server errors
            if (aiResponse.status >= 500 && attempt < maxRetries) {
              console.log(`[parse-rates-pdf] Server error, retrying in 2s...`)
              await new Promise(r => setTimeout(r, 2000))
              continue
            }

            return { success: false, error: 'Błąd podczas analizy AI' }
          }

          const responseText = await aiResponse.text()
          const aiData = JSON.parse(responseText)
          return { success: true, data: aiData }
          
        } catch (error) {
          console.error(`[parse-rates-pdf] Attempt ${attempt} failed:`, error)
          
          if (error instanceof Error) {
            // Connection/timeout errors - retry
            if (error.name === 'AbortError' || error.message.includes('connection') || error.message.includes('body')) {
              if (attempt < maxRetries) {
                console.log(`[parse-rates-pdf] Connection error, retrying in 3s...`)
                await new Promise(r => setTimeout(r, 3000))
                continue
              }
              return { success: false, error: 'Przekroczono czas oczekiwania na odpowiedź AI. Spróbuj ponownie.' }
            }
          }
          
          return { success: false, error: error instanceof Error ? error.message : 'Nieznany błąd AI' }
        }
      }
      
      return { success: false, error: 'Nie udało się połączyć z AI po kilku próbach' }
    }

    const aiResult = await callAIWithRetry(2)
    
    if (!aiResult.success || !aiResult.data) {
      return new Response(
        JSON.stringify({ success: false, error: aiResult.error || 'Błąd AI', requiresManualMapping: true }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const aiData = aiResult.data
    const rawContent = aiData.choices?.[0]?.message?.content || ''

    console.log('[parse-rates-pdf] AI response received, parsing...')
    console.log('[parse-rates-pdf] Raw content length:', rawContent.length)

    // Extract JSON from the response (handle markdown code blocks)
    let jsonContent = rawContent.trim()
    
    // Remove markdown code blocks if present
    if (jsonContent.startsWith('```')) {
      const firstNewline = jsonContent.indexOf('\n')
      if (firstNewline !== -1) {
        jsonContent = jsonContent.substring(firstNewline + 1)
      }
      const lastBackticks = jsonContent.lastIndexOf('```')
      if (lastBackticks !== -1) {
        jsonContent = jsonContent.substring(0, lastBackticks)
      }
      jsonContent = jsonContent.trim()
    }

    // If the JSON appears truncated, try to fix it
    if (!jsonContent.endsWith(']') && !jsonContent.endsWith('}')) {
      console.log('[parse-rates-pdf] JSON appears truncated, attempting to fix...')
      const lastCompleteObject = jsonContent.lastIndexOf('},')
      if (lastCompleteObject !== -1) {
        jsonContent = jsonContent.substring(0, lastCompleteObject + 1) + ']'
        console.log('[parse-rates-pdf] Truncated JSON fixed by closing array')
      } else {
        const lastObject = jsonContent.lastIndexOf('}')
        if (lastObject !== -1) {
          jsonContent = jsonContent.substring(0, lastObject + 1) + ']'
        }
      }
    }

    let rates: ExtractedRate[] = []
    const parseErrors: string[] = []
    
    try {
      const parsed = JSON.parse(jsonContent)
      rates = Array.isArray(parsed) ? parsed : (parsed.rates || [])
    } catch (parseError) {
      console.error('[parse-rates-pdf] JSON parse error:', parseError)
      parseErrors.push(`Błąd parsowania JSON: ${parseError}`)
      
      // Try to extract individual objects
      try {
        const objectMatches = jsonContent.matchAll(/\{[^{}]*"tariff_code"[^{}]*\}/g)
        const objects: ExtractedRate[] = []
        for (const match of objectMatches) {
          try {
            const obj = JSON.parse(match[0])
            obj.needsReview = true // Mark recovered objects for review
            objects.push(obj)
          } catch {
            parseErrors.push(`Nie udało się sparsować obiektu: ${match[0].substring(0, 50)}...`)
          }
        }
        if (objects.length > 0) {
          console.log(`[parse-rates-pdf] Recovered ${objects.length} rates from partial JSON`)
          rates = objects
        } else {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: 'Nie udało się sparsować odpowiedzi AI',
              requiresManualMapping: true,
              raw_text: rawContent.substring(0, 2000),
              diagnostics: {
                tariffsDetected: [],
                recordCount: 0,
                parseErrors
              }
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      } catch {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Nie udało się sparsować odpowiedzi AI',
            requiresManualMapping: true,
            raw_text: rawContent.substring(0, 2000),
            diagnostics: {
              tariffsDetected: [],
              recordCount: 0,
              parseErrors
            }
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Validate and normalize rates
    const validRates = rates.filter(rate => {
      return rate.tariff_code && 
             rate.rate_type && 
             typeof rate.value === 'number' && 
             !isNaN(rate.value) &&
             rate.unit
    }).map(rate => ({
      tariff_code: rate.tariff_code.toUpperCase(),
      rate_type: rate.rate_type,
      value: rate.value,
      unit: normalizeUnit(rate.unit),
      zone_number: rate.zone_number || null,
      season: rate.season || 'ALL',
      description: rate.description || null,
      needsReview: rate.needsReview || false,
    }))

    // Collect diagnostics
    const tariffsDetected = [...new Set(validRates.map(r => r.tariff_code))]
    
    console.log(`[parse-rates-pdf] Extracted ${validRates.length} valid rates`)
    console.log(`[parse-rates-pdf] Tariffs detected: ${tariffsDetected.join(', ')}`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        rates: validRates,
        total_extracted: rates.length,
        total_valid: validRates.length,
        parserUsed: isEnerga ? 'energa' : 'generic',
        diagnostics: {
          tariffsDetected,
          recordCount: validRates.length,
          parseErrors
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[parse-rates-pdf] Error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Nieznany błąd',
        requiresManualMapping: true
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
