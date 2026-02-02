
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Upload, ScrollText, Loader2, ArrowRight, Clock, Trash2, Plus
} from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function QuotesPage() {
  const [uploading, setUploading] = useState(false);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => { fetchQuotes(); }, []);

  async function fetchQuotes() {
    setLoading(true);
    const { data } = await supabase.from('quotes').select('*').order('created_at', { ascending: false });
    setQuotes(data || []);
    setLoading(false);
  }

  const handleUpload = async (event: any) => {
    try {
      setUploading(true);
      const file = event.target.files[0];
      if (!file) return;

      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 10)}.${fileExt}`;
      const filePath = `quotes/${fileName}`;

      // 1. Feltöltés Storage-ba
      const { error: uploadError } = await supabase.storage.from('invoices').upload(filePath, file);
      if (uploadError) throw new Error('Storage Hiba: ' + uploadError.message);

      // 2. Quote rekord létrehozása
      const { data: quoteData, error: dbError } = await supabase.from('quotes').insert([{ 
        name: file.name,
        storage_path: filePath, 
        status: 'pending'
      }]).select().single();

      if (dbError) throw new Error('DB Hiba: ' + dbError.message);

      // 3. API Hívás (PDF Elemzés)
      const response = await fetch('/api/process-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId: quoteData.id, storagePath: filePath }),
      });

      if (!response.ok) throw new Error('Hiba az elemzés közben');

      router.push(`/quotes/${quoteData.id}`);

    } catch (error: any) {
      alert('Hiba: ' + error.message);
    } finally {
      setUploading(false);
      event.target.value = null; 
    }
  };

  const handleDelete = async (id: string, e: any) => {
    e.stopPropagation();
    e.preventDefault();
    if(!confirm("Biztosan törlöd?")) return;
    await supabase.from('quotes').delete().eq('id', id);
    fetchQuotes();
  };

  return (
    <div className="animate-in fade-in duration-500">
      <div className="mb-10">
        <h1 className="text-4xl font-black text-[#2b251d] tracking-tighter uppercase italic">Árajánlatok</h1>
        <p className="text-[#989168] text-[10px] font-black uppercase tracking-[0.3em] mt-1">Deviz Elemzés és Árazás</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-1">
          <div className="bg-white p-10 rounded-[3.5rem] shadow-xl border-4 border-dashed border-[#e7e8dd] hover:border-[#989168] transition-all group relative overflow-hidden">
            <input type="file" onChange={handleUpload} disabled={uploading} className="absolute inset-0 opacity-0 cursor-pointer z-10" accept=".pdf,image/*" />
            <div className="text-center">
              <div className="bg-[#f7f7f3] w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto mb-6 group-hover:bg-[#2b251d] group-hover:text-white transition-all">
                {uploading ? <Loader2 className="animate-spin text-[#989168]" size={32} /> : <Upload className="text-[#989168]" size={32} />}
              </div>
              <h3 className="text-xl font-black text-[#2b251d] uppercase italic tracking-tight">{uploading ? 'Elemzés...' : 'Új Deviz'}</h3>
              <p className="text-[#c7c8ad] text-[10px] font-bold uppercase mt-2 tracking-widest">PDF Feltöltése</p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-[3.5rem] shadow-xl border border-[#e7e8dd] overflow-hidden">
          <div className="p-8 border-b border-[#f7f7f3] bg-[#f7f7f3]/50">
            <span className="text-[10px] font-black text-[#b6b693] uppercase tracking-widest italic">Dokumentumok</span>
          </div>
          <div className="divide-y divide-[#f7f7f3]">
            {loading ? (
               <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-[#989168]" /></div>
            ) : quotes.length === 0 ? (
               <div className="p-10 text-center text-[#c7c8ad] font-bold text-sm">Nincs feltöltött árajánlat.</div>
            ) : (
              quotes.map((quote) => (
                <div key={quote.id} className="p-6 hover:bg-[#fffcf5] transition-all flex items-center justify-between group cursor-pointer" onClick={() => router.push(`/quotes/${quote.id}`)}>
                  <div className="flex items-center gap-5">
                    <div className="p-4 bg-[#f7f7f3] rounded-2xl text-[#b6b693] group-hover:bg-[#2b251d] group-hover:text-white transition-all"><ScrollText size={24} /></div>
                    <div>
                      <p className="font-black text-[#2b251d] uppercase text-sm tracking-tight">{quote.name}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[9px] font-bold text-[#b6b693] flex items-center gap-1 uppercase"><Clock size={10} /> {new Date(quote.created_at).toLocaleDateString()}</span>
                        <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${quote.status === 'analyzed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {quote.status === 'analyzed' ? 'Beárazva' : 'Nyers'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={(e) => handleDelete(quote.id, e)} className="p-3 bg-white rounded-full text-[#c7c8ad] hover:text-red-500 hover:bg-red-50 transition-all"><Trash2 size={18} /></button>
                    <button className="p-3 bg-white rounded-full text-[#c7c8ad] hover:text-[#2b251d] shadow-sm transition-all border border-transparent hover:border-[#e7e8dd]"><ArrowRight size={20} /></button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
