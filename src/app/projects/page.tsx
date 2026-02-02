
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  FolderKanban, Plus, MapPin, Calendar, 
  ArrowRight, Loader2, X, Coins, CheckCircle2, Trash2, PieChart
} from 'lucide-react';
import Link from 'next/link';

// Előre definiált színek a kategóriákhoz
const CATEGORY_COLORS = ['#989168', '#2b251d', '#857b5a', '#c7c8ad', '#e7e8dd', '#d97706', '#059669', '#2563eb'];

export default function ProjectsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Új projekt state
  const [newProject, setNewProject] = useState({
    name: '',
    location: '',
    start_date: new Date().toISOString().split('T')[0],
    status: 'active'
  });

  // Kategóriák state
  const [categories, setCategories] = useState<{name: string, amount: string, color: string}[]>([
    { name: 'Anyagköltség', amount: '', color: CATEGORY_COLORS[0] },
    { name: 'Munkadíj', amount: '', color: CATEGORY_COLORS[1] }
  ]);

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    setLoading(true);
    try {
      // 1. Projektek lekérése
      const { data: projData, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      if (!projData || projData.length === 0) {
        setProjects([]);
        return;
      }

      // 2. TELJESÍTMÉNY OPTIMALIZÁLÁS (BULK FETCH)
      // Ahelyett, hogy cikluson belül kérdeznénk le, egyszerre kérünk le mindent,
      // majd a kliensen párosítjuk. Ez 4 query-re csökkenti az N*4 query-t.
      
      // A) Összes számla tétel (projekthez kötve a számlán keresztül)
      // Mivel az invoice_items nem tudja közvetlenül a projekt ID-t, először a számlákat kell lekérni
      // JAVÍTVA: Árfolyam és státusz lekérése
      const { data: allInvoices } = await supabase
        .from('invoices')
        .select('id, project_id, exchange_rate, invoice_items(quantity, unit_price, status)')
        .not('project_id', 'is', null);

      // B) Összes munkaidő
      const { data: allTimesheets } = await supabase
        .from('timesheets')
        .select('project_id, calculated_cost');

      // C) Összes alvállalkozói kifizetés
      const { data: allJobs } = await supabase
        .from('subcontractor_jobs')
        .select('project_id, subcontractor_payments(amount)');

      // D) Összes közvetlen kiadás (ÚJ)
      const { data: allExpenses } = await supabase
        .from('project_expenses')
        .select('project_id, amount');

      // 3. ADATOK ÖSSZEFÉSÜLÉSE MEMÓRIÁBAN
      const projectsWithSpent = projData.map(p => {
        // Anyagköltség (Számlákból) - JAVÍTVA: Csak elfogadott tételek + Árfolyam
        let materialSpent = 0;
        const projectInvoices = allInvoices?.filter((inv: any) => inv.project_id === p.id);
        projectInvoices?.forEach((inv: any) => {
          const rate = inv.exchange_rate || 1;
          inv.invoice_items?.forEach((item: any) => {
            if (item.status === 'confirmed') { // Csak elfogadott tételeket számolunk
              materialSpent += (item.quantity || 0) * (item.unit_price || 0) * rate;
            }
          });
        });

        // Munkadíj
        const projectTimesheets = allTimesheets?.filter((t: any) => t.project_id === p.id);
        const laborSpent = projectTimesheets?.reduce((sum: number, t: any) => sum + (t.calculated_cost || 0), 0) || 0;

        // Alvállalkozók
        const projectJobs = allJobs?.filter((j: any) => j.project_id === p.id);
        let subSpent = 0;
        projectJobs?.forEach((job: any) => {
          subSpent += job.subcontractor_payments?.reduce((sum: number, pay: any) => sum + (pay.amount || 0), 0) || 0;
        });

        // Közvetlen Kiadások (ÚJ)
        const projectExpenses = allExpenses?.filter((exp: any) => exp.project_id === p.id);
        const directExpensesSpent = projectExpenses?.reduce((sum: number, exp: any) => sum + (Number(exp.amount) || 0), 0) || 0;

        return { ...p, spent: materialSpent + laborSpent + subSpent + directExpensesSpent };
      });

      setProjects(projectsWithSpent);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const handleAddCategory = () => {
    setCategories([...categories, { name: '', amount: '', color: CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length] }]);
  };

  const handleRemoveCategory = (index: number) => {
    setCategories(categories.filter((_, i) => i !== index));
  };

  const handleCategoryChange = (index: number, field: 'name' | 'amount', value: string) => {
    const newCats = [...categories];
    newCats[index] = { ...newCats[index], [field]: value };
    setCategories(newCats);
  };

  // Automatikus össz-budget számítás
  const totalBudget = categories.reduce((sum, cat) => sum + (parseFloat(cat.amount) || 0), 0);

  const handleCreateProject = async () => {
    if (!newProject.name) return alert('Név kötelező!');
    if (categories.some(c => !c.name)) return alert('Minden kategóriának kell név!');
    
    // 1. Projekt létrehozása
    const { data: projData, error: projError } = await supabase.from('projects').insert([{
      name: newProject.name,
      location: newProject.location,
      budget: totalBudget, // Az összegzett budget megy a fő mezőbe
      start_date: newProject.start_date,
      status: 'active'
    }]).select().single();

    if (projError) return alert('Hiba a projekt létrehozásakor: ' + projError.message);

    // 2. Kategóriák mentése
    const categoriesToInsert = categories.map(c => ({
      project_id: projData.id,
      name: c.name,
      allocated_amount: parseFloat(c.amount) || 0,
      color: c.color
    }));

    const { error: catError } = await supabase.from('project_categories').insert(categoriesToInsert);

    if (catError) {
      alert('Projekt létrejött, de a kategóriák mentése hibás: ' + catError.message);
    } else {
      setIsModalOpen(false);
      setNewProject({ name: '', location: '', start_date: '', status: 'active' });
      setCategories([{ name: 'Anyagköltség', amount: '', color: CATEGORY_COLORS[0] }, { name: 'Munkadíj', amount: '', color: CATEGORY_COLORS[1] }]);
      fetchProjects(); 
    }
  };

  return (
    <div className="animate-in fade-in duration-700">
      {/* FEJLÉC */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div>
          <h1 className="text-4xl font-black text-[#2b251d] tracking-tighter uppercase italic underline decoration-[#989168] decoration-4 underline-offset-8">
            Projektek
          </h1>
          <p className="text-[#857b5a] text-[10px] font-black uppercase tracking-[0.3em] mt-4">
            Építkezések és Költségvetések
          </p>
        </div>

        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-[#2b251d] hover:bg-[#4e4639] text-white px-6 py-4 rounded-2xl flex items-center gap-3 transition-all shadow-xl shadow-[#2b251d]/10 group"
        >
          <div className="bg-white/10 p-1.5 rounded-lg group-hover:scale-110 transition-transform"><Plus size={16} /></div>
          <span className="font-black text-xs uppercase tracking-widest">Új Projekt</span>
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#989168]" size={32} /></div>
      ) : projects.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-[3rem] border border-dashed border-[#e7e8dd]">
          <FolderKanban className="mx-auto text-[#e7e8dd] mb-4" size={48} />
          <p className="text-[#b6b693] font-bold uppercase tracking-widest">Nincs aktív projekt.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {projects.map((project) => {
            const progress = project.budget > 0 ? (project.spent / project.budget) * 100 : 0;
            const isOverBudget = progress > 100;
            const isNearLimit = progress > 90;

            return (
              <Link key={project.id} href={`/projects/${project.id}`} className="group">
                <div className="bg-white p-8 rounded-[2.5rem] border border-[#e7e8dd] shadow-sm hover:shadow-xl hover:shadow-[#2b251d]/5 hover:border-[#989168] transition-all h-full flex flex-col justify-between relative overflow-hidden">
                  
                  {/* Status Badge */}
                  <div className="absolute top-6 right-6">
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${project.status === 'completed' ? 'bg-green-50 text-green-600 border-green-100' : 'bg-[#f7f7f3] text-[#b6b693] border-[#e7e8dd]'}`}>
                      {project.status === 'active' ? 'Aktív' : project.status === 'completed' ? 'Kész' : 'Terv'}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-xl font-black text-[#2b251d] mb-1 group-hover:text-[#989168] transition-colors">{project.name}</h3>
                    <div className="flex items-center gap-2 text-[#b6b693] text-[10px] font-bold uppercase tracking-widest mb-6">
                      <MapPin size={12} /> {project.location || 'Nincs helyszín'}
                    </div>

                    {/* BUDGET INFO */}
                    <div className="space-y-3">
                      <div className="flex justify-between items-end">
                        <div>
                          <p className="text-[9px] font-black text-[#b6b693] uppercase tracking-widest">Elköltve</p>
                          <p className="text-lg font-black text-[#2b251d]">{Math.round(project.spent).toLocaleString()} <span className="text-xs opacity-50">RON</span></p>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] font-black text-[#b6b693] uppercase tracking-widest">Keret</p>
                          <p className="text-sm font-bold text-[#857b5a]">{Number(project.budget).toLocaleString()} RON</p>
                        </div>
                      </div>

                      {/* PROGRESS BAR */}
                      <div className="h-3 w-full bg-[#f7f7f3] rounded-full overflow-hidden border border-[#e7e8dd]">
                        <div 
                          className={`h-full rounded-full transition-all duration-1000 ${
                            isOverBudget ? 'bg-red-500' : isNearLimit ? 'bg-yellow-500' : 'bg-[#2b251d]'
                          }`} 
                          style={{ width: `${Math.min(progress, 100)}%` }}
                        ></div>
                      </div>
                      <p className={`text-[9px] font-bold text-right uppercase tracking-widest ${isOverBudget ? 'text-red-500' : 'text-[#b6b693]'}`}>
                        {Math.round(progress)}% Felhasználva
                      </p>
                    </div>
                  </div>

                  <div className="mt-8 pt-6 border-t border-[#f7f7f3] flex justify-between items-center">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-[#b6b693] uppercase">
                      <Calendar size={12} /> {new Date(project.start_date).toLocaleDateString()}
                    </div>
                    <div className="p-2 bg-[#f7f7f3] rounded-full text-[#c7c8ad] group-hover:bg-[#2b251d] group-hover:text-white transition-all">
                      <ArrowRight size={16} />
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* CREATE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-[#2b251d]/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100] overflow-y-auto">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg p-8 shadow-2xl animate-in zoom-in duration-200 my-8">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xl font-black uppercase text-[#2b251d]">Új Projekt</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-[#c7c8ad] hover:text-[#2b251d] transition-colors"><X size={24} /></button>
            </div>
            
            <div className="space-y-6">
              {/* ALAPADATOK */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-2 block ml-2">Projekt Neve</label>
                  <input 
                    autoFocus
                    placeholder="pl. Kossuth u. 12 Tetőcsere" 
                    className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-2xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm transition-all" 
                    value={newProject.name}
                    onChange={e => setNewProject({...newProject, name: e.target.value})} 
                  />
                </div>
                
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-2 block ml-2">Helyszín</label>
                  <input 
                    placeholder="Település, Utca" 
                    className="w-full p-4 bg-[#f7f7f3] border border-[#e7e8dd] rounded-2xl font-bold text-[#2b251d] focus:border-[#989168] outline-none text-sm transition-all" 
                    value={newProject.location}
                    onChange={e => setNewProject({...newProject, location: e.target.value})} 
                  />
                </div>
              </div>

              <div className="h-px bg-[#e7e8dd]"></div>

              {/* KÖLTSÉGVETÉS KATEGÓRIÁK */}
              <div>
                <div className="flex justify-between items-center mb-4">
                  <label className="text-[10px] font-black text-[#989168] uppercase tracking-widest flex items-center gap-2">
                    <PieChart size={12} /> Költségvetés Bontása
                  </label>
                  <span className="text-xs font-bold text-[#2b251d]">
                    Total: {totalBudget.toLocaleString()} RON
                  </span>
                </div>

                <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                  {categories.map((cat, idx) => (
                    <div key={idx} className="flex gap-2 items-center group">
                      <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }}></div>
                      <input 
                        placeholder="Kategória neve"
                        className="flex-1 p-3 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl text-xs font-bold text-[#2b251d] outline-none focus:border-[#989168]"
                        value={cat.name}
                        onChange={(e) => handleCategoryChange(idx, 'name', e.target.value)}
                      />
                      <input 
                        type="number"
                        placeholder="Összeg"
                        className="w-24 p-3 bg-[#f7f7f3] border border-[#e7e8dd] rounded-xl text-xs font-bold text-[#2b251d] outline-none focus:border-[#989168] text-right"
                        value={cat.amount}
                        onChange={(e) => handleCategoryChange(idx, 'amount', e.target.value)}
                      />
                      <span className="text-[10px] font-bold text-[#c7c8ad]">RON</span>
                      {categories.length > 1 && (
                        <button onClick={() => handleRemoveCategory(idx)} className="text-[#c7c8ad] hover:text-red-500 transition-colors p-2">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                
                <button onClick={handleAddCategory} className="mt-3 text-[10px] font-black text-[#989168] uppercase tracking-widest hover:underline flex items-center gap-1">
                  <Plus size={12} /> Új sor hozzáadása
                </button>
              </div>

              <div className="pt-4 border-t border-[#e7e8dd]">
                <button onClick={handleCreateProject} className="w-full py-4 bg-[#2b251d] text-white font-black rounded-2xl hover:bg-[#4e4639] transition-all uppercase tracking-widest text-xs shadow-lg shadow-[#2b251d]/20 flex justify-center items-center gap-2">
                  <CheckCircle2 size={16} /> Projekt Létrehozása
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
