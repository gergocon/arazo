'use client';

import { useEffect, useState } from 'react';
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
  ShieldCheck
} from 'lucide-react';
import Link from 'next/link';

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

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
              <SupplierCard key={supplier.name} supplier={supplier} rank={index + 1} />
            ))
          ) : (
            <div className="bg-white rounded-[2.5rem] p-20 text-center border-4 border-dashed border-[#e7e8dd]">
              <Truck className="mx-auto text-[#e7e8dd] mb-4" size={48} />
              <p className="text-[#b6b693] font-black uppercase text-xs tracking-widest">Nincs talált beszállító</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SupplierCard({ supplier, rank }: { supplier: any, rank: number }) {
  return (
    <div className="bg-white rounded-[2.5rem] p-8 shadow-xl shadow-[#2b251d]/5 border border-[#e7e8dd] hover:border-[#989168] transition-all group flex flex-col md:flex-row items-center gap-8">
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
        <h3 className="text-2xl font-black text-[#2b251d] uppercase tracking-tighter mb-1">{supplier.name}</h3>
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