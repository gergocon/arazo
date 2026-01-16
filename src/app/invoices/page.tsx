'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Upload, FileText, Loader2, AlertCircle, 
  ArrowRight, Clock, Plus 
} from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function InvoicesPage() {
  const [uploading, setUploading] = useState(false);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => { fetchInvoices(); }, []);

  async function fetchInvoices() {
    setLoading(true);
    const { data } = await supabase.from('invoices').select('*').order('created_at', { ascending: false });
    setInvoices(data || []);
    setLoading(false);
  }

  const handleUpload = async (event: any) => {
    try {
      setUploading(true);
      const file = event.target.files[0];
      if (!file) return;

      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `raw/${fileName}`;

      const { error: uploadError } = await supabase.storage.from('invoices').upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: invData, error: dbError } = await supabase.from('invoices').insert([{ 
        storage_path: filePath, status: 'processing', currency: 'RON' 
      }]).select().single();

      if (dbError) throw dbError;

      await fetch('/api/process-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: invData.id, storagePath: filePath }),
      });

      router.push(`/dashboard/${invData.id}`);
    } catch (error: any) {
      alert('Hiba: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="animate-in fade-in duration-500">
      <div className="mb-10">
        <h1 className="text-4xl font-black text-rose-950 tracking-tighter uppercase italic">Számlák</h1>
        <p className="text-rose-300 text-[10px] font-black uppercase tracking-[0.3em] mt-1">Dokumentum Kezelés</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-1">
          <div className="bg-white p-10 rounded-[3.5rem] shadow-xl border-4 border-dashed border-rose-50 hover:border-rose-200 transition-all group relative overflow-hidden">
            <input type="file" onChange={handleUpload} disabled={uploading} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
            <div className="text-center">
              <div className="bg-rose-50 w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto mb-6 group-hover:bg-rose-950 group-hover:text-white transition-all">
                {uploading ? <Loader2 className="animate-spin text-rose-900" size={32} /> : <Upload className="text-rose-900" size={32} />}
              </div>
              <h3 className="text-xl font-black text-rose-950 uppercase italic tracking-tight">{uploading ? 'Feldolgozás...' : 'Feltöltés'}</h3>
              <p className="text-rose-300 text-[10px] font-bold uppercase mt-2 tracking-widest">Kattints vagy húzd ide</p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-[3.5rem] shadow-xl border border-rose-50 overflow-hidden">
          <div className="p-8 border-b border-rose-50 bg-rose-50/20 flex justify-between items-center">
            <span className="text-[10px] font-black text-rose-900 uppercase tracking-widest italic">Előzmények</span>
            <span className="bg-white px-3 py-1 rounded-lg text-[9px] font-black text-rose-300 border border-rose-100">{invoices.length} SZÁMLA</span>
          </div>
          <div className="divide-y divide-rose-50">
            {invoices.map((inv) => (
              <div key={inv.id} className="p-6 hover:bg-rose-50/50 transition-all flex items-center justify-between group">
                <div className="flex items-center gap-5">
                  <div className="p-4 bg-stone-50 rounded-2xl text-rose-200 group-hover:bg-rose-950 group-hover:text-white transition-all"><FileText size={24} /></div>
                  <div>
                    <p className="font-black text-rose-950 uppercase text-sm tracking-tight">{inv.supplier_name || 'Elemzés alatt...'}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[9px] font-bold text-rose-300 flex items-center gap-1 uppercase"><Clock size={10} /> {new Date(inv.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
                <button onClick={() => router.push(`/dashboard/${inv.id}`)} className="p-3 bg-white rounded-full text-rose-200 hover:text-rose-900 shadow-sm transition-all border border-transparent hover:border-rose-100"><ArrowRight size={20} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}