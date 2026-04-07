import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AI MOM System',
  description: 'Automated Minutes of Meeting powered by Claude AI',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={outfit.variable}>
      <body className={outfit.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
