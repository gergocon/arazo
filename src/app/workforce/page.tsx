
'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Users, Calendar, Clock, Plus, Loader2, X, Check, 
  Briefcase, Coins, HardHat, ChevronRight, AlertCircle, Group, UserPlus, Layers 
} from 'lucide-react';
import { Worker, Timesheet, WorkerGroup } from '@/types/workforce';

export default function WorkforcePage() {
  const [activeTab, setActiveTab] = useState<'team' | 'groups' | 'timesheet'>('team');
  const [loading, setLoading] = useState(true);
  
  // DATA STATES
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [groups, setGroups] = useState<WorkerGroup[]>([]);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [projects, setProjects] = useState<any[]>([]);

  // MODAL STATES
  const [isWorkerModalOpen, setIsWorkerModalOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [isTimeModalOpen, setIsTimeModalOpen] = useState(false);
  const [isGroupLogModalOpen, setIsGroupLogModalOpen] = useState(false); // ÚJ: Csoportos rögzítés modal

  // FORMS
  const [newWorker, setNewWorker] = useState({ name: '', role: 'Általános', hourly_rate: '' });
  
  // ÚJ: Csoport létrehozás form
  const [newGroup, setNewGroup] = useState<{ name: string, memberIds: string[] }>({ name: '', memberIds: [] });

  // Egyéni rögzítés form
  const [newTime, setNewTime] = useState({ 
    worker_id: '', 
    project_id: '', 
    date: new Date().toISOString().split('T')[0], 
    hours: '', 
    description: '' 
  });

  // ÚJ: Csoportos rögzítés form (Opció B: editálható órák)
  const [groupLog, setGroupLog] = useState({
    group_id: '',
    project_id: '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    // Ez tárolja a tagok állapotát a modalban: { worker_id: { selected: true, hours: 8 } }
    memberStates: {} as Record<string, { selected: boolean, hours: number }>
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [workersRes, timesheetsRes, projectsRes, groupsRes] = await Promise.all([
        supabase.from('workers').select('*').order('name'),
        supabase.from('timesheets').select('*, workers(name), projects(name)').order('date', { ascending: false }).limit(50),
        supabase.from('projects').select('id, name').eq('status', 'active').order('name'),
        supabase.from('worker_groups').select('*, worker_group_members(worker_id)') // Csak ID-kat kérünk le a joinhoz
      ]);

      if (workersRes.data) setWorkers(workersRes.data);
      if (timesheetsRes.data) setTimesheets(timesheetsRes.data);
      if (projectsRes.data) setProjects(projectsRes.data);

      // Csoportok összerakása (tagok beillesztése)
      if (groupsRes.data && workersRes.data) {
        const fullGroups = groupsRes.data.map((g: any) => ({
          ...g,
          members: g.worker_group_members.map((m: any) => workersRes.data.find(w => w.id === m.worker_id)).filter(Boolean)
        }));
        setGroups(fullGroups);
      }

    } catch (error) {
      console.error('Hiba az adatok betöltésekor:', error);
    } finally {
      setLoading(false);
    }
  }

  // --- MUNKÁS KEZELÉS ---
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

  // --- CSOPORT KEZELÉS ---
  const handleCreateGroup = async () => {
    if (!newGroup.name) return alert("Csoport neve kötelező!");
    if (newGroup.memberIds.length === 0) return alert("Válassz legalább egy tagot!");

    // 1. Csoport létrehozása
    const { data: groupData, error: groupError } = await supabase.from('worker_groups').insert([{ name: newGroup.name }]).select().single();
    if (groupError) return alert(groupError.message);

    // 2. Tagok hozzáadása
    const membersPayload = newGroup.memberIds.map(wId => ({
      group_id: groupData.id,
      worker_id: wId
    }));
    const { error: membersError } = await supabase.from('worker_group_members').insert(membersPayload);

    if (membersError) {
      alert("Hiba a tagok hozzáadásakor: " + membersError.message);
    } else {
      // Frontend state frissítés
      const members = workers.filter(w => newGroup.memberIds.includes(w.id));
      setGroups([...groups, { ...groupData, members }]);
      setIsGroupModalOpen(false);
      setNewGroup({ name: '', memberIds: [] });
    }
  };

  const toggleMemberSelection = (workerId: string) => {
    setNewGroup(prev => {
      const exists = prev.memberIds.includes(workerId);
      return {
        ...prev,
        memberIds: exists ? prev.memberIds.filter(id => id !== workerId) : [...prev.memberIds, workerId]
      };
    });
  };

  // --- EGYÉNI IDŐRÖGZÍTÉS ---
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
      setNewTime(prev => ({ ...prev, hours: '', description: '' }));
    }
  };

  // --- CSOPORTOS IDŐRÖGZÍTÉS (Opció B) ---
  const handleGroupSelectForLog = (groupId: string) => {
    const selectedGroup = groups.find(g => g.id === groupId);
    if (!selectedGroup) return;

    // Alapértelmezett állapot inicializálása: Mindenki kiválasztva, 8 óra
    const initialStates: Record<string, { selected: boolean, hours: number }> = {};
    selectedGroup.members?.forEach(m => {
      initialStates[m.id] = { selected: true, hours: 8 };
    });

    setGroupLog(prev => ({
      ...prev,
      group_id: groupId,
      memberStates: initialStates
    }));
  };

  const handleGroupLogSubmit = async () => {
    if (!groupLog.group_id || !groupLog.project_id) return alert("Válassz csoportot és projektet!");

    const entriesToInsert: any[] = [];
    const selectedGroup = groups.find(g => g.id === groupLog.group_id);
    if (!selectedGroup) return;

    // Végigmegyünk a tagokon és összeszedjük az adatokat
    selectedGroup.members?.forEach(m => {
      const state = groupLog.memberStates[m.id];
      if (state && state.selected && state.hours > 0) {
        entriesToInsert.push({
          worker_id: m.id,
          project_id: groupLog.project_id,
          date: groupLog.date,
          hours: state.hours, // Egyéni óraszám
          description: groupLog.description || 'Csoportos rögzítés',
          calculated_cost: state.hours * m.hourly_rate
        });
      }
    });

    if (entriesToInsert.length === 0) return alert("Nincs kiválasztott tag a rögzítéshez!");

    const { data, error } = await supabase.from('timesheets').insert(entriesToInsert).select('*, workers(name), projects(name)');

    if (error) {
      alert("Hiba: " + error.message);
    } else if (data) {
      // Hozzáadjuk az új sorokat a listához
      setTimesheets([...data, ...timesheets]); // A Supabase több sort ad vissza tömbként
      setIsGroupLogModalOpen(false);
      setGroupLog({ 
        group_id: '', 
        project_id: '', 
        date: new Date().toISOString().split('T')[0], 
        description: '', 
        memberStates: {} 
      });
    }
  };

  const toggleGroupMemberLog = (workerId: string) => {
    setGroupLog(prev => ({
      ...prev,
      memberStates: {
        ...prev.memberStates,
        [workerId]: {
          ...prev.memberStates[workerId],
          selected: !prev.memberStates[workerId].selected
        }
      }
    }));
  };

  const updateGroupMemberHours = (workerId: string, hours: number) => {
    setGroupLog(prev => ({
      ...prev,
      memberStates: {
        ...prev.memberStates,
        [workerId]: {
          ...prev.memberStates[workerId],
          hours: hours
        }
      }
    }));
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
            Csapat, Brigádok és Időráfordítás
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
            onClick={() => setActiveTab('groups')} 
            className={`px-6 py-3 rounded-xl transition-all flex items-center gap-2 text-xs font-black uppercase tracking-widest ${activeTab === 'groups' ? 'bg-[#2b251d] text-white shadow-md' : 'text-[#c7c8ad] hover:text-[#2b251d]'}`}
          >
            <Layers size={16} /> Brigádok
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

          {/* GROUPS TAB */}
          {activeTab === 'groups' && (
            <div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* ADD NEW GROUP CARD */}
                <button 
                  onClick={() => setIsGroupModalOpen(true)}
                  className="bg-[#f7f7f3] border-2 border-dashed border-[#e7e8dd] rounded-[2.5rem] flex flex-col items-center justify-center p-8 hover:border-[#989168] hover:bg-white transition-all group min-h-[200px]"
                >
                  <div className="bg-white p-4 rounded-full shadow-sm mb-4 group-hover:scale-110 transition-transform">
                    <UserPlus size={24} className="text-[#989168]" />
                  </div>
                  <span className="text-xs font-black text-[#b6b693] uppercase tracking-widest group-hover:text-[#2b251d]">Új Brigád Létrehozása</span>
                </button>

                {/* GROUP CARDS */}
                {groups.map(group => (
                  <div key={group.id} className="bg-white p-8 rounded-[2.5rem] border border-[#e7e8dd] shadow-sm hover:shadow-xl transition-all">
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <h3 className="text-xl font-black text-[#2b251d] mb-1">{group.name}</h3>
                        <p className="text-[#989168] text-[10px] font-bold uppercase tracking-widest">{group.members?.length || 0} tag</p>
                      </div>
                      <div className="w-10 h-10 bg-[#f7f7f3] rounded-xl flex items-center justify-center text-[#2b251d]">
                        <Layers size={18} />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      {group.members?.slice(0, 4).map(m => (
                        <div key={m.id} className="flex items-center gap-3 p-2 bg-[#f7f7f3] rounded-xl">
                          <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center text-[10px] font-black text-[#989168] border border-[#e7e8dd]">
                            {m.name.charAt(0)}
                          </div>
                          <span className="text-xs font-bold text-[#5d5343]">{m.name}</span>
                        </div>
                      ))}
                      {(group.members?.length || 0) > 4 && (
                        <p className="text-center text-[10px] font-bold text-[#b6b693] mt-2">+ még {group.members!.length - 4} fő</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TIMESHEET TAB */}
          {activeTab === 'timesheet' && (
            <div className="bg-white rounded-[2.5rem] border border-[#e7e8dd] shadow-xl overflow-hidden">
              <div className="p-8 border-b border-[#f7f7f3] flex flex-col md:flex-row justify-between items-center bg-[#f7f7f3]/30 gap-4">
                <h3 className="text-lg font-black text-[#2b251d] uppercase italic">Munkaidő Rögzítés</h3>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setIsTimeModalOpen(true)}
                    className="bg-white border border-[#e7e8dd] hover:border-[#2b251d] text-[#2b251d] px-5 py-3 rounded-xl flex items-center gap-2 transition-all text-xs font-black uppercase tracking-widest"
                  >
                    <Plus size={14} /> Egyéni
                  </button>
                  <button 
                    onClick={() => setIsGroupLogModalOpen(true)}
                    className="bg-[#2b251d] hover:bg-[#4e4639] text-white px-5 py-3 rounded-xl flex items-center gap-2 transition-all text-xs font-black uppercase tracking-widest shadow-lg shadow-[#2b251d]/20"
                  >
                    <Users size={14} /> Csoportos
                  </button>
                </div>
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

      {/* MODAL: CREATE WORKER */}
      {isWorkerModalOpen && (
        <div className="fixed inset-0 bg-[#2b251d]/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white rounded-[2rem] w-full max-w-sm p-8 shadow-2xl animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-black uppercase text-[#2b251d]">Új Munkás</h2>
              <button onClick={() => setIsWorkerModalOpen(false)} className="text-[#c7c8ad] hover:text-[#2b251d] transition-colors"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <input 
                autoFocus
                placeholder="Név"
                className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm" 
                value={newWorker.name}
                onChange={e => setNewWorker({...newWorker, name: e.target.value})} 
              />
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
              <input 
                type="number"
                placeholder="Órabér (RON)"
                className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm" 
                value={newWorker.hourly_rate}
                onChange={e => setNewWorker({...newWorker, hourly_rate: e.target.value})} 
              />
              <button onClick={handleCreateWorker} className="w-full py-4 bg-[#2b251d] text-white font-black rounded-xl hover:bg-[#4e4639] transition-all uppercase tracking-widest text-xs mt-2 flex justify-center items-center gap-2">
                <Check size={16} /> Mentés
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATE GROUP */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 bg-[#2b251d]/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white rounded-[2rem] w-full max-w-lg p-8 shadow-2xl animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-black uppercase text-[#2b251d]">Új Brigád</h2>
              <button onClick={() => setIsGroupModalOpen(false)} className="text-[#c7c8ad] hover:text-[#2b251d] transition-colors"><X size={20} /></button>
            </div>
            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-2 block ml-2">Csoport Neve</label>
                <input 
                  autoFocus
                  placeholder="pl. Ácsok A-csapat"
                  className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm" 
                  value={newGroup.name}
                  onChange={e => setNewGroup({...newGroup, name: e.target.value})} 
                />
              </div>
              
              <div>
                <label className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-2 block ml-2">Tagok Kiválasztása</label>
                <div className="max-h-60 overflow-y-auto pr-2 space-y-2">
                  {workers.map(w => {
                    const isSelected = newGroup.memberIds.includes(w.id);
                    return (
                      <div 
                        key={w.id} 
                        onClick={() => toggleMemberSelection(w.id)}
                        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${isSelected ? 'bg-[#2b251d] border-[#2b251d] text-white' : 'bg-[#f7f7f3] border-[#e7e8dd] text-[#5d5343] hover:border-[#989168]'}`}
                      >
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${isSelected ? 'border-white bg-[#989168]' : 'border-[#c7c8ad]'}`}>
                          {isSelected && <Check size={12} className="text-white" />}
                        </div>
                        <span className="text-xs font-bold">{w.name}</span>
                        <span className="text-[10px] uppercase opacity-60 ml-auto">{w.role}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <button onClick={handleCreateGroup} className="w-full py-4 bg-[#2b251d] text-white font-black rounded-xl hover:bg-[#4e4639] transition-all uppercase tracking-widest text-xs mt-2 flex justify-center items-center gap-2">
                <Check size={16} /> Csoport Létrehozása
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SINGLE LOG TIME */}
      {isTimeModalOpen && (
        <div className="fixed inset-0 bg-[#2b251d]/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white rounded-[2rem] w-full max-w-sm p-8 shadow-2xl animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-black uppercase text-[#2b251d]">Munka Rögzítése</h2>
              <button onClick={() => setIsTimeModalOpen(false)} className="text-[#c7c8ad] hover:text-[#2b251d] transition-colors"><X size={20} /></button>
            </div>
            
            <div className="space-y-4">
              <select 
                className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm appearance-none cursor-pointer"
                value={newTime.worker_id}
                onChange={e => setNewTime({...newTime, worker_id: e.target.value})}
              >
                <option value="">Munkás kiválasztása...</option>
                {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>

              <select 
                className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm appearance-none cursor-pointer"
                value={newTime.project_id}
                onChange={e => setNewTime({...newTime, project_id: e.target.value})}
              >
                <option value="">Projekt kiválasztása...</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>

              <div className="grid grid-cols-2 gap-4">
                <input 
                  type="date"
                  className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm"
                  value={newTime.date}
                  onChange={e => setNewTime({...newTime, date: e.target.value})}
                />
                <input 
                  type="number"
                  placeholder="Óra"
                  className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm"
                  value={newTime.hours}
                  onChange={e => setNewTime({...newTime, hours: e.target.value})}
                />
              </div>

              <input 
                placeholder="Leírás (pl. Falazás)"
                className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm"
                value={newTime.description}
                onChange={e => setNewTime({...newTime, description: e.target.value})}
              />

              <button onClick={handleLogTime} className="w-full py-4 bg-[#2b251d] text-white font-black rounded-xl hover:bg-[#4e4639] transition-all uppercase tracking-widest text-xs mt-2 flex justify-center items-center gap-2">
                <Check size={16} /> Rögzítés
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: GROUP LOG TIME (Option B) */}
      {isGroupLogModalOpen && (
        <div className="fixed inset-0 bg-[#2b251d]/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white rounded-[2rem] w-full max-w-xl p-8 shadow-2xl animate-in zoom-in duration-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center mb-6 flex-shrink-0">
              <h2 className="text-lg font-black uppercase text-[#2b251d]">Csoportos Rögzítés</h2>
              <button onClick={() => setIsGroupLogModalOpen(false)} className="text-[#c7c8ad] hover:text-[#2b251d] transition-colors"><X size={20} /></button>
            </div>
            
            <div className="space-y-4 overflow-y-auto pr-2 flex-1">
              <select 
                className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm appearance-none cursor-pointer"
                value={groupLog.group_id}
                onChange={e => handleGroupSelectForLog(e.target.value)}
              >
                <option value="">Brigád kiválasztása...</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>

              <select 
                className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm appearance-none cursor-pointer"
                value={groupLog.project_id}
                onChange={e => setGroupLog({...groupLog, project_id: e.target.value})}
              >
                <option value="">Projekt kiválasztása...</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>

              <div className="grid grid-cols-2 gap-4">
                <input 
                  type="date"
                  className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm"
                  value={groupLog.date}
                  onChange={e => setGroupLog({...groupLog, date: e.target.value})}
                />
                <input 
                  placeholder="Közös leírás"
                  className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm"
                  value={groupLog.description}
                  onChange={e => setGroupLog({...groupLog, description: e.target.value})}
                />
              </div>

              {groupLog.group_id && (
                <div className="mt-4">
                  <label className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-3 block ml-2">Tagok és Órák</label>
                  <div className="space-y-2">
                    {groups.find(g => g.id === groupLog.group_id)?.members?.map(m => {
                      const state = groupLog.memberStates[m.id] || { selected: false, hours: 8 };
                      return (
                        <div key={m.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${state.selected ? 'bg-white border-[#989168]' : 'bg-[#f7f7f3] border-[#e7e8dd] opacity-50'}`}>
                          <div 
                            onClick={() => toggleGroupMemberLog(m.id)}
                            className={`w-6 h-6 rounded-lg border flex items-center justify-center cursor-pointer transition-all flex-shrink-0 ${state.selected ? 'bg-[#2b251d] border-[#2b251d]' : 'bg-white border-[#c7c8ad]'}`}
                          >
                            {state.selected && <Check size={14} className="text-white" />}
                          </div>
                          <span className="text-xs font-bold text-[#2b251d] flex-1">{m.name}</span>
                          <div className="flex items-center gap-2 bg-[#f7f7f3] rounded-lg p-1">
                            <input 
                              type="number" 
                              min="0"
                              max="24"
                              disabled={!state.selected}
                              value={state.hours}
                              onChange={(e) => updateGroupMemberHours(m.id, parseFloat(e.target.value))}
                              className="w-12 text-center bg-transparent font-bold text-sm outline-none text-[#2b251d]"
                            />
                            <span className="text-[10px] font-bold text-[#c7c8ad] pr-2">óra</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 mt-2 border-t border-[#e7e8dd] flex-shrink-0">
              <button onClick={handleGroupLogSubmit} className="w-full py-4 bg-[#2b251d] text-white font-black rounded-xl hover:bg-[#4e4639] transition-all uppercase tracking-widest text-xs flex justify-center items-center gap-2">
                <Users size={16} /> Csoportos Rögzítés
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
