import Link from 'next/link';
import { MOM, KeyPoint } from '@/store/slices/momSlice';
import { Task } from '@/store/slices/taskSlice';

const PRIORITY_COLOR: Record<string, string> = {
  high:   '#ef4444',
  medium: '#f59e0b',
  low:    '#10b981',
};

const STATUS_COLOR: Record<string, string> = {
  pending:     '#5e6c84',
  in_progress: '#3b82f6',
  completed:   '#10b981',
};

interface Props {
  mom: MOM;
  /** If provided, renders an "Edit MOM" button linking to this href. */
  editHref?: string;
  /** Called when user clicks "Regenerate MOM" */
  onRegenerate?: () => void;
  regenerating?: boolean;
}

export default function MOMViewer({ mom, editHref, onRegenerate, regenerating }: Props) {
  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#172b4d' }}>Minutes of Meeting</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {onRegenerate && (
            <button onClick={onRegenerate} disabled={regenerating} style={btnSecondary}>
              {regenerating ? 'Regenerating…' : 'Regenerate'}
            </button>
          )}
          {editHref && (
            <Link href={editHref}>
              <button style={btnPrimary}>Edit MOM</button>
            </Link>
          )}
        </div>
      </div>

      {/* Edited badge */}
      {mom.is_edited && (
        <p style={{ fontSize: 12, color: '#5e6c84', marginTop: 4 }}>
          Edited
          {mom.editor ? ` by ${mom.editor.name}` : ''}
          {mom.edited_at ? ` · ${new Date(mom.edited_at).toLocaleString()}` : ''}
        </p>
      )}

      {/* Summary */}
      <div style={card}>
        <p style={sectionLabel}>Summary</p>
        <p style={{ marginTop: 8, lineHeight: 1.75, color: '#253858' }}>{mom.summary}</p>
      </div>

      {/* Key Points */}
      {mom.keyPoints && mom.keyPoints.length > 0 && (
        <div style={card}>
          <p style={sectionLabel}>Key Points ({mom.keyPoints.length})</p>
          <ul style={{ marginTop: 8, paddingLeft: 20 }}>
            {mom.keyPoints.map((kp: KeyPoint) => (
              <li key={kp.id} style={{ marginTop: 6, lineHeight: 1.65, color: '#253858', fontSize: 14 }}>
                {kp.point_text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tasks */}
      {mom.tasks && mom.tasks.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <p style={sectionLabel}>Action Items ({mom.tasks.length})</p>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(mom.tasks as Task[]).map((task) => (
              <div key={task.id} style={{ ...card, marginTop: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <p style={{ fontWeight: 600, fontSize: 14, color: '#172b4d' }}>{task.title}</p>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <span style={badge(PRIORITY_COLOR[task.priority] ?? '#ccc')}>{task.priority}</span>
                    <span style={badge(STATUS_COLOR[task.status] ?? '#ccc')}>{task.status.replace('_', ' ')}</span>
                  </div>
                </div>
                {task.description && (
                  <p style={{ marginTop: 4, fontSize: 13, color: '#5e6c84' }}>{task.description}</p>
                )}
                <div style={{ display: 'flex', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
                  {task.assigned_to && (
                    <span style={{ fontSize: 12, color: '#5e6c84' }}>Assigned: {task.assigned_to}</span>
                  )}
                  {task.deadline && (
                    <span style={{ fontSize: 12, color: '#5e6c84' }}>Due: {task.deadline}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  marginTop: 14,
  padding: '16px 18px',
  background: '#fff',
  borderRadius: 8,
  border: '1px solid #dfe1e6',
};

const sectionLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#5e6c84',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const btnPrimary: React.CSSProperties = {
  padding: '7px 16px',
  background: '#3b82f6',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  padding: '7px 14px',
  background: '#fff',
  color: '#344563',
  border: '1px solid #dfe1e6',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

function badge(color: string): React.CSSProperties {
  return {
    padding: '2px 8px',
    borderRadius: 10,
    fontSize: 11,
    fontWeight: 700,
    background: color + '1a',
    color,
  };
}
