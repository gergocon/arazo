'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  TrendingUp, FileText, Package, Truck, 
  ArrowRight, BarChart3, Loader2, AlertCircle 
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
    // Explicit háttérszín a biztonság kedvéért
    <div className="bg-[#f7f7f3] min-h-full animate-in fade-in duration-700">
      <div className="mb-10">
        <h2 className="text-3xl font-black text-[#2b251d] tracking-tighter uppercase italic">Vezérlőpult</h2>
        <p className="text-[#b6b693] text-[10px] font-black uppercase tracking-[0.3em] mt-1">Áttekintés</p>
      </div>

      {/* STATISZTIKAI KÁRTYÁK */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        <StatCard title="Összes költés" value={`${stats.totalSpent.toLocaleString()} RON`} icon={<TrendingUp size={24} />} color="bg-[#e7e8dd]" />
        <StatCard title="Számlák" value={`${stats.invoiceCount} db`} icon={<FileText size={24} />} color="bg-white" />
        <StatCard title="Anyagok" value={`${stats.materialCount} típus`} icon={<Package size={24} />} color="bg-[#e7e8dd]" />
        <StatCard title="Fő Beszállító" value={stats.topSupplier} icon={<Truck size={24} />} color="bg-white" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2 bg-white rounded-[3rem] p-10 shadow-xl shadow-[#2b251d]/5 border border-[#e7e8dd]">
          <h3 className="text-xl font-black text-[#2b251d] uppercase italic mb-8">Utolsó számlák</h3>
          <div className="space-y-4">
            {recentInvoices.length > 0 ? recentInvoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between p-6 bg-[#f7f7f3] rounded-2xl hover:bg-[#e7e8dd] transition-all group border border-transparent hover:border-[#c7c8ad]">
                <div className="flex items-center gap-5">
                  <div className="bg-white p-3 rounded-xl shadow-sm group-hover:bg-[#2b251d] group-hover:text-white transition-all text-[#b6b693]">
                    <FileText size={20} />
                  </div>
                  <div>
                    <p className="font-black text-[#4e4639] uppercase text-sm">{inv.supplier_name || 'Ismeretlen'}</p>
                    <p className="text-[10px] text-[#b6b693] font-bold uppercase">{new Date(inv.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <Link href={`/dashboard/${inv.id}`} className="p-3 bg-white rounded-full text-[#c7c8ad] hover:text-[#2b251d] shadow-sm transition-all"><ArrowRight size={20} /></Link>
              </div>
            )) : (
              <div className="py-20 text-center border-4 border-dashed border-[#e7e8dd] rounded-[2.5rem] text-[#c7c8ad]">
                <AlertCircle className="mx-auto mb-4" size={48} />
                <p className="text-xs font-black uppercase tracking-widest">Még nincsenek adatok</p>
              </div>
            )}
          </div>
        </div>

        {/* ELEMZÉSEK DOBOR (Sötét) */}
        <div className="bg-[#2b251d] rounded-[3rem] p-10 text-white shadow-2xl relative overflow-hidden group">
          <BarChart3 size={180} className="absolute -right-12 -bottom-12 text-[#989168]/20" />
          <h3 className="text-2xl font-black uppercase mb-8 italic relative z-10 text-[#e7e8dd]">Elemzések</h3>
          <div className="space-y-4 relative z-10">
            <Link href="/catalog" className="block p-6 bg-white/5 rounded-2xl border border-white/10 hover:bg-[#989168] hover:text-[#2b251d] transition-all">
              <p className="font-black text-sm uppercase tracking-tight">Anyagtár</p>
              <p className="text-[9px] uppercase font-bold opacity-50">Árak és piaci trendek</p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, color }: any) {
  return (
    <div className={`p-8 rounded-[2.5rem] ${color} border border-[#e7e8dd] shadow-sm flex flex-col justify-between h-52 group hover:shadow-lg transition-all`}>
      <div className="bg-white w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm text-[#989168]">{icon}</div>
      <div>
        <p className="text-[10px] font-black text-[#b6b693] uppercase tracking-widest mb-1">{title}</p>
        <h3 className="text-2xl font-black text-[#2b251d] truncate tracking-tighter">{value}</h3>
      </div>
    </div>
  );
}