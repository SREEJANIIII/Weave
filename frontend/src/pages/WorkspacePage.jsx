import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icons';
import { AppTopBar } from '../components/workspace/AppTopBar';
import { RunView } from '../components/workspace/RunView';
import { InspectorPanel } from '../components/workspace/InspectorPanel';
import { SHORT } from '../lib/formatters';
import { usePageMeta } from '../hooks/usePageSetup';

const TABS = ['apps', 'sources', 'activity'];

async function api(path, body) {
  const res = await fetch(
    path,
    body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export function WorkspacePage() {
  usePageMeta({
    page: 'app',
    title: 'Weave prototype: ask across your apps',
    description:
      'Ask one question across your connected apps. Weave cites every record it reads and holds changes until you approve them.',
  });

  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = TABS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'apps';

  const [status, setStatus] = useState(null);
  const [offline, setOffline] = useState(false);
  const [activity, setActivity] = useState([]);
  const [tab, setTab] = useState(initialTab);
  const [busy, setBusy] = useState(false);
  const [questionText, setQuestionText] = useState('');
  const [run, setRun] = useState(null);
  const [litN, setLitN] = useState(null);
  const [toastMsg, setToastMsg] = useState('');
  const [toastOn, setToastOn] = useState(false);

  const textareaRef = useRef(null);
  const runRef = useRef(null);
  const runSeqRef = useRef(0);
  const sourceRefs = useRef(new Map());
  const toastTimerRef = useRef(null);

  const showToast = useCallback((message) => {
    setToastMsg(message);
    setToastOn(true);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastOn(false), 5000);
  }, []);

  const selectTab = useCallback(
    (name) => {
      const next = TABS.includes(name) ? name : 'apps';
      setTab(next);
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          params.set('tab', next);
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const loadActivity = useCallback(async () => {
    try {
      const r = await api('/api/activity');
      if (r.ok) setActivity(r.data.activity ?? []);
    } catch {
      // keep existing activity
    }
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const r = await api('/api/status');
      if (!r.ok) throw new Error();
      setStatus(r.data);
      setOffline(false);
      loadActivity();
    } catch {
      setOffline(true);
    }
  }, [loadActivity]);

  useEffect(() => {
    loadStatus();
    return () => clearTimeout(toastTimerRef.current);
  }, [loadStatus]);

  const autosize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  const ask = useCallback(
    async (rawQ) => {
      const q = rawQ.trim();
      if (!q || busy || offline) return;

      const seq = ++runSeqRef.current;
      setBusy(true);
      setLitN(null);
      setRun({ seq, question: q, steps: [], proposals: [], answer: null, error: null, done: false });
      requestAnimationFrame(() => {
        runRef.current?.scrollIntoView({
          block: 'start',
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        });
      });

      let gotAnswer = false;
      try {
        const res = await fetch('/api/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: q }),
        });
        if (!res.ok || !res.body) {
          const j = await res.json().catch(() => ({}));
          throw Object.assign(new Error(j.error ?? `The server answered ${res.status}.`), { known: true });
        }

        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += value;
          let cut;
          while ((cut = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, cut);
            buf = buf.slice(cut + 2);
            let event = 'message';
            let data = '';
            for (const line of block.split('\n')) {
              if (line.startsWith('event: ')) event = line.slice(7);
              else if (line.startsWith('data: ')) data += line.slice(6);
            }
            let payload;
            try {
              payload = JSON.parse(data);
            } catch {
              continue;
            }
            if (event === 'run') {
              setRun((prev) => (prev ? { ...prev, id: payload.id, mode: payload.mode, model: payload.model } : prev));
            } else if (event === 'step') {
              setRun((prev) => {
                if (!prev) return prev;
                const idx = prev.steps.findIndex((s) => s.id === payload.id);
                const steps = idx >= 0 ? prev.steps.map((s, k) => (k === idx ? payload : s)) : [...prev.steps, payload];
                return { ...prev, steps };
              });
            } else if (event === 'proposal') {
              setRun((prev) => {
                if (!prev) return prev;
                const idx = prev.proposals.findIndex((p) => p.id === payload.id);
                const proposals =
                  idx >= 0 ? prev.proposals.map((p, k) => (k === idx ? payload : p)) : [...prev.proposals, payload];
                return { ...prev, proposals };
              });
            } else if (event === 'answer') {
              gotAnswer = true;
              setRun((prev) => {
                if (!prev) return prev;
                const map = new Map(prev.proposals.map((p) => [p.id, p]));
                for (const p of payload.proposals ?? []) map.set(p.id, { ...map.get(p.id), ...p });
                return { ...prev, answer: payload, proposals: [...map.values()] };
              });
            } else if (event === 'error') {
              setRun((prev) => (prev ? { ...prev, error: payload } : prev));
            } else if (event === 'done') {
              setRun((prev) => (prev ? { ...prev, ms: payload.ms } : prev));
            }
          }
        }
      } catch (err) {
        const error = err.known
          ? { message: err.message, hint: '' }
          : { message: 'The connection to the Weave server dropped.', hint: 'Check that the server is still running, then ask again.' };
        setRun((prev) => (prev ? { ...prev, error } : prev));
      }

      setRun((prev) => (prev ? { ...prev, done: true } : prev));
      setBusy(false);
      await loadActivity();
      if (gotAnswer) selectTab('sources');
    },
    [busy, offline, loadActivity, selectTab],
  );

  const handleSetMode = async (mode) => {
    if (!status || status.mode === mode || busy) return;
    const r = await api('/api/mode', { mode });
    if (!r.ok) {
      showToast(r.data.error ?? "Couldn't switch the planner.");
      return;
    }
    setStatus(r.data);
  };

  const handleReset = async () => {
    const r = await api('/api/reset', {});
    if (r.ok) {
      setStatus(r.data);
      setRun(null);
      setLitN(null);
    } else {
      showToast(r.data.error ?? "Couldn't reset the demo.");
    }
    loadActivity();
  };

  const handleToggleApp = async (a) => {
    const r = await api(`/api/apps/${encodeURIComponent(a.id)}`, { enabled: !a.enabled });
    if (!r.ok) {
      showToast(r.data.error ?? `Couldn't switch ${a.name}.`);
      return;
    }
    setStatus(r.data);
  };

  const updateProposal = (id, patch) => {
    setRun((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        proposals: prev.proposals.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      };
    });
  };

  const handleApprove = async (p, changes = {}) => {
    updateProposal(p.id, { status: 'running' });
    const r = await api(`/api/proposals/${encodeURIComponent(p.id)}/approve`, { changes });
    if (r.data.proposal) updateProposal(p.id, r.data.proposal);
    else {
      updateProposal(p.id, { status: 'pending' });
      showToast(r.data.error ?? "Couldn't approve that draft.");
    }
    if (r.status === 409 && r.data.error) showToast(r.data.error);
    loadActivity();
  };

  const handleDismiss = async (p) => {
    const r = await api(`/api/proposals/${encodeURIComponent(p.id)}/dismiss`, {});
    if (r.data.proposal) updateProposal(p.id, r.data.proposal);
    else showToast(r.data.error ?? "Couldn't dismiss that draft.");
  };

  const light = useCallback(
    (n) => {
      setLitN(n);
      if (!n) return;
      const card = sourceRefs.current.get(n);
      if (card && tab === 'sources' && matchMedia('(min-width: 64.01rem)').matches) {
        card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    },
    [tab],
  );

  const openSource = useCallback(
    (n) => {
      selectTab('sources');
      setLitN(n);
      requestAnimationFrame(() => {
        const card = sourceRefs.current.get(n);
        if (!card) return;
        card.scrollIntoView({
          block: 'center',
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        });
        card.focus({ preventScroll: true });
      });
    },
    [selectTab],
  );

  const hour = status?.hour ?? new Date().getHours();
  const greeting = hour < 12 ? 'Good morning.' : hour < 18 ? 'Good afternoon.' : 'Good evening.';
  const askSub = offline
    ? 'Weave reads only what a question needs, cites every record, and holds changes for your\u00a0OK.'
    : !status
      ? 'Weave reads only what a question needs, cites every record, and holds changes for your\u00a0OK.'
      : status.mode === 'offline'
        ? `The offline planner answers the two example questions below with real MCP calls on sample data.${
            status.planners.claude.credentials ? ' Switch to Claude to ask anything.' : ' Add an Anthropic API key to ask anything.'
          }`
        : 'Claude plans which MCP tools to call, cites every record it reads, and holds changes for your OK.';

  return (
    <>
      <a className="skip" href="#q">Skip to the question box</a>

      <AppTopBar
        status={status}
        busy={busy}
        offline={offline}
        onSetMode={handleSetMode}
        onReset={handleReset}
      />

      <div className="workspace">
        <main className="main" id="main">
          <section className="ask" aria-labelledby="greeting">
            <h1 className="greeting" id="greeting">{greeting}</h1>
            <p className="ask-sub">{askSub}</p>
            <form
              className="composer"
              autoComplete="off"
              onSubmit={(e) => {
                e.preventDefault();
                ask(questionText);
              }}
            >
              <label className="visually-hidden" htmlFor="q">Your question</label>
              <textarea
                ref={textareaRef}
                id="q"
                name="q"
                rows={2}
                maxLength={600}
                placeholder="Ask about your day, your plans or your spending"
                value={questionText}
                disabled={busy || offline || !status}
                onChange={(e) => {
                  setQuestionText(e.target.value);
                  autosize();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    ask(questionText);
                  }
                }}
              />
              <div className="composer-foot">
                <span className="composer-hint">
                  <kbd>Enter</kbd> to ask, <kbd>Shift</kbd>&nbsp;+&nbsp;<kbd>Enter</kbd> for a new line
                </span>
                <button className="btn btn-primary" type="submit" disabled={busy || offline || !status}>
                  {busy ? (
                    <>
                      <span className="spinner" aria-hidden="true" />
                      <span>Asking</span>
                    </>
                  ) : (
                    <>
                      <span>Ask</span>
                      <Icon name="i-enter" />
                    </>
                  )}
                </button>
              </div>
            </form>

            <div className="suggest" aria-label="Example questions">
              {!offline &&
                (status?.suggestions ?? []).map((q) => (
                  <button
                    key={q}
                    type="button"
                    disabled={busy}
                    title={q}
                    aria-label={`Ask: ${q}`}
                    onClick={() => {
                      setQuestionText(q);
                      requestAnimationFrame(autosize);
                      ask(q);
                    }}
                  >
                    {SHORT[q] ?? q}
                  </button>
                ))}
            </div>

            {offline && (
              <div className="notice" role="alert">
                <Icon name="i-alert" />
                <div>
                  <strong>Can&apos;t reach the Weave server.</strong>
                  <p>Start it from the project folder with npm start, then try again.</p>
                  <button className="btn btn-quiet btn-sm" type="button" onClick={loadStatus}>
                    Try again
                  </button>
                </div>
              </div>
            )}
          </section>

          <RunView
            ref={runRef}
            run={run}
            busy={busy}
            litN={litN}
            onLight={light}
            onOpenSource={openSource}
            onApprove={handleApprove}
            onDismiss={handleDismiss}
          />
        </main>

        <InspectorPanel
          tab={tab}
          onSelectTab={selectTab}
          status={status}
          offline={offline}
          busy={busy}
          run={run}
          activity={activity}
          litN={litN}
          sourceRefs={sourceRefs}
          onToggleApp={handleToggleApp}
        />
      </div>

      <div className={`toast${toastOn ? ' is-on' : ''}`} role="status" aria-live="polite">
        {toastMsg}
      </div>
    </>
  );
}
