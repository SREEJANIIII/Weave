import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, LogoLockup } from '../components/Icons';
import { ModeSwitch } from '../components/ModeSwitch';
import { DrawdownHero } from '../components/developers/DrawdownHero';
import { TangleSection } from '../components/developers/TangleSection';
import { CitationLoomSection } from '../components/developers/CitationLoomSection';
import {
  ClosingWeaveSection,
  HowItWorksSection,
  LifeStrandsSection,
  McpFlowSection,
  TrustSection,
} from '../components/developers/DevelopersSections';
import { usePageMeta } from '../hooks/usePageSetup';

const NAV_SECTIONS = [
  ['#example', 'Example'],
  ['#how', 'How it works'],
  ['#mcp', 'MCP'],
  ['#trust', 'Trust'],
];

export function DevelopersPage() {
  usePageMeta({
    page: 'developers',
    title: 'Weave for developers: how it works with MCP',
    description:
      'How Weave works under the hood: an MCP client that reads the apps you authorize, cites every record, and holds writes for approval.',
  });

  const [menuOpen, setMenuOpen] = useState(false);
  const [currentSection, setCurrentSection] = useState('');
  const toggleRef = useRef(null);
  const mainRef = useRef(null);

  useEffect(() => {
    const narrow = matchMedia('(max-width: 60rem)');
    const onNarrow = () => setMenuOpen(false);
    const onKey = (e) => {
      if (e.key === 'Escape' && menuOpen) {
        setMenuOpen(false);
        toggleRef.current?.focus();
      }
    };
    narrow.addEventListener('change', onNarrow);
    document.addEventListener('keydown', onKey);
    return () => {
      narrow.removeEventListener('change', onNarrow);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    const main = mainRef.current;
    if (!main || !('IntersectionObserver' in window)) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setCurrentSection(`#${e.target.id}`);
          }
        }
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    main.querySelectorAll('section[id]').forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>

      <header className="nav">
        <div className="container nav-inner">
          <a className="brand" href="#top" aria-label="Weave, back to top">
            <LogoLockup />
          </a>
          <button
            ref={toggleRef}
            className="nav-toggle"
            type="button"
            aria-expanded={String(menuOpen)}
            aria-controls="nav-links"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <Icon name="i-menu" />
            <span>Menu</span>
          </button>
          <nav
            className="nav-links"
            id="nav-links"
            aria-label="Sections"
            data-open={menuOpen ? '' : undefined}
          >
            {NAV_SECTIONS.map(([hash, label]) => (
              <a
                key={hash}
                href={hash}
                aria-current={currentSection === hash ? 'true' : undefined}
                onClick={() => setMenuOpen(false)}
              >
                {label}
              </a>
            ))}
          </nav>
          <Link className="btn btn-ghost nav-cta" to="/app">Try the prototype</Link>
        </div>
      </header>

      <main ref={mainRef} id="main">
        <DrawdownHero />
        <TangleSection />
        <CitationLoomSection />
        <HowItWorksSection />
        <LifeStrandsSection />
        <McpFlowSection />
        <TrustSection />
        <ClosingWeaveSection />
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
            <a href="#example">Example</a>
            <a href="#how">How it works</a>
            <a href="#life">Vision</a>
            <a href="#mcp">MCP</a>
            <a href="#trust">Trust</a>
            <Link to="/">Everyday page</Link>
          </nav>
        </div>
      </footer>

      <ModeSwitch isOn={true} />
    </>
  );
}
