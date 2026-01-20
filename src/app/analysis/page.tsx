'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, Legend
} from 'recharts';
import { 
  BarChart3, TrendingUp, Calendar, 
  Package, Loader2, ArrowLeft, Coins
} from 'lucide-react';
import Link from 'next/link';

export default function AnalysisPage() {
  const [data, setData] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [selectedMaterial, setSelectedMaterial] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalysisData();
  }, [selectedMaterial]);

  async function fetchAnalysisData() {
    setLoading(true);
    try {
      // Anyagok listája a szűrőhöz
      const { data: mats } = await supabase.from('materials').select('id, name').order('name');
      setMaterials(mats || []);

      let chartData = [];

      if (selectedMaterial === 'all') {
        // --- HAVI KÖLTÉS ÖSSZESÍTÉS (Bar Chart) ---
        // Itt nem a 'prices' táblát nézzük (ami csak egységár), hanem az 'invoice_items'-et mennyiséggel együtt
        const { data: items } = await supabase
          .from('invoice_items')
          .select(`
            quantity,
            unit_price,
            invoice_id,
            invoices ( created_at )
          `)
          .eq('status', 'confirmed'); // Csak a feldolgozott tételeket

        // Adatok csoportosítása hónapok szerint
        const monthlyStats: {[key: string]: number} = {};
        
        items?.forEach((item: any) => {
          if (!item.invoices?.created_at) return;
          const date = new Date(item.invoices.created_at);
          const key = `${date.getFullYear()}.${(date.getMonth() + 1).toString().padStart(2, '0')}`; // PL: 2024.05
          const cost = (item.unit_price || 0) * (item.quantity || 0);
          
          monthlyStats[key] = (monthlyStats[key] || 0) + cost;
        });

        chartData = Object.entries(monthlyStats)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([date, total]) => ({
            date,
            total: Math.round(total)
          }));

      } else {
        // --- EGYEDI ANYAG ÁRÁNAK ALAKULÁSA (Area Chart) ---
        const { data: prices } = await supabase
          .from('prices')
          .select(`
            unit_price,
            created_at,
            materials ( name )
          `)
          .eq('material_id', selectedMaterial)
          .order('created_at', { ascending: true });

        chartData = prices?.map(p => {
          const materialInfo = Array.isArray(p.materials) ? p.materials[0] : p.materials;
          return {
            date: new Date(p.created_at).toLocaleDateString('hu-HU'),
            price: p.unit_price,
            name: materialInfo?.name || 'Anyag'
          };
        }) || [];
      }

      setData(chartData);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-[#f7f7f3] min-h-full animate-in fade-in duration-700">
      {/* FEJLÉC */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-12">
        <div>
          <h1 className="text-4xl font-black text-[#2b251d] tracking-tighter uppercase italic underline decoration-[#989168] decoration-4 underline-offset-8">
            Elemzések
          </h1>
          <p className="text-[#857b5a] text-[10px] font-black uppercase tracking-[0.3em] mt-4 italic">
            Piaci trendek és pénzügyi áttekintés
          </p>
        </div>

        <div className="flex items-center gap-4 bg-white p-2 rounded-[2rem] shadow-xl shadow-[#2b251d]/5 border border-[#e7e8dd]">
          <Package className="ml-4 text-[#989168]" size={20} />
          <select 
            className="pr-8 py-3 bg-transparent border-none text-sm font-black text-[#2b251d] focus:ring-0 outline-none cursor-pointer max-w-[200px]"
            onChange={(e) => setSelectedMaterial(e.target.value)}
            value={selectedMaterial}
          >
            <option value="all">Havi Költések (Összesített)</option>
            {materials.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-40">
          <Loader2 className="w-12 h-12 animate-spin text-[#989168] opacity-40" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-10">
          {/* FŐ GRAFIKON KÁRTYA */}
          <div className="bg-white p-10 rounded-[3.5rem] shadow-2xl shadow-[#2b251d]/5 border border-[#e7e8dd] relative overflow-hidden">
             <div className="flex justify-between items-center mb-12">
                <div>
                  <h3 className="text-xl font-black text-[#2b251d] uppercase italic">
                    {selectedMaterial === 'all' ? 'Költések alakulása' : 'Árfolyam görbe'}
                  </h3>
                  <p className="text-[#b6b693] text-[10px] font-bold uppercase tracking-widest mt-1">
                    {selectedMaterial === 'all' ? 'Havi összesített kiadások (RON)' : 'Egységár változása (RON)'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#989168]"></div>
                  <div className="w-3 h-3 rounded-full bg-[#e7e8dd]"></div>
                </div>
             </div>

             <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {selectedMaterial === 'all' ? (
                    // --- BAR CHART (Összesítő) ---
                    <BarChart data={data}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f7f7f3" />
                      <XAxis 
                        dataKey="date" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fill: '#b6b693', fontSize: 10, fontWeight: 'bold'}}
                        dy={10}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fill: '#b6b693', fontSize: 10, fontWeight: 'bold'}}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#2b251d', border: 'none', borderRadius: '1rem', color: '#f7f7f3' }}
                        cursor={{fill: '#f7f7f3'}}
                      />
                      <Bar 
                        dataKey="total" 
                        fill="#2b251d" 
                        radius={[8, 8, 0, 0]} 
                        barSize={40}
                      />
                    </BarChart>
                  ) : (
                    // --- AREA CHART (Egyedi ár) ---
                    <AreaChart data={data}>
                      <defs>
                        <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#989168" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#989168" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f7f7f3" />
                      <XAxis 
                        dataKey="date" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fill: '#b6b693', fontSize: 10, fontWeight: 'bold'}}
                        dy={10}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fill: '#b6b693', fontSize: 10, fontWeight: 'bold'}}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#2b251d', border: 'none', borderRadius: '1.5rem', color: '#f7f7f3' }}
                        itemStyle={{ color: '#989168' }}
                        cursor={{ stroke: '#989168', strokeWidth: 2 }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="price" 
                        stroke="#989168" 
                        strokeWidth={4} 
                        fillOpacity={1} 
                        fill="url(#colorPrice)" 
                      />
                    </AreaChart>
                  )}
                </ResponsiveContainer>
             </div>
          </div>

          {/* KIEMELT MUTATÓK */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            <div className="bg-[#2b251d] p-8 rounded-[2.5rem] text-white relative overflow-hidden group">
              {selectedMaterial === 'all' ? (
                 <Coins className="absolute -right-4 -bottom-4 text-[#989168]/20 group-hover:scale-110 transition-transform" size={120} />
              ) : (
                 <TrendingUp className="absolute -right-4 -bottom-4 text-[#989168]/20 group-hover:scale-110 transition-transform" size={120} />
              )}
              
              <p className="text-[#989168] text-[10px] font-black uppercase tracking-widest mb-2 italic">
                {selectedMaterial === 'all' ? 'Teljes költés (időszaki)' : 'Legmagasabb rögzített ár'}
              </p>
              <h4 className="text-3xl font-black italic">
                {data.length > 0 ? (
                  selectedMaterial === 'all' 
                    ? data.reduce((sum, d) => sum + d.total, 0).toLocaleString() 
                    : Math.max(...data.map(d => d.price)).toLocaleString()
                ) : 0} <span className="text-sm opacity-50">RON</span>
              </h4>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-[#e7e8dd] shadow-xl shadow-[#2b251d]/5">
              <p className="text-[#b6b693] text-[10px] font-black uppercase tracking-widest mb-2 italic">
                 {selectedMaterial === 'all' ? 'Havi átlagos kiadás' : 'Átlagos beszerzési ár'}
              </p>
              <h4 className="text-3xl font-black text-[#2b251d] italic">
                {data.length > 0 ? Math.round(
                   selectedMaterial === 'all' 
                   ? data.reduce((sum, d) => sum + d.total, 0) / data.length
                   : data.reduce((a,b) => a + b.price, 0) / data.length
                ).toLocaleString() : 0} <span className="text-sm opacity-50">RON</span>
              </h4>
            </div>

            <div className="bg-[#989168] p-8 rounded-[2.5rem] text-[#2b251d] shadow-xl shadow-[#989168]/20">
              <p className="text-[#2b251d]/60 text-[10px] font-black uppercase tracking-widest mb-2 italic">Adatpontok száma</p>
              <h4 className="text-3xl font-black italic">{data.length} <span className="text-sm opacity-50">{selectedMaterial === 'all' ? 'hónap' : 'bejegyzés'}</span></h4>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}