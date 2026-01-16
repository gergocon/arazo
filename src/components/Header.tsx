'use client';

import { Plus, Bell, User } from 'lucide-react';
import Link from 'next/link';

export default function Header() {
  return (
    <header className="bg-white border-b border-[#e7e8dd] px-8 py-4 flex items-center justify-between z-40 shadow-sm">
      <div className="text-[#b6b693] text-[10px] font-black uppercase tracking-[0.2em] italic">
        Intelligent <span className="text-[#989168]">Pricing</span> System
      </div>

      <div className="flex items-center gap-6">
        <button className="text-[#c7c8ad] hover:text-[#989168] transition-colors">
          <Bell size={20} />
        </button>

        <Link 
          href="/invoices" 
          className="bg-[#2b251d] text-[#f7f7f3] px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-[#2b251d]/10 hover:bg-[#5d5343] transition-all flex items-center gap-2"
        >
          <Plus size={16} /> Új számla feltöltése
        </Link>

        <div className="w-10 h-10 bg-[#f7f7f3] rounded-xl flex items-center justify-center text-[#5d5343] border border-[#e7e8dd] cursor-pointer hover:bg-[#e7e8dd] transition-colors">
          <User size={20} />
        </div>
      </div>
    </header>
  );
}