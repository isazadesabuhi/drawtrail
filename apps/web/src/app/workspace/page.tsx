import type { Metadata } from 'next';
import { SiteHeader } from '../../components/site-header';
import { MapWorkspace } from '../../components/map-workspace';
import { getMapConfiguration } from '../../lib/map-config';

export const metadata: Metadata = { title: 'Your workspace — DrawTrail' };

export default function WorkspacePage() {
  const configuration = getMapConfiguration({
    NODE_ENV: process.env.NODE_ENV,
    ...(process.env.NEXT_PUBLIC_MAP_STYLE_URL && {
      NEXT_PUBLIC_MAP_STYLE_URL: process.env.NEXT_PUBLIC_MAP_STYLE_URL,
    }),
    ...(process.env.NEXT_PUBLIC_MAP_ATTRIBUTION && {
      NEXT_PUBLIC_MAP_ATTRIBUTION: process.env.NEXT_PUBLIC_MAP_ATTRIBUTION,
    }),
  });
  return (
    <>
      <a className="skip-link" href="#workspace-main">
        Skip to content
      </a>
      <SiteHeader workspace />
      <main id="workspace-main" className="editor-page">
        <MapWorkspace configuration={configuration} />
      </main>
    </>
  );
}
