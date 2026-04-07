'use client';

import { useTranslation } from 'react-i18next';

type Status = 'scheduled' | 'recording' | 'processing' | 'completed' | 'failed';

const BADGE: Record<Status, string> = {
  scheduled:  'bg-blue-50    text-blue-600  dark:bg-blue-500/15  dark:text-blue-400',
  recording:  'bg-red-50     text-red-600   dark:bg-red-500/15   dark:text-red-400   recording-pulse',
  processing: 'bg-orange-50  text-orange-600 dark:bg-orange-500/15 dark:text-orange-400',
  completed:  'bg-green-50   text-green-600  dark:bg-green-500/15  dark:text-green-400',
  failed:     'bg-red-50     text-red-500    dark:bg-red-500/10    dark:text-red-400',
};

export default function MeetingStatusBadge({ status }: { status: Status }) {
  const { t } = useTranslation();
  return (
    <span className={`badge ${BADGE[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status === 'recording' && (
        <span className="w-1.5 h-1.5 rounded-full bg-current inline-block" />
      )}
      {t(`status.${status}`)}
    </span>
  );
}
