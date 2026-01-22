
'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Users, Calendar, Clock, Plus, Loader2, X, Check, 
  Briefcase, Coins, HardHat, ChevronRight, AlertCircle 
} from 'lucide-react';
import { Worker, Timesheet } from '@/types/workforce';

export default function WorkforcePage() {
  const [activeTab, setActiveTab] = useState<'team' | 'timesheet'>('team');
  const [loading, setLoading] = useState(true);
  
  // DATA STATES
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [projects, setProjects] = useState<any[]>([]);

  // MODAL STATES
  const [isWorkerModalOpen, setIsWorkerModalOpen] = useState(false);
  const [isTimeModalOpen, setIsTimeModalOpen] = useState(false);

  // FORMS
  const [newWorker, setNewWorker] = useState({ name: '', role: 'Általános', hourly_rate: '' });
  const [newTime, setNewTime] = useState({ 
    worker_id: '', 
    project_id: '', 
    date: new Date().toISOString().split('T')[0], 
    hours: '', 
    description: '' 
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [workersRes, timesheetsRes, projectsRes] = await Promise.all([
        supabase.from('workers').select('*').order('name'),
        supabase.from('timesheets').select('*, workers(name), projects(name)').order('date', { ascending: false }).limit(50),
        supabase.from('projects').select('id, name').eq('status', 'active').order('name')
      ]);

      if (workersRes.data) setWorkers(workersRes.data);
      if (timesheetsRes.data) setTimesheets(timesheetsRes.data);
      if (projectsRes.data) setProjects(projectsRes.data);
    } catch (error) {
      console.error('Hiba az adatok betöltésekor:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleCreateWorker = async () => {
    if (!newWorker.name || !newWorker.hourly_rate) return alert("Név és órabér kötelező!");
    
    const { data, error } = await supabase.from('workers').insert([{
      name: newWorker.name,
      role: newWorker.role,
      hourly_rate: parseFloat(newWorker.hourly_rate)
    }]).select().single();

    if (error) {
      alert("Hiba: " + error.message);
    } else if (data) {
      setWorkers([...workers, data]);
      setIsWorkerModalOpen(false);
      setNewWorker({ name: '', role: 'Általános', hourly_rate: '' });
    }
  };

  const handleLogTime = async () => {
    if (!newTime.worker_id || !newTime.project_id || !newTime.hours) return alert("Minden mező kitöltése kötelező!");

    const worker = workers.find(w => w.id === newTime.worker_id);
    if (!worker) return;

    const hours = parseFloat(newTime.hours);
    const cost = hours * worker.hourly_rate;

    const { data, error } = await supabase.from('timesheets').insert([{
      worker_id: newTime.worker_id,
      project_id: newTime.project_id,
      date: newTime.date,
      hours: hours,
      description: newTime.description,
      calculated_cost: cost
    }]).select('*, workers(name), projects(name)').single();

    if (error) {
      alert("Hiba: " + error.message);
    } else if (data) {
      setTimesheets([data, ...timesheets]);
      setIsTimeModalOpen(false);
      // Reset form but keep date and project for convenience
      setNewTime(prev => ({ ...prev, hours: '', description: '' }));
    }
  };

  return (
    <div className="animate-in fade-in duration-700 pb-20">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-end mb-10 gap-6">
        <div>
          <h1 className="text-4xl font-black text-[#2b251d] tracking-tighter uppercase italic underline decoration-[#989168] decoration-4 underline-offset-8">
            Munkaerő
          </h1>
          <p className="text-[#857b5a] text-[10px] font-black uppercase tracking-[0.3em] mt-4">
            Csapat és Időráfordítás
          </p>
        </div>

        <div className="flex bg-white p-1 rounded-2xl border border-[#e7e8dd] shadow-sm">
          <button 
            onClick={() => setActiveTab('team')} 
            className={`px-6 py-3 rounded-xl transition-all flex items-center gap-2 text-xs font-black uppercase tracking-widest ${activeTab === 'team' ? 'bg-[#2b251d] text-white shadow-md' : 'text-[#c7c8ad] hover:text-[#2b251d]'}`}
          >
            <Users size={16} /> Csapat
          </button>
          <button 
            onClick={() => setActiveTab('timesheet')} 
            className={`px-6 py-3 rounded-xl transition-all flex items-center gap-2 text-xs font-black uppercase tracking-widest ${activeTab === 'timesheet' ? 'bg-[#2b251d] text-white shadow-md' : 'text-[#c7c8ad] hover:text-[#2b251d]'}`}
          >
            <Clock size={16} /> Munkanapló
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-40"><Loader2 className="animate-spin text-[#989168]" size={40} /></div>
      ) : (
        <>
          {/* TEAM TAB */}
          {activeTab === 'team' && (
            <div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {/* ADD NEW CARD */}
                <button 
                  onClick={() => setIsWorkerModalOpen(true)}
                  className="bg-[#f7f7f3] border-2 border-dashed border-[#e7e8dd] rounded-[2.5rem] flex flex-col items-center justify-center p-8 hover:border-[#989168] hover:bg-white transition-all group min-h-[200px]"
                >
                  <div className="bg-white p-4 rounded-full shadow-sm mb-4 group-hover:scale-110 transition-transform">
                    <Plus size={24} className="text-[#989168]" />
                  </div>
                  <span className="text-xs font-black text-[#b6b693] uppercase tracking-widest group-hover:text-[#2b251d]">Új Munkás</span>
                </button>

                {/* WORKER CARDS */}
                {workers.map(worker => (
                  <div key={worker.id} className="bg-white p-8 rounded-[2.5rem] border border-[#e7e8dd] shadow-sm hover:shadow-xl transition-all group relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-[#f7f7f3] rounded-bl-[2.5rem] -mr-4 -mt-4 transition-colors group-hover:bg-[#2b251d]"></div>
                    <div className="relative z-10">
                      <div className="w-12 h-12 bg-[#f7f7f3] rounded-2xl flex items-center justify-center text-[#2b251d] mb-6 border border-[#e7e8dd]">
                        <HardHat size={24} />
                      </div>
                      <h3 className="text-xl font-black text-[#2b251d] mb-1">{worker.name}</h3>
                      <p className="text-[#989168] text-[10px] font-bold uppercase tracking-widest mb-6">{worker.role}</p>
                      
                      <div className="flex items-center gap-2 text-[#5d5343] bg-[#f7f7f3] px-4 py-2 rounded-xl w-fit">
                        <Coins size={14} />
                        <span className="font-bold text-sm">{worker.hourly_rate} RON <span className="text-[10px] opacity-60">/ óra</span></span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TIMESHEET TAB */}
          {activeTab === 'timesheet' && (
            <div className="bg-white rounded-[2.5rem] border border-[#e7e8dd] shadow-xl overflow-hidden">
              <div className="p-8 border-b border-[#f7f7f3] flex justify-between items-center bg-[#f7f7f3]/30">
                <h3 className="text-lg font-black text-[#2b251d] uppercase italic">Munkaidő Rögzítés</h3>
                <button 
                  onClick={() => setIsTimeModalOpen(true)}
                  className="bg-[#2b251d] hover:bg-[#4e4639] text-white px-5 py-3 rounded-xl flex items-center gap-2 transition-all text-xs font-black uppercase tracking-widest shadow-lg shadow-[#2b251d]/20"
                >
                  <Plus size={14} /> Bejegyzés
                </button>
              </div>

              {timesheets.length === 0 ? (
                <div className="p-20 text-center">
                  <div className="bg-[#f7f7f3] w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-[#c7c8ad]">
                    <Clock size={32} />
                  </div>
                  <p className="text-[#b6b693] font-bold uppercase tracking-widest text-xs">Nincs rögzített munkaidő.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-[#f7f7f3] text-[#b6b693] text-[9px] font-black uppercase tracking-widest">
                      <tr>
                        <th className="p-6 pl-8">Dátum</th>
                        <th className="p-6">Munkás</th>
                        <th className="p-6">Projekt</th>
                        <th className="p-6">Leírás</th>
                        <th className="p-6 text-center">Óra</th>
                        <th className="p-6 pr-8 text-right">Költség</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f7f7f3]">
                      {timesheets.map((ts) => (
                        <tr key={ts.id} className="hover:bg-[#fffcf5] transition-colors group">
                          <td className="p-6 pl-8 font-bold text-[#2b251d] text-sm whitespace-nowrap">
                            {new Date(ts.date).toLocaleDateString()}
                          </td>
                          <td className="p-6 font-bold text-[#5d5343] text-sm">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 bg-[#f7f7f3] rounded-full flex items-center justify-center text-[10px] font-black text-[#989168]">
                                {ts.workers?.name.charAt(0)}
                              </div>
                              {ts.workers?.name}
                            </div>
                          </td>
                          <td className="p-6 text-xs font-bold text-[#857b5a] bg-white">
                            <span className="bg-[#f7f7f3] px-3 py-1 rounded-lg border border-[#e7e8dd]">
                              {ts.projects?.name}
                            </span>
                          </td>
                          <td className="p-6 text-xs text-[#b6b693] italic max-w-xs truncate">{ts.description || '-'}</td>
                          <td className="p-6 text-center font-black text-[#2b251d]">{ts.hours} óra</td>
                          <td className="p-6 pr-8 text-right font-black text-[#2b251d] text-base">
                            {ts.calculated_cost.toLocaleString()} <span className="text-[10px] text-[#c7c8ad]">RON</span>
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

      {/* CREATE WORKER MODAL */}
      {isWorkerModalOpen && (
        <div className="fixed inset-0 bg-[#2b251d]/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white rounded-[2rem] w-full max-w-sm p-8 shadow-2xl animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-black uppercase text-[#2b251d]">Új Munkás</h2>
              <button onClick={() => setIsWorkerModalOpen(false)} className="text-[#c7c8ad] hover:text-[#2b251d] transition-colors"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-2 block ml-2">Név</label>
                <input 
                  autoFocus
                  className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm" 
                  value={newWorker.name}
                  onChange={e => setNewWorker({...newWorker, name: e.target.value})} 
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-2 block ml-2">Pozíció</label>
                <select 
                  className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm appearance-none"
                  value={newWorker.role}
                  onChange={e => setNewWorker({...newWorker, role: e.target.value})}
                >
                  <option value="Kőműves">Kőműves</option>
                  <option value="Segédmunkás">Segédmunkás</option>
                  <option value="Festő">Festő</option>
                  <option value="Vízszerelő">Vízszerelő</option>
                  <option value="Villanyszerelő">Villanyszerelő</option>
                  <option value="Vezető">Vezető</option>
                  <option value="Általános">Általános</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-2 block ml-2">Órabér (RON)</label>
                <input 
                  type="number"
                  className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm" 
                  value={newWorker.hourly_rate}
                  onChange={e => setNewWorker({...newWorker, hourly_rate: e.target.value})} 
                />
              </div>
              <button onClick={handleCreateWorker} className="w-full py-4 bg-[#2b251d] text-white font-black rounded-xl hover:bg-[#4e4639] transition-all uppercase tracking-widest text-xs mt-2 flex justify-center items-center gap-2">
                <Check size={16} /> Mentés
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LOG TIME MODAL */}
      {isTimeModalOpen && (
        <div className="fixed inset-0 bg-[#2b251d]/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white rounded-[2rem] w-full max-w-sm p-8 shadow-2xl animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-black uppercase text-[#2b251d]">Munka Rögzítése</h2>
              <button onClick={() => setIsTimeModalOpen(false)} className="text-[#c7c8ad] hover:text-[#2b251d] transition-colors"><X size={20} /></button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-2 block ml-2">Munkás</label>
                <select 
                  className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm appearance-none cursor-pointer"
                  value={newTime.worker_id}
                  onChange={e => setNewTime({...newTime, worker_id: e.target.value})}
                >
                  <option value="">Válassz...</option>
                  {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-2 block ml-2">Projekt</label>
                <select 
                  className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm appearance-none cursor-pointer"
                  value={newTime.project_id}
                  onChange={e => setNewTime({...newTime, project_id: e.target.value})}
                >
                  <option value="">Válassz...</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-2 block ml-2">Dátum</label>
                  <input 
                    type="date"
                    className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm"
                    value={newTime.date}
                    onChange={e => setNewTime({...newTime, date: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-2 block ml-2">Órák</label>
                  <input 
                    type="number"
                    className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm"
                    value={newTime.hours}
                    onChange={e => setNewTime({...newTime, hours: e.target.value})}
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-2 block ml-2">Leírás (Opcionális)</label>
                <input 
                  placeholder="pl. Falazás"
                  className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm"
                  value={newTime.description}
                  onChange={e => setNewTime({...newTime, description: e.target.value})}
                />
              </div>

              <button onClick={handleLogTime} className="w-full py-4 bg-[#2b251d] text-white font-black rounded-xl hover:bg-[#4e4639] transition-all uppercase tracking-widest text-xs mt-2 flex justify-center items-center gap-2">
                <Check size={16} /> Rögzítés
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
