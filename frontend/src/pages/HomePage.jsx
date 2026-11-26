import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { LogoLockup } from '../components/Icons';
import { ModeSwitch } from '../components/ModeSwitch';
import { IntroCurtain } from '../components/home/IntroCurtain';
import { StitchSpine } from '../components/home/StitchSpine';
import { HeroUntangle } from '../components/home/HeroUntangle';
import { DaySkySection } from '../components/home/DaySkySection';
import { QuestionDemoSection } from '../components/home/QuestionDemoSection';
import { ControlSection } from '../components/home/ControlSection';
import { FaqSection } from '../components/home/FaqSection';
import { TickerSection } from '../components/home/TickerSection';
import { LiveFinaleSection } from '../components/home/LiveFinaleSection';
import { useMagneticProps, usePageMeta } from '../hooks/usePageSetup';

export function HomePage() {
  usePageMeta({
    page: 'home',
    title: 'Weave: your next step, without opening multiple apps',
    description:
      'Ask Weave about your day. It checks your calendar, notes, to-dos, wishlist and more, gives you one clear answer, and asks before it changes anything.',
  });

  const demoRef = useRef(null);
  const liveRef = useRef(null);
  const navCtaMagnetic = useMagneticProps();

  const handlePickArea = (area) => {
    if (liveRef.current?.canAsk(area)) {
      liveRef.current.askArea(area);
    } else {
      demoRef.current?.show(area);
    }
  };

  return (
    <>
      <IntroCurtain />
      <StitchSpine />

      <a className="skip" href="#main">Skip to content</a>

      <header className="nav">
        <div className="container nav-inner">
          <a className="brand" href="#top" aria-label="Weave, back to top">
            <LogoLockup />
          </a>
          <nav className="nav-links" aria-label="Sections">
            <a href="#day">Your day</a>
            <a href="#ask">Try a question</a>
            <a href="#control">Your control</a>
            <a href="#faq">Questions</a>
          </nav>
          <Link className="btn btn-ghost nav-cta" to="/app" {...navCtaMagnetic}>
            Try Weave
          </Link>
        </div>
      </header>

      <main id="main">
        <HeroUntangle />
        <DaySkySection />
        <QuestionDemoSection ref={demoRef} />
        <ControlSection />
        <FaqSection />
        <TickerSection onPickArea={handlePickArea} />
        <LiveFinaleSection ref={liveRef} />
      </main>

      <footer className="footer night">
        <div className="container footer-grid">
          <a className="brand" href="#top" aria-label="Weave, back to top">
            <LogoLockup />
          </a>
          <div className="footer-notes">
            <p>A prototype for wHACKiest 2026, Track 1: Make MCP&nbsp;Matter.</p>
            <p>Examples use sample data. Weave connects to no real accounts&nbsp;yet.</p>
          </div>
          <nav className="footer-links" aria-label="Footer">
            <Link to="/app">Try Weave</Link>
            <a href="#faq">Questions</a>
            <Link to="/developers">Developer mode</Link>
          </nav>
        </div>
      </footer>

      <ModeSwitch isOn={false} />
    </>
  );
}

