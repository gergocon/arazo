'use client';

import { use, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Check, X, Loader2, PackagePlus, ArrowLeft, 
  Save, Sparkles, Building2, Coins 
} from 'lucide-react';
import Link from 'next/link';

// ROMÁN -> MAGYAR MÉRTÉKEGYSÉG FORDÍTÓ
const unitMap: { [key: string]: string } = {
  'buc': 'db', 'buc.': 'db', 'kg': 'kg', 'm': 'fm', 'ml': 'fm', 'mp': 'm2', 'set': 'szett', 'to': 'tonna'
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function InvoiceMappingPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const invoiceId = resolvedParams.id;

  const [items, setItems] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [invoice, setInvoice] = useState<any>(null);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [supplierName, setSupplierName] = useState('');
  const [currency, setCurrency] = useState<'RON' | 'EUR' | 'HUF'>('RON');
  const [exchangeRate, setExchangeRate] = useState<number>(1);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeItemForNewMaterial, setActiveItemForNewMaterial] = useState<string | null>(null);
  const [newMaterial, setNewMaterial] = useState({ name: '', unit: 'db' });

  useEffect(() => { if (invoiceId) fetchData(); }, [invoiceId]);
  useEffect(() => { if (currency !== 'RON') fetchExchangeRate(); else setExchangeRate(1); }, [currency]);

  async function fetchExchangeRate() {
    try {
      const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${currency}`);
      const data = await res.json();
      setExchangeRate(data.rates['RON']);
    } catch (e) { console.error(e); }
  }

  async function fetchData() {
    setLoading(true);
    try {
      const { data: invData } = await supabase.from('invoices').select('*').eq('id', invoiceId).single();
      setInvoice(invData);
      setSupplierName(invData?.supplier_name || '');

      const [itemsRes, matsRes] = await Promise.all([
        supabase.from('invoice_items').select('*').eq('invoice_id', invoiceId),
        supabase.from('materials').select('*').order('name')
      ]);

      const allMaterials = matsRes.data || [];
      const processedItems = itemsRes.data?.map((item: any) => {
        if (item.confirmed_material_id) return item;
        const match = allMaterials.find((m: any) => 
          item.raw_name.toLowerCase().includes(m.name.toLowerCase()) ||
          m.name.toLowerCase().includes(item.raw_name.toLowerCase())
        );
        return { ...item, tempSelectedId: match?.id || '', isAutoMatched: !!match };
      });

      setItems(processedItems || []);
      setMaterials(allMaterials);

      if (invData?.storage_path) {
        const { data: urlData } = supabase.storage.from('invoices').getPublicUrl(invData.storage_path);
        setPublicUrl(urlData.publicUrl);
      }
    } finally { setLoading(false); }
  }

  const handleSaveNewMaterial = async () => {
    if (!newMaterial.name) return;
    const { data, error } = await supabase.from('materials').insert([newMaterial]).select();
    if (error) return alert("Hiba: " + error.message);

    if (data && data[0]) {
      const created = data[0];
      setMaterials(prev => [...prev, created].sort((a,b) => a.name.localeCompare(b.name)));
      if (activeItemForNewMaterial) {
        setItems(prev => prev.map(it => it.id === activeItemForNewMaterial ? { ...it, tempSelectedId: created.id, isAutoMatched: false } : it));
      }
      setIsModalOpen(false);
      setNewMaterial({ name: '', unit: 'db' });
      setActiveItemForNewMaterial(null);
    }
  };

  const handleConfirm = async (item: any) => {
    const materialId = item.tempSelectedId || item.confirmed_material_id;
    if (!materialId) return alert("Válassz anyagot!");
    const priceInRon = item.unit_price * exchangeRate;
    
    const { error } = await supabase.from('invoice_items')
      .update({ confirmed_material_id: materialId, status: 'confirmed' })
      .eq('id', item.id);

    if (!error) {
      await supabase.from('prices').insert([{ material_id: materialId, invoice_id: invoiceId, unit_price: priceInRon }]);
      setItems(items.map(i => i.id === item.id ? { ...i, status: 'confirmed', confirmed_material_id: materialId, isAutoMatched: false } : i));
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-[#f7f7f3]"><Loader2 className="animate-spin text-[#989168] w-12 h-12" /></div>;

  return (
    <div className="flex flex-col h-screen bg-[#f7f7f3] overflow-hidden font-sans">
      {/* TISZTÍTOTT TOOLBAR */}
      <div className="bg-white border-b border-[#e7e8dd] px-6 py-3 flex items-center justify-between shadow-sm z-20">
        <div className="flex items-center gap-4">
          <Link href="/invoices" className="bg-[#f7f7f3] hover:bg-[#e7e8dd] p-2.5 rounded-xl transition-all text-[#5d5343] border border-[#e7e8dd]"><ArrowLeft size={18} /></Link>
          <div className="h-8 w-px bg-[#e7e8dd] mx-2 hidden md:block"></div>
          
          <div className="flex flex-col">
            <label className="text-[9px] font-black text-[#b6b693] uppercase tracking-widest flex items-center gap-1.5"><Building2 size={10} /> Beszállító</label>
            <div className="flex items-center gap-2 group">
              <input 
                value={supplierName} 
                onChange={(e) => setSupplierName(e.target.value)} 
                className="bg-transparent border-b border-transparent group-hover:border-[#e7e8dd] focus:border-[#989168] p-0 text-sm font-bold text-[#2b251d] focus:ring-0 w-48 transition-all outline-none" 
              />
              <button 
                onClick={async () => { await supabase.from('invoices').update({ supplier_name: supplierName }).eq('id', invoiceId); alert("Mentve!"); }}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-[#989168]"
              >
                <Save size={14} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-[#f7f7f3] p-1 rounded-lg border border-[#e7e8dd]">
            <span className="px-2 text-[#c7c8ad]"><Coins size={14} /></span>
            {(['RON', 'EUR', 'HUF'] as const).map((c) => (
              <button key={c} onClick={() => setCurrency(c)} className={`px-3 py-1 rounded-md text-[10px] font-black transition-all ${currency === c ? 'bg-white text-[#2b251d] shadow-sm' : 'text-[#b6b693] hover:text-[#5d5343]'}`}>{c}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* PDF PANEL */}
        <div className="w-1/2 bg-[#2b251d] p-4 flex items-center justify-center relative overflow-hidden">
          {publicUrl ? (
            invoice?.storage_path?.toLowerCase().endsWith('.pdf') ? (
              <object data={publicUrl} type="application/pdf" className="w-full h-full rounded-2xl shadow-2xl bg-white"><iframe src={publicUrl} className="w-full h-full border-none" /></object>
            ) : <img src={publicUrl} alt="invoice" className="max-w-full max-h-full rounded-lg shadow-2xl" />
          ) : <div className="text-white/20 font-black uppercase tracking-widest">Nincs előnézet</div>}
        </div>

        {/* TÉTELEK PANEL */}
        <div className="w-1/2 bg-white flex flex-col border-l border-[#e7e8dd] shadow-xl z-10">
          <div className="p-6 border-b border-[#f7f7f3] bg-white sticky top-0 z-10">
            <h2 className="text-lg font-black uppercase text-[#2b251d] tracking-tighter italic">Tételek Párosítása</h2>
            <p className="text-[10px] font-bold text-[#b6b693] uppercase tracking-widest mt-1">Ellenőrizd és hagyd jóvá a kinyert adatokat</p>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#fafaf8]">
            {items.map((item) => (
              <div key={item.id} className={`p-5 rounded-2xl transition-all border ${
                item.status === 'confirmed' ? 'bg-[#f0fdf4] border-green-100 opacity-60' : 
                item.isAutoMatched ? 'bg-white border-[#989168] ring-1 ring-[#989168]/20 shadow-md shadow-[#989168]/5' : 'bg-white border-[#e7e8dd]'
              }`}>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-[#2b251d] text-sm">{item.raw_name}</h3>
                    <div className="flex gap-3 mt-1">
                      <span className="text-[10px] font-bold text-[#857b5a] bg-[#f7f7f3] px-2 py-0.5 rounded-md border border-[#e7e8dd] uppercase">
                        {item.quantity} {item.raw_unit}
                      </span>
                      {item.isAutoMatched && !item.confirmed_material_id && (
                        <span className="text-[9px] font-black text-[#989168] flex items-center gap-1 uppercase tracking-widest">
                          <Sparkles size={10} /> Auto-Match
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-[#2b251d]">{(item.unit_price * exchangeRate).toLocaleString()} RON</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <select 
                      disabled={item.status === 'confirmed'}
                      className="w-full p-3 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl text-xs font-bold text-[#2b251d] focus:border-[#989168] outline-none appearance-none cursor-pointer hover:bg-[#e7e8dd] transition-colors"
                      value={item.tempSelectedId || item.confirmed_material_id || ""}
                      onChange={(e) => setItems(items.map(i => i.id === item.id ? { ...i, tempSelectedId: e.target.value, isAutoMatched: false } : i))}
                    >
                      <option value="">Válassz a törzsből...</option>
                      {materials.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                    </select>
                  </div>

                  {item.status !== 'confirmed' && (
                    <>
                      <button onClick={() => { setActiveItemForNewMaterial(item.id); setIsModalOpen(true); }} className="p-3 bg-white border border-[#e7e8dd] hover:border-[#989168] hover:text-[#989168] rounded-xl transition-all text-[#c7c8ad]">
                        <PackagePlus size={16} />
                      </button>
                      <button onClick={() => handleConfirm(item)} className="bg-[#2b251d] hover:bg-[#4e4639] text-white px-5 rounded-xl transition-all shadow-lg shadow-[#2b251d]/10">
                        <Check size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="p-6 bg-white border-t border-[#e7e8dd]">
            <div className="flex justify-between items-center mb-4">
              <span className="text-xs font-black text-[#b6b693] uppercase tracking-widest">Kalkulált végösszeg</span>
              <span className="text-2xl font-black text-[#2b251d] tracking-tighter">
                {items.reduce((sum, it) => sum + (it.unit_price * exchangeRate * (it.quantity || 1)), 0).toLocaleString()} RON
              </span>
            </div>
            <button onClick={() => window.location.href = '/'} className="w-full py-4 bg-[#989168] hover:bg-[#857b5a] text-white font-black uppercase tracking-[0.2em] rounded-xl transition-all shadow-xl shadow-[#989168]/20">
              Feldolgozás Befejezése
            </button>
          </div>
        </div>
      </div>

      {/* ÚJ ANYAG MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-[#2b251d]/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white rounded-[2rem] w-full max-w-sm p-8 shadow-2xl animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-black uppercase text-[#2b251d]">Új Anyag</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-[#c7c8ad] hover:text-[#2b251d] transition-colors"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <input 
                autoFocus 
                placeholder="Anyag megnevezése" 
                className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm" 
                onChange={e => setNewMaterial({...newMaterial, name: e.target.value})} 
              />
              <select 
                className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm appearance-none" 
                onChange={e => setNewMaterial({...newMaterial, unit: e.target.value})}
              >
                <option value="db">Darab (db)</option><option value="kg">Kilogramm (kg)</option><option value="m2">Négyzetméter (m2)</option><option value="fm">Folyóméter (fm)</option>
              </select>
              <button onClick={handleSaveNewMaterial} className="w-full py-4 bg-[#2b251d] text-white font-black rounded-xl hover:bg-[#4e4639] transition-all uppercase tracking-widest text-xs mt-2">Mentés</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}