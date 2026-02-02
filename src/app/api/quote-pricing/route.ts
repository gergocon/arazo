import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type, Schema } from "@google/genai";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Segédfüggvény az újrapróbálkozáshoz
async function generateWithRetry(ai: GoogleGenAI, params: any) {
  const MAX_RETRIES = 3;
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await ai.models.generateContent(params);
    } catch (error: any) {
      lastError = error;
      const msg = error?.message || JSON.stringify(error);
      
      const isRateLimit = 
        error?.status === 429 || 
        error?.code === 429 || 
        msg.includes('429') || 
        msg.includes('Quota exceeded') || 
        msg.includes('RESOURCE_EXHAUSTED');

      if (isRateLimit || error?.status === 503) {
        if (attempt === MAX_RETRIES) break;
        // Ha rate limit van, akkor is várunk, sőt növeljük a várakozást
        const delay = Math.pow(2, attempt) * 4000 + Math.random() * 1000;
        console.warn(`Gemini API Rate Limit (${attempt}/${MAX_RETRIES}). Várakozás ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
  throw lastError;
}

// ÚJ SÉMA: Tömeges tisztítás (Batch Cleaning)
// Egyszerre több elemet ad vissza
const batchCleaningSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          original_text: { type: Type.STRING, description: "The original input text to map back." },
          clean_name: { 
            type: Type.STRING, 
            description: "The pure product name without verbs like 'install', 'supply'. Keep dimensions." 
          },
          is_service_only: { 
            type: Type.BOOLEAN, 
            description: "True if item is pure labor/transport." 
          }
        },
        required: ["original_text", "clean_name", "is_service_only"]
      }
    }
  }
};

// Séma az árazáshoz (Market Price Search) - Ez marad egyedi
const pricingSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    price: { type: Type.NUMBER, description: "The numeric price found." },
    currency: { type: Type.STRING, description: "Currency code, prefer RON." },
    store_name: { type: Type.STRING, description: "Name of the store (e.g., Dedeman, Mathaus)." },
    found: { type: Type.BOOLEAN, description: "True if a specific price was found." }
  },
  required: ["price", "found"]
};

// Segédfüggvény: Késleltetés (Sleep)
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function POST(request: Request) {
  try {
    const { items, quoteId } = await request.json();
    const apiKey = process.env.API_KEY;
    
    if (!items || items.length === 0) return NextResponse.json({ success: true });

    // Belső anyagok betöltése a gyorskereséshez
    const { data: internalMaterials } = await supabase
      .from('materials')
      .select('name, prices(unit_price, created_at)')
      .order('name');

    let ai: GoogleGenAI | null = null;
    if (apiKey) {
      ai = new GoogleGenAI({ apiKey: apiKey });
    }

    // --- 1. LÉPÉS: BATCH TISZTÍTÁS (OPTIMALIZÁLT) ---
    // Összegyűjtjük az egyedi szövegeket
    const uniqueRawTexts = [...new Set(items.map((i: any) => i.raw_text))];
    
    // Adatstruktúra a feldolgozott adatoknak
    // raw_text -> { clean_name, is_service, price... }
    const processingMap: Record<string, any> = {};

    // Inicializálás
    uniqueRawTexts.forEach((text: any) => {
      processingMap[text] = { 
        clean_name: text, 
        is_service_only: false,
        price_source: 'none',
        final_price: 0,
        market_url: null,
        market_store: null
      };
    });

    if (ai) {
      try {
        // Egyetlen hívással tisztítjuk az összes tételt!
        // Ha túl sok tétel van (>30), darabolhatnánk, de a Gemini context ablaka nagy.
        // Biztonság kedvéért 20-asával küldjük, ha nagyon sok lenne.
        const CHUNK_SIZE = 20;
        for (let i = 0; i < uniqueRawTexts.length; i += CHUNK_SIZE) {
          const chunk = uniqueRawTexts.slice(i, i + CHUNK_SIZE);
          
          const prompt = `
            Clean the following construction items. Remove labor verbs, keep dimensions.
            INPUT ITEMS:
            ${JSON.stringify(chunk)}
          `;

          const cleanResult = await generateWithRetry(ai, {
            model: 'gemini-3-flash-preview',
            config: {
              responseMimeType: 'application/json',
              responseSchema: batchCleaningSchema,
            },
            contents: prompt
          });

          if (cleanResult.text) {
            const cleanData = JSON.parse(cleanResult.text);
            if (cleanData.items) {
              cleanData.items.forEach((res: any) => {
                if (processingMap[res.original_text]) {
                  processingMap[res.original_text].clean_name = res.clean_name;
                  processingMap[res.original_text].is_service_only = res.is_service_only;
                }
              });
            }
          }
          // Kis pihenő a chunkok között
          await sleep(1000); 
        }
      } catch (e) {
        console.warn("Batch cleaning failed, falling back to raw names.", e);
      }
    }

    // --- 2. LÉPÉS: ÁRAZÁS (LOOP WITH THROTTLE) ---
    
    for (const rawText of uniqueRawTexts) {
      const data = processingMap[rawText as string];
      
      // Ha szolgáltatás, skip
      if (data.is_service_only) {
        data.price_source = 'manual'; // Jelöljük, hogy ez kézi/szolgáltatás
        continue;
      }

      // A) BELSŐ KERESÉS (Ingyen van, gyors)
      const internalMatch = internalMaterials?.find(m => 
        m.name.toLowerCase().includes(data.clean_name.toLowerCase()) || 
        data.clean_name.toLowerCase().includes(m.name.toLowerCase())
      );

      if (internalMatch && internalMatch.prices && internalMatch.prices.length > 0) {
        const sortedPrices = internalMatch.prices.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        data.final_price = sortedPrices[0].unit_price;
        data.price_source = 'internal';
        continue; // Megvan az ár, megyünk a következőre
      }

      // B) PIACI KERESÉS (Google Search) - CSAK HA NINCS BELSŐ ÁR
      // FONTOS: Itt vezetjük be a késleltetést a Rate Limit elkerülésére
      if (ai) {
        try {
          // Késleltetés: 4 másodperc várakozás minden keresés előtt
          // Ez biztosítja, hogy max 15 request/perc legyen (60s / 4s = 15)
          await sleep(4000); 

          const searchPrompt = `Find current price for "${data.clean_name}" in Romania (Dedeman, Mathaus). Return price for 1 unit. Ignore labor.`;
          
          const searchResult = await generateWithRetry(ai, {
            model: 'gemini-3-flash-preview',
            contents: searchPrompt,
            config: {
              tools: [{ googleSearch: {} }],
              responseMimeType: 'application/json',
              responseSchema: pricingSchema
            }
          });

          const resultText = searchResult.text;
          
          if (resultText) {
            const priceData = JSON.parse(resultText);
            if (priceData.found && priceData.price > 0) {
              data.final_price = priceData.price;
              data.price_source = 'market';
              data.market_store = priceData.store_name;
              
              const chunks = searchResult.candidates?.[0]?.groundingMetadata?.groundingChunks;
              if (chunks && chunks.length > 0 && chunks[0].web?.uri) {
                data.market_url = chunks[0].web.uri;
              }
            }
          }
        } catch (searchError) {
          console.error(`Market search failed for ${data.clean_name}:`, searchError);
          // Nem állunk meg hiba esetén, folytatjuk a többi tétellel
        }
      }
    }

    // --- 3. LÉPÉS: ADATBÁZIS UPDATE ---
    // Tömeges update helyett elemenként update, de ez már SQL hívás, bírni fogja
    for (const item of items) {
      const result = processingMap[item.raw_text];
      if (result) {
        await supabase.from('quote_items').update({
          internal_unit_price: result.price_source === 'internal' ? result.final_price : null,
          market_unit_price: result.price_source === 'market' ? result.final_price : null,
          market_source_url: result.market_url,
          market_source_name: result.market_store,
          selected_price_source: result.price_source
        }).eq('id', item.id);
      }
    }

    // Státusz frissítése
    await supabase.from('quotes').update({ status: 'analyzed' }).eq('id', quoteId);

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("Pricing API Critical Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}