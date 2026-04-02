'use client';

import { useState } from 'react';
import { KeyPoint } from '@/store/slices/momSlice';

interface Props {
  initialSummary: string;
  initialKeyPoints: KeyPoint[];
  saving: boolean;
  error: string;
  onSave: (summary: string, keyPoints: string[]) => void;
  onCancel: () => void;
}

export default function MOMEditor({
  initialSummary,
  initialKeyPoints,
  saving,
  error,
  onSave,
  onCancel,
}: Props) {
  const [summary, setSummary] = useState(initialSummary);
  const [keyPoints, setKeyPoints] = useState<string[]>(
    initialKeyPoints.map((kp) => kp.point_text)
  );

  function addPoint() {
    setKeyPoints((prev) => [...prev, '']);
  }

  function updatePoint(idx: number, value: string) {
    setKeyPoints((prev) => prev.map((p, i) => (i === idx ? value : p)));
  }

  function removePoint(idx: number) {
    setKeyPoints((prev) => prev.filter((_, i) => i !== idx));
  }

  function movePoint(idx: number, dir: -1 | 1) {
    const next = [...keyPoints];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setKeyPoints(next);
  }

  function handleSave() {
    const clean = keyPoints.filter((p) => p.trim().length > 0);
    onSave(summary, clean);
  }

  return (
    <div>
      {/* Summary */}
      <div>
        <label style={labelStyle}>Summary</label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={6}
          style={textareaStyle}
          placeholder="Executive summary of the meeting…"
        />
      </div>

      {/* Key Points */}
      <div style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <label style={labelStyle}>Key Points</label>
          <button onClick={addPoint} style={btnAdd}>+ Add Point</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {keyPoints.map((kp, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {/* Reorder */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                <button
                  onClick={() => movePoint(idx, -1)}
                  disabled={idx === 0}
                  style={arrowBtn}
                  title="Move up"
                >▲</button>
                <button
                  onClick={() => movePoint(idx, 1)}
                  disabled={idx === keyPoints.length - 1}
                  style={arrowBtn}
                  title="Move down"
                >▼</button>
              </div>

              {/* Text input */}
              <input
                type="text"
                value={kp}
                onChange={(e) => updatePoint(idx, e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
                placeholder={`Key point ${idx + 1}`}
              />

              {/* Remove */}
              <button
                onClick={() => removePoint(idx)}
                style={{ ...arrowBtn, color: '#e53e3e', fontSize: 15, padding: '3px 8px', flexShrink: 0 }}
                title="Remove"
              >×</button>
            </div>
          ))}

          {keyPoints.length === 0 && (
            <p style={{ fontSize: 13, color: '#5e6c84' }}>
              No key points yet. Click "+ Add Point" to add one.
            </p>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <p style={{ marginTop: 16, color: '#e53e3e', fontSize: 13 }}>{error}</p>
      )}

      {/* Actions */}
      <div style={{ marginTop: 28, display: 'flex', gap: 10 }}>
        <button onClick={handleSave} disabled={saving || !summary.trim()} style={btnPrimary}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        <button onClick={onCancel} style={btnSecondary}>Cancel</button>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  color: '#5e6c84',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 6,
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #dfe1e6',
  borderRadius: 6,
  fontSize: 14,
  resize: 'vertical',
  lineHeight: 1.65,
  outline: 'none',
  color: '#172b4d',
};

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid #dfe1e6',
  borderRadius: 6,
  fontSize: 14,
  outline: 'none',
  color: '#172b4d',
};

const btnPrimary: React.CSSProperties = {
  padding: '9px 20px',
  background: '#3b82f6',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  padding: '9px 16px',
  background: '#fff',
  color: '#344563',
  border: '1px solid #dfe1e6',
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};

const btnAdd: React.CSSProperties = {
  padding: '6px 12px',
  background: '#f4f5f7',
  color: '#344563',
  border: '1px solid #dfe1e6',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const arrowBtn: React.CSSProperties = {
  padding: '2px 6px',
  background: '#f4f5f7',
  border: '1px solid #dfe1e6',
  borderRadius: 4,
  fontSize: 10,
  color: '#344563',
  lineHeight: 1,
  cursor: 'pointer',
};
