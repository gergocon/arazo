'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Upload, FileText, Loader2, ArrowRight, Clock, Filter, X 
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function InvoicesPage() {
  const [uploading, setUploading] = useState(false);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParam = searchParams.get('search'); // URL paraméter kiolvasása

  useEffect(() => { fetchInvoices(); }, [searchParam]); // Újratöltés, ha változik a keresés

  async function fetchInvoices() {
    setLoading(true);
    
    let query = supabase.from('invoices').select('*').order('created_at', { ascending: false });

    // Ha van keresési paraméter az URL-ben, szűrünk a beszállítóra
    if (searchParam) {
      query = query.ilike('supplier_name', `%${searchParam}%`);
    }

    const { data } = await query;
    setInvoices(data || []);
    setLoading(false);
  }

  const handleUpload = async (event: any) => {
    try {
      setUploading(true);
      const file = event.target.files[0];
      if (!file) return;

      // Fájlnév tisztítása és egyedivé tétele
      const fileExt = file.name.split('.').pop();
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 10);
      const fileName = `${Date.now()}_${sanitizedName}.${fileExt}`;
      const filePath = `raw/${fileName}`;

      // 1. Feltöltés Storage-ba
      const { error: uploadError } = await supabase.storage.from('invoices').upload(filePath, file);
      if (uploadError) throw new Error('Storage Hiba: ' + uploadError.message);

      // 2. Számla rekord létrehozása
      const { data: invData, error: dbError } = await supabase.from('invoices').insert([{ 
        storage_path: filePath, status: 'processing', currency: 'RON' 
      }]).select().single();

      if (dbError) throw new Error('DB Hiba: ' + dbError.message);
      if (!invData) throw new Error('Nem sikerült létrehozni a számlát az adatbázisban.');

      // 3. API Hívás (AI Feldolgozás) - SZIGORÚ ELLENŐRZÉSSEL
      const response = await fetch('/api/process-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: invData.id, storagePath: filePath }),
      });

      const result = await response.json();

      if (!response.ok) {
        // Ha az API hibát dob, töröljük a félkész rekordot, hogy ne maradjon szemét
        await supabase.from('invoices').delete().eq('id', invData.id);
        throw new Error(result.error || 'Hiba a számla feldolgozása közben (API).');
      }

      // 4. Átirányítás a Dashboardra
      router.push(`/dashboard/${invData.id}`);

    } catch (error: any) {
      console.error(error);
      alert('Hiba történt: ' + error.message + '\n\nTIPP: Ellenőrizd, hogy lefuttattad-e az új SQL parancsokat (brand oszlop)!');
    } finally {
      setUploading(false);
      // Input mező törlése, hogy ugyanazt a fájlt újra lehessen választani ha kell
      event.target.value = null; 
    }
  };

  return (
    <div className="animate-in fade-in duration-500">
      <div className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-4xl font-black text-[#2b251d] tracking-tighter uppercase italic">Számlák</h1>
          <p className="text-[#989168] text-[10px] font-black uppercase tracking-[0.3em] mt-1">Dokumentum Kezelés</p>
        </div>
        
        {/* Keresési szűrő visszajelzés */}
        {searchParam && (
          <div className="flex items-center gap-2 bg-[#989168] text-white px-4 py-2 rounded-xl shadow-lg animate-in slide-in-from-right">
            <Filter size={14} />
            <span className="text-xs font-bold uppercase tracking-wide">Szűrve: "{searchParam}"</span>
            <button onClick={() => router.push('/invoices')} className="ml-2 hover:bg-white/20 rounded-full p-1 transition-colors">
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-1">
          <div className="bg-white p-10 rounded-[3.5rem] shadow-xl border-4 border-dashed border-[#e7e8dd] hover:border-[#989168] transition-all group relative overflow-hidden">
            <input type="file" onChange={handleUpload} disabled={uploading} className="absolute inset-0 opacity-0 cursor-pointer z-10" accept=".pdf,image/*" />
            <div className="text-center">
              <div className="bg-[#f7f7f3] w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto mb-6 group-hover:bg-[#2b251d] group-hover:text-white transition-all">
                {uploading ? <Loader2 className="animate-spin text-[#989168]" size={32} /> : <Upload className="text-[#989168]" size={32} />}
              </div>
              <h3 className="text-xl font-black text-[#2b251d] uppercase italic tracking-tight">{uploading ? 'Feldolgozás...' : 'Feltöltés'}</h3>
              <p className="text-[#c7c8ad] text-[10px] font-bold uppercase mt-2 tracking-widest">Kattints vagy húzd ide</p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-[3.5rem] shadow-xl border border-[#e7e8dd] overflow-hidden">
          <div className="p-8 border-b border-[#f7f7f3] bg-[#f7f7f3]/50 flex justify-between items-center">
            <span className="text-[10px] font-black text-[#b6b693] uppercase tracking-widest italic">Előzmények</span>
            <span className="bg-white px-3 py-1 rounded-lg text-[9px] font-black text-[#989168] border border-[#e7e8dd]">{invoices.length} SZÁMLA</span>
          </div>
          <div className="divide-y divide-[#f7f7f3]">
            {loading ? (
               <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-[#989168]" /></div>
            ) : invoices.length === 0 ? (
               <div className="p-10 text-center text-[#c7c8ad] font-bold text-sm">Nincs megjeleníthető számla.</div>
            ) : (
              invoices.map((inv) => (
                <div key={inv.id} className="p-6 hover:bg-[#fffcf5] transition-all flex items-center justify-between group">
                  <div className="flex items-center gap-5">
                    <div className="p-4 bg-[#f7f7f3] rounded-2xl text-[#b6b693] group-hover:bg-[#2b251d] group-hover:text-white transition-all"><FileText size={24} /></div>
                    <div>
                      <p className="font-black text-[#2b251d] uppercase text-sm tracking-tight">{inv.supplier_name || 'Elemzés alatt...'}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[9px] font-bold text-[#b6b693] flex items-center gap-1 uppercase"><Clock size={10} /> {new Date(inv.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => router.push(`/dashboard/${inv.id}`)} className="p-3 bg-white rounded-full text-[#c7c8ad] hover:text-[#2b251d] shadow-sm transition-all border border-transparent hover:border-[#e7e8dd]"><ArrowRight size={20} /></button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}