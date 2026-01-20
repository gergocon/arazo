'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  TrendingUp, FileText, Package, Truck, 
  ArrowRight, BarChart3, Loader2, AlertCircle, Plus 
} from 'lucide-react';
import Link from 'next/link';

export default function HomePage() {
  const [stats, setStats] = useState({ totalSpent: 0, invoiceCount: 0, materialCount: 0, topSupplier: '...' });
  const [recentInvoices, setRecentInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchDashboardData(); }, []);

  async function fetchDashboardData() {
    setLoading(true);
    try {
      const { data: priceData } = await supabase.from('prices').select('unit_price');
      const total = priceData?.reduce((sum, p) => sum + Number(p.unit_price), 0) || 0;
      const { count: invCount } = await supabase.from('invoices').select('*', { count: 'exact', head: true });
      const { count: matCount } = await supabase.from('materials').select('*', { count: 'exact', head: true });
      const { data: suppliers } = await supabase.from('invoices').select('supplier_name');
      const counts = suppliers?.reduce((acc: any, curr: any) => {
        if (curr.supplier_name) acc[curr.supplier_name] = (acc[curr.supplier_name] || 0) + 1;
        return acc;
      }, {});
      const top = counts && Object.keys(counts).length > 0 ? Object.entries(counts).sort((a: any, b: any) => b[1] - a[1])[0][0] : 'Nincs adat';
      const { data: recent } = await supabase.from('invoices').select('*').order('created_at', { ascending: false }).limit(5);

      setStats({ totalSpent: total, invoiceCount: invCount || 0, materialCount: matCount || 0, topSupplier: top });
      setRecentInvoices(recent || []);
    } finally { setLoading(false); }
  }

  if (loading) return (
    <div className="flex h-full items-center justify-center bg-[#f7f7f3]">
      <Loader2 className="w-10 h-10 animate-spin text-[#989168] opacity-20" />
    </div>
  );

  return (
    <div className="bg-[#f7f7f3] min-h-full animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
        <div>
          <h2 className="text-4xl font-black text-[#2b251d] tracking-tighter uppercase italic">Vezérlőpult</h2>
          <p className="text-[#b6b693] text-[10px] font-black uppercase tracking-[0.3em] mt-2">Áttekintés & Statisztika</p>
        </div>
        
        <Link href="/invoices" className="bg-[#2b251d] hover:bg-[#4e4639] text-white px-6 py-4 rounded-2xl flex items-center gap-3 transition-all shadow-xl shadow-[#2b251d]/10 group">
          <div className="bg-white/10 p-1.5 rounded-lg group-hover:scale-110 transition-transform"><Plus size={16} /></div>
          <span className="font-black text-xs uppercase tracking-widest">Új Számla</span>
        </Link>
      </div>

      {/* STATISZTIKAI KÁRTYÁK - CLEAN DESIGN */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        <StatCard title="Összes Költés" value={`${stats.totalSpent.toLocaleString()}`} suffix="RON" icon={<TrendingUp size={20} />} accentColor="text-[#989168]" />
        <StatCard title="Feldolgozott Számlák" value={stats.invoiceCount} suffix="db" icon={<FileText size={20} />} accentColor="text-[#2b251d]" />
        <StatCard title="Rögzített Anyagok" value={stats.materialCount} suffix="típus" icon={<Package size={20} />} accentColor="text-[#2b251d]" />
        <StatCard title="Fő Beszállító" value={stats.topSupplier} suffix="" icon={<Truck size={20} />} accentColor="text-[#989168]" isText />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* UTOLSÓ SZÁMLÁK */}
        <div className="lg:col-span-2 bg-white rounded-[2.5rem] p-8 shadow-sm border border-[#e7e8dd]">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-lg font-black text-[#2b251d] uppercase italic tracking-tight">Legutóbbi aktivitás</h3>
            <Link href="/invoices" className="text-[10px] font-black text-[#989168] uppercase tracking-widest hover:underline">Összes megtekintése</Link>
          </div>
          
          <div className="space-y-3">
            {recentInvoices.length > 0 ? recentInvoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between p-5 bg-white border border-[#f0f0eb] rounded-2xl hover:border-[#989168] hover:shadow-md hover:shadow-[#989168]/5 transition-all group cursor-pointer" onClick={() => window.location.href=`/dashboard/${inv.id}`}>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-[#f7f7f3] rounded-xl flex items-center justify-center text-[#c7c8ad] group-hover:text-[#2b251d] transition-colors">
                    <FileText size={18} />
                  </div>
                  <div>
                    <p className="font-bold text-[#2b251d] text-sm uppercase">{inv.supplier_name || 'Ismeretlen partner'}</p>
                    <p className="text-[10px] text-[#b6b693] font-bold uppercase mt-0.5">{new Date(inv.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${inv.status === 'confirmed' ? 'bg-[#f7f7f3] text-[#2b251d] border-[#e7e8dd]' : 'bg-[#fffcf0] text-[#989168] border-[#f5f3e6]'}`}>
                  {inv.status === 'confirmed' ? 'Rögzítve' : 'Folyamatban'}
                </div>
              </div>
            )) : (
              <div className="py-16 text-center border-2 border-dashed border-[#f0f0eb] rounded-3xl">
                <AlertCircle className="mx-auto mb-3 text-[#e7e8dd]" size={32} />
                <p className="text-xs font-bold text-[#c7c8ad] uppercase tracking-widest">Nincs adat</p>
              </div>
            )}
          </div>
        </div>

        {/* GYORS ELEMZÉS */}
        <div className="bg-[#2b251d] rounded-[2.5rem] p-8 text-[#f7f7f3] shadow-2xl flex flex-col relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#989168] rounded-full blur-[80px] opacity-20 -translate-y-1/2 translate-x-1/2"></div>
          
          <div className="relative z-10">
            <h3 className="text-lg font-black uppercase italic tracking-tight mb-2">Elemzések</h3>
            <p className="text-[11px] text-[#b6b693] leading-relaxed mb-8">
              A rögzített adatok alapján a rendszer automatikusan figyeli az áringadozásokat.
            </p>

            <Link href="/catalog" className="mt-auto block group/btn">
              <div className="bg-[#f7f7f3]/10 hover:bg-[#989168] border border-[#f7f7f3]/10 p-5 rounded-2xl transition-all flex justify-between items-center">
                <div>
                  <p className="font-bold text-sm">Anyagtár</p>
                  <p className="text-[10px] opacity-60 uppercase tracking-widest">Árak és trendek</p>
                </div>
                <ArrowRight size={18} className="group-hover/btn:translate-x-1 transition-transform" />
              </div>
            </Link>
            
            <Link href="/analysis" className="mt-3 block group/btn">
              <div className="bg-[#f7f7f3]/5 hover:bg-[#f7f7f3]/10 border border-[#f7f7f3]/5 p-5 rounded-2xl transition-all flex justify-between items-center">
                <div>
                  <p className="font-bold text-sm">Grafikonok</p>
                  <p className="text-[10px] opacity-60 uppercase tracking-widest">Vizuális elemzés</p>
                </div>
                <BarChart3 size={18} className="group-hover/btn:scale-110 transition-transform" />
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, suffix, icon, accentColor, isText }: any) {
  return (
    <div className="bg-white p-6 rounded-[2rem] border border-[#e7e8dd] shadow-sm hover:shadow-lg hover:shadow-[#2b251d]/5 hover:border-[#989168] transition-all h-44 flex flex-col justify-between group">
      <div className="flex justify-between items-start">
        <div className={`p-3 rounded-2xl bg-[#f7f7f3] ${accentColor} group-hover:scale-110 transition-transform`}>
          {icon}
        </div>
      </div>
      <div>
        <p className="text-[10px] font-black text-[#b6b693] uppercase tracking-widest mb-1 group-hover:text-[#2b251d] transition-colors">{title}</p>
        <h3 className={`font-black text-[#2b251d] tracking-tighter ${isText ? 'text-xl leading-tight' : 'text-3xl'}`}>
          {value} <span className="text-xs font-bold text-[#c7c8ad]">{suffix}</span>
        </h3>
      </div>
    </div>
  );
}