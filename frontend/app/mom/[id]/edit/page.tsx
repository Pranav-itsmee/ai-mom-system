'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '@/store';
import { fetchMOMById, updateMOM } from '@/store/slices/momSlice';
import MOMEditor from '@/components/MOMEditor';

export default function MOMEditPage({ params }: { params: { id: string } }) {
  const router   = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { currentMOM, status, error } = useSelector((s: RootState) => s.mom);

  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState('');

  // Fetch by MOM id if not already in Redux, or if it's a different MOM
  useEffect(() => {
    if (!currentMOM || String(currentMOM.id) !== params.id) {
      dispatch(fetchMOMById(params.id));
    }
  }, [dispatch, params.id, currentMOM?.id]);

  async function handleSave(summary: string, keyPoints: string[]) {
    if (!currentMOM) return;
    setSaveError('');
    setSaving(true);
    try {
      await dispatch(updateMOM({ id: currentMOM.id, summary, key_points: keyPoints })).unwrap();
      router.push(`/meetings/${currentMOM.meeting_id}`);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (status === 'loading') return <div style={{ padding: 40, color: '#5e6c84' }}>Loading…</div>;
  if (error)               return <div style={{ padding: 40, color: '#e53e3e' }}>Error: {error}</div>;
  if (!currentMOM)         return <div style={{ padding: 40, color: '#5e6c84' }}>MOM not found.</div>;

  return (
    <main style={{ maxWidth: 800, margin: '40px auto', padding: '0 24px' }}>
      {/* Breadcrumb */}
      <p style={{ fontSize: 13, color: '#5e6c84' }}>
        <Link href="/" style={{ color: '#3b82f6' }}>Dashboard</Link>
        {' / '}
        <Link href="/meetings" style={{ color: '#3b82f6' }}>Meetings</Link>
        {' / '}
        <Link href={`/meetings/${currentMOM.meeting_id}`} style={{ color: '#3b82f6' }}>Meeting</Link>
        {' / Edit MOM'}
      </p>

      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#172b4d', marginTop: 10 }}>
        Edit Minutes of Meeting
      </h1>

      {currentMOM.is_edited && (
        <p style={{ fontSize: 12, color: '#5e6c84', marginTop: 4 }}>
          Previously edited
          {currentMOM.editor ? ` by ${currentMOM.editor.name}` : ''}
          {currentMOM.edited_at ? ` on ${new Date(currentMOM.edited_at).toLocaleString()}` : ''}
        </p>
      )}

      <div style={{ marginTop: 24 }}>
        <MOMEditor
          initialSummary={currentMOM.summary}
          initialKeyPoints={currentMOM.keyPoints ?? []}
          saving={saving}
          error={saveError}
          onSave={handleSave}
          onCancel={() => router.push(`/meetings/${currentMOM.meeting_id}`)}
        />
      </div>
    </main>
  );
}
