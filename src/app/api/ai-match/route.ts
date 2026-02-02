import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type, Schema } from "@google/genai";

// API Route-hoz külön klienst hozunk létre a stabilitás érdekében
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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
        const delay = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
        console.warn(`Gemini API Rate Limit (${attempt}/${MAX_RETRIES}). Újrapróbálkozás ${Math.round(delay)}ms múlva...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
  throw lastError;
}

export async function POST(request: Request) {
  try {
    const { items } = await request.json();
    
    if (!items || items.length === 0) {
      return NextResponse.json({ matches: {} });
    }

    // 1. STEP: MEMÓRIA ELLENŐRZÉSE (Alias Lookup)
    // Megnézzük, hogy ezekhez a "raw_name"-ekhez van-e már mentett párunk.
    const uniqueNames = [...new Set(items.map((i: any) => i.raw_name))];
    const { data: aliases } = await supabase
      .from('material_aliases')
      .select('alias_name, material_id')
      .in('alias_name', uniqueNames);

    const aliasMatches: { [key: string]: string } = {};
    if (aliases) {
      aliases.forEach((a: any) => {
        aliasMatches[a.alias_name] = a.material_id;
      });
    }

    const finalMatches: { [key: string]: string } = {};
    const itemsForAi: any[] = [];

    // Szétválogatjuk a tételeket: aminek van aliasa, az kész, aminek nincs, megy az AI-nak.
    items.forEach((item: any) => {
      if (aliasMatches[item.raw_name]) {
        // Találat a memóriából -> azonnali match
        finalMatches[item.id] = aliasMatches[item.raw_name];
      } else {
        // Nincs találat -> AI feladat
        itemsForAi.push(item);
      }
    });

    // Ha minden tételhez volt alias, nem kell hívni az AI-t
    if (itemsForAi.length === 0) {
      return NextResponse.json({ matches: finalMatches });
    }

    // 2. STEP: AI MATCHING (Csak a maradékra)
    
    // Lekérjük a teljes anyagkatalógust
    const { data: materials } = await supabase
      .from('materials')
      .select('id, name, unit');

    if (!materials || materials.length === 0) {
      return NextResponse.json({ matches: finalMatches });
    }

    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      console.error("HIBA: API_KEY hiányzik a matching funkcióhoz.");
      // Ha nincs kulcs, csak az alias találatokat adjuk vissza, nem dobunk hibát
      return NextResponse.json({ matches: finalMatches });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Egyszerűsített input az AI-nak
    const simplifiedItems = itemsForAi.map((i: any) => ({
      id: i.id,
      name: i.raw_name,
      unit: i.raw_unit
    }));

    // Séma a válaszhoz
    // Az AI egy objektumot adjon vissza, ahol a kulcsok az Item ID-k, az értékek a Material ID-k
    // Mivel a kulcsok dinamikusak, egyszerűbb egy array-t kérni vissza { itemId, materialId } párokkal.
    const matchSchema: Schema = {
        type: Type.OBJECT,
        properties: {
            matches: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        itemId: { type: Type.STRING },
                        materialId: { type: Type.STRING }
                    },
                    required: ["itemId", "materialId"]
                }
            }
        }
    };

    const prompt = `
      Te egy profi építőipari mennyiségi felmérő vagy.
      
      FELADAT:
      Párosítsd össze a SZÁMLA TÉTELEKET a KATALÓGUS ANYAGOKKAL jelentés, szinonimák és szakmai logika alapján.
      
      SZÁMLA TÉTELEK:
      ${JSON.stringify(simplifiedItems)}

      KATALÓGUS ANYAGOK:
      ${JSON.stringify(materials)}

      INSTRUKCIÓK:
      - Csak akkor párosíts, ha biztos vagy a dolgodban (>90% confidence).
      - Figyeld a mértékegységeket is (pl. 'm' és 'fm' egyezhet).
      - Kezeld a rövidítéseket és elírásokat.
    `;

    // AI Hívás Retry logikával
    const response = await generateWithRetry(ai, {
      model: 'gemini-3-flash-preview',
      config: {
        responseMimeType: 'application/json',
        responseSchema: matchSchema
      },
      contents: prompt
    });

    const resultText = response.text;
    if (resultText) {
        const aiData = JSON.parse(resultText);
        if (aiData.matches) {
            aiData.matches.forEach((match: any) => {
                if (match.itemId && match.materialId) {
                    finalMatches[match.itemId] = match.materialId;
                }
            });
        }
    }

    // 3. EREDMÉNYEK ÖSSZEFÉSÜLÉSE (Alias + AI)
    return NextResponse.json({ matches: finalMatches });

  } catch (error: any) {
    console.error("AI Match Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}