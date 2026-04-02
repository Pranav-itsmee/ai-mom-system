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
  task: Task;
  onEdit?: (task: Task) => void;
}

export default function TaskCard({ task, onEdit }: Props) {
  const priorityColor = PRIORITY_COLOR[task.priority] ?? '#ccc';
  const statusColor   = STATUS_COLOR[task.status]   ?? '#ccc';

  return (
    <div
      style={{
        padding: '14px 18px',
        background: '#fff',
        borderRadius: 8,
        border: '1px solid #dfe1e6',
        borderLeft: `3px solid ${priorityColor}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <p style={{ fontWeight: 600, fontSize: 14, color: '#172b4d', lineHeight: 1.4 }}>
          {task.title}
        </p>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
          <span style={badge(priorityColor)}>{task.priority}</span>
          <span style={badge(statusColor)}>{task.status.replace('_', ' ')}</span>
          {onEdit && (
            <button onClick={() => onEdit(task)} style={editBtn}>Edit</button>
          )}
        </div>
      </div>

      {task.description && (
        <p style={{ marginTop: 5, fontSize: 13, color: '#5e6c84', lineHeight: 1.5 }}>
          {task.description}
        </p>
      )}

      <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
        {task.assigned_to && (
          <span style={metaChip}>
            <span style={{ opacity: 0.7 }}>Assigned:</span> {task.assigned_to}
          </span>
        )}
        {task.deadline && (
          <span style={metaChip}>
            <span style={{ opacity: 0.7 }}>Due:</span> {task.deadline}
          </span>
        )}
        {task.is_edited && (
          <span style={{ ...metaChip, color: '#8b5cf6' }}>edited</span>
        )}
      </div>
    </div>
  );
}

function badge(color: string): React.CSSProperties {
  return {
    padding: '2px 8px',
    borderRadius: 10,
    fontSize: 11,
    fontWeight: 700,
    background: color + '1a',
    color,
    whiteSpace: 'nowrap',
  };
}

const editBtn: React.CSSProperties = {
  padding: '3px 10px',
  background: '#f4f5f7',
  border: '1px solid #dfe1e6',
  borderRadius: 5,
  fontSize: 12,
  fontWeight: 600,
  color: '#344563',
  cursor: 'pointer',
};

const metaChip: React.CSSProperties = {
  fontSize: 12,
  color: '#5e6c84',
};
