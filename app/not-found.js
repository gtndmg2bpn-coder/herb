import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="wrap">
      <h1 className="detail-title">Recipe not found</h1>
      <p className="detail-sub">That recipe doesn&rsquo;t exist in the database.</p>
      <Link href="/" className="back">
        &larr; All recipes
      </Link>
    </main>
  );
}
