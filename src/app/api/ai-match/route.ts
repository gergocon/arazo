import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// API Route-hoz külön klienst hozunk létre a stabilitás érdekében
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

    // Ha minden tételhez volt alias, nem kell hívni az OpenAI-t (pénzt spórolunk)
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

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Egyszerűsített input az AI-nak
    const simplifiedItems = itemsForAi.map((i: any) => ({
      id: i.id,
      name: i.raw_name,
      unit: i.raw_unit
    }));

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
      
      VÁLASZ FORMÁTUM (JSON):
      Egy objektumot adj vissza, ahol a kulcs a számla tétel ID, az érték a katalógus anyag ID.
      Példa: { "item_id_1": "material_id_5", "item_id_2": "material_id_8" }
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a helpful JSON matching assistant." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0].message.content;
    const aiResults = content ? JSON.parse(content) : {};

    // 3. EREDMÉNYEK ÖSSZEFÉSÜLÉSE (Alias + AI)
    const combinedMatches = { ...finalMatches, ...aiResults };

    return NextResponse.json({ matches: combinedMatches });

  } catch (error: any) {
    console.error("AI Match Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}