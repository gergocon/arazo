import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import OpenAI from 'openai';

export async function POST(request: Request) {
  try {
    const { invoiceId, storagePath } = await request.json();
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const { data: fileData } = await supabase.storage.from('invoices').download(storagePath);
    if (!fileData) throw new Error("Fájl nem található");

    const file = await openai.files.create({
      file: new File([fileData], 'invoice.pdf'),
      purpose: "assistants",
    });

    const aiResult = await processWithAssistant(openai, file.id);

    // Számla adatainak frissítése (Beszállító + Státusz)
    await supabase.from('invoices')
      .update({ 
        supplier_name: aiResult.supplier_name || 'Ismeretlen Beszállító',
        status: 'processed' 
      })
      .eq('id', invoiceId);

    // Tételek mentése mértékegységgel együtt
    if (aiResult.items && Array.isArray(aiResult.items)) {
      const itemsToInsert = aiResult.items.map((item: any) => ({
        invoice_id: invoiceId,
        raw_name: item.raw_name,
        quantity: item.quantity || 1,
        unit_price: item.unit_price || 0,
        raw_unit: item.raw_unit || 'buc', // Román mértékegység mentése
        status: 'pending'
      }));
      await supabase.from('invoice_items').insert(itemsToInsert);
    }

    await openai.files.delete(file.id);
    return NextResponse.json({ success: true });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function processWithAssistant(openai: OpenAI, fileId: string) {
  const assistant = await openai.beta.assistants.create({
    model: "gpt-4o",
    instructions: `Építőipari számla elemző vagy. 
    A feladatod:
    1. Keresd meg a számla kiállítóját (supplier_name).
    2. Gyűjtsd ki a tételeket: név (raw_name), mennyiség (quantity), egységár (unit_price) és a számlán szereplő mértékegység (raw_unit - pl: buc, kg, ml, mp, m, set).
    SZIGORÚAN CSAK TISZTA JSON VÁLASZ:
    {
      "supplier_name": "...",
      "items": [{ "raw_name": "...", "quantity": 1, "unit_price": 100, "raw_unit": "buc" }]
    }`,
    tools: [{ type: "file_search" }],
  });

  const thread = await openai.beta.threads.create({
    messages: [{ role: "user", content: "Elemezd a számlát.", attachments: [{ file_id: fileId, tools: [{ type: "file_search" }] }] }],
  });

  const run = await openai.beta.threads.runs.createAndPoll(thread.id, { assistant_id: assistant.id });

  if (run.status === 'completed') {
    const messages = await openai.beta.threads.messages.list(thread.id);
    const content = messages.data[0].content[0] as any;
    const cleanJson = content.text.value.replace(/```json/g, '').replace(/```/g, '').trim();
    const start = cleanJson.indexOf('{');
    const end = cleanJson.lastIndexOf('}');
    return JSON.parse(cleanJson.substring(start, end + 1));
  }
  return { items: [], supplier_name: "Ismeretlen" };
}