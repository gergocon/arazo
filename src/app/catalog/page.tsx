'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  TrendingDown, TrendingUp, Tag, LayoutGrid, List, Trophy, Loader2, Search,
  Filter, ChevronDown, ChevronUp, X, ArrowUpDown, Calendar, Pencil, AlertTriangle, Check, BadgeCheck
} from 'lucide-react';

export default function CatalogPage() {
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  // EDIT STATES
  const [editingMaterial, setEditingMaterial] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ name: '', unit: '', brand: '' });
  
  // Szűrő és Kereső State-ek
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    supplier: 'all',
    brand: 'all', // ÚJ: Márka szűrő
    trend: 'all', // 'increasing', 'decreasing', 'stable'
    unit: 'all'
  });
  
  // Rendezés State
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ 
    key: 'name', 
    direction: 'asc' 
  });

  useEffect(() => { fetchMaterialsWithPrices(); }, []);

  async function fetchMaterialsWithPrices() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('materials')
        .select('*, prices(unit_price, created_at, invoices(supplier_name))')
        .order('name');
      setMaterials(data || []);
    } finally { setLoading(false); }
  }

  // --- EDIT FUNCTIONS ---
  const handleEditClick = (material: any) => {
    setEditingMaterial(material);
    setEditForm({ name: material.name, unit: material.unit, brand: material.brand || '' });
  };

  const handleSaveMaterial = async () => {
    if (!editingMaterial) return;
    
    try {
      const { error } = await supabase
        .from('materials')
        .update({ name: editForm.name, unit: editForm.unit, brand: editForm.brand })
        .eq('id', editingMaterial.id);

      if (error) throw error;

      // Lista frissítése
      setMaterials(materials.map(m => m.id === editingMaterial.id ? { ...m, name: editForm.name, unit: editForm.unit, brand: editForm.brand } : m));
      setEditingMaterial(null);
    } catch (err: any) {
      alert("Hiba a mentéskor: " + err.message);
    }
  };

  // --- HELPER FÜGGVÉNYEK ---
  
  const getLatestPrice = (m: any) => {
    if (!m.prices || m.prices.length === 0) return 0;
    // Feltételezzük, hogy a DB-ből időrendben jön, vagy rendezzük itt
    const sorted = [...m.prices].sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return sorted[sorted.length - 1].unit_price;
  };

  const getPreviousPrice = (m: any) => {
    if (!m.prices || m.prices.length < 2) return getLatestPrice(m);
    const sorted = [...m.prices].sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return sorted[sorted.length - 2].unit_price;
  };

  const getTrendStatus = (m: any) => {
    const current = getLatestPrice(m);
    const prev = getPreviousPrice(m);
    if (current > prev) return 'increasing';
    if (current < prev) return 'decreasing';
    return 'stable';
  };

  const getBestSupplierName = (m: any) => {
    if (!m.prices || m.prices.length === 0) return 'Nincs adat';
    const best = m.prices.reduce((prev: any, curr: any) => prev.unit_price < curr.unit_price ? prev : curr);
    return best.invoices?.supplier_name || 'Ismeretlen';
  };

  // --- MEMOIZED SZŰRÉS ÉS RENDEZÉS ---

  const availableSuppliers = useMemo(() => {
    const suppliers = new Set<string>();
    materials.forEach(m => m.prices?.forEach((p: any) => {
      if (p.invoices?.supplier_name) suppliers.add(p.invoices.supplier_name);
    }));
    return Array.from(suppliers).sort();
  }, [materials]);

  // ÚJ: Elérhető márkák
  const availableBrands = useMemo(() => {
    const brands = new Set<string>();
    materials.forEach(m => { if(m.brand) brands.add(m.brand); });
    return Array.from(brands).sort();
  }, [materials]);

  const availableUnits = useMemo(() => {
    const units = new Set<string>();
    materials.forEach(m => { if(m.unit) units.add(m.unit); });
    return Array.from(units).sort();
  }, [materials]);

  const processedMaterials = useMemo(() => {
    let result = [...materials];

    // 1. Keresés
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(m => m.name.toLowerCase().includes(lower) || (m.brand && m.brand.toLowerCase().includes(lower)));
    }

    // 2. Szűrés
    if (filters.supplier !== 'all') {
      result = result.filter(m => m.prices?.some((p: any) => p.invoices?.supplier_name === filters.supplier));
    }
    if (filters.unit !== 'all') {
      result = result.filter(m => m.unit === filters.unit);
    }
    if (filters.brand !== 'all') {
      result = result.filter(m => m.brand === filters.brand);
    }
    if (filters.trend !== 'all') {
      result = result.filter(m => getTrendStatus(m) === filters.trend);
    }

    // 3. Rendezés
    result.sort((a, b) => {
      let valA, valB;

      switch (sortConfig.key) {
        case 'price':
          valA = getLatestPrice(a);
          valB = getLatestPrice(b);
          break;
        case 'trend':
          // Százalékos változás alapján
          const trendA = (getLatestPrice(a) - getPreviousPrice(a)) / getPreviousPrice(a);
          const trendB = (getLatestPrice(b) - getPreviousPrice(b)) / getPreviousPrice(b);
          valA = isNaN(trendA) ? 0 : trendA;
          valB = isNaN(trendB) ? 0 : trendB;
          break;
        case 'unit':
          valA = a.unit;
          valB = b.unit;
          break;
        case 'date':
           // Utolsó árváltozás dátuma
           const dateA = a.prices?.length ? new Date(a.prices[a.prices.length-1].created_at).getTime() : 0;
           const dateB = b.prices?.length ? new Date(b.prices[b.prices.length-1].created_at).getTime() : 0;
           valA = dateA;
           valB = dateB;
           break;
        default: // 'name'
          valA = a.name.toLowerCase();
          valB = b.name.toLowerCase();
      }

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [materials, searchTerm, filters, sortConfig]);

  const handleSort = (key: string) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const resetFilters = () => {
    setFilters({ supplier: 'all', trend: 'all', unit: 'all', brand: 'all' });
    setSearchTerm('');
  };

  const hasActiveFilters = searchTerm !== '' || filters.supplier !== 'all' || filters.trend !== 'all' || filters.unit !== 'all' || filters.brand !== 'all';

  return (
    <div className="animate-in fade-in duration-700 pb-20">
      {/* FEJLÉC ÉS KERESŐ */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8 mb-8">
        <div>
          <h1 className="text-4xl font-black text-[#2b251d] tracking-tighter italic uppercase underline decoration-[#989168] decoration-4 underline-offset-8">Katalógus</h1>
          <p className="text-[#857b5a] text-[10px] font-black uppercase tracking-[0.3em] mt-3">Anyagárak és Beszállítók</p>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
          {/* SEARCH BAR */}
          <div className="relative group w-full md:w-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#c7c8ad] group-focus-within:text-[#2b251d] transition-colors" size={18} />
            <input 
              type="text" 
              placeholder="Keresés név vagy márka szerint..." 
              value={searchTerm}
              className="pl-12 pr-6 py-3 bg-white border border-[#e7e8dd] rounded-2xl shadow-sm outline-none focus:border-[#989168] focus:ring-4 focus:ring-[#f7f7f3] transition-all font-bold text-sm text-[#2b251d] w-full md:w-64" 
              onChange={(e) => setSearchTerm(e.target.value)} 
            />
          </div>
          
          {/* VIEW TOGGLE */}
          <div className="flex bg-white p-1 rounded-2xl border border-[#e7e8dd] shadow-sm">
            <button onClick={() => setViewMode('grid')} className={`p-2.5 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-[#2b251d] text-white shadow-md' : 'text-[#c7c8ad] hover:text-[#2b251d]'}`}><LayoutGrid size={18} /></button>
            <button onClick={() => setViewMode('list')} className={`p-2.5 rounded-xl transition-all ${viewMode === 'list' ? 'bg-[#2b251d] text-white shadow-md' : 'text-[#c7c8ad] hover:text-[#2b251d]'}`}><List size={18} /></button>
          </div>
        </div>
      </div>

      {/* FILTER SÁV */}
      <div className="bg-white p-4 rounded-[2rem] border border-[#e7e8dd] shadow-sm mb-10 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 px-3 text-[#b6b693] font-bold text-xs uppercase tracking-widest border-r border-[#e7e8dd] mr-2">
          <Filter size={14} /> Szűrők
        </div>

        {/* Beszállító Filter */}
        <div className="relative group">
          <select 
            className="appearance-none bg-[#f7f7f3] hover:bg-[#e7e8dd] pl-4 pr-10 py-2.5 rounded-xl text-xs font-bold text-[#2b251d] outline-none cursor-pointer transition-colors border border-transparent focus:border-[#989168]"
            value={filters.supplier}
            onChange={(e) => setFilters({...filters, supplier: e.target.value})}
          >
            <option value="all">Minden Beszállító</option>
            {availableSuppliers.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#c7c8ad] pointer-events-none" />
        </div>

        {/* ÚJ: Márka Filter */}
        <div className="relative group">
          <select 
            className="appearance-none bg-[#f7f7f3] hover:bg-[#e7e8dd] pl-4 pr-10 py-2.5 rounded-xl text-xs font-bold text-[#2b251d] outline-none cursor-pointer transition-colors border border-transparent focus:border-[#989168]"
            value={filters.brand}
            onChange={(e) => setFilters({...filters, brand: e.target.value})}
          >
            <option value="all">Minden Márka</option>
            {availableBrands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#c7c8ad] pointer-events-none" />
        </div>

        {/* Trend Filter */}
        <div className="relative group">
          <select 
            className="appearance-none bg-[#f7f7f3] hover:bg-[#e7e8dd] pl-4 pr-10 py-2.5 rounded-xl text-xs font-bold text-[#2b251d] outline-none cursor-pointer transition-colors border border-transparent focus:border-[#989168]"
            value={filters.trend}
            onChange={(e) => setFilters({...filters, trend: e.target.value})}
          >
            <option value="all">Minden Ármozgás</option>
            <option value="increasing">Dráguló (Trend ↑)</option>
            <option value="decreasing">Csökkenő (Trend ↓)</option>
            <option value="stable">Stabil</option>
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#c7c8ad] pointer-events-none" />
        </div>

        {/* Egység Filter */}
        <div className="relative group">
          <select 
            className="appearance-none bg-[#f7f7f3] hover:bg-[#e7e8dd] pl-4 pr-10 py-2.5 rounded-xl text-xs font-bold text-[#2b251d] outline-none cursor-pointer transition-colors border border-transparent focus:border-[#989168]"
            value={filters.unit}
            onChange={(e) => setFilters({...filters, unit: e.target.value})}
          >
            <option value="all">Minden Egység</option>
            {availableUnits.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#c7c8ad] pointer-events-none" />
        </div>

        {/* Reset Gomb */}
        {hasActiveFilters && (
          <button 
            onClick={resetFilters}
            className="ml-auto flex items-center gap-2 px-4 py-2 bg-[#2b251d] text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-[#4e4639] transition-all animate-in fade-in zoom-in duration-300"
          >
            <X size={14} /> Törlés
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-40">
          <Loader2 className="w-12 h-12 animate-spin text-[#989168] opacity-40" />
          <p className="mt-4 text-[10px] font-black uppercase tracking-[0.3em] text-[#b6b693]">Katalógus betöltése...</p>
        </div>
      ) : processedMaterials.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-[3rem] border border-dashed border-[#e7e8dd]">
          <p className="text-[#b6b693] font-bold uppercase tracking-widest">Nincs találat a keresési feltételekre.</p>
          <button onClick={resetFilters} className="mt-4 text-[#989168] font-black text-xs uppercase underline">Szűrők törlése</button>
        </div>
      ) : (
        <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8" : "bg-white rounded-[2.5rem] overflow-hidden shadow-xl border border-[#e7e8dd]"}>
          {viewMode === 'grid' ? (
            processedMaterials.map(m => <MaterialCard key={m.id} material={m} getLatestPrice={getLatestPrice} getTrendStatus={getTrendStatus} onEdit={handleEditClick} />)
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[#f7f7f3] text-[#2b251d] text-[10px] uppercase font-black tracking-widest">
                  <tr>
                    <SortableHeader label="Megnevezés" sortKey="name" currentSort={sortConfig} onSort={handleSort} className="pl-8" />
                    <SortableHeader label="Egység" sortKey="unit" currentSort={sortConfig} onSort={handleSort} className="text-center" />
                    <th className="p-6 text-right cursor-default">Legjobb Beszállító</th>
                    <SortableHeader label="Trend" sortKey="trend" currentSort={sortConfig} onSort={handleSort} className="text-center" />
                    <SortableHeader label="Utolsó Ár" sortKey="price" currentSort={sortConfig} onSort={handleSort} className="text-right pr-8" />
                    <th className="p-6"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f7f7f3]">
                  {processedMaterials.map(m => (
                    <MaterialRow 
                      key={m.id} 
                      material={m} 
                      latestPrice={getLatestPrice(m)} 
                      trend={getTrendStatus(m)}
                      bestSupplier={getBestSupplierName(m)}
                      onEdit={handleEditClick}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* EDIT MODAL */}
      {editingMaterial && (
        <div className="fixed inset-0 bg-[#2b251d]/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100] overflow-y-auto">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-black uppercase text-[#2b251d]">Anyag Szerkesztése</h2>
              <button onClick={() => setEditingMaterial(null)} className="text-[#c7c8ad] hover:text-[#2b251d] transition-colors"><X size={20} /></button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-2 block ml-2">Megnevezés</label>
                <input 
                  className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm" 
                  value={editForm.name}
                  onChange={e => setEditForm({...editForm, name: e.target.value})} 
                />
              </div>

              {/* ÚJ: Márka input */}
              <div>
                <label className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-2 block ml-2">Márka</label>
                <input 
                  placeholder='pl. Baumit'
                  className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm" 
                  value={editForm.brand}
                  onChange={e => setEditForm({...editForm, brand: e.target.value})} 
                />
              </div>
              
              <div>
                <label className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-2 block ml-2">Mértékegység</label>
                <select 
                  className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm appearance-none cursor-pointer"
                  value={editForm.unit}
                  onChange={e => setEditForm({...editForm, unit: e.target.value})}
                >
                  <option value="db">Darab (db)</option>
                  <option value="kg">Kilogramm (kg)</option>
                  <option value="m2">Négyzetméter (m2)</option>
                  <option value="m3">Köbméter (m3)</option>
                  <option value="fm">Folyóméter (fm)</option>
                  <option value="zsák">Zsák</option>
                  <option value="szett">Szett</option>
                </select>
              </div>

              {/* Warning box */}
              {editForm.unit !== editingMaterial.unit && (
                <div className="bg-yellow-50 border border-yellow-100 p-4 rounded-xl flex items-start gap-3 text-yellow-700">
                  <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
                  <p className="text-xs font-bold leading-relaxed">
                    A mértékegység módosítása nem váltja át automatikusan a korábbi mennyiségeket! Csak a megjelenítés változik.
                  </p>
                </div>
              )}

              <div className="pt-4">
                <button onClick={handleSaveMaterial} className="w-full py-4 bg-[#2b251d] text-white font-black rounded-xl hover:bg-[#4e4639] transition-all uppercase tracking-widest text-xs flex justify-center items-center gap-2">
                  <Check size={16} /> Mentés
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- ALKOMPONENSEK ---

function SortableHeader({ label, sortKey, currentSort, onSort, className = "" }: any) {
  const isActive = currentSort.key === sortKey;
  return (
    <th 
      onClick={() => onSort(sortKey)} 
      className={`p-6 cursor-pointer hover:bg-[#e7e8dd] transition-colors select-none group ${className}`}
    >
      <div className={`flex items-center gap-2 ${className.includes('text-right') ? 'justify-end' : className.includes('text-center') ? 'justify-center' : 'justify-start'}`}>
        {label}
        <div className={`text-[#989168] transition-opacity ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}>
          {isActive && currentSort.direction === 'desc' ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </div>
      </div>
    </th>
  );
}

function MaterialCard({ material, getLatestPrice, getTrendStatus, onEdit }: any) {
  const lastPrice = getLatestPrice(material);
  const trend = getTrendStatus(material);
  const prices = material.prices || [];
  const bestEntry = prices.length > 0 ? prices.reduce((prev: any, curr: any) => prev.unit_price < curr.unit_price ? prev : curr) : null;

  return (
    <div className="bg-white p-8 rounded-[2.5rem] shadow-sm hover:shadow-xl hover:shadow-[#2b251d]/5 transition-all border border-[#e7e8dd] hover:border-[#989168] group relative flex flex-col justify-between h-full animate-in zoom-in duration-300">
      
      {/* Edit Button */}
      <button 
        onClick={() => onEdit(material)}
        className="absolute top-6 right-6 p-2 bg-[#f7f7f3] text-[#c7c8ad] rounded-full hover:bg-[#2b251d] hover:text-white transition-colors opacity-0 group-hover:opacity-100"
      >
        <Pencil size={14} />
      </button>

      <div>
        <div className="flex justify-between items-start mb-6">
          <div className="bg-[#f7f7f3] text-[#c7c8ad] p-3 rounded-2xl group-hover:bg-[#2b251d] group-hover:text-white transition-all"><Tag size={20} /></div>
          {prices.length > 0 && (
            <div className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${trend === 'increasing' ? 'bg-red-50 text-red-600' : trend === 'decreasing' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
              {trend === 'increasing' ? <TrendingUp size={12} /> : trend === 'decreasing' ? <TrendingDown size={12} /> : <ArrowUpDown size={12} />}
              {trend === 'increasing' ? 'Dráguló' : trend === 'decreasing' ? 'Olcsóbb' : 'Stabil'}
            </div>
          )}
        </div>
        
        {/* ÚJ: Márka megjelenítése - Badge stílusban */}
        {material.brand && (
          <div className="mb-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#2b251d] text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-sm">
              <BadgeCheck size={12} className="text-[#989168]" /> 
              {material.brand}
            </span>
          </div>
        )}
        
        <h3 className="text-xl font-black text-[#2b251d] mb-1 leading-tight group-hover:text-[#989168] transition-colors line-clamp-2 pr-8">{material.name}</h3>
        <p className="text-[#c7c8ad] text-[10px] font-black uppercase tracking-[0.2em] mb-8">{material.unit}</p>
      </div>
      
      <div className="bg-[#f7f7f3] p-5 rounded-[1.5rem] border border-[#e7e8dd] relative">
        <Trophy size={32} className="absolute -right-2 -bottom-2 text-[#989168]/10" />
        <p className="text-[9px] font-black text-[#989168] uppercase tracking-widest mb-1 italic">Best Price</p>
        <div className="flex justify-between items-end">
          <p className="font-bold text-[#2b251d] text-xs truncate max-w-[60%]">{bestEntry?.invoices?.supplier_name || 'Nincs adat'}</p>
          <p className="text-lg font-black text-[#2b251d]">{bestEntry?.unit_price.toLocaleString()} RON</p>
        </div>
      </div>
    </div>
  );
}

function MaterialRow({ material, latestPrice, trend, bestSupplier, onEdit }: any) {
  return (
    <tr className="hover:bg-[#fffcf5] transition-colors group border-b border-[#f7f7f3] last:border-none">
      <td className="p-6 pl-8 font-bold text-[#2b251d] group-hover:text-[#989168] transition-colors text-sm">
        {material.name}
        {material.brand && (
          <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-black text-[#989168] uppercase tracking-wider bg-[#f7f7f3] px-2 py-0.5 rounded-md">
            <BadgeCheck size={10} /> {material.brand}
          </span>
        )}
      </td>
      <td className="p-6 text-center text-[#b6b693] text-[10px] font-black tracking-widest uppercase">{material.unit}</td>
      <td className="p-6 text-right">
        <p className="text-xs font-bold text-[#4e4639]">{bestSupplier}</p>
      </td>
      <td className="p-6 text-center">
         {trend !== 'stable' && (
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider ${trend === 'increasing' ? 'text-red-600 bg-red-50' : 'text-green-600 bg-green-50'}`}>
               {trend === 'increasing' ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
               {trend === 'increasing' ? 'Nő' : 'Csökk.'}
            </span>
         )}
      </td>
      <td className="p-6 pr-8 text-right font-black text-[#2b251d] text-base">{latestPrice.toLocaleString()} RON</td>
      <td className="p-6 pr-8 text-right">
        <button onClick={() => onEdit(material)} className="text-[#c7c8ad] hover:text-[#2b251d] transition-colors"><Pencil size={14} /></button>
      </td>
    </tr>
  );
}