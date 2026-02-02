import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { GoogleGenAI, Type, Schema } from "@google/genai";

// Segédfüggvény az újrapróbálkozáshoz (Rate Limit kezelés)
async function generateWithRetry(ai: GoogleGenAI, params: any) {
  const MAX_RETRIES = 3;
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await ai.models.generateContent(params);
    } catch (error: any) {
      lastError = error;
      const msg = error?.message || JSON.stringify(error);
      
      // Különböző hibaformátumok ellenőrzése (429 = Too Many Requests)
      const isRateLimit = 
        error?.status === 429 || 
        error?.code === 429 || 
        msg.includes('429') || 
        msg.includes('Quota exceeded') ||
        msg.includes('RESOURCE_EXHAUSTED');

      if (isRateLimit || error?.status === 503) {
        if (attempt === MAX_RETRIES) break;
        // Exponenciális várakozás: 2s, 4s, 8s...
        const delay = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
        console.warn(`Gemini API Rate Limit (${attempt}/${MAX_RETRIES}). Újrapróbálkozás ${Math.round(delay)}ms múlva...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error; // Ha más a hiba (pl. érvénytelen kérés), ne próbálkozzunk újra
      }
    }
  }
  throw lastError;
}

export async function POST(request: Request) {
  try {
    const { quoteId, storagePath } = await request.json();
    
    // API Kulcs ellenőrzése
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      console.error("CRITICAL: API_KEY is missing from environment variables.");
      return NextResponse.json(
        { error: "Hiányzik a Google API Kulcs! Ellenőrizd a .env.local fájlt." },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    // Fájl letöltése
    const { data: fileData, error: downloadError } = await supabase.storage.from('invoices').download(storagePath);
    if (downloadError || !fileData) throw new Error("Fájl nem található");

    // Buffer konvertálása Base64 sztringgé
    const arrayBuffer = await fileData.arrayBuffer();
    const base64String = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = storagePath.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';

    // Séma definiálása a válaszhoz
    const quoteSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        items: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              description: { type: Type.STRING, description: "Description of the work or material." },
              quantity: { type: Type.NUMBER, description: "Quantity." },
              unit: { type: Type.STRING, description: "Unit of measurement." },
              unit_price: { type: Type.NUMBER, description: "Unit price if available, otherwise 0." }
            },
            required: ["description", "quantity", "unit"]
          }
        }
      },
      required: ["items"]
    };

    // AI Hívás (Retry logikával)
    const response = await generateWithRetry(ai, {
      model: 'gemini-3-flash-preview',
      config: {
        responseMimeType: 'application/json',
        responseSchema: quoteSchema,
        systemInstruction: `Építőipari költségvetés (Deviz) elemző vagy.
        FELADAT:
        Olvasd be a dokumentumot, és keresd meg a tételes listát (F3-as lista Romániában).
        Gyűjtsd ki a tételeket strukturáltan.
        Csak a konkrét munkatételeket és anyagokat gyűjtsd ki.
        Ha a deviz tartalmaz anyagárat és munkadíjat külön, próbáld meg az anyagárat 'unit_price'-ként visszaadni.`,
      },
      contents: [
        {
          parts: [
            { inlineData: { mimeType: mimeType, data: base64String } },
            { text: "Elemezd a csatolt költségvetést és vond ki a tételeket." }
          ]
        }
      ]
    });

    const resultText = response.text;
    if (!resultText) throw new Error("Az AI nem adott vissza eredményt.");

    const aiResult = JSON.parse(resultText);

    // Eredmények mentése
    if (aiResult.items && Array.isArray(aiResult.items)) {
      const itemsToInsert = aiResult.items.map((item: any) => ({
        quote_id: quoteId,
        raw_text: item.description,
        quantity: item.quantity || 1,
        unit: item.unit || 'db',
        deviz_unit_price: item.unit_price || 0,
        status: 'pending'
      }));
      
      const { error: insertError } = await supabase.from('quote_items').insert(itemsToInsert);
      if (insertError) throw new Error("Hiba a tételek mentésekor: " + insertError.message);
      
      await supabase.from('quotes').update({ status: 'processed' }).eq('id', quoteId);
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("Quote Processing Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}