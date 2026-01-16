'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { LogIn, Loader2, ShieldCheck, Lock } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

if (error) {
  setError(error.message); // Így a pontos hibaüzenetet fogod látni (pl. Invalid login credentials)
  setLoading(false);
} else if (data.user) {
  // A router helyett teljes oldal-újratöltést használunk az éles sütik miatt
  window.location.assign('/'); 
}
  };

  return (
    <div className="min-h-screen bg-[#f7f7f3] flex items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full animate-in fade-in zoom-in duration-500">
        <div className="text-center mb-10">
          <div className="inline-flex p-5 bg-[#2b251d] rounded-[2rem] text-[#989168] mb-6 shadow-2xl">
            <ShieldCheck size={40} />
          </div>
          <h1 className="text-3xl font-black text-[#2b251d] uppercase tracking-tighter italic">
            Control<span className="text-[#989168]">Panel</span>
          </h1>
          <p className="text-[10px] font-black text-[#b6b693] uppercase tracking-[0.3em] mt-2 italic">Biztonságos Belépés</p>
        </div>

        <div className="bg-white p-10 rounded-[3rem] shadow-2xl shadow-[#2b251d]/5 border border-[#e7e8dd]">
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-2 block ml-2">Email cím</label>
              <input 
                type="email" required
                className="w-full p-5 bg-[#f7f7f3] border-2 border-[#e7e8dd] rounded-2xl font-bold text-[#2b251d] focus:border-[#989168] outline-none transition-all"
                placeholder="pelda@constructorulsalard.ro"
                value={email} onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="text-[10px] font-black text-[#989168] uppercase tracking-widest mb-2 block ml-2">Jelszó</label>
              <div className="relative">
                <input 
                  type="password" required
                  className="w-full p-5 bg-[#f7f7f3] border-2 border-[#e7e8dd] rounded-2xl font-bold text-[#2b251d] focus:border-[#989168] outline-none transition-all"
                  placeholder="••••••••"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                />
                <Lock className="absolute right-5 top-1/2 -translate-y-1/2 text-[#c7c8ad]" size={20} />
              </div>
            </div>

            {error && <p className="text-red-500 text-xs font-bold text-center animate-bounce">{error}</p>}

            <button 
              disabled={loading}
              className="w-full py-6 bg-[#2b251d] text-[#f7f7f3] font-black rounded-2xl shadow-xl hover:bg-[#4e4639] transition-all uppercase tracking-widest flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" /> : <><LogIn size={20} /> Belépés</>}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}