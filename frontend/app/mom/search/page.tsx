'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import {
  Search, SortAsc, SortDesc, FileText,
  X, Calendar, Archive,
} from 'lucide-react';
import { api } from '@/services/api';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import MeetingStatusBadge from '@/components/meetings/MeetingStatusBadge';
import { TableRowSkeleton } from '@/components/ui/Skeleton';

type SortField = 'date' | 'title';
type SortDir   = 'asc' | 'desc';

interface MOMResult {
  id: number;
  meeting_id: number;
  summary: string | null;
  is_edited: boolean;
  is_archived?: boolean;
  archived_at?: string | null;
  updated_at: string;
  meeting?: {
    id: number;
    title: string;
    scheduled_at: string;
    status: string;
    organizer?: { name: string };
  };
}

function formatDate(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric', month: 'short', day: 'numeric',
  }).format(new Date(iso));
}

export default function MOMSearchPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ja' ? 'ja-JP' : 'en-US';

  const [query,        setQuery]        = useState('');
  const [results,      setResults]      = useState<MOMResult[]>([]);
  const [allMOMs,      setAllMOMs]      = useState<MOMResult[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [loadingAll,   setLoadingAll]   = useState(true);
  const [sortField,    setSortField]    = useState<SortField>('date');
  const [sortDir,      setSortDir]      = useState<SortDir>('desc');
  const [statusFilter, setStatusFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  // ── Load MOMs (active or archived) ───────────────────────────────────────
  useEffect(() => {
    async function loadAll() {
      setLoadingAll(true);
      setQuery('');          // clear search when switching tabs
      setResults([]);
      try {
        const res = await api.get('/mom/list', { params: showArchived ? { archived: 'true' } : {} });
        const list: any[] = Array.isArray(res.data?.moms) ? res.data.moms : [];
        setAllMOMs(list.map((m) => ({
          id:          m.id,
          meeting_id:  m.meeting_id,
          summary:     m.summary ?? null,
          is_edited:   m.is_edited ?? false,
          is_archived: m.is_archived ?? false,
          archived_at: m.archived_at ?? null,
          updated_at:  m.updated_at ?? m.created_at,
          meeting: m.meeting ? {
            id:           m.meeting.id,
            title:        m.meeting.title,
            scheduled_at: m.meeting.scheduled_at,
            status:       m.meeting.status,
            organizer:    m.meeting.organizer,
          } : undefined,
        })));
      } catch {
        setAllMOMs([]);
      } finally {
        setLoadingAll(false);
      }
    }
    loadAll();
  }, [showArchived]);

  // ── Search debounce ────────────────────────────────────────────────────────
  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await api.get('/mom/search', { params: { q } });
      const raw = res.data;
      const list: MOMResult[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.moms)    ? raw.moms
        : Array.isArray(raw?.results) ? raw.results
        : [];
      // Filter by current archive tab
      setResults(list.filter((m) => (m.is_archived ?? false) === showArchived));
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    const id = setTimeout(() => doSearch(query), 300);
    return () => clearTimeout(id);
  }, [query, doSearch]);

  // ── Derived data ───────────────────────────────────────────────────────────
  const isSearching = query.length >= 2;
  const baseList    = isSearching ? results : allMOMs;

  const displayList = useMemo(() => {
    let list = [...baseList];

    if (statusFilter && !isSearching) {
      list = list.filter((m) => m.meeting?.status === statusFilter);
    }

    list.sort((a, b) => {
      if (sortField === 'title') {
        const ta = (a.meeting?.title ?? '').toLowerCase();
        const tb = (b.meeting?.title ?? '').toLowerCase();
        return sortDir === 'asc' ? ta.localeCompare(tb) : tb.localeCompare(ta);
      }
      const da = new Date(a.meeting?.scheduled_at ?? a.updated_at).getTime();
      const db = new Date(b.meeting?.scheduled_at ?? b.updated_at).getTime();
      return sortDir === 'asc' ? da - db : db - da;
    });

    return list;
  }, [baseList, sortField, sortDir, statusFilter, isSearching]);

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  }

  const SortIcon = sortDir === 'asc' ? SortAsc : SortDesc;

  return (
    <ProtectedLayout>
      <div className="max-w-4xl mx-auto space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-[20px] font-bold text-[var(--text)]">{t('nav.moms')}</h1>
            <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
              {isSearching
                ? `${displayList.length} result${displayList.length !== 1 ? 's' : ''} for "${query}"`
                : `${displayList.length} ${showArchived ? 'archived' : ''} meeting record${displayList.length !== 1 ? 's' : ''}`
              }
            </p>
          </div>
        </div>

        {/* ── Archive / Active tabs ── */}
        <div className="flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 w-fit">
          <button
            onClick={() => setShowArchived(false)}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-[12px] font-semibold rounded-lg transition-all ${
              !showArchived
                ? 'bg-[var(--primary)] text-[var(--text)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)]'
            }`}
          >
            <FileText size={13} /> Active
          </button>
          <button
            onClick={() => setShowArchived(true)}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-[12px] font-semibold rounded-lg transition-all ${
              showArchived
                ? 'bg-amber-500 text-white shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)]'
            }`}
          >
            <Archive size={13} /> Archived
          </button>
        </div>

        {/* ── Search + Filters bar ── */}
        <div className="card p-3 flex flex-wrap items-center gap-2">

          <div className="flex items-center gap-2.5 flex-1 min-w-[180px] h-9
                          bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3
                          focus-within:border-[var(--primary-deep)] focus-within:shadow-[var(--shadow-focus)]
                          transition-all">
            <Search size={14} className="text-[var(--text-muted)] shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search.placeholder')}
              className="flex-1 bg-transparent text-[14px] text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none"
              autoFocus
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
                <X size={13} />
              </button>
            )}
          </div>

          {!isSearching && !showArchived && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input h-9 w-auto text-[13px] min-w-[130px]"
            >
              <option value="">All Statuses</option>
              <option value="completed">{t('status.completed')}</option>
              <option value="processing">{t('status.processing')}</option>
            </select>
          )}

          <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1">
            <button
              onClick={() => toggleSort('date')}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-semibold rounded-md transition-all ${
                sortField === 'date'
                  ? 'bg-[var(--primary)] text-[var(--text)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)]'
              }`}
            >
              <Calendar size={12} /> Date {sortField === 'date' && <SortIcon size={11} />}
            </button>
            <button
              onClick={() => toggleSort('title')}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-semibold rounded-md transition-all ${
                sortField === 'title'
                  ? 'bg-[var(--primary)] text-[var(--text)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)]'
              }`}
            >
              <FileText size={12} /> Title {sortField === 'title' && <SortIcon size={11} />}
            </button>
          </div>

          {(statusFilter || query) && (
            <button onClick={() => { setQuery(''); setStatusFilter(''); }} className="btn-ghost text-[12px] h-9">
              <X size={13} /> Clear
            </button>
          )}
        </div>

        {query.length > 0 && query.length < 2 && (
          <p className="text-[12px] text-[var(--text-muted)] px-1">{t('search.min_chars')}</p>
        )}

        {/* ── Results ── */}
        <div className="card p-0 overflow-hidden">

          <div className="px-5 py-3 border-b border-[var(--border)] flex items-center gap-2">
            {showArchived
              ? <Archive size={14} className="text-amber-500" />
              : <FileText size={14} className="text-[var(--primary-deep)]" />}
            <span className="text-[13px] font-semibold text-[var(--text)]">
              {isSearching ? 'Search Results' : showArchived ? 'Archived Records' : 'All Meeting Records'}
            </span>
          </div>

          {(loadingAll || loading) && (
            <table className="table-base">
              <tbody>{Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} cols={4} />)}</tbody>
            </table>
          )}

          {!loadingAll && !loading && displayList.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${showArchived ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-[var(--surface-3)]'}`}>
                {showArchived
                  ? <Archive size={22} className="text-amber-400" />
                  : <FileText size={22} className="text-[var(--text-muted)]" />}
              </div>
              <p className="text-[14px] font-semibold text-[var(--text)]">
                {isSearching ? 'No results found' : showArchived ? 'No archived MOMs' : 'No meeting records yet'}
              </p>
              <p className="text-[13px] text-[var(--text-muted)]">
                {isSearching
                  ? 'Try a different search term'
                  : showArchived
                  ? 'Archive a MOM from its detail page to see it here'
                  : 'Completed meetings will appear here'}
              </p>
            </div>
          )}

          {!loadingAll && !loading && displayList.length > 0 && (
            <table className="table-base">
              <thead>
                <tr>
                  <th>
                    <button onClick={() => toggleSort('title')} className="flex items-center gap-1 hover:text-[var(--text)] transition-colors">
                      Meeting Title {sortField === 'title' && <SortIcon size={10} />}
                    </button>
                  </th>
                  <th>
                    <button onClick={() => toggleSort('date')} className="flex items-center gap-1 hover:text-[var(--text)] transition-colors">
                      Date {sortField === 'date' && <SortIcon size={10} />}
                    </button>
                  </th>
                  <th className="hidden sm:table-cell">Organizer</th>
                  <th>Status</th>
                  {showArchived && <th className="hidden sm:table-cell">Archived On</th>}
                  <th className="hidden md:table-cell">Summary</th>
                </tr>
              </thead>
              <tbody>
                {displayList.map((mom) => (
                  <tr key={mom.id} className={showArchived ? 'opacity-75 hover:opacity-100 transition-opacity' : ''}>
                    <td>
                      <Link href={`/mom/${mom.id}`}
                        className="font-semibold text-[var(--text)] hover:text-[var(--primary-deep)] transition-colors line-clamp-1">
                        {mom.meeting?.title || `MOM #${mom.id}`}
                      </Link>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {mom.is_edited && <span className="text-[10px] text-[var(--text-light)] italic">edited</span>}
                        {mom.is_archived && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 font-semibold">
                            <Archive size={9} /> archived
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="text-[var(--text-muted)] whitespace-nowrap text-[13px]">
                      {mom.meeting?.scheduled_at ? formatDate(mom.meeting.scheduled_at, locale) : '—'}
                    </td>
                    <td className="hidden sm:table-cell text-[var(--text-muted)] text-[13px]">
                      {mom.meeting?.organizer?.name ?? '—'}
                    </td>
                    <td>
                      {mom.meeting?.status && <MeetingStatusBadge status={mom.meeting.status as any} />}
                    </td>
                    {showArchived && (
                      <td className="hidden sm:table-cell text-[var(--text-muted)] text-[13px] whitespace-nowrap">
                        {mom.archived_at ? formatDate(mom.archived_at, locale) : '—'}
                      </td>
                    )}
                    <td className="hidden md:table-cell text-[var(--text-muted)] text-[13px] max-w-[260px]">
                      <p className="line-clamp-1">{mom.summary ?? '—'}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </ProtectedLayout>
  );
}
