import React from 'react';
import { Link } from 'react-router-dom';
import { SplitWords } from '../SplitWords';

export function FaqSection() {
  return (
    <section className="faq" id="faq" aria-labelledby="faq-title">
      <div className="container faq-grid">
        <SplitWords as="h2" className="section-title" id="faq-title" text="Questions people ask" />
        <div className="faq-list">
          <details>
            <summary>Do I need to sign up?</summary>
            <p>No. Weave is a working prototype that runs on sample data, so you can try it straight&nbsp;away.</p>
          </details>
          <details>
            <summary>Which apps does it work with?</summary>
            <p>Today it reads a sample calendar, notes, to-do list and spending statement. Email, fitness, travel and home apps are&nbsp;next.</p>
          </details>
          <details>
            <summary>Can Weave change things on its own?</summary>
            <p>No. It drafts changes, like a new to-do, and waits for you to approve each&nbsp;one.</p>
          </details>
          <details>
            <summary>What if I switch an app off?</summary>
            <p>Weave tells you what it couldn&rsquo;t check instead of&nbsp;guessing.</p>
          </details>
          <details>
            <summary>How does it connect to my apps?</summary>
            <p>
              Through MCP, an open standard that lets an assistant use apps you allow. You don&rsquo;t need to know it to use Weave.{' '}
              <Link className="nowrap" to="/developers">Developer mode explains&nbsp;it.</Link>
            </p>
          </details>
        </div>
      </div>
    </section>
  );
}

