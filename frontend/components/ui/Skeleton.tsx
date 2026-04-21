import { ReactNode } from 'react';

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: string;
}

/** Single skeleton line / block */
export function Skeleton({ className = '', width, height, rounded = '8px' }: SkeletonProps) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ width, height: height ?? '16px', borderRadius: rounded }}
      aria-hidden="true"
    />
  );
}

/** Card-shaped skeleton with repeated rows */
export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card space-y-3" aria-hidden="true">
      <Skeleton height={20} width="55%" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={14} width={`${75 - i * 10}%`} />
      ))}
    </div>
  );
}

/** Table row skeleton */
export function TableRowSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <tr aria-hidden="true">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="py-3.5 px-4">
          <Skeleton height={14} width={i === 0 ? '70%' : i === cols - 1 ? '50%' : '60%'} />
        </td>
      ))}
    </tr>
  );
}

/** Wraps children with a loading state */
export function SkeletonGroup({ loading, children, fallback }: {
  loading: boolean;
  children: ReactNode;
  fallback: ReactNode;
}) {
  return <>{loading ? fallback : children}</>;
}
