
'use client';

import { use, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  ArrowLeft, Calendar, MapPin, Wallet, 
  TrendingUp, FileText, Package, Check, Loader2, ArrowRight, PieChart, 
  Pencil, X, Plus, Trash2, Save, Clock, HardHat, Briefcase, FileSignature
} from 'lucide-react';
import Link from 'next/link';

interface PageProps {
  params: Promise<{ id: string }>;
}

// Színpaletta az új kategóriákhoz
const CATEGORY_COLORS = ['#989168', '#2b251d', '#857b5a', '#c7c8ad', '#e7e8dd', '#d97706', '#059669', '#2563eb'];

export default function ProjectDetailsPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const projectId = resolvedParams.id;

  const [project, setProject] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [timesheets, setTimesheets] = useState<any[]>([]); 
  // ÚJ: Alvállalkozói adatok
  const [subcontractorJobs, setSubcontractorJobs] = useState<any[]>([]);
  const [allSubcontractors, setAllSubcontractors] = useState<any[]>([]);

  const [spent, setSpent] = useState(0);
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // EDIT STATE
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState<any>({
    name: '',
    location: '',
    status: '',
    categories: [] as any[]
  });

  // SUBCONTRACTOR MODALS
  const [isJobModalOpen, setIsJobModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [newJob, setNewJob] = useState({ subcontractor_id: '', description: '', agreed_price: '' });
  const [newPayment, setNewPayment] = useState({ job_id: '', amount: '', note: '' });

  useEffect(() => {
    fetchProjectDetails();
  }, [projectId]);

  async function fetchProjectDetails() {
    setLoading(true);
    try {
      // 1. Projekt alapadatai
      const { data: proj } = await supabase.from('projects').select('*').eq('id', projectId).single();
      setProject(proj);

      // 2. Kategóriák lekérése
      const { data: cats } = await supabase.from('project_categories').select('*').eq('project_id', projectId).order('created_at');
      
      // 3. Számlák és tételek lekérése
      const { data: invs } = await supabase
        .from('invoices')
        .select(`
          *,
          invoice_items (
            quantity,
            unit_price,
            raw_name,
            raw_unit,
            confirmed_material_id,
            project_category_id
          )
        `)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      setInvoices(invs || []);

      // 4. Timesheets lekérése
      const { data: ts } = await supabase
        .from('timesheets')
        .select('*, workers(name)')
        .eq('project_id', projectId)
        .order('date', { ascending: false });
      
      setTimesheets(ts || []);

      // 5. Alvállalkozók lekérése (Jobs + Payments)
      const { data: jobs } = await supabase
        .from('subcontractor_jobs')
        .select(`
          *,
          subcontractors (name, trade),
          subcontractor_payments (amount)
        `)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      const processedJobs = jobs?.map((j: any) => ({
        ...j,
        paid: j.subcontractor_payments?.reduce((sum: number, p: any) => sum + p.amount, 0) || 0
      })) || [];
      
      setSubcontractorJobs(processedJobs);

      // 6. Lista az összes alvállalkozóról (Dropdownhoz)
      const { data: allSubs } = await supabase.from('subcontractors').select('id, name, trade').eq('status', 'active');
      setAllSubcontractors(allSubs || []);

      // 7. ÖSSZESÍTETT KÖLTSÉGEK SZÁMÍTÁSA
      let totalSpent = 0;
      const matList: any[] = [];
      const categorySpent: {[key: string]: number} = {};

      // A) ANYAGKÖLTSÉGEK
      invs?.forEach((inv: any) => {
        inv.invoice_items?.forEach((item: any) => {
          const itemCost = (item.quantity || 0) * (item.unit_price || 0);
          totalSpent += itemCost;
          
          if (item.project_category_id) {
            categorySpent[item.project_category_id] = (categorySpent[item.project_category_id] || 0) + itemCost;
          }

          const existing = matList.find(m => m.name === item.raw_name);
          if (existing) {
            existing.quantity += item.quantity || 0;
            existing.totalPrice += itemCost;
          } else {
            matList.push({
              name: item.raw_name,
              quantity: item.quantity || 0,
              unit: item.raw_unit,
              totalPrice: itemCost
            });
          }
        });
      });

      // B) MUNKADÍJ KÖLTSÉGEK
      let totalLaborCost = 0;
      ts?.forEach((t: any) => {
        const cost = t.calculated_cost || 0;
        totalLaborCost += cost;
      });
      totalSpent += totalLaborCost;

      // C) ALVÁLLALKOZÓI KIFIZETÉSEK
      let totalSubPaid = 0;
      processedJobs.forEach(j => {
        totalSubPaid += j.paid;
      });
      totalSpent += totalSubPaid;

      // Munkadíj és Alvállalkozó költség hozzáadása a kategóriákhoz (név alapján)
      const laborCat = cats?.find(c => c.name.toLowerCase().includes('munka') || c.name.toLowerCase().includes('labor'));
      if (laborCat) categorySpent[laborCat.id] = (categorySpent[laborCat.id] || 0) + totalLaborCost;

      // Keresünk "Alvállalkozó" vagy hasonló kategóriát, ha nincs, nem rendeljük hozzá (vagy létrehozhatnánk)
      const subCat = cats?.find(c => c.name.toLowerCase().includes('alváll') || c.name.toLowerCase().includes('külső'));
      if (subCat) categorySpent[subCat.id] = (categorySpent[subCat.id] || 0) + totalSubPaid;

      // Kategóriák frissítése a költésekkel
      const processedCategories = cats?.map(c => ({
        ...c,
        spent: categorySpent[c.id] || 0
      })) || [];

      setCategories(processedCategories);
      setSpent(totalSpent);
      setMaterials(matList.sort((a, b) => b.totalPrice - a.totalPrice));

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // --- EDIT PROJECT FUNCTIONS ---
  const openEditModal = () => {
    setEditForm({
      name: project.name,
      location: project.location,
      status: project.status,
      categories: categories.map(c => ({...c}))
    });
    setIsEditModalOpen(true);
  };

  const handleEditCategoryChange = (index: number, field: string, value: string) => {
    const newCats = [...editForm.categories];
    newCats[index] = { ...newCats[index], [field]: value };
    setEditForm({ ...editForm, categories: newCats });
  };

  const handleAddCategory = () => {
    setEditForm({
      ...editForm,
      categories: [...editForm.categories, { id: null, name: '', allocated_amount: 0, spent: 0, color: CATEGORY_COLORS[editForm.categories.length % CATEGORY_COLORS.length] }]
    });
  };

  const handleRemoveCategory = async (index: number) => {
    const catToDelete = editForm.categories[index];
    if (catToDelete.spent > 0) return alert("Nem törölhetsz olyan kategóriát, amin már van könyvelt költség!");
    if (catToDelete.id) {
      const { error } = await supabase.from('project_categories').delete().eq('id', catToDelete.id);
      if (error) return alert("Hiba: " + error.message);
    }
    setEditForm({ ...editForm, categories: editForm.categories.filter((_: any, i: number) => i !== index) });
  };

  const handleSaveProject = async () => {
    try {
      const totalBudget = editForm.categories.reduce((sum: number, c: any) => sum + (parseFloat(c.allocated_amount) || 0), 0);
      await supabase.from('projects').update({ name: editForm.name, location: editForm.location, status: editForm.status, budget: totalBudget }).eq('id', projectId);
      
      for (const cat of editForm.categories) {
        const payload: any = { project_id: projectId, name: cat.name, allocated_amount: parseFloat(cat.allocated_amount) || 0, color: cat.color };
        if (cat.id) payload.id = cat.id;
        await supabase.from('project_categories').upsert(payload);
      }
      setIsEditModalOpen(false);
      fetchProjectDetails();
    } catch (error: any) { alert(error.message); }
  };

  // --- SUBCONTRACTOR FUNCTIONS ---
  
  const handleAddJob = async () => {
    if (!newJob.subcontractor_id || !newJob.description || !newJob.agreed_price) return alert("Minden mező kötelező!");
    
    const { error } = await supabase.from('subcontractor_jobs').insert([{
      project_id: projectId,
      subcontractor_id: newJob.subcontractor_id,
      description: newJob.description,
      agreed_price: parseFloat(newJob.agreed_price)
    }]);

    if (error) alert("Hiba: " + error.message);
    else {
      setIsJobModalOpen(false);
      setNewJob({ subcontractor_id: '', description: '', agreed_price: '' });
      fetchProjectDetails();
    }
  };

  const handleAddPayment = async () => {
    if (!newPayment.amount) return alert("Összeg kötelező!");
    
    const { error } = await supabase.from('subcontractor_payments').insert([{
      job_id: newPayment.job_id,
      amount: parseFloat(newPayment.amount),
      note: newPayment.note
    }]);

    if (error) alert("Hiba: " + error.message);
    else {
      setIsPaymentModalOpen(false);
      setNewPayment({ job_id: '', amount: '', note: '' });
      fetchProjectDetails();
    }
  };

  if (loading) return <div className="flex justify-center py-40"><Loader2 className="animate-spin text-[#989168]" size={32} /></div>;
  if (!project) return <div>Projekt nem található.</div>;

  const progress = project.budget > 0 ? (spent / project.budget) * 100 : 0;

  return (
    <div className="animate-in fade-in duration-700 pb-20">
      {/* HEADER */}
      <div className="mb-10">
        <Link href="/projects" className="inline-flex items-center gap-2 text-[#b6b693] hover:text-[#2b251d] font-bold text-xs uppercase tracking-widest mb-6 transition-colors">
          <ArrowLeft size={14} /> Vissza a listához
        </Link>
        <div className="flex flex-col md:flex-row justify-between items-start gap-6">
          <div>
            <div className="flex items-center gap-4">
              <h1 className="text-4xl font-black text-[#2b251d] tracking-tighter uppercase italic">{project.name}</h1>
              <button onClick={openEditModal} className="p-2 bg-white border border-[#e7e8dd] rounded-full text-[#b6b693] hover:text-[#2b251d] hover:border-[#2b251d] transition-all">
                <Pencil size={16} />
              </button>
            </div>
            <div className="flex gap-6 mt-4">
              <span className="flex items-center gap-2 text-[#857b5a] text-xs font-bold uppercase tracking-widest">
                <MapPin size={14} /> {project.location || 'Helyszín nincs megadva'}
              </span>
              <span className="flex items-center gap-2 text-[#857b5a] text-xs font-bold uppercase tracking-widest">
                <Calendar size={14} /> Kezdés: {project.start_date || '-'}
              </span>
            </div>
          </div>
          <div className="bg-white px-6 py-4 rounded-2xl border border-[#e7e8dd] shadow-sm">
            <span className="block text-[9px] font-black text-[#b6b693] uppercase tracking-widest mb-1">Státusz</span>
            <span className={`text-lg font-black uppercase ${project.status === 'active' ? 'text-[#2b251d]' : 'text-green-600'}`}>
              {project.status === 'active' ? 'Folyamatban' : 'Lezárva'}
            </span>
          </div>
        </div>
      </div>

      {/* PÉNZÜGYI KÁRTYA */}
      <div className="bg-[#2b251d] rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden mb-12">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#989168] rounded-full blur-[100px] opacity-10 -translate-y-1/2 translate-x-1/3"></div>
        <div className="relative z-10 flex flex-col md:flex-row gap-12">
          
          {/* BUDGET */}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2 text-[#989168]">
              <Wallet size={24} />
              <span className="text-xs font-black uppercase tracking-widest">Pénzügyi Helyzet</span>
            </div>
            <div className="mt-6">
              <div className="flex justify-between items-end mb-2">
                <span className="text-4xl font-black tracking-tighter">{Math.round(spent).toLocaleString()} <span className="text-lg opacity-50">RON</span></span>
                <span className="text-sm font-bold text-[#b6b693]">{Number(project.budget).toLocaleString()} RON keretből</span>
              </div>
              <div className="h-4 w-full bg-white/10 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-1000 ${progress > 100 ? 'bg-red-500' : progress > 90 ? 'bg-yellow-500' : 'bg-[#989168]'}`}
                  style={{ width: `${Math.min(progress, 100)}%` }}
                ></div>
              </div>
              <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-right opacity-60">{Math.round(progress)}% Felhasználva</p>
            </div>
          </div>

          {/* STATS */}
          <div className="flex gap-8 border-l border-white/10 pl-8">
            <div>
              <p className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-1">Számlák</p>
              <p className="text-2xl font-black">{invoices.length} <span className="text-sm opacity-50">db</span></p>
            </div>
            <div>
              <p className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-1">Alvállalkozók</p>
              <p className="text-2xl font-black">{subcontractorJobs.length} <span className="text-sm opacity-50">db</span></p>
            </div>
          </div>
        </div>
      </div>

      {/* KATEGÓRIA BONTÁS */}
      <div className="mb-12">
        <h3 className="text-xl font-black text-[#2b251d] uppercase italic mb-6 flex items-center gap-2">
          <PieChart size={20} /> Költségvetés Bontása
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {categories.map((cat) => {
            const catProgress = cat.allocated_amount > 0 ? (cat.spent / cat.allocated_amount) * 100 : 0;
            const isOver = catProgress > 100;
            return (
              <div key={cat.id} className="bg-white p-6 rounded-[2rem] border border-[#e7e8dd] shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color || '#989168' }}></div>
                    <span className="font-bold text-[#2b251d] text-sm">{cat.name}</span>
                  </div>
                  <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${isOver ? 'bg-red-50 text-red-500' : 'bg-[#f7f7f3] text-[#b6b693]'}`}>
                    {Math.round(catProgress)}%
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-bold text-[#5d5343]">
                    <span>{Math.round(cat.spent).toLocaleString()}</span>
                    <span className="opacity-50">/ {Number(cat.allocated_amount).toLocaleString()}</span>
                  </div>
                  <div className="h-2 w-full bg-[#f7f7f3] rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all duration-1000"
                      style={{ 
                        width: `${Math.min(catProgress, 100)}%`, 
                        backgroundColor: isOver ? '#ef4444' : (cat.color || '#989168')
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* --- ALSÓ SZEKCIÓ (GRID) --- */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
        
        {/* BAL OSZLOP: ANYAGOK */}
        <div className="bg-white rounded-[2.5rem] border border-[#e7e8dd] shadow-sm overflow-hidden h-fit">
          <div className="p-8 border-b border-[#f7f7f3] flex justify-between items-center bg-[#f7f7f3]/50">
            <h3 className="text-lg font-black text-[#2b251d] uppercase italic flex items-center gap-2"><Package size={18} /> Felhasznált Anyagok</h3>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {materials.length === 0 ? (
              <div className="p-8 text-center text-[#c7c8ad] font-bold text-xs uppercase tracking-widest">Még nincs rögzített anyag.</div>
            ) : (
              <table className="w-full text-left">
                <thead className="bg-[#f7f7f3] text-[#b6b693] text-[9px] font-black uppercase tracking-widest sticky top-0">
                  <tr>
                    <th className="p-4 pl-8">Megnevezés</th>
                    <th className="p-4 text-center">Menny.</th>
                    <th className="p-4 pr-8 text-right">Összeg</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f7f7f3]">
                  {materials.map((m, i) => (
                    <tr key={i} className="hover:bg-[#fffcf5] transition-colors">
                      <td className="p-4 pl-8 font-bold text-[#2b251d] text-sm">{m.name}</td>
                      <td className="p-4 text-center text-xs font-bold text-[#857b5a]">{m.quantity} {m.unit}</td>
                      <td className="p-4 pr-8 text-right font-black text-[#2b251d]">{Math.round(m.totalPrice).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* JOBB OSZLOP: SZÁMLÁK & MUNKANAPLÓ & ALVÁLLALKOZÓK */}
        <div className="flex flex-col gap-10">
          
          {/* 1. SZÁMLÁK */}
          <div className="bg-white rounded-[2.5rem] border border-[#e7e8dd] shadow-sm overflow-hidden">
            <div className="p-8 border-b border-[#f7f7f3] flex justify-between items-center bg-[#f7f7f3]/50">
              <h3 className="text-lg font-black text-[#2b251d] uppercase italic flex items-center gap-2"><FileText size={18} /> Kapcsolódó Számlák</h3>
            </div>
            <div className="max-h-[200px] overflow-y-auto p-4 space-y-2">
              {invoices.length === 0 ? (
                <div className="p-4 text-center text-[#c7c8ad] font-bold text-xs uppercase tracking-widest">Nincs csatolt számla.</div>
              ) : (
                invoices.map((inv) => (
                  <Link key={inv.id} href={`/dashboard/${inv.id}`} className="block">
                    <div className="flex items-center justify-between p-4 rounded-2xl border border-[#f7f7f3] hover:border-[#989168] hover:bg-[#fffcf5] transition-all group">
                      <div>
                        <p className="font-bold text-[#2b251d] text-sm">{inv.supplier_name || 'Ismeretlen'}</p>
                        <p className="text-[10px] text-[#b6b693] font-bold uppercase">{new Date(inv.created_at).toLocaleDateString()}</p>
                      </div>
                      <div className="p-2 bg-[#f7f7f3] rounded-full text-[#c7c8ad] group-hover:text-[#2b251d] transition-colors">
                        <ArrowRight size={16} />
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* 2. MUNKANAPLÓ */}
          <div className="bg-white rounded-[2.5rem] border border-[#e7e8dd] shadow-sm overflow-hidden">
            <div className="p-8 border-b border-[#f7f7f3] flex justify-between items-center bg-[#f7f7f3]/50">
              <h3 className="text-lg font-black text-[#2b251d] uppercase italic flex items-center gap-2"><Clock size={18} /> Munkanapló</h3>
            </div>
            <div className="max-h-[200px] overflow-y-auto">
              {timesheets.length === 0 ? (
                <div className="p-8 text-center text-[#c7c8ad] font-bold text-xs uppercase tracking-widest">Nincs rögzített munkaidő.</div>
              ) : (
                <table className="w-full text-left">
                  <thead className="bg-[#f7f7f3] text-[#b6b693] text-[9px] font-black uppercase tracking-widest sticky top-0">
                    <tr>
                      <th className="p-4 pl-8">Munkás</th>
                      <th className="p-4 text-center">Dátum</th>
                      <th className="p-4 text-center">Óra</th>
                      <th className="p-4 pr-8 text-right">Költség</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f7f7f3]">
                    {timesheets.map((ts, i) => (
                      <tr key={i} className="hover:bg-[#fffcf5] transition-colors">
                        <td className="p-4 pl-8 font-bold text-[#2b251d] text-sm flex items-center gap-2">
                          <HardHat size={14} className="text-[#989168]" />
                          {ts.workers?.name}
                        </td>
                        <td className="p-4 text-center text-xs font-bold text-[#857b5a]">{new Date(ts.date).toLocaleDateString()}</td>
                        <td className="p-4 text-center text-xs font-bold text-[#2b251d]">{ts.hours}</td>
                        <td className="p-4 pr-8 text-right font-black text-[#2b251d]">{Math.round(ts.calculated_cost).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* 3. ALVÁLLALKOZÓK - ÚJ SZEKCIÓ */}
          <div className="bg-white rounded-[2.5rem] border border-[#e7e8dd] shadow-sm overflow-hidden">
            <div className="p-8 border-b border-[#f7f7f3] flex justify-between items-center bg-[#f7f7f3]/50">
              <h3 className="text-lg font-black text-[#2b251d] uppercase italic flex items-center gap-2"><Briefcase size={18} /> Alvállalkozói Szerződések</h3>
              <button 
                onClick={() => setIsJobModalOpen(true)}
                className="bg-[#2b251d] hover:bg-[#4e4639] text-white px-3 py-2 rounded-xl flex items-center gap-2 transition-all text-[10px] font-black uppercase tracking-widest"
              >
                <Plus size={12} /> Új Megbízás
              </button>
            </div>
            <div className="max-h-[300px] overflow-y-auto">
              {subcontractorJobs.length === 0 ? (
                <div className="p-8 text-center text-[#c7c8ad] font-bold text-xs uppercase tracking-widest">Nincs alvállalkozói megbízás.</div>
              ) : (
                <table className="w-full text-left">
                  <thead className="bg-[#f7f7f3] text-[#b6b693] text-[9px] font-black uppercase tracking-widest sticky top-0">
                    <tr>
                      <th className="p-4 pl-8">Partner</th>
                      <th className="p-4">Leírás</th>
                      <th className="p-4 text-right">Fix Ár</th>
                      <th className="p-4 text-right">Kifizetve</th>
                      <th className="p-4 text-center">Akció</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f7f7f3]">
                    {subcontractorJobs.map((job) => (
                      <tr key={job.id} className="hover:bg-[#fffcf5] transition-colors">
                        <td className="p-4 pl-8 font-bold text-[#2b251d] text-sm">
                          {job.subcontractors?.name}
                          <span className="block text-[9px] text-[#b6b693] uppercase">{job.subcontractors?.trade}</span>
                        </td>
                        <td className="p-4 text-xs text-[#5d5343] font-bold">{job.description}</td>
                        <td className="p-4 text-right font-black text-[#2b251d]">{job.agreed_price.toLocaleString()}</td>
                        <td className="p-4 text-right font-bold text-[#857b5a]">
                          {job.paid.toLocaleString()}
                          <div className="w-full h-1 bg-[#f7f7f3] rounded-full mt-1">
                            <div className="h-full bg-[#989168] rounded-full" style={{ width: `${Math.min((job.paid/job.agreed_price)*100, 100)}%` }}></div>
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          <button 
                            onClick={() => { setNewPayment({...newPayment, job_id: job.id}); setIsPaymentModalOpen(true); }}
                            className="p-2 bg-[#f7f7f3] hover:bg-[#2b251d] hover:text-white rounded-lg transition-colors text-[#c7c8ad]"
                            title="Kifizetés rögzítése"
                          >
                            <FileSignature size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* EDIT MODAL */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-[#2b251d]/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100] overflow-y-auto">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg p-8 shadow-2xl animate-in zoom-in duration-200 my-8">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xl font-black uppercase text-[#2b251d]">Projekt Szerkesztése</h2>
              <button onClick={() => setIsEditModalOpen(false)} className="text-[#c7c8ad] hover:text-[#2b251d] transition-colors"><X size={24} /></button>
            </div>
            
            <div className="space-y-6">
              {/* ALAPADATOK */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-2 block ml-2">Projekt Neve</label>
                  <input 
                    className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-2xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm transition-all" 
                    value={editForm.name}
                    onChange={e => setEditForm({...editForm, name: e.target.value})} 
                  />
                </div>
                
                <div className="col-span-1">
                  <label className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-2 block ml-2">Helyszín</label>
                  <input 
                    className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-2xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm transition-all" 
                    value={editForm.location}
                    onChange={e => setEditForm({...editForm, location: e.target.value})} 
                  />
                </div>

                <div className="col-span-1">
                  <label className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-2 block ml-2">Státusz</label>
                  <select 
                    className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-2xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm transition-all appearance-none cursor-pointer"
                    value={editForm.status}
                    onChange={e => setEditForm({...editForm, status: e.target.value})}
                  >
                    <option value="active">Aktív</option>
                    <option value="completed">Lezárt</option>
                  </select>
                </div>
              </div>

              <div className="h-px bg-[#e7e8dd]"></div>

              {/* KÖLTSÉGVETÉS KATEGÓRIÁK */}
              <div>
                <div className="flex justify-between items-center mb-4">
                  <label className="text-[10px] font-black text-[#989168] uppercase tracking-widest flex items-center gap-2">
                    <PieChart size={12} /> Költségvetés Kezelése
                  </label>
                  <span className="text-xs font-bold text-[#2b251d]">
                    Új Total: {editForm.categories.reduce((sum: number, c: any) => sum + (parseFloat(c.allocated_amount) || 0), 0).toLocaleString()} RON
                  </span>
                </div>

                <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                  {editForm.categories.map((cat: any, idx: number) => (
                    <div key={idx} className="flex gap-2 items-center group">
                      <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }}></div>
                      <input 
                        placeholder="Kategória neve"
                        className="flex-1 p-3 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl text-xs font-bold text-[#2b251d] outline-none focus:border-[#989168]"
                        value={cat.name}
                        onChange={(e) => handleEditCategoryChange(idx, 'name', e.target.value)}
                      />
                      <input 
                        type="number"
                        placeholder="Összeg"
                        className="w-24 p-3 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl text-xs font-bold text-[#2b251d] outline-none focus:border-[#989168] text-right"
                        value={cat.allocated_amount}
                        onChange={(e) => handleEditCategoryChange(idx, 'allocated_amount', e.target.value)}
                      />
                      
                      {cat.spent > 0 ? (
                        <div title="Már van rajta költés, nem törölhető" className="p-2 text-gray-300 cursor-not-allowed">
                          <Trash2 size={14} />
                        </div>
                      ) : (
                        <button onClick={() => handleRemoveCategory(idx)} className="text-[#c7c8ad] hover:text-red-500 transition-colors p-2">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                
                <button onClick={handleAddCategory} className="mt-3 text-[10px] font-black text-[#989168] uppercase tracking-widest hover:underline flex items-center gap-1">
                  <Plus size={12} /> Kategória hozzáadása
                </button>
              </div>

              <div className="pt-4 border-t border-[#e7e8dd]">
                <button onClick={handleSaveProject} className="w-full py-4 bg-[#2b251d] text-white font-black rounded-2xl hover:bg-[#4e4639] transition-all uppercase tracking-widest text-xs shadow-lg shadow-[#2b251d]/20 flex justify-center items-center gap-2">
                  <Save size={16} /> Változások Mentése
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NEW SUBCONTRACTOR JOB MODAL */}
      {isJobModalOpen && (
        <div className="fixed inset-0 bg-[#2b251d]/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white rounded-[2rem] w-full max-w-sm p-8 shadow-2xl animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-black uppercase text-[#2b251d]">Új Megbízás</h2>
              <button onClick={() => setIsJobModalOpen(false)} className="text-[#c7c8ad] hover:text-[#2b251d] transition-colors"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-2 block ml-2">Partner</label>
                <select 
                  className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm appearance-none"
                  value={newJob.subcontractor_id}
                  onChange={e => setNewJob({...newJob, subcontractor_id: e.target.value})}
                >
                  <option value="">Válassz partnert...</option>
                  {allSubcontractors.map(s => <option key={s.id} value={s.id}>{s.name} ({s.trade})</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-2 block ml-2">Feladat leírása</label>
                <input 
                  placeholder="pl. Tetőszerkezet ácsmunkái"
                  className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm" 
                  value={newJob.description}
                  onChange={e => setNewJob({...newJob, description: e.target.value})} 
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-2 block ml-2">Megállapodott ár (RON)</label>
                <input 
                  type="number"
                  className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm" 
                  value={newJob.agreed_price}
                  onChange={e => setNewJob({...newJob, agreed_price: e.target.value})} 
                />
              </div>
              <button onClick={handleAddJob} className="w-full py-4 bg-[#2b251d] text-white font-black rounded-xl hover:bg-[#4e4639] transition-all uppercase tracking-widest text-xs mt-2 flex justify-center items-center gap-2">
                <Check size={16} /> Mentés
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEW PAYMENT MODAL */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 bg-[#2b251d]/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white rounded-[2rem] w-full max-w-sm p-8 shadow-2xl animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-black uppercase text-[#2b251d]">Kifizetés Rögzítése</h2>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-[#c7c8ad] hover:text-[#2b251d] transition-colors"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-2 block ml-2">Összeg (RON)</label>
                <input 
                  autoFocus
                  type="number"
                  className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm" 
                  value={newPayment.amount}
                  onChange={e => setNewPayment({...newPayment, amount: e.target.value})} 
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-2 block ml-2">Megjegyzés</label>
                <input 
                  placeholder="pl. Előleg"
                  className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm" 
                  value={newPayment.note}
                  onChange={e => setNewPayment({...newPayment, note: e.target.value})} 
                />
              </div>
              <button onClick={handleAddPayment} className="w-full py-4 bg-[#2b251d] text-white font-black rounded-xl hover:bg-[#4e4639] transition-all uppercase tracking-widest text-xs mt-2 flex justify-center items-center gap-2">
                <Check size={16} /> Rögzítés
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
