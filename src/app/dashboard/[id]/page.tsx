'use client';

import { use, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Check, X, Loader2, PackagePlus, ArrowLeft, 
  Save, Sparkles, Building2, Coins, Wand2, FolderKanban, Tag, BadgeCheck
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function InvoiceMappingPage({ params }: PageProps) {
  const router = useRouter();
  const resolvedParams = use(params);
  const invoiceId = resolvedParams.id;

  const [items, setItems] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]); // Projektek listája
  const [projectCategories, setProjectCategories] = useState<any[]>([]); // Kiválasztott projekt kategóriái
  const [invoice, setInvoice] = useState<any>(null);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiMatching, setAiMatching] = useState(false);
  const [supplierName, setSupplierName] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>(''); // Kiválasztott projekt
  const [currency, setCurrency] = useState<'RON' | 'EUR' | 'HUF'>('RON');
  const [exchangeRate, setExchangeRate] = useState<number>(1);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeItemForNewMaterial, setActiveItemForNewMaterial] = useState<string | null>(null);
  // ÚJ: brand mező a state-ben
  const [newMaterial, setNewMaterial] = useState({ name: '', unit: 'db', brand: '' });

  useEffect(() => { if (invoiceId) fetchData(); }, [invoiceId]);
  useEffect(() => { if (currency !== 'RON') fetchExchangeRate(); else setExchangeRate(1); }, [currency]);
  
  // Ha változik a projekt, töltsük be a kategóriáit
  useEffect(() => {
    if (selectedProjectId) {
      fetchProjectCategories(selectedProjectId);
    } else {
      setProjectCategories([]);
    }
  }, [selectedProjectId]);

  async function fetchProjectCategories(projId: string) {
    const { data } = await supabase.from('project_categories').select('*').eq('project_id', projId).order('name');
    setProjectCategories(data || []);
  }

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
      // Számla lekérése
      const { data: invData } = await supabase.from('invoices').select('*').eq('id', invoiceId).single();
      if (!invData) {
        // Ha nincs ilyen számla, visszairányítjuk a listára
        router.push('/invoices');
        return;
      }
      setInvoice(invData);
      setSupplierName(invData?.supplier_name || '');
      setSelectedProjectId(invData?.project_id || ''); // Projekt betöltése ha van
      if (invData?.currency) setCurrency(invData.currency); // Pénznem betöltése

      // Ha van már projekt, töltsük be a kategóriákat is
      if (invData?.project_id) {
        const { data: catData } = await supabase.from('project_categories').select('*').eq('project_id', invData.project_id);
        setProjectCategories(catData || []);
      }

      // Párhuzamos adatlekérés: Tételek, Anyagok, Projektek
      const [itemsRes, matsRes, projRes] = await Promise.all([
        supabase.from('invoice_items').select('*').eq('invoice_id', invoiceId),
        supabase.from('materials').select('*').order('name'),
        supabase.from('projects').select('id, name').eq('status', 'active').order('name') // Csak aktív projektek
      ]);

      const allMaterials = matsRes.data || [];
      const processedItems = itemsRes.data?.map((item: any) => ({
        ...item, 
        tempSelectedId: item.confirmed_material_id || '', 
        tempCategoryId: item.project_category_id || '',
        isAutoMatched: false 
      }));

      setItems(processedItems || []);
      setMaterials(allMaterials);
      setProjects(projRes.data || []);

      if (invData?.storage_path) {
        const { data: urlData } = supabase.storage.from('invoices').getPublicUrl(invData.storage_path);
        setPublicUrl(urlData.publicUrl);
      }
    } finally { setLoading(false); }
  }

  const runAiMatching = async () => {
    setAiMatching(true);
    try {
      const pendingItems = items.filter(i => i.status !== 'confirmed');
      const response = await fetch('/api/ai-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: pendingItems })
      });
      const { matches } = await response.json();
      if (matches) {
        setItems(prev => prev.map(item => {
          if (matches[item.id]) {
            return { ...item, tempSelectedId: matches[item.id], isAutoMatched: true };
          }
          return item;
        }));
      }
    } catch (error) {
      console.error("AI Match hiba:", error);
      alert("Nem sikerült az AI párosítás.");
    } finally {
      setAiMatching(false);
    }
  };

  // Beszállító, Projekt ÉS Pénznem mentése egy gombbal
  const handleSaveHeader = async () => {
    setSaveStatus('saving');
    
    const { error } = await supabase.from('invoices')
      .update({ 
        supplier_name: supplierName,
        project_id: selectedProjectId || null,
        currency: currency 
      })
      .eq('id', invoiceId);

    if (error) {
      console.error('Mentési hiba:', error);
      alert('Nem sikerült menteni. Ellenőrizd, hogy lefuttattad-e az SQL parancsokat a Supabase-ben!');
      setSaveStatus('idle');
    } else {
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  };

  const handleSaveNewMaterial = async () => {
    if (!newMaterial.name) return;
    // ÚJ: Márka mentése is
    const { data, error } = await supabase.from('materials').insert([newMaterial]).select();
    if (error) return alert("Hiba: " + error.message);

    if (data && data[0]) {
      const created = data[0];
      setMaterials(prev => [...prev, created].sort((a,b) => a.name.localeCompare(b.name)));
      if (activeItemForNewMaterial) {
        setItems(prev => prev.map(it => it.id === activeItemForNewMaterial ? { ...it, tempSelectedId: created.id, isAutoMatched: false } : it));
      }
      setIsModalOpen(false);
      setNewMaterial({ name: '', unit: 'db', brand: '' });
      setActiveItemForNewMaterial(null);
    }
  };

  const handleConfirm = async (item: any) => {
    const materialId = item.tempSelectedId || item.confirmed_material_id;
    if (!materialId) return alert("Válassz anyagot!");
    
    const categoryId = item.tempCategoryId || item.project_category_id;
    
    const priceInRon = item.unit_price * exchangeRate;
    
    // 1. Tétel frissítése
    const { error } = await supabase.from('invoice_items')
      .update({ 
        confirmed_material_id: materialId, 
        project_category_id: categoryId || null,
        status: 'confirmed' 
      })
      .eq('id', item.id);

    if (!error) {
      // 2. Ártörténet mentése
      await supabase.from('prices').insert([{ material_id: materialId, invoice_id: invoiceId, unit_price: priceInRon }]);
      
      // 3. TANULÁS (Alias mentése)
      await supabase.from('material_aliases').upsert(
        { alias_name: item.raw_name, material_id: materialId }, 
        { onConflict: 'alias_name' }
      );

      // 4. MÁRKA TANULÁS (Ha az anyagnak nincs márkája, de a számlán volt)
      // Ez biztosítja, hogy a katalógusba bekerüljön a márka, ha eddig hiányzott
      if (item.brand) {
        const targetMaterial = materials.find(m => m.id === materialId);
        // Ha az anyagnak még nincs márkája, mentsük el a számláról kapottat
        if (targetMaterial && !targetMaterial.brand) {
          await supabase.from('materials').update({ brand: item.brand }).eq('id', materialId);
          // Helyi state frissítése is, hogy azonnal látszódjon a listában
          setMaterials(prev => prev.map(m => m.id === materialId ? { ...m, brand: item.brand } : m));
        }
      }

      // UI frissítés
      setItems(items.map(i => i.id === item.id ? { 
        ...i, 
        status: 'confirmed', 
        confirmed_material_id: materialId, 
        project_category_id: categoryId,
        isAutoMatched: false 
      } : i));
    } else {
      alert('Hiba a tétel mentésekor: ' + error.message);
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-[#f7f7f3]"><Loader2 className="animate-spin text-[#989168] w-12 h-12" /></div>;

  return (
    <div className="flex flex-col h-screen bg-[#f7f7f3] overflow-hidden font-sans">
      <div className="bg-white border-b border-[#e7e8dd] px-6 py-3 flex items-center justify-between shadow-sm z-20">
        <div className="flex items-center gap-6">
          <Link href="/invoices" className="bg-[#f7f7f3] hover:bg-[#e7e8dd] p-2.5 rounded-xl transition-all text-[#5d5343] border border-[#e7e8dd]"><ArrowLeft size={18} /></Link>
          <div className="h-8 w-px bg-[#e7e8dd] hidden md:block"></div>
          
          {/* BESZÁLLÍTÓ INPUT */}
          <div className="flex flex-col">
            <label className="text-[9px] font-black text-[#b6b693] uppercase tracking-widest flex items-center gap-1.5"><Building2 size={10} /> Beszállító</label>
            <input 
              value={supplierName} 
              onChange={(e) => setSupplierName(e.target.value)} 
              className="bg-transparent border-b border-transparent hover:border-[#e7e8dd] focus:border-[#989168] p-0 text-sm font-bold text-[#2b251d] focus:ring-0 w-48 transition-all outline-none" 
            />
          </div>

          <div className="h-8 w-px bg-[#e7e8dd] hidden md:block"></div>

          {/* PROJEKT VÁLASZTÓ */}
          <div className="flex flex-col">
            <label className="text-[9px] font-black text-[#b6b693] uppercase tracking-widest flex items-center gap-1.5"><FolderKanban size={10} /> Projekt hozzárendelése</label>
            <div className="flex items-center gap-2 group">
              <select 
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="bg-transparent border-b border-transparent group-hover:border-[#e7e8dd] focus:border-[#989168] py-0 pr-4 pl-0 text-sm font-bold text-[#2b251d] focus:ring-0 w-48 transition-all outline-none cursor-pointer appearance-none"
              >
                <option value="">-- Nincs hozzárendelve --</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              
              {/* KÖZÖS MENTÉS GOMB */}
              <button 
                onClick={handleSaveHeader}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-[#989168]"
                disabled={saveStatus === 'saved'}
              >
                {saveStatus === 'saved' ? <Check size={14} className="text-green-500" /> : <Save size={14} />}
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
        <div className="w-1/2 bg-[#2b251d] p-4 flex items-center justify-center relative overflow-hidden">
          {publicUrl ? (
            invoice?.storage_path?.toLowerCase().endsWith('.pdf') ? (
              <object data={publicUrl} type="application/pdf" className="w-full h-full rounded-2xl shadow-2xl bg-white"><iframe src={publicUrl} className="w-full h-full border-none" /></object>
            ) : <img src={publicUrl} alt="invoice" className="max-w-full max-h-full rounded-lg shadow-2xl" />
          ) : <div className="text-white/20 font-black uppercase tracking-widest">Nincs előnézet</div>}
        </div>

        <div className="w-1/2 bg-white flex flex-col border-l border-[#e7e8dd] shadow-xl z-10">
          <div className="p-6 border-b border-[#f7f7f3] bg-white sticky top-0 z-10 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-black uppercase text-[#2b251d] tracking-tighter italic">Tételek Párosítása</h2>
              <p className="text-[10px] font-bold text-[#b6b693] uppercase tracking-widest mt-1">Ellenőrizd és hagyd jóvá</p>
            </div>
            
            <button 
              onClick={runAiMatching} 
              disabled={aiMatching || items.every(i => i.status === 'confirmed')}
              className="bg-gradient-to-r from-[#989168] to-[#b6b693] text-white px-4 py-2.5 rounded-xl shadow-lg shadow-[#989168]/20 flex items-center gap-2 hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {aiMatching ? <Loader2 className="animate-spin" size={16} /> : <Wand2 size={16} />}
              <span className="text-xs font-black uppercase tracking-widest">AI Párosítás</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#fafaf8]">
            {items.map((item) => (
              <div key={item.id} className={`p-5 rounded-2xl transition-all border ${
                item.status === 'confirmed' ? 'bg-[#f0fdf4] border-green-100 opacity-60' : 
                item.isAutoMatched ? 'bg-white border-[#989168] ring-2 ring-[#989168]/10 shadow-lg shadow-[#989168]/5' : 'bg-white border-[#e7e8dd]'
              }`}>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-[#2b251d] text-sm">{item.raw_name}</h3>
                    
                    {/* ÚJ: Márka megjelenítése ha van */}
                    {item.brand && (
                      <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-black text-[#989168] uppercase tracking-wider">
                        <BadgeCheck size={12} /> {item.brand}
                      </span>
                    )}

                    <div className="flex gap-3 mt-1">
                      <span className="text-[10px] font-bold text-[#857b5a] bg-[#f7f7f3] px-2 py-0.5 rounded-md border border-[#e7e8dd] uppercase">
                        {item.quantity} {item.raw_unit}
                      </span>
                      {item.isAutoMatched && !item.confirmed_material_id && (
                        <span className="text-[9px] font-black text-[#989168] flex items-center gap-1 uppercase tracking-widest animate-pulse">
                          <Sparkles size={10} /> AI Javaslat
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-[#2b251d]">{(item.unit_price * exchangeRate).toLocaleString()} RON</p>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <select 
                        disabled={item.status === 'confirmed'}
                        className="w-full p-3 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl text-xs font-bold text-[#2b251d] focus:border-[#989168] outline-none appearance-none cursor-pointer hover:bg-[#e7e8dd] transition-colors"
                        value={item.tempSelectedId || item.confirmed_material_id || ""}
                        onChange={(e) => setItems(items.map(i => i.id === item.id ? { ...i, tempSelectedId: e.target.value, isAutoMatched: false } : i))}
                      >
                        <option value="">Anyag kiválasztása...</option>
                        {materials.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.name} {m.brand ? `[${m.brand}]` : ''} ({m.unit})
                          </option>
                        ))}
                      </select>
                    </div>

                    {item.status !== 'confirmed' && (
                      <button 
                        onClick={() => { 
                          setActiveItemForNewMaterial(item.id); 
                          // Ha az AI talált márkát, előtöltjük a modalba
                          setNewMaterial({ name: item.raw_name, unit: 'db', brand: item.brand || '' }); 
                          setIsModalOpen(true); 
                        }} 
                        className="p-3 bg-white border border-[#e7e8dd] hover:border-[#989168] hover:text-[#989168] rounded-xl transition-all text-[#c7c8ad]"
                      >
                        <PackagePlus size={16} />
                      </button>
                    )}
                  </div>

                  {/* KATEGÓRIA VÁLASZTÓ (Csak ha van projekt kiválasztva) */}
                  {selectedProjectId && (
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#c7c8ad]"><Tag size={12} /></div>
                      <select
                        disabled={item.status === 'confirmed'}
                        className="w-full p-3 pl-8 bg-white border border-[#e7e8dd] rounded-xl text-xs font-bold text-[#5d5343] focus:border-[#989168] outline-none appearance-none cursor-pointer"
                        value={item.tempCategoryId || item.project_category_id || ""}
                        onChange={(e) => setItems(items.map(i => i.id === item.id ? { ...i, tempCategoryId: e.target.value } : i))}
                      >
                        <option value="">Kategória hozzárendelése (Projekt budget)...</option>
                        {projectCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  )}

                  {item.status !== 'confirmed' && (
                    <button onClick={() => handleConfirm(item)} className="w-full py-3 bg-[#2b251d] hover:bg-[#4e4639] text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-[#2b251d]/10 flex items-center justify-center gap-2">
                      <Check size={14} /> Jóváhagyás
                    </button>
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
            {/* JAVÍTOTT NAVIGÁCIÓ: Client-side routing */}
            <button onClick={() => router.push('/')} className="w-full py-4 bg-[#989168] hover:bg-[#857b5a] text-white font-black uppercase tracking-[0.2em] rounded-xl transition-all shadow-xl shadow-[#989168]/20">
              Feldolgozás Befejezése
            </button>
          </div>
        </div>
      </div>

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
                value={newMaterial.name}
                onChange={e => setNewMaterial({...newMaterial, name: e.target.value})} 
              />
              
              {/* ÚJ: Márka input */}
              <input 
                placeholder="Márka (pl. Baumit) - opcionális" 
                className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm" 
                value={newMaterial.brand}
                onChange={e => setNewMaterial({...newMaterial, brand: e.target.value})} 
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