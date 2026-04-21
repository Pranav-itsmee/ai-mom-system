import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  weight: ['300', '400', '500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'AI MOM System',
  description: 'Automated Minutes of Meeting powered by Claude AI',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
