import Link from 'next/link';

const cards = [
  {
    href: '/meetings',
    title: 'Meetings',
    desc: 'View all scheduled and completed meetings',
    color: '#3b82f6',
  },
  {
    href: '/tasks',
    title: 'Tasks',
    desc: 'Manage action items across all meetings',
    color: '#10b981',
  },
  {
    href: '/search',
    title: 'Search MOMs',
    desc: 'Full-text search across meeting summaries and transcripts',
    color: '#8b5cf6',
  },
];

export default function DashboardPage() {
  return (
    <main style={{ maxWidth: 960, margin: '48px auto', padding: '0 24px' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>AI MOM System</h1>
      <p style={{ marginTop: 6, color: '#5e6c84', fontSize: 15 }}>
        Automated Minutes of Meeting — powered by Claude AI
      </p>

      <div style={{ marginTop: 36, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {cards.map((c) => (
          <Link key={c.href} href={c.href} style={{ flex: '1 1 240px' }}>
            <div
              style={{
                padding: '24px',
                background: '#fff',
                borderRadius: 10,
                border: `1px solid #dfe1e6`,
                borderTop: `4px solid ${c.color}`,
                transition: 'box-shadow 0.15s',
              }}
            >
              <h2 style={{ fontSize: 18, fontWeight: 600 }}>{c.title}</h2>
              <p style={{ marginTop: 6, color: '#5e6c84', fontSize: 14 }}>{c.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
