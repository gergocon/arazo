'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Truck, 
  TrendingUp, 
  FileText, 
  ArrowRight, 
  Search, 
  Loader2, 
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  Pencil,
  X,
  Check
} from 'lucide-react';
import Link from 'next/link';

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // EDIT STATE
  const [editingSupplier, setEditingSupplier] = useState<string | null>(null);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    fetchSuppliersData();
  }, []);

  async function fetchSuppliersData() {
    setLoading(true);
    try {
      // 1. Lekérjük az összes számlát és a hozzájuk tartozó árakat
      const { data: invoices, error } = await supabase
        .from('invoices')
        .select(`
          supplier_name,
          id,
          prices (
            unit_price
          )
        `);

      if (error) throw error;

      // 2. Adatok aggregálása beszállítónként
      const supplierMap: { [key: string]: any } = {};

      invoices?.forEach((inv: any) => {
        const name = inv.supplier_name || 'Ismeretlen Beszállító';
        const totalForInvoice = inv.prices?.reduce((sum: number, p: any) => sum + Number(p.unit_price), 0) || 0;

        if (!supplierMap[name]) {
          supplierMap[name] = {
            name: name,
            totalSpent: 0,
            invoiceCount: 0,
            lastActivity: null
          };
        }

        supplierMap[name].totalSpent += totalForInvoice;
        supplierMap[name].invoiceCount += 1;
      });

      const supplierList = Object.values(supplierMap).sort((a: any, b: any) => b.totalSpent - a.totalSpent);
      setSuppliers(supplierList);
    } catch (err) {
      console.error("Hiba a beszállítók lekérésekor:", err);
    } finally {
      setLoading(false);
    }
  }

  const handleEditClick = (name: string) => {
    setEditingSupplier(name);
    setNewSupplierName(name);
  };

  const handleRename = async () => {
    if (!editingSupplier || !newSupplierName || newSupplierName === editingSupplier) return;
    
    setIsUpdating(true);
    try {
      // Tömeges frissítés: minden számlán átírjuk a nevet
      const { error } = await supabase
        .from('invoices')
        .update({ supplier_name: newSupplierName })
        .eq('supplier_name', editingSupplier);

      if (error) throw error;

      // Lista újratöltése
      await fetchSuppliersData();
      setEditingSupplier(null);
    } catch (err: any) {
      alert("Hiba az átnevezéskor: " + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const filteredSuppliers = suppliers.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="bg-[#f7f7f3] min-h-full animate-in fade-in duration-700">
      {/* FEJLÉC */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-12">
        <div>
          <h1 className="text-4xl font-black text-[#2b251d] tracking-tighter uppercase italic underline decoration-[#989168] decoration-4 underline-offset-8">
            Beszállítók
          </h1>
          <p className="text-[#857b5a] text-[10px] font-black uppercase tracking-[0.3em] mt-4">
            Partneri Kapcsolatok és Rangsor
          </p>
        </div>

        <div className="relative group">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-[#c7c8ad] group-focus-within:text-[#989168] transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="Keresés a partnerek között..." 
            className="pl-14 pr-8 py-4 bg-white border-none rounded-[1.8rem] shadow-xl shadow-[#2b251d]/5 outline-none focus:ring-4 ring-[#e7e8dd] transition-all font-bold w-full md:w-80 text-[#2b251d]" 
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-40">
          <Loader2 className="w-12 h-12 animate-spin text-[#989168] opacity-40" />
          <p className="mt-4 text-[10px] font-black uppercase tracking-[0.3em] text-[#b6b693]">Adatok összegzése...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {filteredSuppliers.length > 0 ? (
            filteredSuppliers.map((supplier, index) => (
              <SupplierCard key={supplier.name} supplier={supplier} rank={index + 1} onEdit={handleEditClick} />
            ))
          ) : (
            <div className="bg-white rounded-[2.5rem] p-20 text-center border-4 border-dashed border-[#e7e8dd]">
              <Truck className="mx-auto text-[#e7e8dd] mb-4" size={48} />
              <p className="text-[#b6b693] font-black uppercase text-xs tracking-widest">Nincs talált beszállító</p>
            </div>
          )}
        </div>
      )}

      {/* EDIT MODAL */}
      {editingSupplier && (
        <div className="fixed inset-0 bg-[#2b251d]/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100] overflow-y-auto">
          <div className="bg-white rounded-[2.5rem] w-full max-w-sm p-8 shadow-2xl animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-black uppercase text-[#2b251d]">Beszállító Átnevezése</h2>
              <button onClick={() => setEditingSupplier(null)} className="text-[#c7c8ad] hover:text-[#2b251d] transition-colors"><X size={20} /></button>
            </div>
            
            <div className="space-y-4">
              <p className="text-xs text-[#b6b693] font-bold">Ez a művelet frissíti a beszállító nevét az összes ("{editingSupplier}") névvel rögzített számlán.</p>
              
              <div>
                <label className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-2 block ml-2">Új név</label>
                <input 
                  className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm" 
                  value={newSupplierName}
                  onChange={e => setNewSupplierName(e.target.value)} 
                  autoFocus
                />
              </div>

              <div className="pt-2">
                <button 
                  onClick={handleRename} 
                  disabled={isUpdating}
                  className="w-full py-4 bg-[#2b251d] text-white font-black rounded-xl hover:bg-[#4e4639] transition-all uppercase tracking-widest text-xs flex justify-center items-center gap-2 disabled:opacity-50"
                >
                  {isUpdating ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />} 
                  {isUpdating ? 'Frissítés...' : 'Átnevezés'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SupplierCard({ supplier, rank, onEdit }: { supplier: any, rank: number, onEdit: (name: string) => void }) {
  return (
    <div className="bg-white rounded-[2.5rem] p-8 shadow-xl shadow-[#2b251d]/5 border border-[#e7e8dd] hover:border-[#989168] transition-all group flex flex-col md:flex-row items-center gap-8 relative">
      {/* RANG ÉS IKON */}
      <div className="flex items-center gap-6">
        <div className="text-4xl font-black text-[#e7e8dd] group-hover:text-[#989168] transition-colors italic w-12 text-center">
          #{rank}
        </div>
        <div className="bg-[#f7f7f3] p-5 rounded-3xl text-[#989168] group-hover:bg-[#2b251d] group-hover:text-white transition-all">
          <Truck size={32} />
        </div>
      </div>

      {/* NÉV ÉS INFÓ */}
      <div className="flex-1 text-center md:text-left">
        <div className="flex items-center justify-center md:justify-start gap-3">
          <h3 className="text-2xl font-black text-[#2b251d] uppercase tracking-tighter mb-1">{supplier.name}</h3>
          <button 
            onClick={(e) => { e.preventDefault(); onEdit(supplier.name); }}
            className="text-[#c7c8ad] hover:text-[#2b251d] transition-colors opacity-0 group-hover:opacity-100"
          >
            <Pencil size={14} />
          </button>
        </div>
        <div className="flex flex-wrap justify-center md:justify-start gap-4">
          <span className="flex items-center gap-2 text-[10px] font-black text-[#b6b693] uppercase tracking-widest">
            <FileText size={12} /> {supplier.invoiceCount} feldolgozott számla
          </span>
          <span className="flex items-center gap-2 text-[10px] font-black text-[#989168] uppercase tracking-widest">
            <ShieldCheck size={12} /> Hitelesített Partner
          </span>
        </div>
      </div>

      {/* STATISZTIKA */}
      <div className="bg-[#f7f7f3] px-10 py-6 rounded-[2rem] border border-[#e7e8dd] text-center min-w-[250px] group-hover:bg-[#e7e8dd] transition-colors">
        <p className="text-[9px] font-black text-[#857b5a] uppercase tracking-[0.2em] mb-1 italic">Összes forgalom</p>
        <p className="text-3xl font-black text-[#2b251d] tracking-tighter">
          {supplier.totalSpent.toLocaleString()} <span className="text-sm font-bold opacity-40">RON</span>
        </p>
      </div>

      {/* AKCIÓ GOMB */}
      <Link 
        href={`/invoices?search=${supplier.name}`} 
        className="p-5 bg-white rounded-full text-[#c7c8ad] hover:text-[#2b251d] border border-[#e7e8dd] hover:border-[#989168] transition-all shadow-sm"
      >
        <ArrowRight size={24} />
      </Link>
    </div>
  );
}