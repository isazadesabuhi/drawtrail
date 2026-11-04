import Link from 'next/link';

export function SiteHeader({ workspace = false }: { workspace?: boolean }) {
  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="DrawTrail home">
        <span className="brand-symbol" aria-hidden="true">
          ↝
        </span>
        drawtrail<span className="brand-dot">.</span>
      </Link>
      <nav aria-label="Main navigation">
        <Link
          className="nav-active"
          href="/workspace"
          aria-current={workspace ? 'page' : undefined}
        >
          Workspace
        </Link>
        <Link href="/#how-it-works">
          How it works <span aria-hidden="true">↗</span>
        </Link>
      </nav>
      <span className="local-badge">
        <span />
        Local-first, open roads
      </span>
    </header>
  );
}
