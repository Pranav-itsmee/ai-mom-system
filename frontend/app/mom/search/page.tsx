'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { api } from '@/services/api';
import ProtectedLayout from '@/components/layout/ProtectedLayout';

export default function MOMSearchPage() {
  const { t } = useTranslation();
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState<any[]>([]);
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
    const t = setTimeout(() => doSearch(query), 300);
    return () => clearTimeout(t);
  }, [query, doSearch]);

  return (
    <ProtectedLayout>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-bold text-[var(--text)] mb-6">{t('nav.moms')}</h1>

        <div className="flex items-center gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-2 mb-6">
          <Search size={16} className="text-[var(--text-muted)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search.placeholder')}
            className="flex-1 bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none"
            autoFocus
          />
        </div>

        {query.length > 0 && query.length < 2 && (
          <p className="text-xs text-[var(--text-muted)]">{t('search.min_chars')}</p>
        )}

        {loading && (
          <p className="text-sm text-[var(--text-muted)]">{t('common.loading')}</p>
        )}

        <div className="flex flex-col gap-3">
          {results.map((mom) => (
            <Link key={mom.id} href={`/mom/${mom.id}`}>
              <div className="card hover:shadow-md transition-shadow cursor-pointer">
                <p className="font-semibold text-sm text-[var(--text)]">
                  {mom.meeting?.title || `MOM #${mom.id}`}
                </p>
                {mom.meeting?.scheduled_at && (
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {new Date(mom.meeting.scheduled_at).toLocaleDateString()}
                  </p>
                )}
                <p className="text-sm text-[var(--text-muted)] mt-2 line-clamp-2">{mom.summary}</p>
              </div>
            </Link>
          ))}
          {!loading && query.length >= 2 && results.length === 0 && (
            <p className="text-sm text-[var(--text-muted)]">{t('common.no_data')}</p>
          )}
        </div>
      </div>
    </ProtectedLayout>
  );
}
