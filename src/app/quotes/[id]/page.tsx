
'use client';

import { use, useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  ArrowLeft, Loader2, Play, Home, Globe, AlertTriangle, 
  ExternalLink, CheckCircle, TrendingUp, TrendingDown, RefreshCw, Layers
} from 'lucide-react';
import Link from 'next/link';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function QuoteDetailsPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const quoteId = resolvedParams.id;

  const [quote, setQuote] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    fetchQuoteData();
  }, [quoteId]);

  async function fetchQuoteData() {
    setLoading(true);
    const { data: q } = await supabase.from('quotes').select('*').eq('id', quoteId).single();
    setQuote(q);
    
    const { data: i } = await supabase.from('quote_items').select('*').eq('quote_id', quoteId).order('id');
    setItems(i || []);
    setLoading(false);
  }

  const runPricingAnalysis = async () => {
    setAnalyzing(true);
    try {
      await fetch('/api/quote-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId, items }),
      });
      await fetchQuoteData(); // Újratöltés a friss árakkal
    } catch (error) {
      alert("Hiba az elemzés során");
    } finally {
      setAnalyzing(false);
    }
  };

  // --- AGGREGÁLÁSI LOGIKA ---
  // A tételeket összevonjuk, ha ugyanaz a termék (URL vagy Belső ár alapján)
  const consolidatedItems = useMemo(() => {
    const groups: Record<string, any> = {};

    items.forEach(item => {
      // Kulcs képzés: Ha van URL, az a legerősebb azonosító. Ha nincs, akkor a nyers szöveg.
      let key = item.raw_text; 
      
      if (item.selected_price_source === 'market' && item.market_source_url) {
        key = item.market_source_url; // Ugyanaz a link -> Ugyanaz a termék
      } else if (item.selected_price_source === 'internal' && item.internal_unit_price) {
        key = `INT_${item.internal_unit_price}_${item.raw_text}`; // Belső ár + név
      }

      if (!groups[key]) {
        groups[key] = {
          ...item,
          totalQuantity: 0,
          originalItems: [],
          isGroup: false
        };
      }

      groups[key].totalQuantity += Number(item.quantity);
      groups[key].originalItems.push(item);
      if (groups[key].originalItems.length > 1) {
        groups[key].isGroup = true;
      }
    });

    return Object.values(groups).sort((a, b) => b.deviz_unit_price - a.deviz_unit_price);
  }, [items]);

  // Profit számítás segédfüggvény
  const calculateProfit = (item: any) => {
    const cost = item.selected_price_source === 'internal' ? item.internal_unit_price 
               : item.selected_price_source === 'market' ? item.market_unit_price 
               : item.manual_price || 0;
    
    if (!cost || cost === 0) return null;
    
    const revenue = item.deviz_unit_price;
    const profit = revenue - cost;
    const margin = (profit / revenue) * 100;
    
    return { profit, margin, cost };
  };

  if (loading) return <div className="flex justify-center py-40"><Loader2 className="animate-spin text-[#989168]" size={40} /></div>;

  const totalRevenue = items.reduce((sum, i) => sum + (i.deviz_unit_price * i.quantity), 0);
  const totalCost = items.reduce((sum, i) => {
    const cost = i.selected_price_source === 'internal' ? i.internal_unit_price 
               : i.selected_price_source === 'market' ? i.market_unit_price 
               : 0;
    return sum + (cost * i.quantity);
  }, 0);

  return (
    <div className="animate-in fade-in duration-700 pb-20">
      <div className="mb-8 flex justify-between items-start">
        <div>
          <Link href="/quotes" className="inline-flex items-center gap-2 text-[#b6b693] hover:text-[#2b251d] font-bold text-xs uppercase tracking-widest mb-4 transition-colors">
            <ArrowLeft size={14} /> Vissza
          </Link>
          <h1 className="text-3xl font-black text-[#2b251d] uppercase italic">{quote?.name}</h1>
          <p className="text-[#857b5a] text-[10px] font-bold uppercase tracking-[0.3em] mt-2">Árazási elemzés (Összesített)</p>
        </div>

        <button 
          onClick={runPricingAnalysis} 
          disabled={analyzing}
          className="bg-[#2b251d] hover:bg-[#4e4639] text-white px-6 py-4 rounded-2xl flex items-center gap-3 transition-all shadow-xl shadow-[#2b251d]/10 disabled:opacity-50"
        >
          {analyzing ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} />}
          <span className="font-black text-xs uppercase tracking-widest">
            {quote?.status === 'analyzed' ? 'Újraelemzés' : 'Árazás Futtatása'}
          </span>
        </button>
      </div>

      {/* STATS BAR */}
      {quote?.status === 'analyzed' && (
        <div className="grid grid-cols-3 gap-6 mb-10">
          <div className="bg-white p-6 rounded-[2rem] border border-[#e7e8dd] shadow-sm">
            <p className="text-[10px] font-black text-[#b6b693] uppercase tracking-widest">Deviz Érték (Bevétel)</p>
            <p className="text-2xl font-black text-[#2b251d]">{totalRevenue.toLocaleString()} <span className="text-sm opacity-50">RON</span></p>
          </div>
          <div className="bg-white p-6 rounded-[2rem] border border-[#e7e8dd] shadow-sm">
            <p className="text-[10px] font-black text-[#b6b693] uppercase tracking-widest">Becsült Költség</p>
            <p className="text-2xl font-black text-[#2b251d]">{totalCost.toLocaleString()} <span className="text-sm opacity-50">RON</span></p>
          </div>
          <div className={`p-6 rounded-[2rem] shadow-sm ${totalRevenue > totalCost ? 'bg-[#2b251d] text-white' : 'bg-red-500 text-white'}`}>
            <p className="text-[10px] font-black opacity-60 uppercase tracking-widest">Várható Profit</p>
            <p className="text-2xl font-black">{(totalRevenue - totalCost).toLocaleString()} <span className="text-sm opacity-50">RON</span></p>
          </div>
        </div>
      )}

      {/* ITEMS TABLE */}
      <div className="bg-white rounded-[2.5rem] border border-[#e7e8dd] shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#f7f7f3] text-[#b6b693] text-[9px] font-black uppercase tracking-widest">
              <tr>
                <th className="p-6 pl-8">Anyag / Tétel</th>
                <th className="p-6 text-center">Össz. Menny.</th>
                <th className="p-6 text-right">Deviz Ár / egység</th>
                <th className="p-6 text-right">Talált Piaci Ár</th>
                <th className="p-6 text-center">Forrás</th>
                <th className="p-6 text-center w-32">Profit / egység</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f7f7f3]">
              {consolidatedItems.map((item: any, idx: number) => {
                const profitData = calculateProfit(item);
                const isProfitable = profitData ? profitData.profit > 0 : false;
                
                // Kinyerjük a bolt nevét a market_source_name-ből ha van
                const storeName = item.market_source_name || (item.selected_price_source === 'internal' ? 'Belső Raktár' : '-');

                return (
                  <tr key={idx} className="hover:bg-[#fffcf5] transition-colors group">
                    <td className="p-6 pl-8">
                      <div className="font-bold text-[#2b251d] text-sm max-w-sm">
                        {item.raw_text}
                      </div>
                      {item.isGroup && (
                        <div className="text-[10px] text-[#989168] font-bold mt-1 flex items-center gap-1 uppercase tracking-wider">
                          <Layers size={10} /> {item.originalItems.length} tétel összevonva
                        </div>
                      )}
                    </td>
                    
                    <td className="p-6 text-center text-xs font-bold text-[#857b5a]">
                      {item.totalQuantity} {item.unit}
                    </td>
                    
                    <td className="p-6 text-right font-black text-[#2b251d]">
                      {item.deviz_unit_price > 0 ? item.deviz_unit_price.toLocaleString() : '-'}
                    </td>
                    
                    {/* COST PRICE CELL */}
                    <td className={`p-6 text-right font-bold transition-all`}>
                      {profitData ? (
                        <span className="text-sm">{profitData.cost.toLocaleString()}</span>
                      ) : (
                        <span className="text-xs text-gray-300">-</span>
                      )}
                    </td>

                    {/* SOURCE CELL */}
                    <td className="p-6 text-center">
                      {item.selected_price_source === 'internal' && (
                        <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 px-3 py-1 rounded-full text-[10px] font-bold uppercase">
                          <Home size={12} /> Belső
                        </div>
                      )}
                      {item.selected_price_source === 'market' && (
                        <a href={item.market_source_url} target="_blank" className="inline-flex items-center gap-2 bg-blue-50 text-blue-600 px-3 py-1 rounded-full text-[10px] font-bold uppercase hover:bg-blue-100 transition-colors">
                          <Globe size={12} /> {storeName} <ExternalLink size={8} />
                        </a>
                      )}
                      {item.selected_price_source === 'manual' && (
                        <span className="text-[10px] text-gray-400 font-bold uppercase">Kézi / Szolg.</span>
                      )}
                      {item.selected_price_source === 'none' && (
                        <span className="text-[10px] text-gray-300 font-bold uppercase">-</span>
                      )}
                    </td>

                    {/* PROFIT CELL */}
                    <td className="p-6 text-center">
                      {profitData ? (
                        <div className={`flex flex-col items-center ${isProfitable ? 'text-green-600' : 'text-red-500'}`}>
                          <div className="flex items-center gap-1 font-black text-sm">
                            {isProfitable ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                            {Math.round(profitData.margin)}%
                          </div>
                          <span className="text-[9px] font-bold opacity-60">
                            {profitData.profit > 0 ? '+' : ''}{Math.round(profitData.profit)} RON
                          </span>
                        </div>
                      ) : (
                        <AlertTriangle size={16} className="text-gray-300 mx-auto" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
