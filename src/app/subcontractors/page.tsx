
'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Briefcase, Plus, Loader2, X, Check, 
  Search, Phone, HardHat, FileSignature, Wallet
} from 'lucide-react';
import { Subcontractor, SubcontractorJob } from '@/types/subcontractor';

export default function SubcontractorsPage() {
  const [activeTab, setActiveTab] = useState<'directory' | 'contracts'>('directory');
  const [loading, setLoading] = useState(true);
  
  // DATA
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [jobs, setJobs] = useState<SubcontractorJob[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // MODAL & FORMS
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newSub, setNewSub] = useState({ name: '', trade: '', contact_info: '' });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      // 1. Partnerek lekérése
      const { data: subData } = await supabase.from('subcontractors').select('*').order('name');
      setSubcontractors(subData || []);

      // 2. Szerződések lekérése + Kifizetések
      const { data: jobData } = await supabase
        .from('subcontractor_jobs')
        .select(`
          *,
          subcontractors (name, trade),
          projects (name),
          subcontractor_payments (amount)
        `)
        .order('created_at', { ascending: false });

      // Feldolgozás: Kifizetések összeadása
      const processedJobs = jobData?.map((job: any) => {
        const totalPaid = job.subcontractor_payments?.reduce((sum: number, p: any) => sum + p.amount, 0) || 0;
        const progress = job.agreed_price > 0 ? (totalPaid / job.agreed_price) * 100 : 0;
        return { ...job, total_paid: totalPaid, progress };
      }) || [];

      setJobs(processedJobs);

    } catch (error) {
      console.error('Hiba az adatok betöltésekor:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleCreateSubcontractor = async () => {
    if (!newSub.name || !newSub.trade) return alert("Név és szakterület kötelező!");
    
    const { data, error } = await supabase.from('subcontractors').insert([{
      name: newSub.name,
      trade: newSub.trade,
      contact_info: newSub.contact_info,
      status: 'active'
    }]).select().single();

    if (error) {
      alert("Hiba: " + error.message);
    } else if (data) {
      setSubcontractors([...subcontractors, data]);
      setIsModalOpen(false);
      setNewSub({ name: '', trade: '', contact_info: '' });
    }
  };

  const filteredSubs = subcontractors.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.trade.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="animate-in fade-in duration-700 pb-20">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-end mb-10 gap-6">
        <div>
          <h1 className="text-4xl font-black text-[#2b251d] tracking-tighter uppercase italic underline decoration-[#989168] decoration-4 underline-offset-8">
            Alvállalkozók
          </h1>
          <p className="text-[#857b5a] text-[10px] font-black uppercase tracking-[0.3em] mt-4">
            Partnerkezelés és Szerződések
          </p>
        </div>

        <div className="flex bg-white p-1 rounded-2xl border border-[#e7e8dd] shadow-sm">
          <button 
            onClick={() => setActiveTab('directory')} 
            className={`px-6 py-3 rounded-xl transition-all flex items-center gap-2 text-xs font-black uppercase tracking-widest ${activeTab === 'directory' ? 'bg-[#2b251d] text-white shadow-md' : 'text-[#c7c8ad] hover:text-[#2b251d]'}`}
          >
            <Briefcase size={16} /> Partnerek
          </button>
          <button 
            onClick={() => setActiveTab('contracts')} 
            className={`px-6 py-3 rounded-xl transition-all flex items-center gap-2 text-xs font-black uppercase tracking-widest ${activeTab === 'contracts' ? 'bg-[#2b251d] text-white shadow-md' : 'text-[#c7c8ad] hover:text-[#2b251d]'}`}
          >
            <FileSignature size={16} /> Szerződések
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-40"><Loader2 className="animate-spin text-[#989168]" size={40} /></div>
      ) : (
        <>
          {/* DIRECTORY TAB */}
          {activeTab === 'directory' && (
            <div>
              <div className="flex justify-between items-center mb-8">
                <div className="relative group w-full max-w-md">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#c7c8ad] group-focus-within:text-[#989168]" size={18} />
                  <input 
                    type="text" 
                    placeholder="Keresés név vagy szakma szerint..." 
                    className="pl-12 pr-6 py-3 bg-white border border-[#e7e8dd] rounded-2xl shadow-sm outline-none focus:border-[#989168] transition-all font-bold text-sm w-full text-[#2b251d]" 
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <button 
                  onClick={() => setIsModalOpen(true)}
                  className="bg-[#2b251d] hover:bg-[#4e4639] text-white px-5 py-3 rounded-2xl flex items-center gap-2 transition-all text-xs font-black uppercase tracking-widest shadow-lg shadow-[#2b251d]/20 ml-4"
                >
                  <Plus size={16} /> Új Partner
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredSubs.map(sub => (
                  <div key={sub.id} className="bg-white p-8 rounded-[2.5rem] border border-[#e7e8dd] shadow-sm hover:shadow-xl transition-all group relative overflow-hidden">
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-12 h-12 bg-[#f7f7f3] rounded-2xl flex items-center justify-center text-[#989168] border border-[#e7e8dd]">
                        <HardHat size={24} />
                      </div>
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${sub.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                        {sub.status === 'active' ? 'Aktív' : 'Inaktív'}
                      </span>
                    </div>
                    
                    <h3 className="text-lg font-black text-[#2b251d] mb-1">{sub.name}</h3>
                    <p className="text-[#989168] text-[10px] font-bold uppercase tracking-widest mb-6">{sub.trade}</p>
                    
                    {sub.contact_info && (
                      <div className="flex items-center gap-2 text-[#b6b693] text-xs font-bold bg-[#f7f7f3] p-3 rounded-xl">
                        <Phone size={14} /> {sub.contact_info}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CONTRACTS TAB */}
          {activeTab === 'contracts' && (
            <div className="bg-white rounded-[2.5rem] border border-[#e7e8dd] shadow-xl overflow-hidden">
              <div className="p-8 border-b border-[#f7f7f3] bg-[#f7f7f3]/30">
                <h3 className="text-lg font-black text-[#2b251d] uppercase italic">Aktív Szerződések</h3>
              </div>

              {jobs.length === 0 ? (
                <div className="p-20 text-center">
                  <p className="text-[#b6b693] font-bold uppercase tracking-widest text-xs">Nincs rögzített szerződés.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-[#f7f7f3] text-[#b6b693] text-[9px] font-black uppercase tracking-widest">
                      <tr>
                        <th className="p-6 pl-8">Projekt</th>
                        <th className="p-6">Partner</th>
                        <th className="p-6">Leírás</th>
                        <th className="p-6 text-right">Megállapodás</th>
                        <th className="p-6 text-right">Kifizetve</th>
                        <th className="p-6 pr-8 w-40">Státusz</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f7f7f3]">
                      {jobs.map((job) => (
                        <tr key={job.id} className="hover:bg-[#fffcf5] transition-colors">
                          <td className="p-6 pl-8 font-bold text-[#2b251d] text-sm">{job.projects?.name}</td>
                          <td className="p-6 font-bold text-[#5d5343] text-sm">
                            <div className="flex items-center gap-2">
                              <HardHat size={14} className="text-[#989168]" />
                              {job.subcontractors?.name}
                            </div>
                          </td>
                          <td className="p-6 text-xs text-[#b6b693] font-bold">{job.description}</td>
                          <td className="p-6 text-right font-black text-[#2b251d]">{job.agreed_price.toLocaleString()} RON</td>
                          <td className="p-6 text-right font-bold text-[#857b5a]">{(job.total_paid || 0).toLocaleString()} RON</td>
                          <td className="p-6 pr-8">
                            <div className="w-full h-2 bg-[#f7f7f3] rounded-full overflow-hidden mb-1">
                              <div 
                                className={`h-full rounded-full transition-all ${job.progress && job.progress >= 100 ? 'bg-green-500' : 'bg-[#989168]'}`}
                                style={{ width: `${Math.min(job.progress || 0, 100)}%` }}
                              ></div>
                            </div>
                            <p className="text-[9px] font-black text-right text-[#c7c8ad]">{Math.round(job.progress || 0)}%</p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* CREATE SUBCONTRACTOR MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-[#2b251d]/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white rounded-[2rem] w-full max-w-sm p-8 shadow-2xl animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-black uppercase text-[#2b251d]">Új Partner</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-[#c7c8ad] hover:text-[#2b251d] transition-colors"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-2 block ml-2">Cégnév / Név</label>
                <input 
                  autoFocus
                  className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm" 
                  value={newSub.name}
                  onChange={e => setNewSub({...newSub, name: e.target.value})} 
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-2 block ml-2">Szakterület</label>
                <input 
                  placeholder="pl. Gázszerelő, Ács..."
                  className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm" 
                  value={newSub.trade}
                  onChange={e => setNewSub({...newSub, trade: e.target.value})} 
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-2 block ml-2">Elérhetőség</label>
                <input 
                  placeholder="Telefon, Email..."
                  className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm" 
                  value={newSub.contact_info}
                  onChange={e => setNewSub({...newSub, contact_info: e.target.value})} 
                />
              </div>
              <button onClick={handleCreateSubcontractor} className="w-full py-4 bg-[#2b251d] text-white font-black rounded-xl hover:bg-[#4e4639] transition-all uppercase tracking-widest text-xs mt-2 flex justify-center items-center gap-2">
                <Check size={16} /> Mentés
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
