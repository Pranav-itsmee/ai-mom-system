'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserCheck } from 'lucide-react';
import { api } from '@/services/api';

interface Props {
  meetingId: number;
  waitingCount: number;
}

export default function AdmitButton({ meetingId, waitingCount }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  async function handleAdmit() {
    setLoading(true);
    try {
      await api.post(`/meetings/${meetingId}/admit`);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  if (waitingCount === 0) return null;

  return (
    <button
      onClick={handleAdmit}
      disabled={loading}
      className="flex items-center gap-1.5 btn-primary text-xs py-1.5"
    >
      <UserCheck size={14} />
      {t('btn.admit_all')} ({waitingCount})
    </button>
  );
}
