import React, { useRef, useState } from 'react';
import { LogoSymbol } from '../Icons';
import { SplitWords } from '../SplitWords';

export function ControlSection() {
  const [moved, setMoved] = useState(false);
  const [decision, setDecision] = useState(null); // null | 'yes' | 'no'
  const yesBtnRef = useRef(null);
  const moveBtnRef = useRef(null);
  const undoBtnRef = useRef(null);

  const cardWhen = moved ? '6:30 to 7:15\u00a0pm' : '6:15 to 7:00\u00a0pm';
  const calWhen = moved ? '6:30 to 7:15' : '6:15 to 7:00';

  const decide = (next) => {
    setDecision(next);
    requestAnimationFrame(() => undoBtnRef.current?.focus());
  };

  const undo = () => {
    setDecision(null);
    requestAnimationFrame(() => yesBtnRef.current?.focus());
  };

  const toggleMove = () => {
    setMoved((m) => !m);
    requestAnimationFrame(() => moveBtnRef.current?.focus());
  };

  const evCls = [
    'ev ev-new',
    moved ? 'is-moved' : '',
    decision === 'yes' ? 'is-added' : '',
    decision === 'no' ? 'is-gone' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section className="control" id="control" aria-labelledby="control-title">
      <div className="container">
        <SplitWords as="h2" className="section-title" id="control-title" text="Nothing changes until you say yes." />
        <div className="control-demo">
          <div className="confirm-card">
            <p className="confirm-from">
              <LogoSymbol small />
              Weave wants to add
            </p>
            <p className="confirm-what">Easy run</p>
            <p className="confirm-when">Today, <span>{cardWhen}</span></p>
            <div className="confirm-actions">
              {decision ? (
                <button ref={undoBtnRef} className="btn btn-quiet btn-sm" type="button" onClick={undo}>
                  Undo
                </button>
              ) : (
                <>
                  <button ref={yesBtnRef} className="btn btn-primary btn-sm" type="button" onClick={() => decide('yes')}>
                    Yes, add it
                  </button>
                  <button ref={moveBtnRef} className="btn btn-quiet btn-sm" type="button" onClick={toggleMove}>
                    {moved ? 'Back to 6:15' : 'Make it 6:30'}
                  </button>
                  <button className="btn btn-link btn-sm" type="button" onClick={() => decide('no')}>
                    Not now
                  </button>
                </>
              )}
            </div>
            <p className={`confirm-result${decision === 'yes' ? ' is-yes' : ''}`} role="status">
              {decision === 'yes'
                ? 'Added to your calendar.'
                : decision === 'no'
                  ? 'Left off your calendar. Nothing changed.'
                  : ''}
            </p>
            <p className="confirm-note">A demo on sample data. Nothing is&nbsp;saved.</p>
          </div>
          <figure className="daycal" aria-label="Your calendar this evening, sample data">
            <div className="daycal-grid">
              <span className="hour" data-h="0">4 pm</span>
              <span className="hour" data-h="1">5 pm</span>
              <span className="hour" data-h="2">6 pm</span>
              <span className="hour" data-h="3">7 pm</span>
              <span className="hour" data-h="4">8 pm</span>
              <div className="ev ev-focus" data-yarn="calendar">
                <strong>Focus block</strong>
                <span>4:45 to 6:00</span>
              </div>
              <div className="ev ev-dinner" data-yarn="calendar">
                <strong>Dinner with Meera</strong>
                <span>7:30</span>
              </div>
              <div className={evCls} data-yarn="workout">
                <strong>Easy run</strong>
                <span>{calWhen}</span>
              </div>
            </div>
          </figure>
        </div>
        <ul className="promises">
          <li>
            <h3>You pick the apps</h3>
            <p>Only the apps you connect. Switch one off&nbsp;anytime.</p>
          </li>
          <li>
            <h3>You see the sources</h3>
            <p>Every point links to the note or event behind&nbsp;it.</p>
          </li>
          <li>
            <h3>You approve changes</h3>
            <p>New to-dos and events wait for your&nbsp;yes.</p>
          </li>
        </ul>
      </div>
    </section>
  );
}

