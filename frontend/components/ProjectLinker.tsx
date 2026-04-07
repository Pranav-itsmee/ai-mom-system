'use client';

import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { X, Link2, Trash2 } from 'lucide-react';
import { AppDispatch, RootState } from '@/store';
import {
  fetchBmsProjects,
  fetchProjectLinks,
  linkProject,
  removeProjectLink,
} from '@/store/slices/bmsSlice';

interface Props {
  meetingId: number;
  onClose: () => void;
}

export default function ProjectLinker({ meetingId, onClose }: Props) {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const { projects, links, projectsStatus } = useSelector((s: RootState) => s.bms);

  const [selectedProjectId, setSelectedProjectId] = useState<number | ''>('');
  const [linking, setLinking]                     = useState(false);
  const [error, setError]                         = useState('');

  useEffect(() => {
    dispatch(fetchBmsProjects());
    dispatch(fetchProjectLinks(meetingId));
  }, [dispatch, meetingId]);

  async function handleLink() {
    if (!selectedProjectId) {
      setError(t('bms.select_project', { defaultValue: 'Select a project first.' }));
      return;
    }
    setError('');
    setLinking(true);
    try {
      await dispatch(
        linkProject({ meeting_id: meetingId, project_id: Number(selectedProjectId) })
      ).unwrap();
      setSelectedProjectId('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('bms.link_failed', { defaultValue: 'Failed to link project.' }));
    } finally {
      setLinking(false);
    }
  }

  async function handleRemove(linkId: number) {
    await dispatch(removeProjectLink(linkId));
  }

  const projectMap = new Map(projects.map((p) => [p.id, p.name]));

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[var(--surface)] rounded-2xl p-6 w-full max-w-md shadow-2xl flex flex-col gap-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-[var(--text)] flex items-center gap-2">
            <Link2 className="w-4 h-4 text-[var(--primary)]" />
            {t('bms.modal_title', { defaultValue: 'Link to BMS Project' })}
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Add link */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            {t('bms.select_label', { defaultValue: 'Select Project' })}
          </label>
          <div className="flex gap-2">
            <select
              className="input flex-1"
              value={selectedProjectId}
              onChange={(e) =>
                setSelectedProjectId(e.target.value === '' ? '' : Number(e.target.value))
              }
              disabled={projectsStatus === 'loading'}
            >
              <option value="">
                {projectsStatus === 'loading'
                  ? t('common.loading', { defaultValue: 'Loading…' })
                  : projects.length === 0
                  ? t('bms.no_projects', { defaultValue: 'No projects available' })
                  : t('bms.choose', { defaultValue: 'Choose a project…' })}
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              className="btn-primary whitespace-nowrap"
              onClick={handleLink}
              disabled={linking || !selectedProjectId}
            >
              {linking ? '…' : t('bms.link_btn', { defaultValue: 'Link' })}
            </button>
          </div>

          {error && (
            <p className="text-sm text-[var(--accent)]">{error}</p>
          )}

          {projects.length === 0 && projectsStatus === 'succeeded' && (
            <p className="text-xs text-[var(--text-muted)]">
              {t('bms.no_projects_hint', {
                defaultValue: 'No BMS projects found. Ensure BMS_API_URL is configured in the backend .env.',
              })}
            </p>
          )}
        </div>

        {/* Existing links */}
        {links.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              {t('bms.linked_projects', { defaultValue: 'Linked Projects' })}
            </p>
            <div className="space-y-1.5">
              {links.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center justify-between bg-[var(--bg)] rounded-xl px-3 py-2.5 gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--text)] truncate">
                      {projectMap.get(link.project_id) ?? `Project #${link.project_id}`}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      {t('bms.linked_on', { defaultValue: 'Linked' })}{' '}
                      {new Date(link.linked_at).toLocaleDateString()}
                      {link.linkedByUser ? ` ${t('bms.linked_by', { defaultValue: 'by' })} ${link.linkedByUser.name}` : ''}
                    </p>
                  </div>
                  <button
                    className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors shrink-0 p-1 rounded"
                    onClick={() => handleRemove(link.id)}
                    title={t('bms.remove_link', { defaultValue: 'Remove link' })}
                    aria-label="Remove link"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end">
          <button className="btn-secondary" onClick={onClose}>
            {t('common.close', { defaultValue: 'Close' })}
          </button>
        </div>
      </div>
    </div>
  );
}
