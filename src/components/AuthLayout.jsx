import React from "react";
import Wordmark from "@/components/brand/Wordmark";

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-dm-bg px-4 font-body">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <a href="https://deltamint.app" className="flex items-center justify-center mb-6">
            <Wordmark size={28} textClass="text-lg" />
          </a>
          <div className="flex items-center justify-center mb-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-dm-accent">
              <Icon className="w-7 h-7 text-white" aria-hidden="true" />
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-dm-text">{title}</h1>
          {subtitle && <p className="text-dm-sub mt-2">{subtitle}</p>}
        </div>
        <div className="bg-dm-panel rounded-2xl shadow-sm border border-dm-line p-8">
          {children}
        </div>
        {footer && (
          <p className="text-center text-sm text-dm-sub mt-6">{footer}</p>
        )}
      </div>
    </div>
  );
}
