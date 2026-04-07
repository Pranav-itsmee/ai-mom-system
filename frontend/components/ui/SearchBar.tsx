'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react';
import { api } from '@/services/api';

export default function SearchBar() {
  const { t }  = useTranslation();
  const router = useRouter();
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await api.get('/mom/search', { params: { q } });
      setResults(res.data.moms || res.data || []);
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => doSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query, doSearch]);

  return (
    <div className="relative w-full max-w-[400px]">
      <div className="flex items-center gap-2.5 h-10 bg-[var(--bg)] border border-[var(--border)]
                      rounded-lg px-3.5 transition-all focus-within:border-primary"
           style={{ boxShadow: 'var(--shadow-xs)' }}>
        <Search size={15} className="text-[var(--gray-400)] shrink-0" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
          placeholder={t('search.placeholder')}
          className="flex-1 bg-transparent text-theme-sm text-[var(--text)]
                     placeholder:text-[var(--text-muted)] outline-none"
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults([]); }}
                  className="text-[var(--gray-400)] hover:text-[var(--gray-600)]">
            <X size={13} />
          </button>
        )}
      </div>

      {open && query.length >= 2 && (
        <div className="absolute top-full mt-1.5 left-0 w-full bg-[var(--surface)]
                        border border-[var(--border)] rounded-2xl z-50 overflow-hidden"
             style={{ boxShadow: 'var(--shadow-lg)' }}>
          {loading && (
            <p className="px-4 py-3 text-theme-sm text-[var(--text-muted)]">{t('common.loading')}</p>
          )}
          {!loading && results.length === 0 && (
            <p className="px-4 py-3 text-theme-sm text-[var(--text-muted)]">{t('common.no_data')}</p>
          )}
          {results.map((mom) => (
            <button
              key={mom.id}
              onClick={() => { router.push(`/mom/${mom.id}`); setOpen(false); setQuery(''); }}
              className="w-full text-left px-4 py-2.5 hover:bg-[var(--gray-50)]
                         dark:hover:bg-white/5 transition-colors border-b border-[var(--border)]
                         last:border-0"
            >
              <p className="text-theme-sm font-medium text-[var(--text)] truncate">
                {mom.meeting?.title || `MOM #${mom.id}`}
              </p>
              <p className="text-theme-xs text-[var(--text-muted)] truncate mt-0.5">{mom.summary}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
