import Link from 'next/link';
import { Meeting } from '@/store/slices/meetingSlice';

const STATUS_COLOR: Record<string, string> = {
  scheduled:  '#3b82f6',
  recording:  '#f59e0b',
  processing: '#8b5cf6',
  completed:  '#10b981',
  failed:     '#ef4444',
};

interface Props {
  meeting: Meeting;
}

export default function MeetingCard({ meeting }: Props) {
  const color = STATUS_COLOR[meeting.status] ?? '#5e6c84';

  return (
    <Link href={`/meetings/${meeting.id}`}>
      <div
        style={{
          padding: '14px 18px',
          background: '#fff',
          borderRadius: 8,
          border: '1px solid #dfe1e6',
          borderLeft: `4px solid ${color}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          cursor: 'pointer',
          transition: 'box-shadow 0.15s',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p style={{ fontWeight: 600, fontSize: 14, color: '#172b4d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {meeting.title}
          </p>
          <p style={{ fontSize: 12, color: '#5e6c84', marginTop: 3 }}>
            {new Date(meeting.scheduled_at).toLocaleString()}
            {meeting.duration_seconds != null && ` · ${Math.round(meeting.duration_seconds / 60)} min`}
            {meeting.organizer && ` · ${meeting.organizer.name}`}
          </p>
        </div>

        <span
          style={{
            padding: '3px 10px',
            borderRadius: 10,
            fontSize: 11,
            fontWeight: 700,
            background: color + '18',
            color,
            whiteSpace: 'nowrap',
            flexShrink: 0,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {meeting.status}
        </span>
      </div>
    </Link>
  );
}
