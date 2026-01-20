'use client';

import { LogOut, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function Header() {
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <header className="bg-white/80 backdrop-blur-md border-b border-[#e7e8dd] px-8 py-4 flex items-center justify-between z-40 sticky top-0">
      <div className="text-[#b6b693] text-[10px] font-black uppercase tracking-[0.2em] italic">
        Intelligent <span className="text-[#989168]">Pricing</span> System
      </div>

      <div className="flex items-center gap-4">
        {/* Bell icon removed for MVP */}
        
        <div className="h-6 w-px bg-[#e7e8dd] mx-2 hidden md:block"></div>

        <button 
          onClick={handleLogout}
          className="flex items-center gap-3 pl-2 pr-4 py-1.5 rounded-full hover:bg-[#f7f7f3] transition-all border border-transparent hover:border-[#e7e8dd] group"
          title="Kijelentkezés"
        >
          <div className="w-8 h-8 bg-[#2b251d] rounded-full flex items-center justify-center text-[#f7f7f3] group-hover:bg-red-500 transition-colors">
            <User size={14} className="group-hover:hidden" />
            <LogOut size={14} className="hidden group-hover:block" />
          </div>
          <div className="flex flex-col items-start">
            <span className="text-xs font-bold text-[#5d5343]">Admin</span>
            <span className="text-[9px] font-bold text-[#b6b693] uppercase tracking-widest hidden md:block group-hover:text-red-500">Kilépés</span>
          </div>
        </button>
      </div>
    </header>
  );
}