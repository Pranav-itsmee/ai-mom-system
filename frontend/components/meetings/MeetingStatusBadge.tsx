'use client';

import { useTranslation } from 'react-i18next';

type Status = 'scheduled' | 'recording' | 'processing' | 'completed' | 'failed';

const BADGE_CLASS: Record<Status, string> = {
  scheduled:  'badge-info',
  recording:  'badge-danger recording-pulse',
  processing: 'badge-warning',
  completed:  'badge-success',
  failed:     'badge-danger',
};

export default function MeetingStatusBadge({ status }: { status: Status }) {
  const { t } = useTranslation();
  return (
    <span className={`badge ${BADGE_CLASS[status] ?? 'badge-neutral'}`}>
      {status === 'recording' && (
        <span className="w-1.5 h-1.5 rounded-full bg-current inline-block shrink-0" aria-hidden="true" />
      )}
      {t(`status.${status}`)}
    </span>
  );
}
