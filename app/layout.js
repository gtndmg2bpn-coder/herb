// app/layout.js
// Editorial design system foundation: Hanken Grotesk (UI) + Newsreader (serif
// accent), design tokens via globals.css, and the Editorial nav on every page.

import './globals.css';
import { Hanken_Grotesk, Newsreader } from 'next/font/google';
import AuthNav from './AuthNav';

const hanken = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-hanken',
  display: 'swap',
});

const newsreader = Newsreader({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  weight: ['400', '500'],
  variable: '--font-newsreader',
  display: 'swap',
});

export const metadata = {
  title: 'HERB — cook smarter, eat well',
  description: 'Herb plans your week, tracks the macros and the cost, and rebalances when life gets in the way. Food, health and culture — not a diet.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${hanken.variable} ${newsreader.variable}`}>
        <AuthNav />
        {children}
      </body>
    </html>
  );
}
