'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Upload, FileText, Loader2, CheckCircle, AlertCircle, Sparkles } from 'lucide-react';

export default function InvoiceUpload() {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      setStatus('processing');
      setErrorMessage('');
      
      if (!event.target.files || event.target.files.length === 0) {
        throw new Error('Kérlek, válassz ki egy fájlt!');
      }

      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `invoices/${fileName}`;

      // 1. Feltöltés a Supabase Storage-ba
      const { error: storageError } = await supabase.storage
        .from('invoices')
        .upload(filePath, file);

      if (storageError) throw storageError;

      // 2. Rekord létrehozása az 'invoices' táblában
      const { data: invoiceData, error: dbError } = await supabase
        .from('invoices')
        .insert([
          { 
            storage_path: filePath, 
            status: 'pending' 
          }
        ])
        .select();

      if (dbError) throw dbError;
      if (!invoiceData || invoiceData.length === 0) throw new Error("Adatbázis mentési hiba.");

      const invoiceId = invoiceData[0].id;

      // 3. API hívás az MI feldolgozáshoz (OpenAI Vision)
      const processRes = await fetch('/api/process-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          invoiceId: invoiceId, 
          storagePath: filePath 
        }),
      });

      const result = await processRes.json();

      if (!processRes.ok) {
        throw new Error(result.details || result.error || 'Az MI feldolgozás megszakadt.');
      }

      // Siker esetén
      setStatus('success');
      
      // 1.5 másodperc várakozás, hogy a felhasználó lássa a sikert, majd átirányítás
      setTimeout(() => {
        router.push(`/dashboard/${invoiceId}`);
      }, 1500);

    } catch (error: any) {
      console.error("Feltöltési hiba:", error);
      setStatus('error');
      setErrorMessage(error.message || 'Váratlan hiba történt.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto">
      <div className={`
        relative overflow-hidden p-10 rounded-[2.5rem] border-4 border-dashed transition-all duration-500
        ${status === 'success' ? 'border-green-400 bg-green-50' : 
          status === 'error' ? 'border-red-200 bg-red-50' : 
          'border-gray-200 bg-white hover:border-blue-400 shadow-2xl shadow-blue-100'}
      `}>
        
        {/* Dekorációs elem a háttérben feldolgozáskor */}
        {status === 'processing' && (
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5 animate-pulse" />
        )}

        <div className="relative z-10 flex flex-col items-center">
          {/* Ikon szekció */}
          <div className={`p-5 rounded-3xl mb-6 shadow-sm transition-transform duration-300 ${
            status === 'success' ? 'bg-green-500 text-white scale-110' : 
            status === 'error' ? 'bg-red-500 text-white' : 
            'bg-blue-600 text-white'
          }`}>
            {uploading ? (
              <Loader2 className="w-10 h-10 animate-spin" />
            ) : status === 'success' ? (
              <CheckCircle className="w-10 h-10" />
            ) : status === 'error' ? (
              <AlertCircle className="w-10 h-10" />
            ) : (
              <Upload className="w-10 h-10" />
            )}
          </div>
          
          <h2 className="text-2xl font-black text-gray-900 mb-3 text-center">
            {status === 'processing' ? 'Az MI elemzi a számlát...' : 
             status === 'success' ? 'Feldolgozva!' : 
             status === 'error' ? 'Hoppá, hiba történt' : 'Számla feltöltése'}
          </h2>
          
          <p className="text-gray-500 text-center mb-8 font-medium">
            {status === 'processing' ? 'Ez eltarthat 10-15 másodpercig. Kérlek, ne zárd be az ablakot.' : 
             status === 'error' ? errorMessage : 
             status === 'success' ? 'Azonnal átirányítunk az ellenőrzéshez...' :
             'Tölts fel PDF-et vagy képet a tételek kinyeréséhez.'}
          </p>

          {/* Feltöltő gomb */}
          <label className={`
            group w-full flex items-center justify-center px-8 py-5 rounded-2xl cursor-pointer transition-all font-black text-lg
            ${uploading ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 
              status === 'success' ? 'bg-green-600 text-white' :
              'bg-gray-900 text-white hover:bg-blue-600 hover:-translate-y-1 active:translate-y-0 shadow-xl shadow-gray-200'}
          `}>
            {uploading ? (
              <Sparkles className="w-6 h-6 mr-3 animate-bounce" />
            ) : (
              <FileText className="w-6 h-6 mr-3 group-hover:rotate-12 transition-transform" />
            )}
            <span>{uploading ? 'MI folyamat...' : 'Fájl kiválasztása'}</span>
            <input 
              type="file" 
              className="hidden" 
              onChange={handleUpload} 
              disabled={uploading}
              accept="image/*,.pdf"
            />
          </label>

          {/* Státusz üzenetek */}
          {status === 'idle' && (
            <p className="mt-6 text-xs font-bold text-gray-400 uppercase tracking-widest">
              Támogatott formátumok: PDF, JPG, PNG
            </p>
          )}
        </div>
      </div>
    </div>
  );
}