import Link from 'next/link';

export default function NotFound() {
  return (
    <main id="main" className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="mb-2 text-xl font-semibold">Page not found</h1>
      <p className="mb-6 text-sm text-fg-muted">
        The page you were looking for does not exist or has moved.
      </p>
      <Link
        href="/"
        className="inline-flex min-h-11 items-center rounded-md border border-accent-strong bg-accent px-4 font-medium text-accent-fg"
      >
        Browse the catalog
      </Link>
    </main>
  );
}
