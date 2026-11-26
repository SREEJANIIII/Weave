import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icons';
import { AppTopBar } from '../components/workspace/AppTopBar';
import { RunView } from '../components/workspace/RunView';
import { InspectorPanel } from '../components/workspace/InspectorPanel';
import { WishlistView } from '../components/wishlist/WishlistView';
import { SizeProfileView } from '../components/profile/SizeProfileView';
import { SizeIntelligenceModal } from '../components/wishlist/SizeIntelligenceModal';
import { AppliancesView } from '../components/appliances/AppliancesView';
import { SHORT } from '../lib/formatters';
import { matchOccasions } from '../lib/occasionMatcher';
import { buildWishlistRunResponse, isWishlistQuery } from '../lib/wishlistContextQA';
import { useWishlistStore } from '../hooks/useWishlistStore';
import { usePageMeta } from '../hooks/usePageSetup';

const TABS = ['apps', 'sources', 'activity'];

const WISHLIST_PROMPTS = [
  'What outfits have I saved for Diwali?',
  'Which of my saved outfits are likely to fit me?',
  "My friend's wedding is next month. Do I have anything saved for it?",
  'Show me the products I should revisit before my upcoming occasions.',
  'Which size should I consider for this dress?',
];

const APPLIANCE_PROMPTS = [
  'Which warranties expire soon?',
  'When is my next AC service?',
  'How much EMI is due this month?',
  'Can I still return my washing machine?',
  'Which AMCs need renewal?',
];

async function api(path, body) {
  const res = await fetch(
    path,
    body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export function WorkspacePage() {
  const location = useLocation();
  const navigate = useNavigate();

  const view = location.pathname.startsWith('/app/wishlist')
    ? 'wishlist'
    : location.pathname.startsWith('/app/size-profile')
      ? 'size-profile'
      : location.pathname.startsWith('/app/appliances')
        ? 'appliances'
        : 'ask';

  usePageMeta({
    page: 'app',
    title:
      view === 'wishlist'
        ? 'Weave — Smart Wishlist'
        : view === 'size-profile'
          ? 'Weave — My Size Profile'
          : view === 'appliances'
            ? 'Weave — Appliances & Bills'
            : 'Weave prototype: ask across your apps',
    description:
      'Ask one question across your connected apps, manage your Smart Wishlist & Size Intelligence, and approve changes before anything runs.',
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
  const [inspectedProduct, setInspectedProduct] = useState(null);
  const [inspectedResult, setInspectedResult] = useState(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  const wishlistEnabled = useMemo(
    () => Boolean(status?.apps?.find((a) => a.id === 'wishlist')?.enabled && status?.apps?.find((a) => a.id === 'wishlist')?.status === 'connected'),
    [status],
  );
  const calendarEnabled = useMemo(
    () => Boolean(status?.apps?.find((a) => a.id === 'calendar')?.enabled && status?.apps?.find((a) => a.id === 'calendar')?.status === 'connected'),
    [status],
  );
  const appliancesEnabled = useMemo(
    () => Boolean(status?.apps?.find((a) => a.id === 'appliances')?.enabled && status?.apps?.find((a) => a.id === 'appliances')?.status === 'connected'),
    [status],
  );

  const {
    syncMode,
    syncing,
    profileDeleted,
    wishlist,
    sizeProfile,
    reminderPrefs,
    backendReminders,
    occasions,
    refreshAll,
    addItem,
    updateItem,
    removeItem,
    saveProfile,
    clearProfileMeasurements,
    deleteProfile,
    matchSizeForProduct,
    updateReminderPrefs,
    reconcileReminders,
    dismissReminder,
    approveReminderEvent,
    addOccasionEvent,
    resetWishlistDemo,
  } = useWishlistStore({
    backendOnline: !offline && Boolean(status),
    wishlistEnabled,
    calendarEnabled,
  });

  const activeReminderCount = useMemo(
    () => matchOccasions(wishlist, occasions, reminderPrefs, status?.today, backendReminders).filter((m) => m.inWindow && !m.dismissed).length,
    [wishlist, occasions, reminderPrefs, status?.today, backendReminders],
  );

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
      if (!q || busy) return;

      // Local Smart Wishlist & Size Intelligence fallback ONLY when the backend server is offline
      if (offline && isWishlistQuery(q, wishlist)) {
        const seq = ++runSeqRef.current;
        setLitN(null);
        const localRun = buildWishlistRunResponse({
          question: q,
          wishlist,
          sizeProfile,
          occasions,
          reminderPrefs,
          onApproveReminder: approveReminderEvent,
        });
        setRun({ seq, ...localRun });
        selectTab('sources');
        requestAnimationFrame(() => {
          runRef.current?.scrollIntoView({
            block: 'start',
            behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
          });
        });
        return;
      }

      if (offline) {
        showToast('Start the Weave backend with npm start for Calendar/Notes/Tasks/Money questions, or ask about your Wishlist & Size Profile.');
        return;
      }

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
    [busy, offline, status?.mode, wishlist, sizeProfile, occasions, reminderPrefs, approveReminderEvent, loadActivity, selectTab, showToast],
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
    resetWishlistDemo();
    if (!offline) {
      const r = await api('/api/reset', {});
      if (r.ok) {
        setStatus(r.data);
        loadActivity();
        await refreshAll();
      } else {
        showToast(r.data.error ?? "Couldn't reset the backend MCP servers.");
      }
    }
    setRun(null);
    setLitN(null);
    showToast('Sample data restored.');
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
    if (typeof p.localAction === 'function') {
      p.localAction();
      updateProposal(p.id, {
        status: 'done',
        args: { ...p.args, ...changes },
        conflicts: [],
      });
      return;
    }
    updateProposal(p.id, { status: 'running' });
    const r = await api(`/api/proposals/${encodeURIComponent(p.id)}/approve`, { changes });
    if (r.data.proposal) {
      updateProposal(p.id, r.data.proposal);
      if (r.data.proposal.status === 'done' && (p.server === 'wishlist' || p.server === 'calendar')) {
        refreshAll();
      }
    } else {
      updateProposal(p.id, { status: 'pending' });
      showToast(r.data.error ?? "Couldn't approve that draft.");
    }
    if (r.status === 409 && r.data.error) showToast(r.data.error);
    loadActivity();
  };

  const handleDismiss = async (p) => {
    if (typeof p.localAction === 'function') {
      updateProposal(p.id, { status: 'dismissed' });
      return;
    }
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

  const handleInspectSize = useCallback(
    async (item) => {
      setInspectedProduct(item);
      setInspectedResult(null);
      setInspectLoading(syncMode === 'backend');
      const result = await matchSizeForProduct(item);
      setInspectedResult(result);
      setInspectLoading(false);
    },
    [syncMode, matchSizeForProduct],
  );

  const runAction = useCallback(
    async (promise, errFallback) => {
      const res = await promise;
      if (res && res.ok === false) showToast(res.error || errFallback);
      else loadActivity();
      return res;
    },
    [loadActivity, showToast],
  );

  const hour = status?.hour ?? new Date().getHours();
  const greeting = hour < 12 ? 'Good morning.' : hour < 18 ? 'Good afternoon.' : 'Good evening.';
  const askSub = offline
    ? 'Wishlist & Size Intelligence questions run on local browser sample data. Start the server (npm start) for MongoDB persistence and live MCP tools.'
    : !status
      ? 'Weave reads only what a question needs, cites every record, and holds changes for your\u00a0OK.'
      : status.mode === 'offline'
        ? `Ask about your day or your Smart Wishlist & Size Profile using sample data.${
            status.planners.nvidia.credentials ? ' Switch to NVIDIA to ask anything.' : ' Add a NVIDIA API key to ask open-ended MCP questions.'
          }`
        : 'NVIDIA plans which MCP tools to call, cites every record it reads, and holds changes for your OK.';

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>

      <AppTopBar
        status={status}
        busy={busy}
        offline={offline}
        reminderCount={activeReminderCount}
        onSetMode={handleSetMode}
        onReset={handleReset}
      />

      {view === 'appliances' ? (
        <main id="main">
          <AppliancesView enabled={appliancesEnabled} />
        </main>
      ) : view === 'wishlist' ? (
        <main className="wl-shell" id="main">
          <WishlistView
            wishlist={wishlist}
            sizeProfile={sizeProfile}
            occasions={occasions}
            reminderPrefs={reminderPrefs}
            backendReminders={backendReminders}
            syncMode={syncMode}
            calendarEnabled={calendarEnabled}
            syncing={syncing}
            serverToday={status?.today}
            onAdd={(item) => runAction(addItem(item), 'Could not add wishlist item.')}
            onUpdate={(id, patch) => runAction(updateItem(id, patch), 'Could not update item.')}
            onRemove={(id) => runAction(removeItem(id), 'Could not remove item.')}
            onDismissReminder={(eventId, remIds) => runAction(dismissReminder(eventId, remIds), 'Could not dismiss reminder.')}
            onReconcileReminders={() => runAction(reconcileReminders(), 'Could not sync reminders.')}
            onInspectSize={handleInspectSize}
            onGoToProfile={() => navigate('/app/size-profile')}
          />
        </main>
      ) : view === 'size-profile' ? (
        <main className="wl-shell" id="main">
          <SizeProfileView
            sizeProfile={sizeProfile}
            wishlist={wishlist}
            occasions={occasions}
            reminderPrefs={reminderPrefs}
            backendReminders={backendReminders}
            syncMode={syncMode}
            calendarEnabled={calendarEnabled}
            profileDeleted={profileDeleted}
            serverToday={status?.today}
            onSaveProfile={(p) => runAction(saveProfile(p), 'Could not save size profile.')}
            onClearProfile={() => runAction(clearProfileMeasurements(), 'Could not clear measurements.')}
            onDeleteProfile={() => runAction(deleteProfile(), 'Could not delete size profile.')}
            onUpdateReminderPrefs={updateReminderPrefs}
            onReconcileReminders={() => runAction(reconcileReminders(), 'Could not sync reminders.')}
            onAddOccasion={addOccasionEvent}
            onOpenWishlist={() => navigate('/app/wishlist')}
          />
        </main>
      ) : (
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
                  placeholder="Ask about your day, your wishlist outfits, sizing or spending"
                  value={questionText}
                  disabled={busy}
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
                  <button className="btn btn-primary" type="submit" disabled={busy}>
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
                {WISHLIST_PROMPTS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    className="is-wishlist"
                    disabled={busy}
                    title={q}
                    aria-label={`Ask: ${q}`}
                    onClick={() => {
                      setQuestionText(q);
                      requestAnimationFrame(autosize);
                      ask(q);
                    }}
                  >
                    {q}
                  </button>
                ))}
                {APPLIANCE_PROMPTS.map((q) => (
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
                    {q}
                  </button>
                ))}
              </div>

              {offline && (
                <div className="notice" role="alert">
                  <Icon name="i-alert" />
                  <div>
                    <strong>MCP backend is offline — Wishlist &amp; Size Q&amp;A is still active.</strong>
                    <p>Start the Node server with npm start to also connect Calendar, Notes, Tasks and Money MCP servers.</p>
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
              sizeProfile={sizeProfile}
              onLight={light}
              onOpenSource={openSource}
              onApprove={handleApprove}
              onDismiss={handleDismiss}
              onInspectSize={handleInspectSize}
              onOpenWishlist={() => navigate('/app/wishlist')}
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
      )}

      {inspectedProduct && (
        <SizeIntelligenceModal
          product={inspectedProduct}
          result={inspectedResult}
          loading={inspectLoading}
          unit={sizeProfile.unit}
          onClose={() => {
            setInspectedProduct(null);
            setInspectedResult(null);
            setInspectLoading(false);
          }}
          onGoToProfile={() => navigate('/app/size-profile')}
        />
      )}

      <div className={`toast${toastOn ? ' is-on' : ''}`} role="status" aria-live="polite">
        {toastMsg}
      </div>
    </>
  );
}
