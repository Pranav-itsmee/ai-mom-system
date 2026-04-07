'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, X } from 'lucide-react';

type ToastType = 'success' | 'error';

interface ToastProps {
  message: string;
  type?:   ToastType;
  onClose: () => void;
}

export function Toast({ message, type = 'success', onClose }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white transition-all ${
        type === 'success' ? 'bg-primary' : 'bg-accent'
      }`}
    >
      {type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
      <span>{message}</span>
      <button onClick={onClose} className="ml-1">
        <X size={14} />
      </button>
    </div>
  );
}

// Simple hook for toast state
export function useToast() {
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  function show(message: string, type: ToastType = 'success') {
    setToast({ message, type });
  }
  function hide() { setToast(null); }

  return { toast, show, hide };
}
