'use client';

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="fallback">
      <h1>We couldn’t load your workspace.</h1>
      <p>Try again to get back on track.</p>
      <button className="primary-button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
