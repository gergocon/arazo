
'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Users, Clock, Plus, Loader2, X, Check, 
  Coins, HardHat, Group, UserPlus, Layers,
  Pencil, Trash2, Eye, Calendar as CalendarIcon, Save, AlertTriangle
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
  const [isGroupLogModalOpen, setIsGroupLogModalOpen] = useState(false);
  
  // BATCH EDITING STATE
  const [selectedBatch, setSelectedBatch] = useState<{ id: string, entries: Timesheet[] } | null>(null);
  const [batchEditForm, setBatchEditForm] = useState<{
    date: string;
    project_id: string;
    description: string;
    entries: Timesheet[];
  } | null>(null);

  // EDITING STATES (Individual)
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [editingGroup, setEditingGroup] = useState<WorkerGroup | null>(null);
  const [editingTimesheet, setEditingTimesheet] = useState<Timesheet | null>(null);

  // FORMS
  const [workerForm, setWorkerForm] = useState({ name: '', role: 'Általános', hourly_rate: '', status: 'active' });
  const [groupForm, setGroupForm] = useState<{ name: string, memberIds: string[] }>({ name: '', memberIds: [] });
  
  // Timesheet Form
  const [timeForm, setTimeForm] = useState({ 
    worker_id: '', 
    project_id: '', 
    date: new Date().toISOString().split('T')[0], 
    hours: '', 
    description: '' 
  });

  // Csoportos rögzítés form
  const [groupLog, setGroupLog] = useState({
    group_id: '',
    project_id: '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    memberStates: {} as Record<string, { selected: boolean, hours: number }>
  });

  useEffect(() => {
    fetchData();
  }, []);

  // Batch Form inicializálása amikor megnyílik a modal
  useEffect(() => {
    if (selectedBatch) {
      const first = selectedBatch.entries[0];
      let cleanDesc = first.description || '';
      if (cleanDesc.startsWith('[') && cleanDesc.includes(']')) {
        cleanDesc = cleanDesc.substring(cleanDesc.indexOf(']') + 1).trim();
      }

      setBatchEditForm({
        date: first.date,
        project_id: first.project_id,
        description: cleanDesc,
        entries: JSON.parse(JSON.stringify(selectedBatch.entries))
      });
    } else {
      setBatchEditForm(null);
    }
  }, [selectedBatch]);

  async function fetchData() {
    setLoading(true);
    try {
      const [workersRes, timesheetsRes, projectsRes, groupsRes] = await Promise.all([
        supabase.from('workers').select('*').order('name'),
        supabase.from('timesheets').select('*, workers(name, hourly_rate), projects(name)').order('date', { ascending: false }).limit(100),
        supabase.from('projects').select('id, name').eq('status', 'active').order('name'),
        supabase.from('worker_groups').select('*, worker_group_members(worker_id)')
      ]);

      if (workersRes.data) setWorkers(workersRes.data);
      if (timesheetsRes.data) setTimesheets(timesheetsRes.data);
      if (projectsRes.data) setProjects(projectsRes.data);

      if (groupsRes.data && workersRes.data) {
        const fullGroups = groupsRes.data.map((g: any) => ({
          ...g,
          members: g.worker_group_members.map((m: any) => workersRes.data.find((w: any) => w.id === m.worker_id)).filter(Boolean)
        }));
        setGroups(fullGroups);
      }

    } catch (error) {
      console.error('Hiba az adatok betöltésekor:', error);
    } finally {
      setLoading(false);
    }
  }

  // --- VALIDÁCIÓS FÜGGVÉNY ---
  // Ellenőrzi a 12 órás limitet és a duplikációt
  const checkWorkLogConstraints = async (workerId: string, date: string, projectId: string, hours: number, excludeEntryId?: string) => {
    // 1. Lekérjük a munkás aznapi összes bejegyzését
    const { data: dailyEntries } = await supabase
      .from('timesheets')
      .select('id, hours, project_id')
      .eq('worker_id', workerId)
      .eq('date', date);

    if (!dailyEntries) return { valid: true };

    // Szűrjük ki a jelenleg szerkesztett elemet (ha van)
    const otherEntries = excludeEntryId 
      ? dailyEntries.filter(e => e.id !== excludeEntryId) 
      : dailyEntries;

    // RULE 1: DUPLIKÁCIÓ (Ugyanaz a projekt, ugyanaz a nap)
    const alreadyOnProject = otherEntries.some(e => e.project_id === projectId);
    if (alreadyOnProject) {
      return { valid: false, error: 'Erre a projektre már van rögzítve idő a mai napon. Kérlek, módosítsd a meglévő bejegyzést!' };
    }

    // RULE 2: 12 ÓRÁS LIMIT
    const currentTotalHours = otherEntries.reduce((sum, e) => sum + e.hours, 0);
    if (currentTotalHours + hours > 12) {
      return { valid: false, error: `Napi limit túllépés! Már dolgozott ${currentTotalHours} órát, az új bejegyzéssel (${hours}ó) túllépné a 12 órát.` };
    }

    return { valid: true };
  };

  // --- HELPER: Munkás Csoport Tagság Keresése ---
  const getWorkerCurrentGroupName = (workerId: string, excludeGroupId?: string) => {
    for (const g of groups) {
      if (g.id === excludeGroupId) continue;
      if (g.members?.some(m => m.id === workerId)) return g.name;
    }
    return null;
  };

  // --- LOGIKA: LISTA ÖSSZEVONÁS (GROUPING) ---
  const processedTimesheets = useMemo(() => {
    const result: { type: 'single' | 'group', data: Timesheet | Timesheet[] }[] = [];
    const processedBatches = new Set<string>();

    timesheets.forEach(ts => {
      if (ts.batch_id) {
        if (!processedBatches.has(ts.batch_id)) {
          const batchItems = timesheets.filter(t => t.batch_id === ts.batch_id);
          result.push({ type: 'group', data: batchItems });
          processedBatches.add(ts.batch_id);
        }
      } else {
        result.push({ type: 'single', data: ts });
      }
    });

    return result;
  }, [timesheets]);

  // --- MUNKÁS KEZELÉS ---
  const openWorkerModal = (worker?: Worker) => {
    if (worker) {
      setEditingWorker(worker);
      setWorkerForm({ 
        name: worker.name, 
        role: worker.role, 
        hourly_rate: worker.hourly_rate.toString(),
        status: worker.status 
      });
    } else {
      setEditingWorker(null);
      setWorkerForm({ name: '', role: 'Általános', hourly_rate: '', status: 'active' });
    }
    setIsWorkerModalOpen(true);
  };

  const handleSaveWorker = async () => {
    if (!workerForm.name || !workerForm.hourly_rate) return alert("Név és órabér kötelező!");
    
    const payload = {
      name: workerForm.name,
      role: workerForm.role,
      hourly_rate: parseFloat(workerForm.hourly_rate),
      status: workerForm.status
    };

    let result;
    if (editingWorker) {
      result = await supabase.from('workers').update(payload).eq('id', editingWorker.id).select().single();
    } else {
      result = await supabase.from('workers').insert([payload]).select().single();
    }

    if (result.error) {
      alert("Hiba: " + result.error.message);
    } else if (result.data) {
      if (editingWorker) {
        setWorkers(workers.map(w => w.id === editingWorker.id ? result.data : w));
      } else {
        setWorkers([...workers, result.data]);
      }
      setIsWorkerModalOpen(false);
    }
  };

  // --- CSOPORT KEZELÉS ---
  const openGroupModal = (group?: WorkerGroup) => {
    if (group) {
      setEditingGroup(group);
      setGroupForm({ 
        name: group.name, 
        memberIds: group.members?.map(m => m.id) || [] 
      });
    } else {
      setEditingGroup(null);
      setGroupForm({ name: '', memberIds: [] });
    }
    setIsGroupModalOpen(true);
  };

  const handleSaveGroup = async () => {
    if (!groupForm.name) return alert("Csoport neve kötelező!");
    if (groupForm.memberIds.length === 0) return alert("Válassz legalább egy tagot!");

    let groupId = editingGroup?.id;

    // 1. Csoport Mentése
    if (editingGroup) {
      const { error } = await supabase.from('worker_groups').update({ name: groupForm.name }).eq('id', editingGroup.id);
      if (error) return alert(error.message);
    } else {
      const { data, error } = await supabase.from('worker_groups').insert([{ name: groupForm.name }]).select().single();
      if (error) return alert(error.message);
      groupId = data.id;
    }

    if (!groupId) return;

    // RULE: Egy munkás csak egy csoportban lehet.
    // Töröljük a kiválasztott munkásokat MINDEN csoportból, mielőtt ebbe betennénk őket.
    if (groupForm.memberIds.length > 0) {
      await supabase.from('worker_group_members').delete().in('worker_id', groupForm.memberIds);
    }

    // Majd beszúrjuk az új kapcsolatokat ebbe a csoportba
    const membersPayload = groupForm.memberIds.map(wId => ({
      group_id: groupId,
      worker_id: wId
    }));
    const { error: membersError } = await supabase.from('worker_group_members').insert(membersPayload);

    if (membersError) {
      alert("Hiba a tagok mentésekor: " + membersError.message);
    } else {
      // Újratöltjük az adatokat, mert a "másik csoportból kivétel" miatt más csoportok is változtak
      await fetchData();
      setIsGroupModalOpen(false);
    }
  };

  const toggleMemberSelection = (workerId: string) => {
    setGroupForm(prev => {
      const exists = prev.memberIds.includes(workerId);
      return {
        ...prev,
        memberIds: exists ? prev.memberIds.filter(id => id !== workerId) : [...prev.memberIds, workerId]
      };
    });
  };

  // --- MUNKANAPLÓ EGYÉNI KEZELÉS ---
  const openTimeModal = (ts?: Timesheet) => {
    if (ts) {
      setEditingTimesheet(ts);
      setTimeForm({
        worker_id: ts.worker_id,
        project_id: ts.project_id,
        date: ts.date,
        hours: ts.hours.toString(),
        description: ts.description || ''
      });
    } else {
      setEditingTimesheet(null);
      setTimeForm({ 
        worker_id: '', 
        project_id: '', 
        date: new Date().toISOString().split('T')[0], 
        hours: '', 
        description: '' 
      });
    }
    setIsTimeModalOpen(true);
  };

  const handleSaveTime = async () => {
    if (!timeForm.worker_id || !timeForm.project_id || !timeForm.hours) return alert("Minden mező kitöltése kötelező!");

    const worker = workers.find(w => w.id === timeForm.worker_id);
    if (!worker) return;

    const hours = parseFloat(timeForm.hours);
    
    // VALIDÁCIÓ (Duplikáció + 12h Limit)
    const check = await checkWorkLogConstraints(
      timeForm.worker_id, 
      timeForm.date, 
      timeForm.project_id, 
      hours, 
      editingTimesheet?.id
    );

    if (!check.valid) {
      return alert(check.error);
    }

    const cost = hours * worker.hourly_rate; 

    const payload = {
      worker_id: timeForm.worker_id,
      project_id: timeForm.project_id,
      date: timeForm.date,
      hours: hours,
      description: timeForm.description,
      calculated_cost: cost
    };

    let result;
    if (editingTimesheet) {
      result = await supabase.from('timesheets').update(payload).eq('id', editingTimesheet.id).select('*, workers(name, hourly_rate), projects(name)').single();
    } else {
      result = await supabase.from('timesheets').insert([payload]).select('*, workers(name, hourly_rate), projects(name)').single();
    }

    if (result.error) {
      alert("Hiba: " + result.error.message);
    } else if (result.data) {
      if (editingTimesheet) {
        setTimesheets(timesheets.map(t => t.id === editingTimesheet.id ? result.data : t));
      } else {
        setTimesheets([result.data, ...timesheets]);
      }
      setIsTimeModalOpen(false);
    }
  };

  const handleDeleteTimesheet = async (id: string) => {
    if (!confirm("Biztosan törölni szeretnéd ezt a bejegyzést?")) return;

    const { error } = await supabase.from('timesheets').delete().eq('id', id);
    if (error) {
      alert("Hiba a törléskor: " + error.message);
    } else {
      setTimesheets(timesheets.filter(t => t.id !== id));
    }
  };

  // --- BATCH (CSOPORTOS) SZERKESZTÉS LOGIKA ---
  const handleBatchEntryChange = (id: string, field: 'hours', value: number) => {
    if (!batchEditForm) return;
    const newEntries = batchEditForm.entries.map(entry => {
      if (entry.id === id) {
        const newHours = value;
        const hourlyRate = entry.workers?.hourly_rate || 0;
        return { 
          ...entry, 
          [field]: value,
          calculated_cost: newHours * hourlyRate
        };
      }
      return entry;
    });
    setBatchEditForm({ ...batchEditForm, entries: newEntries });
  };

  const handleDeleteBatchEntry = (id: string) => {
    if (!batchEditForm) return;
    const newEntries = batchEditForm.entries.filter(e => e.id !== id);
    setBatchEditForm({ ...batchEditForm, entries: newEntries });
  };

  const handleSaveBatch = async () => {
    if (!batchEditForm || !selectedBatch) return;

    // VALIDÁCIÓ BATCH SZERKESZTÉSNÉL IS
    for (const entry of batchEditForm.entries) {
      const check = await checkWorkLogConstraints(
        entry.worker_id,
        batchEditForm.date,
        batchEditForm.project_id,
        entry.hours,
        entry.id // Saját magát kizárjuk a checkből
      );
      
      if (!check.valid) {
        return alert(`Hiba ${entry.workers?.name} adatainál: ${check.error}`);
      }
    }

    const groupNamePrefix = selectedBatch.entries[0]?.group_name ? `[${selectedBatch.entries[0].group_name}]` : '[Csoport]';
    const finalDescription = batchEditForm.description 
      ? `${groupNamePrefix} ${batchEditForm.description}`
      : `${groupNamePrefix} Csoportos rögzítés`;

    const updates = batchEditForm.entries.map(entry => ({
      id: entry.id,
      worker_id: entry.worker_id, 
      date: batchEditForm.date,
      project_id: batchEditForm.project_id,
      description: finalDescription,
      hours: entry.hours,
      calculated_cost: entry.calculated_cost,
      batch_id: selectedBatch.id,
      group_name: selectedBatch.entries[0]?.group_name
    }));

    const originalIds = selectedBatch.entries.map(e => e.id);
    const currentIds = batchEditForm.entries.map(e => e.id);
    const idsToDelete = originalIds.filter(id => !currentIds.includes(id));

    try {
      if (idsToDelete.length > 0) {
        await supabase.from('timesheets').delete().in('id', idsToDelete);
      }

      const { error } = await supabase.from('timesheets').upsert(updates);
      
      if (error) throw error;

      await fetchData();
      setSelectedBatch(null);

    } catch (error: any) {
      alert("Hiba a mentés során: " + error.message);
    }
  };

  const handleDeleteBatch = async (batchId: string) => {
    if (!confirm("Biztosan törölni szeretnéd az egész csoportos bejegyzést? Minden érintett munkás bejegyzése törlődik.")) return;

    const { error } = await supabase.from('timesheets').delete().eq('batch_id', batchId);
    if (error) {
      alert("Hiba a törléskor: " + error.message);
    } else {
      setTimesheets(timesheets.filter(t => t.batch_id !== batchId));
      setSelectedBatch(null);
    }
  };

  // --- CSOPORTOS IDŐRÖGZÍTÉS ---
  const handleGroupSelectForLog = (groupId: string) => {
    const selectedGroup = groups.find(g => g.id === groupId);
    if (!selectedGroup) return;

    const initialStates: Record<string, { selected: boolean, hours: number }> = {};
    selectedGroup.members?.forEach(m => {
      if (m.status === 'active') {
        initialStates[m.id] = { selected: true, hours: 8 };
      }
    });

    setGroupLog(prev => ({
      ...prev,
      group_id: groupId,
      memberStates: initialStates
    }));
  };

  const handleGroupLogSubmit = async () => {
    if (!groupLog.group_id || !groupLog.project_id) return alert("Válassz csoportot és projektet!");

    const selectedGroup = groups.find(g => g.id === groupLog.group_id);
    if (!selectedGroup) return;

    // VALIDÁCIÓ MINDEN TAGRA
    const selectedMembers = selectedGroup.members?.filter(m => groupLog.memberStates[m.id]?.selected) || [];
    
    for (const m of selectedMembers) {
      const hours = groupLog.memberStates[m.id].hours;
      const check = await checkWorkLogConstraints(m.id, groupLog.date, groupLog.project_id, hours);
      
      if (!check.valid) {
        return alert(`Hiba ${m.name} rögzítésénél: ${check.error}\n\nA folyamat megszakadt, semmi nem került mentésre.`);
      }
    }

    const entriesToInsert: any[] = [];
    const batchId = crypto.randomUUID(); 
    const groupNamePrefix = `[${selectedGroup.name}]`;
    const finalDescription = groupLog.description 
      ? `${groupNamePrefix} ${groupLog.description}` 
      : `${groupNamePrefix} Csoportos rögzítés`;

    selectedMembers.forEach(m => {
      const state = groupLog.memberStates[m.id];
      entriesToInsert.push({
        worker_id: m.id,
        project_id: groupLog.project_id,
        date: groupLog.date,
        hours: state.hours,
        description: finalDescription,
        calculated_cost: state.hours * m.hourly_rate,
        batch_id: batchId, 
        group_name: selectedGroup.name 
      });
    });

    if (entriesToInsert.length === 0) return alert("Nincs kiválasztott tag a rögzítéshez!");

    const { data, error } = await supabase.from('timesheets').insert(entriesToInsert).select('*, workers(name, hourly_rate), projects(name)');

    if (error) {
      alert("Hiba: " + error.message);
    } else if (data) {
      setTimesheets([...data, ...timesheets]);
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
                  onClick={() => openWorkerModal()}
                  className="bg-[#f7f7f3] border-2 border-dashed border-[#e7e8dd] rounded-[2.5rem] flex flex-col items-center justify-center p-8 hover:border-[#989168] hover:bg-white transition-all group min-h-[200px]"
                >
                  <div className="bg-white p-4 rounded-full shadow-sm mb-4 group-hover:scale-110 transition-transform">
                    <Plus size={24} className="text-[#989168]" />
                  </div>
                  <span className="text-xs font-black text-[#b6b693] uppercase tracking-widest group-hover:text-[#2b251d]">Új Munkás</span>
                </button>

                {/* WORKER CARDS */}
                {workers.map(worker => (
                  <div key={worker.id} className={`bg-white p-8 rounded-[2.5rem] border border-[#e7e8dd] shadow-sm hover:shadow-xl transition-all group relative overflow-hidden ${worker.status === 'inactive' ? 'opacity-60 grayscale' : ''}`}>
                    <div className={`absolute top-0 right-0 w-24 h-24 rounded-bl-[2.5rem] -mr-4 -mt-4 transition-colors ${worker.status === 'active' ? 'bg-[#f7f7f3] group-hover:bg-[#2b251d]' : 'bg-gray-200'}`}></div>
                    
                    {/* Edit Button */}
                    <button 
                      onClick={(e) => { e.stopPropagation(); openWorkerModal(worker); }}
                      className="absolute top-6 right-6 p-2 bg-white rounded-full text-[#c7c8ad] hover:text-[#2b251d] z-20 shadow-sm opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Pencil size={14} />
                    </button>

                    <div className="relative z-10">
                      <div className="w-12 h-12 bg-[#f7f7f3] rounded-2xl flex items-center justify-center text-[#2b251d] mb-6 border border-[#e7e8dd]">
                        <HardHat size={24} />
                      </div>
                      <h3 className="text-xl font-black text-[#2b251d] mb-1">{worker.name}</h3>
                      <div className="flex items-center gap-2 mb-6">
                        <p className="text-[#989168] text-[10px] font-bold uppercase tracking-widest">{worker.role}</p>
                        {worker.status === 'inactive' && <span className="bg-gray-200 text-gray-500 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase">Inaktív</span>}
                      </div>
                      
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
                  onClick={() => openGroupModal()}
                  className="bg-[#f7f7f3] border-2 border-dashed border-[#e7e8dd] rounded-[2.5rem] flex flex-col items-center justify-center p-8 hover:border-[#989168] hover:bg-white transition-all group min-h-[200px]"
                >
                  <div className="bg-white p-4 rounded-full shadow-sm mb-4 group-hover:scale-110 transition-transform">
                    <UserPlus size={24} className="text-[#989168]" />
                  </div>
                  <span className="text-xs font-black text-[#b6b693] uppercase tracking-widest group-hover:text-[#2b251d]">Új Brigád Létrehozása</span>
                </button>

                {/* GROUP CARDS */}
                {groups.map(group => (
                  <div key={group.id} className="bg-white p-8 rounded-[2.5rem] border border-[#e7e8dd] shadow-sm hover:shadow-xl transition-all group relative">
                    <button 
                      onClick={() => openGroupModal(group)}
                      className="absolute top-6 right-6 p-2 bg-[#f7f7f3] rounded-full text-[#c7c8ad] hover:text-[#2b251d] transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Pencil size={14} />
                    </button>

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
                    onClick={() => openTimeModal()}
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

              {processedTimesheets.length === 0 ? (
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
                        <th className="p-6">Munkás / Brigád</th>
                        <th className="p-6">Projekt</th>
                        <th className="p-6">Leírás</th>
                        <th className="p-6 text-center">Óra</th>
                        <th className="p-6 text-right">Költség</th>
                        <th className="p-6 pr-8 text-center">Akciók</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f7f7f3]">
                      {processedTimesheets.map((row, index) => {
                        // HA EGYÉNI SOR
                        if (row.type === 'single') {
                          const ts = row.data as Timesheet;
                          return (
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
                              <td className="p-6 text-right font-black text-[#2b251d] text-base">
                                {ts.calculated_cost.toLocaleString()} <span className="text-[10px] text-[#c7c8ad]">RON</span>
                              </td>
                              <td className="p-6 pr-8 text-center">
                                <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={() => openTimeModal(ts)} className="p-2 text-[#c7c8ad] hover:text-[#2b251d] transition-colors"><Pencil size={14} /></button>
                                  <button onClick={() => handleDeleteTimesheet(ts.id)} className="p-2 text-[#c7c8ad] hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                                </div>
                              </td>
                            </tr>
                          );
                        } 
                        // HA CSOPORTOS SOR (BATCH)
                        else {
                          const items = row.data as Timesheet[];
                          const first = items[0];
                          const totalCost = items.reduce((sum, i) => sum + (i.calculated_cost || 0), 0);
                          const distinctWorkers = items.length;
                          const totalHours = items.reduce((sum, i) => sum + (i.hours || 0), 0);

                          return (
                            <tr 
                              key={`batch-${first.batch_id}`} 
                              className="bg-[#fcfbf9] hover:bg-[#fffcf5] transition-colors group cursor-pointer border-l-4 border-l-[#989168]"
                              onClick={() => setSelectedBatch({ id: first.batch_id!, entries: items })}
                            >
                              <td className="p-6 pl-8 font-bold text-[#2b251d] text-sm whitespace-nowrap">
                                {new Date(first.date).toLocaleDateString()}
                              </td>
                              <td className="p-6 font-bold text-[#2b251d] text-sm">
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 bg-[#2b251d] rounded text-white flex items-center justify-center text-[10px] font-black">
                                    <Layers size={12} />
                                  </div>
                                  <span>{first.group_name || 'Névtelen Brigád'}</span>
                                  <span className="text-[10px] font-normal text-[#989168] ml-1">({distinctWorkers} fő)</span>
                                </div>
                              </td>
                              <td className="p-6 text-xs font-bold text-[#857b5a]">
                                <span className="bg-white px-3 py-1 rounded-lg border border-[#e7e8dd]">
                                  {first.projects?.name}
                                </span>
                              </td>
                              <td className="p-6 text-xs text-[#b6b693] italic max-w-xs truncate">{first.description || 'Csoportos rögzítés'}</td>
                              <td className="p-6 text-center font-black text-[#2b251d]">{totalHours} óra <span className="text-[9px] font-normal text-[#c7c8ad] block">összesen</span></td>
                              <td className="p-6 text-right font-black text-[#2b251d] text-base">
                                {totalCost.toLocaleString()} <span className="text-[10px] text-[#c7c8ad]">RON</span>
                              </td>
                              <td className="p-6 pr-8 text-center">
                                <div className="flex items-center justify-center gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                                  <div className="flex items-center gap-1 text-[10px] font-bold text-[#989168] uppercase tracking-widest">
                                    <Pencil size={14} /> Szerkesztés
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        }
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* MODAL: BATCH EDIT (CSOPORTOS SZERKESZTÉS) */}
      {selectedBatch && batchEditForm && (
        <div className="fixed inset-0 bg-[#2b251d]/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] w-full max-w-3xl p-8 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-start mb-6 flex-shrink-0">
              <div>
                <h2 className="text-xl font-black uppercase text-[#2b251d] flex items-center gap-3">
                  <Pencil size={20} className="text-[#989168]" />
                  {selectedBatch.entries[0]?.group_name || 'Csoport'} Szerkesztése
                </h2>
                <p className="text-[#b6b693] text-xs font-bold uppercase tracking-widest mt-1">
                  Globális adatok és egyéni órák módosítása
                </p>
              </div>
              <button onClick={() => setSelectedBatch(null)} className="text-[#c7c8ad] hover:text-[#2b251d] transition-colors bg-[#f7f7f3] p-2 rounded-full"><X size={20} /></button>
            </div>

            {/* GLOBÁLIS MEZŐK */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 p-4 bg-[#f7f7f3] rounded-2xl border border-[#e7e8dd]">
              <div className="col-span-1">
                <label className="text-[9px] font-black text-[#989168] uppercase tracking-widest mb-1 block">Dátum</label>
                <input 
                  type="date" 
                  className="w-full p-2 bg-white border border-[#e7e8dd] rounded-lg text-sm font-bold text-[#2b251d] outline-none focus:border-[#989168]"
                  value={batchEditForm.date}
                  onChange={(e) => setBatchEditForm({...batchEditForm, date: e.target.value})}
                />
              </div>
              <div className="col-span-1">
                <label className="text-[9px] font-black text-[#989168] uppercase tracking-widest mb-1 block">Projekt</label>
                <select 
                  className="w-full p-2 bg-white border border-[#e7e8dd] rounded-lg text-sm font-bold text-[#2b251d] outline-none focus:border-[#989168]"
                  value={batchEditForm.project_id}
                  onChange={(e) => setBatchEditForm({...batchEditForm, project_id: e.target.value})}
                >
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="col-span-1 md:col-span-3">
                <label className="text-[9px] font-black text-[#989168] uppercase tracking-widest mb-1 block">Közös Leírás</label>
                <input 
                  className="w-full p-2 bg-white border border-[#e7e8dd] rounded-lg text-sm font-bold text-[#2b251d] outline-none focus:border-[#989168]"
                  value={batchEditForm.description}
                  onChange={(e) => setBatchEditForm({...batchEditForm, description: e.target.value})}
                />
              </div>
            </div>

            {/* EGYÉNI SOROK LISTÁJA */}
            <div className="overflow-y-auto pr-2 flex-1 border-t border-[#e7e8dd]">
              <table className="w-full text-left">
                <thead className="bg-white text-[#b6b693] text-[9px] font-black uppercase tracking-widest sticky top-0 z-10">
                  <tr>
                    <th className="p-4">Munkás</th>
                    <th className="p-4 text-center">Óra (Szerk.)</th>
                    <th className="p-4 text-right">Órabér</th>
                    <th className="p-4 text-right">Költség</th>
                    <th className="p-4 text-center">Törlés</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f7f7f3]">
                  {batchEditForm.entries.map(item => (
                    <tr key={item.id} className="hover:bg-[#fffcf5]">
                      <td className="p-4 font-bold text-[#2b251d] text-sm">{item.workers?.name}</td>
                      <td className="p-4 text-center">
                        <input 
                          type="number" 
                          min="0" max="24"
                          className="w-16 p-2 bg-[#f7f7f3] border border-[#e7e8dd] rounded-lg text-center font-bold text-[#2b251d] outline-none focus:border-[#989168]"
                          value={item.hours}
                          onChange={(e) => handleBatchEntryChange(item.id, 'hours', parseFloat(e.target.value) || 0)}
                        />
                      </td>
                      <td className="p-4 text-right text-xs text-[#b6b693]">{item.workers?.hourly_rate} RON</td>
                      <td className="p-4 text-right font-black text-[#2b251d]">{item.calculated_cost.toLocaleString()} RON</td>
                      <td className="p-4 text-center">
                        <button 
                          onClick={() => handleDeleteBatchEntry(item.id)}
                          className="p-2 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eltávolítás a listából"
                        >
                          <X size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* LÁBLÉC ÖSSZESÍTŐ ÉS MENTÉS */}
            <div className="mt-4 pt-4 border-t border-[#e7e8dd] bg-[#f7f7f3]/50 p-4 rounded-xl flex flex-col gap-4 flex-shrink-0">
              <div className="flex justify-between items-center text-sm font-black text-[#2b251d]">
                <span>Összesen ({batchEditForm.entries.length} fő):</span>
                <span className="text-lg">{batchEditForm.entries.reduce((s, i) => s + (i.calculated_cost || 0), 0).toLocaleString()} RON</span>
              </div>
              
              <div className="flex justify-between items-center gap-4">
                <button 
                  onClick={() => handleDeleteBatch(selectedBatch.id)}
                  className="text-red-500 text-xs font-black uppercase tracking-widest hover:underline flex items-center gap-2"
                >
                  <Trash2 size={14} /> Egész csoport törlése
                </button>
                <div className="flex gap-2">
                  <button onClick={() => setSelectedBatch(null)} className="bg-white border border-[#e7e8dd] hover:bg-[#e7e8dd] text-[#2b251d] px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all">
                    Mégse
                  </button>
                  <button onClick={handleSaveBatch} className="bg-[#2b251d] hover:bg-[#4e4639] text-white px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg flex items-center gap-2">
                    <Save size={16} /> Módosítások Mentése
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATE/EDIT WORKER */}
      {isWorkerModalOpen && (
        <div className="fixed inset-0 bg-[#2b251d]/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white rounded-[2rem] w-full max-w-sm p-8 shadow-2xl animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-black uppercase text-[#2b251d]">{editingWorker ? 'Munkás Szerkesztése' : 'Új Munkás'}</h2>
              <button onClick={() => setIsWorkerModalOpen(false)} className="text-[#c7c8ad] hover:text-[#2b251d] transition-colors"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <input 
                autoFocus
                placeholder="Név"
                className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm" 
                value={workerForm.name}
                onChange={e => setWorkerForm({...workerForm, name: e.target.value})} 
              />
              <select 
                className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm appearance-none"
                value={workerForm.role}
                onChange={e => setWorkerForm({...workerForm, role: e.target.value})}
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
                value={workerForm.hourly_rate}
                onChange={e => setWorkerForm({...workerForm, hourly_rate: e.target.value})} 
              />
              
              {/* STATUS SWITCH */}
              {editingWorker && (
                <div className="flex items-center justify-between p-4 bg-[#f7f7f3] rounded-xl border border-[#e7e8dd]">
                  <span className="text-xs font-bold text-[#b6b693] uppercase">Státusz</span>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setWorkerForm({...workerForm, status: 'active'})}
                      className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase transition-all ${workerForm.status === 'active' ? 'bg-[#2b251d] text-white' : 'text-[#c7c8ad]'}`}
                    >
                      Aktív
                    </button>
                    <button 
                      onClick={() => setWorkerForm({...workerForm, status: 'inactive'})}
                      className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase transition-all ${workerForm.status === 'inactive' ? 'bg-[#989168] text-white' : 'text-[#c7c8ad]'}`}
                    >
                      Inaktív
                    </button>
                  </div>
                </div>
              )}

              <button onClick={handleSaveWorker} className="w-full py-4 bg-[#2b251d] text-white font-black rounded-xl hover:bg-[#4e4639] transition-all uppercase tracking-widest text-xs mt-2 flex justify-center items-center gap-2">
                <Check size={16} /> Mentés
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATE/EDIT GROUP */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 bg-[#2b251d]/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white rounded-[2rem] w-full max-w-lg p-8 shadow-2xl animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-black uppercase text-[#2b251d]">{editingGroup ? 'Brigád Szerkesztése' : 'Új Brigád'}</h2>
              <button onClick={() => setIsGroupModalOpen(false)} className="text-[#c7c8ad] hover:text-[#2b251d] transition-colors"><X size={20} /></button>
            </div>
            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-2 block ml-2">Csoport Neve</label>
                <input 
                  autoFocus
                  placeholder="pl. Ácsok A-csapat"
                  className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm" 
                  value={groupForm.name}
                  onChange={e => setGroupForm({...groupForm, name: e.target.value})} 
                />
              </div>
              
              <div>
                <label className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-2 block ml-2">Tagok Kezelése</label>
                <div className="max-h-60 overflow-y-auto pr-2 space-y-2">
                  {workers.map(w => {
                    const isSelected = groupForm.memberIds.includes(w.id);
                    const currentGroupName = getWorkerCurrentGroupName(w.id, editingGroup?.id);
                    const isTaken = !!currentGroupName;

                    return (
                      <div 
                        key={w.id} 
                        onClick={() => toggleMemberSelection(w.id)}
                        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${isSelected ? 'bg-[#2b251d] border-[#2b251d] text-white' : 'bg-[#f7f7f3] border-[#e7e8dd] text-[#5d5343] hover:border-[#989168]'} ${w.status === 'inactive' ? 'opacity-50' : ''}`}
                      >
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${isSelected ? 'border-white bg-[#989168]' : 'border-[#c7c8ad]'}`}>
                          {isSelected && <Check size={12} className="text-white" />}
                        </div>
                        <div className="flex-1">
                          <span className="text-xs font-bold">{w.name}</span>
                          {/* HA MÁR FOGLALT: KIÍRJUK */}
                          {isTaken && !isSelected && (
                            <span className="block text-[8px] uppercase text-[#989168] font-bold">
                              <AlertTriangle size={8} className="inline mr-1" />
                              Jelenleg: {currentGroupName}
                            </span>
                          )}
                          {/* HA FOGLALT VOLT DE MOST KIVÁLASZTOTTUK */}
                          {isTaken && isSelected && (
                            <span className="block text-[8px] uppercase text-[#989168] font-bold">
                              Áthelyezés innen: {currentGroupName}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] uppercase opacity-60 ml-auto">{w.role}</span>
                        {w.status === 'inactive' && <span className="text-[8px] uppercase font-black bg-red-500 text-white px-1 rounded ml-2">Inaktív</span>}
                      </div>
                    );
                  })}
                </div>
              </div>

              <button onClick={handleSaveGroup} className="w-full py-4 bg-[#2b251d] text-white font-black rounded-xl hover:bg-[#4e4639] transition-all uppercase tracking-widest text-xs mt-2 flex justify-center items-center gap-2">
                <Check size={16} /> Mentés
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SINGLE LOG TIME (CREATE/EDIT) */}
      {isTimeModalOpen && (
        <div className="fixed inset-0 bg-[#2b251d]/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white rounded-[2rem] w-full max-w-sm p-8 shadow-2xl animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-black uppercase text-[#2b251d]">{editingTimesheet ? 'Bejegyzés Módosítása' : 'Munka Rögzítése'}</h2>
              <button onClick={() => setIsTimeModalOpen(false)} className="text-[#c7c8ad] hover:text-[#2b251d] transition-colors"><X size={20} /></button>
            </div>
            
            <div className="space-y-4">
              <select 
                className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm appearance-none cursor-pointer"
                value={timeForm.worker_id}
                onChange={e => setTimeForm({...timeForm, worker_id: e.target.value})}
                disabled={!!editingTimesheet} // Szerkesztésnél ne lehessen munkást váltani, mert bekavarhat az árkalkulációba
              >
                <option value="">Munkás kiválasztása...</option>
                {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>

              <select 
                className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm appearance-none cursor-pointer"
                value={timeForm.project_id}
                onChange={e => setTimeForm({...timeForm, project_id: e.target.value})}
              >
                <option value="">Projekt kiválasztása...</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>

              <div className="grid grid-cols-2 gap-4">
                <input 
                  type="date"
                  className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm"
                  value={timeForm.date}
                  onChange={e => setTimeForm({...timeForm, date: e.target.value})}
                />
                <input 
                  type="number"
                  placeholder="Óra"
                  className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm"
                  value={timeForm.hours}
                  onChange={e => setTimeForm({...timeForm, hours: e.target.value})}
                />
              </div>

              <input 
                placeholder="Leírás (pl. Falazás)"
                className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm"
                value={timeForm.description}
                onChange={e => setTimeForm({...timeForm, description: e.target.value})}
              />

              <button onClick={handleSaveTime} className="w-full py-4 bg-[#2b251d] text-white font-black rounded-xl hover:bg-[#4e4639] transition-all uppercase tracking-widest text-xs mt-2 flex justify-center items-center gap-2">
                <Check size={16} /> Mentés
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: GROUP LOG TIME (Option B) - unchanged logic mostly */}
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
                      // Csak aktív munkásoknak lehet csoportosan rögzíteni
                      if (m.status === 'inactive') return null;

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
