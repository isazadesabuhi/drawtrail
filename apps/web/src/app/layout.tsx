import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DrawTrail — Make your miles a little more you',
  description:
    'Turn a little imagination into your next adventure. A local-first GPS art workspace for walking, running, and cycling.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
