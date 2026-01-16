'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Database, Search, TrendingDown, TrendingUp, 
  ArrowLeft, Tag, History, LayoutGrid, List, Trophy, Loader2 
} from 'lucide-react';
import Link from 'next/link';

export default function CatalogPage() {
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => { fetchMaterialsWithPrices(); }, []);

  async function fetchMaterialsWithPrices() {
    setLoading(true);
    try {
      const { data } = await supabase.from('materials').select('*, prices(unit_price, created_at, invoices(supplier_name))').order('name');
      setMaterials(data || []);
    } finally { setLoading(false); }
  }

  const filtered = materials.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="animate-in fade-in duration-700">
      {/* FEJLÉC */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-16">
        <div>
          <h1 className="text-5xl font-black text-[#2b251d] tracking-tighter italic uppercase underline decoration-[#989168] decoration-4 underline-offset-8">Katalógus</h1>
          <p className="text-[#857b5a] text-[10px] font-black uppercase tracking-[0.3em] mt-4">Anyagárak és Beszállítói Rangsor</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex bg-white p-1.5 rounded-2xl shadow-xl shadow-[#2b251d]/5 border border-[#e7e8dd]">
            <button onClick={() => setViewMode('grid')} className={`p-3 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-[#2b251d] text-white shadow-lg' : 'text-[#c7c8ad] hover:text-[#989168]'}`}><LayoutGrid size={22} /></button>
            <button onClick={() => setViewMode('list')} className={`p-3 rounded-xl transition-all ${viewMode === 'list' ? 'bg-[#2b251d] text-white shadow-lg' : 'text-[#c7c8ad] hover:text-[#989168]'}`}><List size={22} /></button>
          </div>
          <input 
            type="text" 
            placeholder="Keresés az anyagtárban..." 
            className="pl-6 pr-6 py-4 bg-white border-none rounded-[1.8rem] shadow-xl shadow-[#2b251d]/5 outline-none focus:ring-4 ring-[#f7f7f3] transition-all font-bold w-full md:w-80 text-[#2b251d]" 
            onChange={(e) => setSearchTerm(e.target.value)} 
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-40">
          <Loader2 className="w-12 h-12 animate-spin text-[#989168] opacity-40" />
          <p className="mt-4 text-[10px] font-black uppercase tracking-[0.3em] text-[#b6b693]">Adatok szinkronizálása...</p>
        </div>
      ) : (
        <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10" : "bg-white rounded-[3rem] overflow-hidden shadow-2xl border border-[#e7e8dd]"}>
          {viewMode === 'grid' ? (
            filtered.map(m => <MaterialCard key={m.id} material={m} />)
          ) : (
            <table className="w-full text-left">
              <thead className="bg-[#2b251d] text-white text-[10px] uppercase font-black tracking-widest">
                <tr>
                  <th className="p-8">Megnevezés</th>
                  <th className="p-8 text-center">Egység</th>
                  <th className="p-8 text-right">Legjobb Beszállító</th>
                  <th className="p-8 text-right">Utolsó Ár (RON)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f7f7f3]">
                {filtered.map(m => <MaterialRow key={m.id} material={m} />)}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function MaterialCard({ material }: { material: any }) {
  const prices = material.prices || [];
  const lastPrice = prices.length > 0 ? prices[prices.length - 1].unit_price : 0;
  const bestEntry = prices.length > 0 ? prices.reduce((prev: any, curr: any) => prev.unit_price < curr.unit_price ? prev : curr) : null;
  const isIncreasing = prices.length >= 2 && lastPrice > prices[prices.length - 2].unit_price;

  return (
    <div className="bg-white p-10 rounded-[3.5rem] shadow-xl hover:shadow-[0_30px_60px_-15px_rgba(43,37,29,0.1)] transition-all border-2 border-transparent hover:border-[#989168] group relative overflow-hidden">
      <div className="flex justify-between items-start mb-8">
        <div className="bg-[#f7f7f3] text-[#989168] p-4 rounded-2xl group-hover:bg-[#2b251d] group-hover:text-white transition-all"><Tag size={24} /></div>
        {prices.length > 0 && (
          <div className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest ${isIncreasing ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
            {isIncreasing ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {isIncreasing ? 'Dráguló' : 'Stabil'}
          </div>
        )}
      </div>
      <h3 className="text-2xl font-black text-[#2b251d] mb-1 leading-tight group-hover:text-[#857b5a] transition-colors">{material.name}</h3>
      <p className="text-[#c7c8ad] text-[10px] font-black uppercase tracking-[0.2em] mb-10">{material.unit}</p>
      
      <div className="bg-[#f7f7f3] p-6 rounded-[2rem] border border-[#e7e8dd] mb-8 relative group-hover:bg-[#e7e8dd] transition-colors">
        <Trophy size={40} className="absolute -right-2 -bottom-2 text-[#989168]/20" />
        <p className="text-[9px] font-black text-[#989168] uppercase tracking-widest mb-2 italic">Best Price Source</p>
        <p className="font-bold text-[#2b251d] text-sm truncate mb-1">{bestEntry?.invoices?.supplier_name || 'Nincs adat'}</p>
        <p className="text-xl font-black text-[#5d5343]">{bestEntry?.unit_price.toLocaleString()} RON</p>
      </div>
    </div>
  );
}

function MaterialRow({ material }: { material: any }) {
  const prices = material.prices || [];
  const lastPrice = prices.length > 0 ? prices[prices.length - 1].unit_price : 0;
  const bestEntry = prices.length > 0 ? prices.reduce((prev: any, curr: any) => prev.unit_price < curr.unit_price ? prev : curr) : null;

  return (
    <tr className="hover:bg-[#f7f7f3] transition-colors group">
      <td className="p-8 font-black text-[#2b251d] group-hover:text-[#989168] transition-colors">{material.name}</td>
      <td className="p-8 text-center text-[#b6b693] text-[10px] font-black tracking-widest uppercase">{material.unit}</td>
      <td className="p-8 text-right">
        <p className="text-xs font-bold text-[#4e4639]">{bestEntry?.invoices?.supplier_name || '-'}</p>
        <p className="text-[9px] font-black text-[#989168] uppercase tracking-widest">{bestEntry?.unit_price.toLocaleString()} RON</p>
      </td>
      <td className="p-8 text-right font-black text-[#2b251d] text-lg tracking-tighter">{lastPrice.toLocaleString()} RON</td>
    </tr>
  );
}