import Link from 'next/link';
import { ActivityPicker } from '../components/activity-picker';
import { TrailIllustration } from '../components/trail-illustration';
import { SiteHeader } from '../components/site-header';

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow">
              <span /> A LITTLE ART. A LITTLE ADVENTURE.
            </p>
            <h1 id="hero-title">
              The city is
              <br />
              your{' '}
              <span className="canvas-word">
                canvas.
                <svg viewBox="0 0 330 18" aria-hidden="true">
                  <path d="M3 12 Q150 -4 326 8 M22 16 Q170 3 299 13" />
                </svg>
              </span>
            </h1>
            <p className="hero-description">
              A heart through your neighborhood. A star across the city. Turn
              the things you draw into places you go.
            </p>
            <Link className="primary-button" href="/workspace">
              Meet your workspace <span aria-hidden="true">↗</span>
            </Link>
            <div className="hero-footnote">
              <span className="mini-spark" aria-hidden="true">
                ✳
              </span>{' '}
              Made for the joy of getting out there.
            </div>
          </div>
          <TrailIllustration />
        </section>

        <section
          id="workspace"
          className="workspace-section"
          aria-labelledby="workspace-title"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                YOUR NEXT CHAPTER, ON FOOT OR TWO WHEELS
              </p>
              <h2 id="workspace-title">
                Every good route starts with an idea.
              </h2>
            </div>
            <span className="version-tag">THE FIRST STEPS / 0.1</span>
          </div>
          <div className="workspace-grid">
            <ActivityPicker />
            <article className="build-card">
              <div className="card-topline">
                <span className="step-number">02</span>
                <span className="progress-badge">In the making</span>
              </div>
              <h3>A sketch. Then the streets.</h3>
              <p>
                Your map workspace is ready. Choose a start in Lyon, then come
                back for the drawing canvas in the next chapter.
              </p>
              <div className="milestone">
                <span className="milestone-check" aria-hidden="true">
                  ✓
                </span>
                <div>
                  <strong>Foundation</strong>
                  <span>Shared types, validation & a local web app</span>
                </div>
                <span className="milestone-status">Ready</span>
              </div>
              <div className="milestone">
                <span className="milestone-next" aria-hidden="true">
                  ↗
                </span>
                <div>
                  <strong>Drawing & map</strong>
                  <span>Your idea, placed in the real world</span>
                </div>
                <span className="milestone-status muted">Next</span>
              </div>
              <p className="route-note">
                <span aria-hidden="true">ⓘ</span> Route generation and exports
                will arrive after street routing is validated.
              </p>
            </article>
          </div>
        </section>

        <section
          id="how-it-works"
          className="how-section"
          aria-labelledby="how-title"
        >
          <div className="how-intro">
            <p className="eyebrow">THE IDEA IS SIMPLE</p>
            <h2 id="how-title">
              Less routine.
              <br /> More possibility.
            </h2>
            <p>The journey we’re building.</p>
          </div>
          <ol className="journey-list">
            <li>
              <span>01 /</span>
              <h3>Make your mark</h3>
              <p>
                Draw something simple or start with a shape that speaks to you.
              </p>
            </li>
            <li>
              <span>02 /</span>
              <h3>Find its place</h3>
              <p>
                Choose your neighborhood, your activity, and how far you want to
                go.
              </p>
            </li>
            <li>
              <span>03 /</span>
              <h3>Take it outside</h3>
              <p>
                Inspect a route along real streets, then make the adventure your
                own.
              </p>
            </li>
          </ol>
        </section>
      </main>
      <footer>
        <span className="footer-brand">drawtrail.</span>
        <p>A new perspective is just a few steps away.</p>
        <span>
          Built for curious feet <span aria-hidden="true">↗</span>
        </span>
      </footer>
    </>
  );
}
