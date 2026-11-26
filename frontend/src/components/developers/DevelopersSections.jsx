import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, LogoSymbol } from '../Icons';
import { cubic, fmt } from '../../lib/svgGeom';

function useRevealOnce(ref) {
  const [inView, setInView] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView || !('IntersectionObserver' in window)) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, inView]);

  return inView;
}

export function HowItWorksSection() {
  const stepsRef = useRef(null);
  const inView = useRevealOnce(stepsRef);

  return (
    <section className="how" id="how" aria-labelledby="how-title">
      <div className="container">
        <h2 id="how-title" className="section-title">From question to approved&nbsp;change</h2>
        <div ref={stepsRef} className={`steps-wrap${inView ? ' is-in' : ''}`} data-steps="">
          <svg className="steps-thread" viewBox="0 0 1000 40" preserveAspectRatio="none" aria-hidden="true">
            <path pathLength="1" d="M0,20 C120,4 200,36 333,20 S540,4 666,20 S880,36 1000,20" />
          </svg>
          <ol className="steps">
            <li className="step">
              <h3 className="step-title">You ask</h3>
              <p>In your own&nbsp;words.</p>
              <div className="step-demo demo-ask">What should I follow up&nbsp;on?</div>
            </li>
            <li className="step">
              <h3 className="step-title">Weave finds context</h3>
              <p>Only the tools it&nbsp;needs.</p>
              <div className="step-demo demo-tools">
                <code>calendar.list_events</code>
                <code>notes.search_notes</code>
                <code>tasks.list_tasks</code>
              </div>
            </li>
            <li className="step">
              <h3 className="step-title">It answers with sources</h3>
              <p>Each point links to its&nbsp;record.</p>
              <div className="step-demo demo-answer">
                Confirm Friday&rsquo;s venue booking <span className="cite cite-static">2</span>
              </div>
            </li>
            <li className="step">
              <h3 className="step-title">You approve</h3>
              <p>Drafts wait until you say&nbsp;yes.</p>
              <div className="step-demo demo-approve">
                <span>Create task: budget</span>
                <span className="pill pill-yes">Approve</span>
              </div>
            </li>
          </ol>
        </div>
      </div>
    </section>
  );
}

export function LifeStrandsSection() {
  const strandsRef = useRef(null);
  const inView = useRevealOnce(strandsRef);

  const strands = [
    ['Work', 'What did I promise in yesterday\u2019s meetings?'],
    ['Planning', 'What moves if this call runs\u00a0late?'],
    ['Fitness', 'Where does a long run fit this\u00a0week?'],
    ['Money', 'What did eating out cost this\u00a0month?'],
    ['Home', 'Which bills are due before\u00a0Sunday?'],
    ['Travel', 'What\u2019s still unbooked for the\u00a0trip?'],
    ['Learning', 'When can I finish chapter\u00a0four?'],
  ];

  return (
    <section className="life night" id="life" aria-labelledby="life-title">
      <div className="container">
        <div className="life-head">
          <h2 id="life-title" className="section-title">Work is one strand. Life has&nbsp;more.</h2>
          <p className="section-lede">Ideas for later, not live&nbsp;integrations.</p>
        </div>
        <ul ref={strandsRef} className={`strands${inView ? ' is-in' : ''}`} data-strands="">
          {strands.map(([name, q]) => (
            <li key={name} className="strand">
              <span className="strand-name">{name}</span>
              <span className="ribbon" aria-hidden="true" />
              <span className="strand-q">{q}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function McpFlowSection() {
  const flowRef = useRef(null);
  const inView = useRevealOnce(flowRef);

  return (
    <section className="mcp" id="mcp" aria-labelledby="mcp-title">
      <div className="container mcp-grid">
        <div className="mcp-copy">
          <h2 id="mcp-title" className="section-title">MCP is the plug, not the&nbsp;key.</h2>
          <p>The Model Context Protocol is an open standard that lets an assistant find the tools a connected service offers, then use&nbsp;them.</p>
          <p>It grants no access on its own. You choose what to connect, and changes wait for your&nbsp;OK.</p>
        </div>

        <figure ref={flowRef} className={`flow-fig${inView ? ' is-in' : ''}`} aria-labelledby="flow-cap" data-flow="">
          <ol className="flow">
            <li className="flow-step">
              <div className="node node-you">
                <span className="node-name">You</span>
                <span className="node-sub">Ask a question</span>
              </div>
              <span className="link"><span className="link-label">question</span></span>
            </li>
            <li className="flow-step">
              <div className="node node-weave">
                <span className="node-name">
                  <LogoSymbol small />
                  Weave assistant
                </span>
                <span className="node-sub">Picks the tools it&nbsp;needs</span>
              </div>
              <span className="link"><span className="link-label">tool calls</span></span>
            </li>
            <li className="flow-step">
              <div className="node node-client">
                <span className="node-name">MCP client</span>
                <span className="node-sub"><code>tools/list</code> <code>tools/call</code></span>
              </div>
              <span className="link link-gate">
                <span className="link-label">
                  <Icon name="i-lock" />
                  only what you authorized
                </span>
              </span>
            </li>
            <li className="flow-step">
              <div className="node node-apps">
                <span className="node-name">Connected app tools</span>
                <ul className="tools">
                  <li><span className="tool-app">Calendar</span><code>list_events</code><code>create_event</code><span className="asks">asks first</span></li>
                  <li><span className="tool-app">Notes</span><code>search_notes</code></li>
                  <li><span className="tool-app">Tasks</span><code>list_tasks</code><code>create_task</code><span className="asks">asks first</span></li>
                </ul>
              </div>
            </li>
          </ol>
          <figcaption id="flow-cap" className="caption">Tool names are&nbsp;examples.</figcaption>
        </figure>
      </div>
    </section>
  );
}

export function TrustSection() {
  const gridRef = useRef(null);
  const draftRef = useRef(null);
  const markRefs = useRef({});
  const numRefs = useRef({});
  const [leaders, setLeaders] = useState({ w: 0, h: 0, paths: [] });

  const draw = useCallback(() => {
    const grid = gridRef.current;
    const draft = draftRef.current;
    if (!grid || !draft) return;
    if (matchMedia('(max-width: 60rem)').matches) {
      setLeaders({ w: 0, h: 0, paths: [] });
      return;
    }
    const base = grid.getBoundingClientRect();
    const dr = draft.getBoundingClientRect();
    const paths = ['1', '2', '3']
      .map((id) => {
        const mark = markRefs.current[id];
        const num = numRefs.current[id];
        if (!mark || !num) return null;
        const mr = mark.getBoundingClientRect();
        const nr = num.getBoundingClientRect();
        const S = { x: dr.right - base.left, y: mr.top + mr.height / 2 - base.top };
        const E = { x: nr.left + nr.width / 2 - base.left, y: nr.top + nr.height / 2 - base.top };
        const dx = E.x - S.x;
        return {
          id,
          d: cubic(S, { x: S.x + dx * 0.5, y: S.y }, { x: E.x - dx * 0.5, y: E.y }, E),
        };
      })
      .filter(Boolean);
    setLeaders({ w: fmt(base.width), h: fmt(base.height), paths });
  }, []);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return undefined;
    const narrow = matchMedia('(max-width: 60rem)');
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(grid);
    narrow.addEventListener('change', draw);
    document.fonts?.ready.then(draw);
    return () => {
      ro.disconnect();
      narrow.removeEventListener('change', draw);
    };
  }, [draw]);

  return (
    <section className="trust" id="trust" aria-labelledby="trust-title">
      <div ref={gridRef} className="container trust-grid" data-trust="">
        <svg
          className="trust-leaders"
          viewBox={leaders.w ? `0 0 ${leaders.w} ${leaders.h}` : undefined}
          width={leaders.w || undefined}
          height={leaders.h || undefined}
          aria-hidden="true"
        >
          {leaders.paths.map((p) => (
            <path key={p.id} d={p.d} />
          ))}
        </svg>

        <h2 id="trust-title" className="section-title trust-title">Nothing changes until you say&nbsp;so.</h2>

        <figure className="specimen" aria-labelledby="spec-cap">
          <div ref={draftRef} className="draft">
            <p ref={(el) => { markRefs.current['1'] = el; }} className="draft-kind" data-mark="1">
              <Icon name="i-tasks" />
              Draft for Tasks
            </p>
            <p className="draft-title">Create task: Send the revised budget to the design team</p>
            <dl className="draft-meta">
              <div><dt>Due</dt><dd>Today</dd></div>
              <div><dt>List</dt><dd>Work</dd></div>
            </dl>
            <p ref={(el) => { markRefs.current['2'] = el; }} className="draft-why" data-mark="2">
              Source <span className="cite-chip">Team sync note</span>
            </p>
            <div ref={(el) => { markRefs.current['3'] = el; }} className="draft-actions" data-mark="3" aria-hidden="true">
              <span className="pill pill-yes">Approve</span>
              <span className="pill">Edit</span>
              <span className="pill">Dismiss</span>
            </div>
          </div>
          <figcaption id="spec-cap" className="caption">Illustrative&nbsp;draft.</figcaption>
        </figure>

        <dl className="promises">
          <div className="promise" data-for="1">
            <dt><span ref={(el) => { numRefs.current['1'] = el; }} className="promise-n">1</span>You choose the connections</dt>
            <dd>Weave reaches only apps you authorize, and stops when you disconnect&nbsp;one.</dd>
          </div>
          <div className="promise" data-for="2">
            <dt><span ref={(el) => { numRefs.current['2'] = el; }} className="promise-n">2</span>You see every source</dt>
            <dd>Each point in an answer names the record it came&nbsp;from.</dd>
          </div>
          <div className="promise" data-for="3">
            <dt><span ref={(el) => { numRefs.current['3'] = el; }} className="promise-n">3</span>You approve every change</dt>
            <dd>New tasks and events wait as drafts until you say&nbsp;yes.</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

export function ClosingWeaveSection() {
  const svgRef = useRef(null);
  const inView = useRevealOnce(svgRef);

  return (
    <section className="closing night" id="start" aria-labelledby="closing-title">
      <div className="container closing-grid">
        <svg
          ref={svgRef}
          className={`closing-weave${inView ? ' is-in' : ''}`}
          data-closing=""
          viewBox="0 0 640 420"
          role="img"
          aria-labelledby="closing-weave-title"
        >
          <title id="closing-weave-title">Connected app threads running into the Weave symbol</title>
          <g fill="none" strokeLinecap="round">
            <path className="cw cw-calendar" pathLength="1" d="M0,60 C150,60 220,210 326,210" />
            <path className="cw cw-notes" pathLength="1" d="M0,140 C140,140 220,216 326,216" />
            <path className="cw cw-tasks" pathLength="1" d="M0,222 C120,222 220,222 326,222" />
            <path className="cw cw-workout" pathLength="1" d="M0,300 C140,300 220,228 326,228" />
            <path className="cw cw-email" pathLength="1" d="M0,380 C150,380 220,234 326,234" />
          </g>
          <use className="cw-logo" href="#logo-symbol" x="360" y="82" width="256" height="256" />
        </svg>
        <div className="closing-copy">
          <h2 id="closing-title" className="closing-title">Weave your day back&nbsp;together.</h2>
          <p className="section-lede">The prototype runs real MCP calls on sample data, on your&nbsp;machine.</p>
          <Link className="btn btn-primary" to="/app">Try the prototype</Link>
        </div>
      </div>
    </section>
  );
}

