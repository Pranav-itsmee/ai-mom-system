'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Calendar, Clock, User, Users, Link2 } from 'lucide-react';
import { AppDispatch, RootState } from '@/store';
import { fetchMeeting } from '@/store/slices/meetingSlice';
import { api } from '@/services/api';
import MeetingStatusBadge from '@/components/meetings/MeetingStatusBadge';
import AdmitButton        from '@/components/meetings/AdmitButton';
import MOMViewer          from '@/components/mom/MOMViewer';
import ProjectLinker      from '@/components/ProjectLinker';
import ProtectedLayout    from '@/components/layout/ProtectedLayout';
import ExportButton       from '@/components/ui/ExportButton';

export default function MeetingDetailPage({ params }: { params: { id: string } }) {
  const { t, i18n } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const { currentMeeting, status, error } = useSelector((s: RootState) => s.meetings);
  const [showLinker,   setShowLinker]   = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenMsg,     setRegenMsg]     = useState('');
  const [waitingCount, setWaitingCount] = useState(0);

  const locale = i18n.language === 'ja' ? 'ja-JP' : 'en-US';

  useEffect(() => {
    dispatch(fetchMeeting(params.id));
  }, [dispatch, params.id]);

  // Poll while recording / processing
  useEffect(() => {
    if (!currentMeeting) return;
    if (!['recording', 'processing'].includes(currentMeeting.status)) return;
    const id = setInterval(() => dispatch(fetchMeeting(params.id)), 10_000);
    return () => clearInterval(id);
  }, [dispatch, params.id, currentMeeting?.status]);

  // Poll waiting count while recording
  useEffect(() => {
    if (currentMeeting?.status !== 'recording') return;
    const id = setInterval(async () => {
      try {
        const res = await api.get(`/meetings/${params.id}/waiting`);
        setWaitingCount(res.data.count ?? 0);
      } catch { /* ignore */ }
    }, 5_000);
    return () => clearInterval(id);
  }, [params.id, currentMeeting?.status]);

  async function handleRegenerate() {
    if (!currentMeeting?.mom) return;
    setRegenerating(true);
    setRegenMsg('');
    try {
      const res = await api.post(`/mom/${currentMeeting.mom.id}/regenerate`);
      setRegenMsg(res.data.message ?? 'Regeneration started');
    } catch (err: any) {
      setRegenMsg(err.response?.data?.error || 'Regeneration failed');
    } finally {
      setRegenerating(false);
    }
  }

  if (status === 'loading') return (
    <ProtectedLayout>
      <p className="text-[var(--text-muted)] text-sm">{t('common.loading')}</p>
    </ProtectedLayout>
  );
  if (error) return (
    <ProtectedLayout>
      <p className="text-accent text-sm">{t('common.error')}: {error}</p>
    </ProtectedLayout>
  );
  if (!currentMeeting) return (
    <ProtectedLayout>
      <p className="text-[var(--text-muted)] text-sm">{t('common.no_data')}</p>
    </ProtectedLayout>
  );

  const mom = currentMeeting.mom;

  return (
    <ProtectedLayout>
      <div className="max-w-4xl mx-auto">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-xs text-[var(--text-muted)] mb-4">
          <Link href="/meetings" className="hover:text-primary">{t('nav.meetings')}</Link>
          <span>/</span>
          <span className="text-[var(--text)] truncate">{currentMeeting.title}</span>
        </div>

        {/* Header card */}
        <div className="card mb-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-bold text-[var(--text)]">{currentMeeting.title}</h1>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <MeetingStatusBadge status={currentMeeting.status} />
                <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                  <Calendar size={12} />
                  {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
                    .format(new Date(currentMeeting.scheduled_at))}
                </span>
                {currentMeeting.duration_seconds != null && (
                  <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                    <Clock size={12} />
                    {Math.round(currentMeeting.duration_seconds / 60)} {t('common.min')}
                  </span>
                )}
                {currentMeeting.organizer && (
                  <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                    <User size={12} /> {currentMeeting.organizer.name}
                  </span>
                )}
              </div>
            </div>
            <button onClick={() => setShowLinker(true)} className="btn-secondary flex items-center gap-1.5 text-xs">
              <Link2 size={13} /> {t('btn.link_project')}
            </button>
          </div>

          {/* Attendees */}
          {currentMeeting.attendees && currentMeeting.attendees.length > 0 && (
            <div className="flex items-center gap-2 mt-3">
              <Users size={13} className="text-[var(--text-muted)]" />
              <div className="flex gap-1 flex-wrap">
                {currentMeeting.attendees.map((a: any, i: number) => (
                  <span key={i} className="text-xs bg-[var(--bg)] border border-[var(--border)] px-2 py-0.5 rounded-full">
                    {a.name ?? a.email}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Status banners */}
        {currentMeeting.status === 'recording' && (
          <div className="mb-4 flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800">
            <p className="text-sm text-red-600 dark:text-red-400 font-medium recording-pulse">
              {t('meeting.recording_banner')}
              {waitingCount > 0 && ` · ${waitingCount} ${t('meeting.waiting')}`}
            </p>
            <AdmitButton meetingId={currentMeeting.id} waitingCount={waitingCount} />
          </div>
        )}
        {currentMeeting.status === 'processing' && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
            <p className="text-sm text-amber-600 dark:text-amber-400 font-medium">
              ⏳ {t('meeting.processing_banner')}
            </p>
          </div>
        )}
        {currentMeeting.status === 'failed' && (
          <div className="mb-4 flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800">
            <p className="text-sm text-red-600 dark:text-red-400 font-medium">
              {t('status.failed')}: {t('common.error')}
            </p>
            {mom && (
              <button onClick={handleRegenerate} disabled={regenerating} className="btn-danger text-xs py-1.5">
                {regenerating ? t('common.loading') : t('btn.regenerate')}
              </button>
            )}
          </div>
        )}
        {regenMsg && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
            <p className="text-sm text-blue-600 dark:text-blue-400">{regenMsg}</p>
          </div>
        )}

        {/* MOM section */}
        {mom ? (
          <>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="font-semibold text-[var(--text)]">{t('nav.moms')}</h2>
              <div className="flex gap-2 flex-wrap">
                <Link href={`/mom/${mom.id}`} className="btn-secondary text-xs py-1.5">
                  {t('btn.view_mom')}
                </Link>
                <Link href={`/mom/${mom.id}/edit`} className="btn-primary text-xs py-1.5">
                  {t('btn.edit_mom')}
                </Link>
                <ExportButton mom={mom} meetingTitle={currentMeeting.title} />
              </div>
            </div>
            <MOMViewer mom={mom} compact />
          </>
        ) : (
          <div className="card text-sm text-[var(--text-muted)]">
            {['scheduled', 'recording', 'processing'].includes(currentMeeting.status)
              ? t('meeting.processing_banner')
              : t('mom.not_available')}
          </div>
        )}
      </div>

      {showLinker && (
        <ProjectLinker meetingId={currentMeeting.id} onClose={() => setShowLinker(false)} />
      )}
    </ProtectedLayout>
  );
}
