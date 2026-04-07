'use client';

import { useTranslation } from 'react-i18next';
import { GripVertical, X, Plus } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ── Sortable item ─────────────────────────────────────────────────────────────

interface SortableItemProps {
  id: string;
  index: number;
  value: string;
  onChange: (value: string) => void;
  onDelete: () => void;
}

function SortableItem({ id, index, value, onChange, onDelete }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 group"
    >
      {/* Drag handle */}
      <button
        type="button"
        className="shrink-0 p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg)] cursor-grab active:cursor-grabbing touch-none transition-colors"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>

      {/* Text input */}
      <input
        type="text"
        className="input flex-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Key point ${index + 1}`}
        aria-label={`Key point ${index + 1}`}
      />

      {/* Delete button */}
      <button
        type="button"
        onClick={onDelete}
        aria-label="Remove key point"
        className="shrink-0 p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all"
      >
        <X size={15} />
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  points: string[];
  onChange: (newPoints: string[]) => void;
}

export default function KeyPointsList({ points, onChange }: Props) {
  const { t } = useTranslation();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        // Require 5px movement before drag starts — prevents accidental drags on text inputs
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Stable ids for DnD: "point-0", "point-1", …
  const itemIds = points.map((_, i) => `point-${i}`);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = itemIds.indexOf(active.id as string);
    const newIndex = itemIds.indexOf(over.id as string);
    if (oldIndex !== -1 && newIndex !== -1) {
      onChange(arrayMove(points, oldIndex, newIndex));
    }
  }

  function updatePoint(index: number, value: string) {
    const next = [...points];
    next[index] = value;
    onChange(next);
  }

  function deletePoint(index: number) {
    onChange(points.filter((_, i) => i !== index));
  }

  function addPoint() {
    onChange([...points, '']);
  }

  return (
    <div className="space-y-2">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {points.map((point, index) => (
            <SortableItem
              key={`point-${index}`}
              id={`point-${index}`}
              index={index}
              value={point}
              onChange={(v) => updatePoint(index, v)}
              onDelete={() => deletePoint(index)}
            />
          ))}
        </SortableContext>
      </DndContext>

      {points.length === 0 && (
        <p className="text-sm text-[var(--text-muted)] py-2 text-center border border-dashed border-[var(--border)] rounded-lg">
          No key points yet. Click the button below to add one.
        </p>
      )}

      {/* Add new point */}
      <button
        type="button"
        onClick={addPoint}
        className="btn-secondary flex items-center gap-1.5 text-sm mt-1"
      >
        <Plus size={15} />
        {t('btn.add_point')}
      </button>
    </div>
  );
}
