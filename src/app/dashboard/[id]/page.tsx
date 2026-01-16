'use client';

import { use, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Check, Plus, AlertCircle, X, Loader2, 
  PackagePlus, ArrowLeft, Globe, Save, Sparkles 
} from 'lucide-react';
import Link from 'next/link';

const unitMap: { [key: string]: string } = {
  'buc': 'db', 'buc.': 'db', 'kg': 'kg', 'm': 'fm', 'ml': 'fm', 'mp': 'm2', 'set': 'szett', 'to': 'tonna'
};

export default function InvoiceMappingPage({ params }: any) {
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
  
  // MODAL ÉS ÚJ ANYAG ÁLLAPOTOK
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

  // ÚJ ANYAG MENTÉSE ÉS AUTOMATIKUS PÁROSÍTÁSA
  const handleSaveNewMaterial = async () => {
    if (!newMaterial.name) return;
    
    const { data, error } = await supabase
      .from('materials')
      .insert([newMaterial])
      .select();

    if (error) {
      alert("Hiba a mentés során: " + error.message);
      return;
    }

    if (data && data[0]) {
      const createdMaterial = data[0];
      
      // 1. Frissítjük a globális anyaglistát
      setMaterials(prev => [...prev, createdMaterial].sort((a,b) => a.name.localeCompare(b.name)));
      
      // 2. Ha egy konkrét tételről indítottuk a modalt, akkor azt rögtön párosítjuk az újjal
      if (activeItemForNewMaterial) {
        setItems(prevItems => prevItems.map(item => 
          item.id === activeItemForNewMaterial 
            ? { ...item, tempSelectedId: createdMaterial.id, isAutoMatched: false } 
            : item
        ));
      }

      // Reset
      setIsModalOpen(false);
      setNewMaterial({ name: '', unit: 'db' });
      setActiveItemForNewMaterial(null);
    }
  };

  const handleConfirm = async (item: any) => {
    const materialId = item.tempSelectedId || item.confirmed_material_id;
    if (!materialId) return alert("Válassz anyagot!");

    const priceInRon = item.unit_price * exchangeRate;
    const { error } = await supabase.from('invoice_items').update({ confirmed_material_id: materialId, status: 'confirmed' }).eq('id', item.id);

    if (!error) {
      await supabase.from('prices').insert([{ material_id: materialId, invoice_id: invoiceId, unit_price: priceInRon }]);
      setItems(items.map(i => i.id === item.id ? { ...i, status: 'confirmed', confirmed_material_id: materialId, isAutoMatched: false } : i));
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-[#f7f7f3]"><Loader2 className="animate-spin text-[#989168] w-12 h-12" /></div>;

  return (
    <div className="flex flex-col h-screen bg-[#f7f7f3] overflow-hidden font-sans">
      {/* FEJLÉC */}
      <div className="bg-white border-b border-[#e7e8dd] px-6 py-4 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-6">
          <Link href="/invoices" className="hover:bg-[#f7f7f3] p-2 rounded-full transition-all text-[#5d5343]"><ArrowLeft size={20} /></Link>
          <div className="flex flex-col">
            <h1 className="text-xl font-black text-[#2b251d] uppercase tracking-tighter italic underline decoration-[#989168] decoration-4">Párosítás</h1>
            <div className="flex items-center gap-2 bg-[#f7f7f3] px-3 py-1 rounded-lg border border-[#e7e8dd] mt-1">
              <span className="text-[9px] font-black text-[#989168] uppercase">Beszállító:</span>
              <input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} className="bg-transparent border-none p-0 text-xs font-bold text-[#2b251d] focus:ring-0 w-48" />
              <button onClick={async () => { await supabase.from('invoices').update({ supplier_name: supplierName }).eq('id', invoiceId); alert("Mentve!"); }}><Save size={14} className="text-[#989168]" /></button>
            </div>
          </div>
        </div>
        <div className="flex bg-[#f7f7f3] p-1 rounded-xl border border-[#e7e8dd]">
          {(['RON', 'EUR', 'HUF'] as const).map((c) => (
            <button key={c} onClick={() => setCurrency(c)} className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${currency === c ? 'bg-[#2b251d] text-white shadow-md' : 'text-[#b6b693]'}`}>{c}</button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* PDF ELŐNÉZET */}
        <div className="w-1/2 p-6 bg-[#e7e8dd]/50 overflow-y-auto">
          <div className="bg-white rounded-[2.5rem] shadow-2xl h-full flex items-center justify-center relative overflow-hidden border-8 border-white">
            {publicUrl ? (
              invoice?.storage_path?.toLowerCase().endsWith('.pdf') ? (
                <object data={publicUrl} type="application/pdf" className="w-full h-full"><iframe src={publicUrl} className="w-full h-full border-none" /></object>
              ) : <img src={publicUrl} alt="invoice" className="max-w-full h-auto" />
            ) : <AlertCircle className="text-[#c7c8ad] w-12 h-12" />}
          </div>
        </div>

        {/* TÉTELEK LISTÁJA */}
        <div className="w-1/2 p-8 overflow-y-auto bg-white shadow-[-20px_0_30px_rgba(43,37,29,0.02)]">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-black uppercase text-[#2b251d] tracking-tight italic">Beolvasott tételek</h2>
          </div>

          <div className="space-y-4 mb-32">
            {items.map((item) => (
              <div key={item.id} className={`p-6 border-2 rounded-[2rem] transition-all relative overflow-hidden ${
                item.status === 'confirmed' ? 'bg-[#f7f7f3] border-[#e7e8dd]' : 
                item.isAutoMatched ? 'bg-[#e7e8dd]/30 border-[#989168]' : 'bg-white border-[#f7f7f3]'
              }`}>
                {item.isAutoMatched && !item.confirmed_material_id && (
                  <div className="absolute top-0 right-0 bg-[#989168] text-white px-4 py-1 rounded-bl-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-1 animate-pulse">
                    <Sparkles size={10} /> Smart Match
                  </div>
                )}

                <div className="flex justify-between items-start mb-6 pt-2">
                  <div className="flex-1 pr-4">
                    <h3 className="font-bold text-[#2b251d] text-lg leading-tight">{item.raw_name}</h3>
                    <p className="text-[10px] text-[#857b5a] font-bold mt-1 uppercase italic tracking-wider">
                      Számlán: {item.quantity} {item.raw_unit} ({unitMap[item.raw_unit?.toLowerCase()] || item.raw_unit})
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-[#989168] tracking-tighter italic">{(item.unit_price * exchangeRate).toLocaleString()} <span className="text-sm font-bold not-italic">RON</span></p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <select 
                    disabled={item.status === 'confirmed'}
                    className={`flex-1 p-4 rounded-xl text-sm font-bold text-[#2b251d] outline-none transition-all border-2 ${
                      item.isAutoMatched && !item.confirmed_material_id 
                        ? 'bg-white border-[#989168] ring-4 ring-[#f7f7f3]' 
                        : 'bg-[#f7f7f3] border-[#e7e8dd] focus:bg-white focus:border-[#989168]'
                    }`}
                    value={item.tempSelectedId || item.confirmed_material_id || ""}
                    onChange={(e) => setItems(items.map(i => i.id === item.id ? { ...i, tempSelectedId: e.target.value, isAutoMatched: false } : i))}
                  >
                    <option value="" className="text-[#b6b693]">Anyag kiválasztása...</option>
                    {materials.map(m => <option key={m.id} value={m.id} className="text-[#2b251d]">{m.name} ({m.unit})</option>)}
                  </select>

                  {item.status !== 'confirmed' ? (
                    <div className="flex gap-2">
                      <button 
                        onClick={() => {
                          setActiveItemForNewMaterial(item.id);
                          setIsModalOpen(true);
                        }} 
                        className="p-4 bg-[#f7f7f3] hover:bg-[#e7e8dd] rounded-xl transition-all text-[#5d5343]"
                      >
                        <PackagePlus size={20} />
                      </button>
                      <button onClick={() => handleConfirm(item)} className="bg-[#2b251d] text-white px-8 py-4 rounded-xl hover:bg-[#4e4639] transition-all font-black text-xs uppercase tracking-widest">OK</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-[#5d5343] bg-[#e7e8dd] px-8 py-4 rounded-xl font-black text-xs uppercase tracking-widest"><Check size={16} /> KÉSZ</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* VÉGÖSSZEG */}
          <div className="fixed bottom-8 right-8 left-[52%] bg-[#2b251d] text-white p-8 rounded-[2.5rem] shadow-2xl flex justify-between items-center z-20 border-t-4 border-[#4e4639]">
            <div>
              <p className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-1 italic">Kalkulált Összesen</p>
              <h3 className="text-4xl font-black italic tracking-tighter text-[#f7f7f3]">
                {items.reduce((sum, item) => sum + (item.unit_price * exchangeRate * (item.quantity || 1)), 0).toLocaleString()} <span className="text-sm font-bold text-[#b6b693]">RON</span>
              </h3>
            </div>
            <button onClick={() => window.location.href = '/'} className="bg-[#989168] hover:bg-[#857b5a] text-[#2b251d] px-8 py-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-xl">Befejezés</button>
          </div>
        </div>
      </div>

      {/* MODAL: ÚJ ANYAG HOZZÁADÁSA */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-[#2b251d]/60 backdrop-blur-md flex items-center justify-center p-4 z-[100]">
          <div className="bg-white rounded-[3rem] w-full max-w-md p-10 shadow-2xl animate-in zoom-in duration-300 border border-[#e7e8dd]">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black uppercase italic text-[#2b251d] tracking-tighter">Új Anyag Mentése</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-[#f7f7f3] rounded-full text-[#5d5343] transition-colors"><X size={24} /></button>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-2 block">Anyag neve</label>
                <input 
                  autoFocus
                  placeholder="Pl. Ciment Baumit 40kg" 
                  className="w-full p-5 bg-[#f7f7f3] border-2 border-[#e7e8dd] rounded-2xl font-bold text-[#2b251d] focus:border-[#989168] outline-none transition-all" 
                  value={newMaterial.name}
                  onChange={e => setNewMaterial({...newMaterial, name: e.target.value})} 
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-2 block">Mértékegység</label>
                <select 
                  className="w-full p-5 bg-[#f7f7f3] border-2 border-[#e7e8dd] rounded-2xl font-bold text-[#2b251d] focus:border-[#989168] outline-none" 
                  value={newMaterial.unit}
                  onChange={e => setNewMaterial({...newMaterial, unit: e.target.value})}
                >
                  <option value="db">Darab (db)</option>
                  <option value="kg">Kilogramm (kg)</option>
                  <option value="m2">Négyzetméter (m2)</option>
                  <option value="fm">Folyóméter (fm)</option>
                  <option value="zsák">Zsák (zsák)</option>
                </select>
              </div>

              <button 
                onClick={handleSaveNewMaterial}
                className="w-full py-6 bg-[#2b251d] text-[#f7f7f3] font-black rounded-2xl shadow-xl hover:bg-[#4e4639] transition-all uppercase tracking-widest mt-4"
              >
                Hozzáadás az anyagtárba
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}