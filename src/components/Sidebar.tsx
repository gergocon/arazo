'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
// MINDEN SZÜKSÉGES IKON IMPORTÁLVA:
import { 
  LayoutDashboard, 
  FileText, 
  Database, 
  Truck, 
  Settings, 
  BarChart3 
} from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();

  const menuItems = [
    { name: 'Vezérlőpult', icon: LayoutDashboard, href: '/' },
    { name: 'Számlák', icon: FileText, href: '/invoices' },
    { name: 'Anyagkatalógus', icon: Database, href: '/catalog' },
    { name: 'Elemzések', icon: BarChart3, href: '/analysis' },
    { name: 'Beszállítók', icon: Truck, href: '/suppliers' },
  ];

  return (
    <aside className="w-72 bg-[#2b251d] text-white flex flex-col shadow-2xl z-50">
      <div className="p-8">
        <h1 className="text-2xl font-black italic tracking-tighter uppercase text-[#e7e8dd]">
          CONTROL<span className="text-[#989168]">PANEL</span>
        </h1>
        <p className="text-[9px] text-[#857b5a] font-black uppercase tracking-[0.3em] mt-1">
          Építőipari Árkontroll
        </p>
      </div>

      <nav className="flex-1 px-4 space-y-2 mt-4">
        {menuItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-4 px-6 py-4 rounded-2xl font-bold text-sm transition-all ${
                isActive 
                  ? 'bg-[#989168] text-[#2b251d] shadow-lg shadow-[#2b251d]/50' 
                  : 'text-[#b6b693]/40 hover:bg-[#4e4639] hover:text-[#f7f7f3]'
              }`}
            >
              <item.icon size={20} className={isActive ? 'text-[#2b251d]' : ''} />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="p-8 border-t border-[#4e4639]">
        <div className="flex items-center gap-3 text-[#70644d] hover:text-[#f7f7f3] cursor-pointer transition-colors group">
          <Settings size={18} className="group-hover:rotate-90 transition-transform duration-500" />
          <span className="text-xs font-bold uppercase tracking-widest">Beállítások</span>
        </div>
      </div>
    </aside>
  );
}