// app/dashboard/_dash/DashFooter.js — split from app/dashboard/page.js (spec v2 pantry refresh)
'use client';

import Link from 'next/link';

export function DashFooter({ p }) {
  const {  } = p;

  return (
      <div style={{ display: 'flex', gap: 20, alignItems: 'center', fontSize: 14, fontWeight: 600 }}>
        <Link href="/recipes" style={{ textDecoration: 'underline' }}>Browse recipes</Link>
        <Link href="/shopping" style={{ textDecoration: 'underline' }}>Shopping list</Link>
      </div>
  );
}