import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RateItem {
  id: string
  rate_card_id: string
  tariff_code: string
  season: string
  rate_type: string
  unit: string
  value: number
  zone_number: number | null
  description: string | null
}

interface RateCard {
  id: string
  osd_id: string
  name: string
  valid_from: string
  valid_to: string | null
  source_document: string | null
}

interface ResolvedRates {
  rateCardId: string
  rateCardName: string
  validFrom: string
  validTo: string | null
  sourceDocument: string | null
  rates: {
    fixedNetworkRate: number | null  // SIEC_STALA [zł/kW/mies]
    variableRates: { zone: number; rate: number; description: string }[]  // SIEC_ZMIENNA per zone [zł/kWh]
    qualityFee: number | null  // OPLATA_JAKOSCIOWA [zł/kWh]
    subscriptionFee: number | null  // OPLATA_ABONAMENTOWA [zł/mies]
    capacityFee: number | null  // OPLATA_MOCOWA
    reactiveEnergyRate: number | null  // ENERGIA_BIERNA
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const osdId = url.searchParams.get('osd_id')
    const tariffCode = url.searchParams.get('tariff')
    const season = url.searchParams.get('season') || 'ALL'
    const dateStr = url.searchParams.get('date') || new Date().toISOString().split('T')[0]

    console.log(`[rates-resolve] Params: osd_id=${osdId}, tariff=${tariffCode}, season=${season}, date=${dateStr}`)

    if (!osdId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: osd_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!tariffCode) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: tariff' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Find the applicable rate card for the given OSD and date
    const { data: rateCards, error: rateCardError } = await supabase
      .from('rate_cards')
      .select('*')
      .eq('osd_id', osdId)
      .lte('valid_from', dateStr)
      .or(`valid_to.is.null,valid_to.gte.${dateStr}`)
      .order('valid_from', { ascending: false })
      .limit(1)

    if (rateCardError) {
      console.error('[rates-resolve] Error fetching rate cards:', rateCardError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch rate cards', details: rateCardError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!rateCards || rateCards.length === 0) {
      console.log('[rates-resolve] No rate card found for given parameters')
      return new Response(
        JSON.stringify({ 
          error: 'NOT_FOUND', 
          message: 'No rate card found for the given OSD and date' 
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const rateCard = rateCards[0] as RateCard
    console.log(`[rates-resolve] Found rate card: ${rateCard.name} (${rateCard.id})`)

    // Get rate items for the rate card and tariff (case-insensitive matching)
    // When season is ALL, we need to fetch all items regardless of season
    // and prefer season-specific rates over ALL rates
    let rateItemsQuery = supabase
      .from('rate_items')
      .select('*')
      .eq('rate_card_id', rateCard.id)
      .ilike('tariff_code', tariffCode)

    // If specific season requested, filter by that season or ALL
    // If ALL requested, get all items (we'll deduplicate later)
    if (season !== 'ALL') {
      rateItemsQuery = rateItemsQuery.or(`season.eq.ALL,season.eq.${season}`)
    }
    // When season is ALL, don't filter by season - get everything

    const { data: rateItems, error: itemsError } = await rateItemsQuery

    if (itemsError) {
      console.error('[rates-resolve] Error fetching rate items:', itemsError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch rate items', details: itemsError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!rateItems || rateItems.length === 0) {
      console.log(`[rates-resolve] No rate items found for tariff ${tariffCode}`)
      return new Response(
        JSON.stringify({ 
          error: 'NOT_FOUND', 
          message: `No rates found for tariff ${tariffCode} in this rate card` 
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[rates-resolve] Found ${rateItems.length} rate items`)

    // Deduplicate items by rate_type (and zone for variable rates)
    // When season=ALL is explicitly requested, prefer ALL rates
    // When a specific season is requested, prefer that season over ALL
    const deduplicateItems = (items: RateItem[], requestedSeason: string): RateItem[] => {
      const grouped = new Map<string, RateItem[]>()
      
      for (const item of items) {
        const key = item.rate_type.startsWith('SIEC_ZMIENNA') 
          ? `${item.rate_type}_${item.zone_number || 1}`
          : item.rate_type
        
        if (!grouped.has(key)) {
          grouped.set(key, [])
        }
        grouped.get(key)!.push(item)
      }
      
      const result: RateItem[] = []
      for (const [, groupItems] of grouped) {
        if (groupItems.length === 1) {
          result.push(groupItems[0])
        } else {
          if (requestedSeason === 'ALL') {
            // When ALL is requested, prefer ALL rates if available
            const allSeason = groupItems.find(i => i.season === 'ALL')
            result.push(allSeason || groupItems[0])
          } else {
            // When specific season requested, prefer that season over ALL
            const specificSeason = groupItems.find(i => i.season === requestedSeason)
            result.push(specificSeason || groupItems[0])
          }
        }
      }
      
      return result
    }

    // Parse rate items into structured response
    const items = deduplicateItems(rateItems as RateItem[], season)
    
    const fixedNetworkItem = items.find(i => i.rate_type === 'SIEC_STALA')
    // Support both SIEC_ZMIENNA and SIEC_ZMIENNA_STREFA* rate types
    const variableItems = items
      .filter(i => i.rate_type === 'SIEC_ZMIENNA' || i.rate_type.startsWith('SIEC_ZMIENNA_STREFA'))
      .map(item => {
        // Extract zone number from rate_type if not set (e.g., SIEC_ZMIENNA_STREFA1 -> 1)
        let zoneNum = item.zone_number
        if (!zoneNum && item.rate_type.startsWith('SIEC_ZMIENNA_STREFA')) {
          const match = item.rate_type.match(/SIEC_ZMIENNA_STREFA(\d+)/)
          zoneNum = match ? parseInt(match[1], 10) : 1
        }
        return { ...item, zone_number: zoneNum || 1 }
      })
      .sort((a, b) => (a.zone_number || 0) - (b.zone_number || 0))
    const qualityFeeItem = items.find(i => i.rate_type === 'OPLATA_JAKOSCIOWA')
    const subscriptionFeeItem = items.find(i => i.rate_type === 'OPLATA_ABONAMENTOWA')
    const capacityFeeItem = items.find(i => i.rate_type === 'OPLATA_MOCOWA')
    const reactiveEnergyItem = items.find(i => i.rate_type === 'ENERGIA_BIERNA')

    const result: ResolvedRates = {
      rateCardId: rateCard.id,
      rateCardName: rateCard.name,
      validFrom: rateCard.valid_from,
      validTo: rateCard.valid_to,
      sourceDocument: rateCard.source_document,
      rates: {
        fixedNetworkRate: fixedNetworkItem?.value ?? null,
        variableRates: variableItems.map(item => ({
          zone: item.zone_number || 1,
          rate: item.value,
          description: item.description || ''
        })),
        qualityFee: qualityFeeItem?.value ?? null,
        subscriptionFee: subscriptionFeeItem?.value ?? null,
        capacityFee: capacityFeeItem?.value ?? null,
        reactiveEnergyRate: reactiveEnergyItem?.value ?? null
      }
    }

    console.log('[rates-resolve] Successfully resolved rates')
    
    return new Response(
      JSON.stringify(result),
      { 
        status: 200, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=86400' // 24h cache
        } 
      }
    )

  } catch (error) {
    console.error('[rates-resolve] Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})