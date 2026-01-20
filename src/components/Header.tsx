'use client';

import { Bell, User } from 'lucide-react';
import Link from 'next/link';

export default function Header() {
  return (
    <header className="bg-white/80 backdrop-blur-md border-b border-[#e7e8dd] px-8 py-4 flex items-center justify-between z-40 sticky top-0">
      <div className="text-[#b6b693] text-[10px] font-black uppercase tracking-[0.2em] italic">
        Intelligent <span className="text-[#989168]">Pricing</span> System
      </div>

      <div className="flex items-center gap-4">
        <button className="w-10 h-10 flex items-center justify-center rounded-full text-[#c7c8ad] hover:text-[#2b251d] hover:bg-[#f7f7f3] transition-all">
          <Bell size={20} />
        </button>

        <div className="h-6 w-px bg-[#e7e8dd] mx-2"></div>

        <button className="flex items-center gap-3 pl-2 pr-4 py-1.5 rounded-full hover:bg-[#f7f7f3] transition-all border border-transparent hover:border-[#e7e8dd] group">
          <div className="w-8 h-8 bg-[#2b251d] rounded-full flex items-center justify-center text-[#f7f7f3] group-hover:scale-105 transition-transform">
            <User size={14} />
          </div>
          <span className="text-xs font-bold text-[#5d5343] hidden md:block">Admin</span>
        </button>
      </div>
    </header>
  );
}