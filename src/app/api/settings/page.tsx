'use client';

import { Settings, Shield, User, Bell } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div className="animate-in fade-in duration-700">
      <div className="mb-10">
        <h1 className="text-4xl font-black text-[#2b251d] tracking-tighter uppercase italic underline decoration-[#989168] decoration-4 underline-offset-8">Beállítások</h1>
        <p className="text-[#857b5a] text-[10px] font-black uppercase tracking-[0.3em] mt-3">Fiók és Rendszerkonfiguráció</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* PROFIL KÁRTYA */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-[#e7e8dd]">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 bg-[#f7f7f3] rounded-2xl text-[#2b251d]">
              <User size={24} />
            </div>
            <div>
              <h3 className="text-lg font-black text-[#2b251d] uppercase italic">Admin Profil</h3>
              <p className="text-[#b6b693] text-[10px] font-bold uppercase tracking-widest">Jelszó és Személyes adatok</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="bg-[#f7f7f3] p-4 rounded-xl border border-[#e7e8dd] opacity-50 cursor-not-allowed">
              <label className="text-[9px] font-black text-[#b6b693] uppercase tracking-widest block mb-1">Email Cím</label>
              <p className="font-bold text-[#2b251d] text-sm">admin@constructorulsalard.ro</p>
            </div>
            <button className="w-full py-3 bg-[#2b251d] text-white rounded-xl font-bold text-xs uppercase tracking-widest opacity-50 cursor-not-allowed">Jelszó Módosítása (Hamarosan)</button>
          </div>
        </div>

        {/* ÉRTESÍTÉSEK */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-[#e7e8dd]">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 bg-[#f7f7f3] rounded-2xl text-[#989168]">
              <Bell size={24} />
            </div>
            <div>
              <h3 className="text-lg font-black text-[#2b251d] uppercase italic">Értesítések</h3>
              <p className="text-[#b6b693] text-[10px] font-bold uppercase tracking-widest">Riasztások kezelése</p>
            </div>
          </div>
          <div className="p-6 bg-[#fffcf5] border border-[#f5f3e6] rounded-2xl text-center">
            <p className="text-[#857b5a] text-xs font-bold uppercase tracking-wide">Az árfigyelő értesítések fejlesztés alatt állnak.</p>
          </div>
        </div>

      </div>
    </div>
  );
}