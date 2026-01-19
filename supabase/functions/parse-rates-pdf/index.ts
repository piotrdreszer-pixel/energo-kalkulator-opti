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
}

interface ExtractionResult {
  success: boolean
  rates: ExtractedRate[]
  raw_text?: string
  error?: string
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
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Brak autoryzacji' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create admin client for storage access
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Create user client for auth check
    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    })

    // Verify user is admin
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nieautoryzowany użytkownik' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle()

    if (!roleData) {
      return new Response(
        JSON.stringify({ success: false, error: 'Brak uprawnień administratora' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { filePath, osdName, tariffCodes } = await req.json()

    if (!filePath) {
      return new Response(
        JSON.stringify({ success: false, error: 'Brak ścieżki do pliku' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[parse-rates-pdf] Processing file: ${filePath} for OSD: ${osdName}`)

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
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))

    console.log(`[parse-rates-pdf] File size: ${arrayBuffer.byteLength} bytes`)

    // Use AI to extract rates from PDF
    const systemPrompt = `Jesteś ekspertem od polskich taryf energetycznych OSD (Operatorów Sieci Dystrybucyjnych).
Twoim zadaniem jest analiza dokumentu PDF zawierającego taryfę dystrybucyjną i wyekstrahowanie wszystkich stawek.

Dla każdej stawki określ:
- tariff_code: kod taryfy (np. C11, C12a, C12b, C21, C22a, C22b, C23, B11, B21, B22, B23)
- rate_type: rodzaj stawki:
  - SIEC_STALA - opłata sieciowa stała (składnik stały stawki sieciowej)
  - SIEC_ZMIENNA_STREFA1 - opłata sieciowa zmienna strefa 1 (szczyt)
  - SIEC_ZMIENNA_STREFA2 - opłata sieciowa zmienna strefa 2 (reszta dnia)
  - SIEC_ZMIENNA_STREFA3 - opłata sieciowa zmienna strefa 3 (noc)
  - OPLATA_MOCOWA - opłata mocowa
  - OPLATA_JAKOSCIOWA - opłata jakościowa
  - OPLATA_ABONAMENTOWA - opłata abonamentowa
  - OPLATA_PRZEJSCIOWA - opłata przejściowa
  - ENERGIA_BIERNA - energia bierna
- value: wartość liczbowa stawki (użyj kropki jako separatora dziesiętnego)
- unit: jednostka (np. zł/kW/mies, zł/kWh, zł/mies, zł/kvarh)
- zone_number: numer strefy (1, 2 lub 3 dla stawek zmiennych, null dla pozostałych)
- season: sezon (ALL dla całorocznych, SUMMER dla letnich, WINTER dla zimowych)
- description: opcjonalny opis

Zwróć wyniki jako tablicę JSON z obiektami zawierającymi powyższe pola.
Upewnij się, że wszystkie wartości liczbowe są poprawnie wyekstrahowane - zwróć szczególną uwagę na przecinki i kropki dziesiętne.
Jeśli taryfa ma podział na strefy czasowe, przypisz odpowiedni zone_number.`

    const userPrompt = `Przeanalizuj załączony dokument PDF z taryfą operatora ${osdName || 'OSD'}.
${tariffCodes?.length ? `Skoncentruj się na taryfach: ${tariffCodes.join(', ')}` : 'Wyekstrahuj stawki dla wszystkich dostępnych taryf.'}

Zwróć wyłącznie tablicę JSON ze stawkami, bez żadnego dodatkowego tekstu.`

    console.log('[parse-rates-pdf] Calling AI gateway...')

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
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
        max_tokens: 8000,
      }),
    })

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text()
      console.error('[parse-rates-pdf] AI error:', aiResponse.status, errorText)

      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: 'Przekroczono limit zapytań AI. Spróbuj ponownie za chwilę.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ success: false, error: 'Brak środków na AI. Doładuj konto.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ success: false, error: 'Błąd podczas analizy AI' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const aiData = await aiResponse.json()
    const rawContent = aiData.choices?.[0]?.message?.content || ''

    console.log('[parse-rates-pdf] AI response received, parsing...')

    // Extract JSON from the response (handle markdown code blocks)
    let jsonContent = rawContent
    const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonContent = jsonMatch[1].trim()
    }

    let rates: ExtractedRate[] = []
    try {
      const parsed = JSON.parse(jsonContent)
      rates = Array.isArray(parsed) ? parsed : (parsed.rates || [])
    } catch (parseError) {
      console.error('[parse-rates-pdf] JSON parse error:', parseError)
      console.log('[parse-rates-pdf] Raw content:', rawContent.substring(0, 500))
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Nie udało się sparsować odpowiedzi AI',
          raw_text: rawContent.substring(0, 1000)
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate and clean rates
    const validRates = rates.filter(rate => {
      return rate.tariff_code && 
             rate.rate_type && 
             typeof rate.value === 'number' && 
             !isNaN(rate.value) &&
             rate.unit
    }).map(rate => ({
      ...rate,
      zone_number: rate.zone_number || null,
      season: rate.season || 'ALL',
      description: rate.description || null,
    }))

    console.log(`[parse-rates-pdf] Extracted ${validRates.length} valid rates`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        rates: validRates,
        total_extracted: rates.length,
        total_valid: validRates.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[parse-rates-pdf] Error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Nieznany błąd' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
