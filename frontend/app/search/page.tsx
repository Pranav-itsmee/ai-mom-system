'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { api } from '@/services/api';

interface SearchResult {
  id: number;
  meeting_id: number;
  summary: string;
  is_edited: boolean;
  created_at: string;
  Meeting?: { id: number; title: string; scheduled_at: string; status: string };
  keyPoints?: { id: number; point_text: string }[];
}

export default function SearchPage() {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [searched, setSearched] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) { setResults([]); setSearched(false); return; }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const res = await api.get('/mom/search', { params: { q: query.trim() } });
        setResults(res.data.results ?? []);
        setSearched(true);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function highlight(text: string): string {
    if (!query.trim()) return text;
    const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark style="background:#fef08a;border-radius:2px;padding:0 1px">$1</mark>');
  }

  return (
    <main style={{ maxWidth: 880, margin: '40px auto', padding: '0 24px' }}>
      {/* Breadcrumb */}
      <p style={{ fontSize: 13, color: '#5e6c84' }}>
        <Link href="/" style={{ color: '#3b82f6' }}>Dashboard</Link>
        {' / Search MOMs'}
      </p>

      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#172b4d', marginTop: 8 }}>Search MOMs</h1>
      <p style={{ fontSize: 13, color: '#5e6c84', marginTop: 4 }}>
        Search across meeting summaries and transcripts.
      </p>

      {/* Search input */}
      <div style={{ marginTop: 20, position: 'relative' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search meetings, summaries, transcripts…"
          autoFocus
          style={{
            width: '100%',
            padding: '12px 16px',
            fontSize: 15,
            border: '2px solid #dfe1e6',
            borderRadius: 8,
            outline: 'none',
            color: '#172b4d',
            background: '#fff',
            transition: 'border-color 0.15s',
          }}
          onFocus={(e) => { e.target.style.borderColor = '#3b82f6'; }}
          onBlur={(e)  => { e.target.style.borderColor = '#dfe1e6'; }}
        />
        {loading && (
          <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#5e6c84' }}>
            Searching…
          </span>
        )}
      </div>

      {error && <p style={{ marginTop: 12, color: '#e53e3e', fontSize: 13 }}>{error}</p>}

      {/* Results */}
      {searched && (
        <p style={{ marginTop: 16, fontSize: 13, color: '#5e6c84' }}>
          {results.length === 0 ? 'No results found.' : `${results.length} result${results.length !== 1 ? 's' : ''}`}
        </p>
      )}

      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {results.map((r) => (
          <div key={r.id} style={card}>
            {/* Meeting link */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <Link href={`/meetings/${r.meeting_id}`} style={{ textDecoration: 'none' }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#3b82f6' }}>
                  {r.Meeting?.title ?? `Meeting #${r.meeting_id}`}
                </p>
              </Link>
              {r.Meeting && (
                <span style={{ fontSize: 12, color: '#5e6c84', whiteSpace: 'nowrap' }}>
                  {new Date(r.Meeting.scheduled_at).toLocaleDateString()}
                </span>
              )}
            </div>

            {/* Summary snippet */}
            <p
              style={{ marginTop: 6, fontSize: 13, color: '#253858', lineHeight: 1.6 }}
              dangerouslySetInnerHTML={{ __html: highlight(truncate(r.summary, 240)) }}
            />

            {/* Key points preview */}
            {r.keyPoints && r.keyPoints.length > 0 && (
              <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                {r.keyPoints.slice(0, 3).map((kp) => (
                  <li
                    key={kp.id}
                    style={{ fontSize: 12, color: '#5e6c84', marginTop: 3 }}
                    dangerouslySetInnerHTML={{ __html: highlight(truncate(kp.point_text, 120)) }}
                  />
                ))}
                {r.keyPoints.length > 3 && (
                  <li style={{ fontSize: 12, color: '#8b9fc1', marginTop: 3 }}>
                    +{r.keyPoints.length - 3} more…
                  </li>
                )}
              </ul>
            )}

            {/* Footer */}
            <div style={{ marginTop: 10, display: 'flex', gap: 12, alignItems: 'center' }}>
              <Link href={`/meetings/${r.meeting_id}`}>
                <span style={{ fontSize: 12, color: '#3b82f6', fontWeight: 600 }}>View Meeting →</span>
              </Link>
              <Link href={`/mom/${r.id}/edit`}>
                <span style={{ fontSize: 12, color: '#5e6c84' }}>Edit MOM</span>
              </Link>
              {r.is_edited && (
                <span style={{ fontSize: 11, color: '#8b5cf6', fontWeight: 600 }}>EDITED</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + '…';
}

const card: React.CSSProperties = {
  padding: '16px 18px',
  background: '#fff',
  borderRadius: 8,
  border: '1px solid #dfe1e6',
};
