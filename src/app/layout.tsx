// src/app/layout.tsx
import React from 'react';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="hu">
      {/* A body kapja meg az alap világos hátteret */}
      <body className="bg-[#f7f7f3] text-[#2b251d]">
        <div className="flex h-screen overflow-hidden">
          {/* Sötét oldalsáv */}
          <Sidebar />

          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Világos fejléc */}
            <Header />
            
            {/* TARTALOM TERÜLET: Itt kényszerítjük a világos hátteret */}
            <main className="flex-1 overflow-y-auto p-8 bg-[#f7f7f3]">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}