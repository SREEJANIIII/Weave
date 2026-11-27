import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon, LogoSymbol } from '../components/Icons';
import { Sidebar } from '../components/dashboard/Sidebar';
import { Composer } from '../components/dashboard/Composer';
import { Turn } from '../components/dashboard/Turn';
import { TodayPanel } from '../components/dashboard/TodayPanel';
import { ConnectionsPage } from '../components/dashboard/ConnectionsPage';
import { SavedPage } from '../components/dashboard/SavedPage';
import { UploadSheet } from '../components/dashboard/UploadSheet';
import { Toast } from '../components/dashboard/Toast';
import { WishlistView } from '../components/wishlist/WishlistView';
import { SizeProfileView } from '../components/profile/SizeProfileView';
import { AppliancesView } from '../components/appliances/AppliancesView';
import { WardrobeView } from '../components/wardrobe/WardrobeView';
import { TimetableView } from '../components/timetable/TimetableView';
import { api } from '../lib/api';
import { joinNames } from '../lib/services';
import { STARTERS } from '../lib/followUps';
import { answerFromSaved, answerRunFromPaper, savedIntent, withSavedNotes, workoutNotesForLastWeek } from '../lib/savedPapers';
import { matchOccasions } from '../lib/occasionMatcher';
import { buildWishlistRunResponse, isWishlistQuery } from '../lib/wishlistContextQA';
import { useWishlistStore } from '../hooks/useWishlistStore';
import { useConnections } from '../hooks/useConnections';
import { useSavedPapers } from '../hooks/useSavedPapers';
import { useChats } from '../hooks/useChats';
import { useVoice } from '../hooks/useVoice';
import { usePageMeta } from '../hooks/usePageSetup';

const LAST_SIDEBAR = 'weave:sidebar:v1';
const TECH = 'weave:tech:v1';

function useNarrow() {
  const query = '(max-width: 47.99rem)';
  const [narrow, setNarrow] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

function Welcome({ services, onConnectAll, onChoose, onLater }) {
  const reachable = services.filter((s) => s.state !== 'unavailable');
  if (!reachable.length) return null;
  return (
    <section className="welcome" aria-labelledby="welcome-title">
      <div>
        <h2 id="welcome-title">Choose what Weave can look at</h2>
        <p>
          Nothing is read until you say so. Connect {joinNames(reachable.map((s) => s.name))} to get answers about your day. You can disconnect any time.
        </p>
      </div>
      <div className="row-actions">
        <button className="d-btn is-ink is-sm" type="button" onClick={() => onConnectAll(reachable.map((s) => s.id))}>
          Connect {reachable.length === 1 ? 'it' : `all ${reachable.length}`}
        </button>
        <button className="d-btn is-line is-sm" type="button" onClick={onChoose}>
          Choose
        </button>
        <button className="d-btn is-plain is-sm" type="button" onClick={onLater}>
          Not now
        </button>
      </div>
    </section>
  );
}

export function WorkspacePage({ routeView = null }) {
  const location = useLocation();
  const navigate = useNavigate();

  const [searchParams, setSearchParams] = useSearchParams();
  const PAGES = { '/app/wishlist': 'wishlist', '/app/size-profile': 'size-profile', '/app/appliances': 'appliances', '/app/wardrobe': 'wardrobe', '/app/timetable': 'timetable', '/app/saved': 'saved', '/app/connections': 'connections' };
  const view = routeView ?? (Object.entries(PAGES).find(([path]) => location.pathname.startsWith(path))?.[1] ?? 'home');

  usePageMeta({
    page: ['wishlist', 'size-profile', 'appliances', 'wardrobe', 'timetable'].includes(view) ? 'app' : 'dashboard',
    title: { wishlist: 'Weave — Wishlist', 'size-profile': 'Weave — Sizes', appliances: 'Weave — Appliances & Bills', saved: 'Weave — Saved', connections: 'Weave — Connections' }[view] ?? 'Weave',
    description: 'Ask Weave about your plans, purchases and papers. It answers from what you’ve saved and connected, and asks before changing anything.',
  });

  const conn = useConnections();
  const papers = useSavedPapers();
  const store = useWishlistStore();
  const chats = useChats();
  const narrow = useNarrow();

  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState('');
  const [glance, setGlance] = useState(null);
  const [glanceLoading, setGlanceLoading] = useState(true);
  const [activity, setActivity] = useState([]);
  const [techDetails, setTechDetails] = useState(() => localStorage.getItem(TECH) === '1');
  const [toast, setToast] = useState(null);
  const [uploadJob, setUploadJob] = useState(null);
  const [freshId, setFreshId] = useState(null);
  const [dismissing, setDismissing] = useState(() => new Set());
  const [addSignal, setAddSignal] = useState(0);
  const [sideOpen, setSideOpen] = useState(() => localStorage.getItem(LAST_SIDEBAR) !== 'closed');
  const [drawer, setDrawer] = useState(false);

  const seqRef = useRef(0);
  const busyRef = useRef(false);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const threadRef = useRef(null);
  const stickRef = useRef(true);
  const toastTimer = useRef(null);
  const dismissTimers = useRef(new Map());

  const turns = chats.active?.turns ?? [];
  const hasThread = view === 'home' && turns.length > 0;
  const focus = searchParams.get('focus');

  /* ---------- Panels, toasts, sidebar ---------- */

  /** Saved and Connections are pages; `focusId` opens one item on arrival. */
  const openPanel = useCallback(
    (name, focusId) => {
      setDrawer(false);
      navigate(`/app/${name}${focusId ? `?focus=${encodeURIComponent(focusId)}` : ''}`);
    },
    [navigate],
  );
  const closePanel = useCallback(() => {}, []);

  const showToast = useCallback((message, action) => {
    clearTimeout(toastTimer.current);
    setToast({ message, action, id: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), action ? 7000 : 4500);
  }, []);

  const toggleSidebar = () => {
    if (narrow) {
      setDrawer((d) => !d);
      return;
    }
    setSideOpen((open) => {
      try {
        localStorage.setItem(LAST_SIDEBAR, open ? 'closed' : 'open');
      } catch {
        // remembered for this visit only
      }
      return !open;
    });
  };

  const goHome = () => {
    if (view !== 'home') navigate('/app');
    setDrawer(false);
  };

  const newChat = () => {
    chats.startNew();
    goHome();
    setQuestion('');
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  /** "Add a photo or file" from anywhere: open the ask box's add menu, where the file picker lives. */
  const openAddMenu = () => {
    goHome();
    closePanel();
    setAddSignal((n) => n + 1);
  };

  /* ---------- Today cards ---------- */

  const connectedKey = conn.connected.map((s) => s.id).join(',');
  useEffect(() => {
    if (!conn.synced) return undefined;
    if (conn.offline) {
      setGlance(null);
      setGlanceLoading(false);
      return undefined;
    }
    let live = true;
    setGlanceLoading(true);
    api('/api/calendar/events').then((r) => {
      if (!live) return;
      const events = r.ok ? (r.data.events ?? []) : [];
      const today = conn.status?.today ?? new Date().toISOString().slice(0, 10);
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const next = events.find((event) => event.date > today || (event.date === today && event.end >= hhmm)) ?? null;
      setGlance({ now: hhmm, calendar: { status: r.ok ? 'ok' : 'error', next }, tasks: { status: 'unavailable', due: [] } });
      setGlanceLoading(false);
    });
    return () => {
      live = false;
    };
  }, [conn.synced, conn.offline, connectedKey]);

  useEffect(() => {
    if (!techDetails || view !== 'connections' || conn.offline) return;
    api('/api/activity').then((r) => r.ok && setActivity(r.data.activity ?? []));
  }, [techDetails, view, conn.offline, turns.length]);

  /* ---------- Follow the answer as it is written ---------- */

  useEffect(() => {
    const scroller = scrollRef.current;
    const thread = threadRef.current;
    if (!scroller || !thread) return undefined;
    const onScroll = () => {
      stickRef.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120;
    };
    const grow = new ResizeObserver(() => {
      if (stickRef.current) scroller.scrollTop = scroller.scrollHeight;
    });
    scroller.addEventListener('scroll', onScroll, { passive: true });
    grow.observe(thread);
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      grow.disconnect();
    };
  }, [hasThread, chats.activeId]);

  useEffect(() => {
    if (view !== 'home' && scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [view]);

  useEffect(() => {
    // Opening a conversation shows its latest answer; other pages start at the top.
    if (view !== 'home') return;
    stickRef.current = true;
    requestAnimationFrame(() => {
      const s = scrollRef.current;
      if (s) s.scrollTop = s.scrollHeight;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chats.activeId]);

  /* ---------- Asking ---------- */

  const wishlistState = conn.services.find((s) => s.id === 'wishlist')?.state;
  const applianceService = conn.services.find((s) => s.id === 'appliances');

  const ask = useCallback(
    async (raw) => {
      const q = String(raw ?? '').trim();
      if (!q || busyRef.current) return;
      if (view !== 'home') navigate('/app');
      closePanel();
      setDrawer(false);
      setQuestion('');
      stickRef.current = true;
      const seq = `${Date.now().toString(36)}-${++seqRef.current}`;

      // 1. Receipts, warranties and bills saved on this device.
      const intent = savedIntent(q, papers.saved);
      const nvidiaCanLook = conn.status?.mode === 'nvidia' && !conn.offline;
      if (intent.claims && (intent.matches.length || !nvidiaCanLook)) {
        const paper = intent.matches[0];
        const readable = paper && (paper.content?.text || paper.content?.tables?.length) && papers.onServer && !conn.offline;
        if (!readable) {
          chats.addTurn({ seq, fresh: true, ...answerFromSaved(q, papers.saved, intent) });
          return;
        }
        // Answer from the text stored with the paper: specific to the question, as a table where it helps.
        busyRef.current = true;
        setBusy(true);
        chats.addTurn({ seq, fresh: true, question: q, steps: [{ id: 1, kind: 'read', server: 'saved', app: 'Saved', tool: 'read_paper', status: 'running' }], proposals: [], answer: null, error: null, done: false });
        const r = await api(`/api/papers/${encodeURIComponent(paper.id)}/answer`, { question: q });
        chats.updateTurn(seq, (t) => ({
          ...t,
          ...(r.ok ? answerRunFromPaper(paper, r.data.answer, q) : answerFromSaved(q, papers.saved, intent)),
          steps: [],
          seq,
          fresh: true,
          done: true,
        }));
        busyRef.current = false;
        setBusy(false);
        return;
      }

      // 2. The wishlist kept in this browser. "Fit in a workout" or "meeting" questions belong to the services.
      const aboutMyDay = /follow[\s-]?up|workout|exercise|gym|meeting|calendar|spen[dt]|to-?dos?|tasks?/i.test(q);
      if (!aboutMyDay && wishlistState !== 'off' && isWishlistQuery(q, store.wishlist)) {
        const local = buildWishlistRunResponse({
          question: q,
          wishlist: store.wishlist,
          sizeProfile: store.sizeProfile,
          occasions: store.occasions,
          reminderPrefs: store.reminderPrefs,
          onApproveReminder: store.approveReminderEvent,
        });
        chats.addTurn({ seq, fresh: true, ...local, question: q });
        return;
      }

      // 3. Connected services, through the server.
      if (conn.offline) {
        chats.addTurn({
          seq,
          question: q,
          steps: [],
          proposals: [],
          answer: null,
          done: true,
          error: { message: 'I can’t reach your connected services right now.', hint: 'Your saved papers still work. Try again in a moment.' },
        });
        return;
      }

      busyRef.current = true;
      setBusy(true);
      chats.addTurn({ seq, fresh: true, question: q, steps: [], proposals: [], answer: null, error: null, done: false });

      try {
        const res = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q }) });
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
            if (event === 'step') {
              chats.updateTurn(seq, (t) => {
                const i = t.steps.findIndex((s) => s.id === payload.id);
                return { ...t, steps: i >= 0 ? t.steps.map((s, k) => (k === i ? payload : s)) : [...t.steps, payload] };
              });
            } else if (event === 'proposal') {
              chats.updateTurn(seq, (t) => {
                const i = t.proposals.findIndex((p) => p.id === payload.id);
                return { ...t, proposals: i >= 0 ? t.proposals.map((p, k) => (k === i ? payload : p)) : [...t.proposals, payload] };
              });
            } else if (event === 'answer') {
              const notes = workoutNotesForLastWeek(q, papers.saved);
              chats.updateTurn(seq, (t) => {
                const map = new Map(t.proposals.map((p) => [p.id, p]));
                for (const p of payload.proposals ?? []) map.set(p.id, { ...map.get(p.id), ...p });
                return { ...t, answer: withSavedNotes(payload, notes), proposals: [...map.values()] };
              });
            } else if (event === 'error') {
              chats.updateTurn(seq, (t) => ({ ...t, error: payload }));
            }
          }
        }
      } catch (err) {
        const error = err.known
          ? { message: err.message, hint: '' }
          : { message: 'The connection to Weave dropped before I could answer.', hint: 'Check that the Weave server is running, then try again.' };
        chats.updateTurn(seq, (t) => ({ ...t, error }));
      }
      chats.updateTurn(seq, (t) => ({ ...t, done: true }));
      busyRef.current = false;
      setBusy(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, papers.saved, papers.onServer, conn.status?.mode, conn.offline, wishlistState, store.wishlist, store.sizeProfile, store.occasions, store.reminderPrefs, chats.addTurn],
  );

  const voice = useVoice({ onFinal: (text) => ask(text) });

  /* ---------- Approving drafted changes ---------- */

  const updateProposal = (id, patch) =>
    chats.updateAllTurns((t) => (t.proposals?.some((p) => p.id === id) ? { ...t, proposals: t.proposals.map((p) => (p.id === id ? { ...p, ...patch } : p)) } : t));

  const handleApprove = async (p, changes = {}) => {
    if (typeof p.localAction === 'function') {
      p.localAction();
      updateProposal(p.id, { status: 'done', args: { ...p.args, ...changes }, conflicts: [] });
      return;
    }
    updateProposal(p.id, { status: 'running' });
    const r = await api(`/api/proposals/${encodeURIComponent(p.id)}/approve`, { changes });
    if (r.data?.proposal) updateProposal(p.id, r.data.proposal);
    else if (r.status === 404) updateProposal(p.id, { status: 'expired' });
    else {
      updateProposal(p.id, { status: 'pending' });
      showToast(r.data?.error ?? 'That didn’t go through. Nothing was changed.');
    }
  };

  const stopDismissing = (id) =>
    setDismissing((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });

  const handleUndoDismiss = (p) => {
    clearTimeout(dismissTimers.current.get(p.id));
    dismissTimers.current.delete(p.id);
    stopDismissing(p.id);
    setToast(null);
  };

  const handleDismiss = (p) => {
    setDismissing((s) => new Set(s).add(p.id));
    showToast(`Okay, I won’t add “${p.args?.title ?? 'it'}”.`, { label: 'Undo', run: () => handleUndoDismiss(p) });
    const timer = setTimeout(async () => {
      dismissTimers.current.delete(p.id);
      if (typeof p.localAction === 'function') updateProposal(p.id, { status: 'dismissed' });
      else {
        const r = await api(`/api/proposals/${encodeURIComponent(p.id)}/dismiss`, {});
        updateProposal(p.id, r.data?.proposal ?? { status: 'dismissed' });
      }
      stopDismissing(p.id);
    }, 7000);
    dismissTimers.current.set(p.id, timer);
  };

  /* ---------- Connections ---------- */

  const nameOf = (id) => conn.services.find((s) => s.id === id)?.name ?? id;

  const connect = async (id) => {
    const ok = await conn.setService(id, true);
    showToast(ok ? `${nameOf(id)} is connected. Weave will use it when a question needs it.` : `Couldn’t connect ${nameOf(id)}. Nothing changed.`);
  };
  const disconnect = async (id) => {
    const ok = await conn.setService(id, false);
    if (ok) showToast(`${nameOf(id)} is disconnected. Weave won’t read it.`, { label: 'Undo', run: () => conn.setService(id, true) });
    else showToast(`Couldn’t disconnect ${nameOf(id)}. Try again.`);
  };
  const connectAll = async (ids) => {
    const ok = await conn.connectMany(ids);
    showToast(ok ? `Connected ${joinNames(ids.map(nameOf))}.` : 'Couldn’t connect them. Nothing changed.');
  };
  const notNow = async () => {
    for (const s of conn.services) if (s.state !== 'unavailable') await conn.setService(s.id, false);
    showToast('Okay. You can connect services any time from Connections.');
  };

  const setMode = async (mode) => {
    const r = await api('/api/mode', { mode });
    if (r.ok) {
      conn.setStatus(r.data);
      showToast(mode === 'nvidia' ? 'NVIDIA will answer from now on.' : 'The offline demo will answer from now on.');
    } else showToast(r.data?.error ?? 'Couldn’t switch. Nothing changed.');
  };

  const reset = async () => {
    store.resetWishlistDemo();
    await papers.restoreSamples();
    if (!conn.offline) {
      const r = await api('/api/reset', {});
      if (r.ok) await conn.resync(r.data);
    }
    chats.updateAllTurns((t) => ({ ...t, proposals: (t.proposals ?? []).map((p) => (p.status === 'pending' ? { ...p, status: 'expired' } : p)) }));
    showToast('The sample data is back.');
  };

  const toggleTech = (on) => {
    setTechDetails(on);
    try {
      localStorage.setItem(TECH, on ? '1' : '0');
    } catch {
      // setting lasts for this visit
    }
  };

  const deleteChat = (chat) => {
    chats.remove(chat.id);
    showToast(`Deleted “${chat.title}”.`, { label: 'Undo', run: () => chats.restore(chat) });
  };

  /* ---------- Saved papers ---------- */

  const saveItem = async (item) => {
    const result = await papers.add(item);
    if (result.ok) setFreshId(item.id);
    return result;
  };
  const undoSave = async (id) => {
    const r = await papers.remove(id);
    showToast(r.ok ? 'Removed. That paper isn’t saved any more.' : 'Couldn’t remove it. It’s still in Saved.');
  };
  const deleteItem = async (item) => {
    const r = await papers.remove(item.id);
    if (r.ok) showToast(`Deleted “${item.title}”.`, { label: 'Undo', run: () => papers.add(item) });
    else showToast('Couldn’t delete it. It’s still in Saved.');
  };

  /* ---------- Rendering ---------- */

  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Let’s get tomorrow sorted' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const names = conn.connected.map((s) => s.name);
  const readiness = !conn.synced
    ? 'Getting ready…'
    : conn.offline
      ? 'I can’t reach your connected services right now, but I can still help with what you’ve saved here.'
      : names.length
        ? `What can I help you keep track of? I can look at your ${joinNames(names)} and your saved papers.`
        : 'Ask me anything, or add a photo of a receipt or warranty and I’ll keep track of it.';
  const reminderCount = useMemo(
    () => matchOccasions(store.wishlist, store.occasions, store.reminderPrefs).filter((m) => m.inWindow && !m.dismissed).length,
    [store.wishlist, store.occasions, store.reminderPrefs],
  );
  const dockComposer = view === 'home' && (hasThread || narrow);
  const pageTitle = view === 'home' ? chats.active?.title ?? '' : view === 'appliances' ? 'Appliances & Bills' : view === 'wardrobe' ? 'Wardrobe' : view === 'timetable' ? 'Timetable' : '';

  const composer = (docked) => (
    <Composer
      value={question}
      onChange={setQuestion}
      onAsk={ask}
      busy={busy}
      voice={voice}
      onFile={(file) => setUploadJob({ file })}
      onSample={() => setUploadJob({ sample: true })}
      docked={docked}
      inputRef={inputRef}
      openMenuSignal={addSignal}
      connected={conn.connected}
      offline={conn.offline}
      status={conn.status}
      onOpenConnections={(id) => openPanel('connections', id)}
      onSetMode={setMode}
      followUp={hasThread}
    />
  );

  return (
    <div className={`shell${sideOpen ? '' : ' is-side-closed'}${drawer ? ' is-drawer' : ''}`}>
      <a className="skip" href="#main">
        Skip to content
      </a>

      <Sidebar
        chats={chats.chats}
        activeId={view === 'home' ? chats.activeId : null}
        onNew={newChat}
        onOpenChat={(id) => {
          chats.open(id);
          goHome();
        }}
        onDeleteChat={deleteChat}
        savedCount={papers.saved.length}
        connected={conn.connected}
        offline={conn.offline}
        reminderCount={reminderCount}
        onCollapse={toggleSidebar}
        busy={busy}
        techDetails={techDetails}
        onToggleTech={toggleTech}
        onReset={reset}
        onClearHistory={async () => {
          chats.clearAll();
          showToast('All conversations deleted.');
        }}
      />
      <button type="button" className="side-scrim" aria-label="Close menu" tabIndex={drawer ? 0 : -1} onClick={() => setDrawer(false)} />

      <div className="shell-main">
        <header className="main-top">
          <button type="button" className="side-icon main-toggle" onClick={toggleSidebar} aria-label="Open sidebar">
            <Icon name="i-panel" />
          </button>
          <p className="main-title">{pageTitle}</p>
          <button type="button" className="side-icon main-new" onClick={newChat} aria-label="New chat">
            <Icon name="i-new" />
          </button>
        </header>

        <main className={`main-scroll${view !== 'home' ? ' is-page' : ''}`} id="main" ref={scrollRef}>
          {view === 'saved' ? (
            <SavedPage
              saved={papers.saved}
              focusId={focus}
              freshId={freshId}
              onAsk={ask}
              onDelete={deleteItem}
              onAdd={openAddMenu}
              onReadText={async (item) => {
                const r = await papers.readText(item.id);
                showToast(r.ok ? `Read the text of “${item.title}”. You can ask about it now.` : r.error);
              }}
            />
          ) : view === 'connections' ? (
            <ConnectionsPage
              focusId={focus}
              services={conn.services}
              planned={conn.status?.planned}
              offline={conn.offline}
              pending={conn.pending}
              onConnect={connect}
              onDisconnect={disconnect}
              onNotify={showToast}
              onLinked={(id) => {
                if (conn.services.find((x) => x.id === id)?.state === 'off') conn.setService(id, true);
              }}
              onRetry={conn.reload}
              reader={conn.status?.reader}
              readerAllowed={conn.readerAllowed}
              onSetReader={(allow) => {
                conn.setReader(allow);
                showToast(allow ? 'Weave will send photos you add to NVIDIA NIM to read them.' : 'Weave won’t send photos anywhere. You can type the details instead.');
              }}
              techDetails={techDetails}
              activity={activity}
            />
          ) : view === 'appliances' ? (
            <AppliancesView
              enabled={applianceService?.state === 'connected'}
              state={applianceService?.state ?? 'unavailable'}
              connectionError={applianceService?.error}
            />
          ) : view === 'wardrobe' ? (
            <WardrobeView enabled={conn.services.find((service) => service.id === 'wardrobe')?.state === 'connected'} />
          ) : view === 'timetable' ? (
            <TimetableView enabled={conn.services.find((service) => service.id === 'timetable')?.state === 'connected'} />
          ) : view === 'wishlist' ? (
            <div className="wl-shell">
              <WishlistView
                wishlist={store.wishlist}
                sizeProfile={store.sizeProfile}
                occasions={store.occasions}
                reminderPrefs={store.reminderPrefs}
                onAdd={store.addItem}
                onUpdate={store.updateItem}
                onRemove={store.removeItem}
                onDismissReminder={store.dismissReminder}
                onGoToProfile={() => navigate('/app/size-profile')}
              />
            </div>
          ) : view === 'size-profile' ? (
            <div className="wl-shell">
              <SizeProfileView
                sizeProfile={store.sizeProfile}
                wishlist={store.wishlist}
                occasions={store.occasions}
                reminderPrefs={store.reminderPrefs}
                onSaveProfile={store.saveProfile}
                onClearProfile={store.clearProfileMeasurements}
                onUpdateReminderPrefs={store.updateReminderPrefs}
                onAddOccasion={store.addOccasionEvent}
                onOpenWishlist={() => navigate('/app/wishlist')}
              />
            </div>
          ) : hasThread ? (
            <div className="thread" ref={threadRef} aria-label={`Conversation: ${chats.active.title}`}>
              {turns.map((t) => (
                <Turn
                  key={t.seq}
                  turn={t}
                  services={conn.services}
                  saved={papers.saved}
                  techDetails={techDetails}
                  dismissing={dismissing}
                  onApprove={handleApprove}
                  onDismiss={handleDismiss}
                  onUndoDismiss={handleUndoDismiss}
                  onAsk={ask}
                  onRetry={ask}
                  onOpenSaved={(id) => openPanel('saved', id)}
                  onOpenConnections={(id) => openPanel('connections', id)}
                  onAddFile={openAddMenu}
                  onOpenWishlist={() => navigate('/app/wishlist')}
                  onTyped={(seq) => chats.updateTurn(seq, (x) => ({ ...x, fresh: false }))}
                />
              ))}
            </div>
          ) : (
            <div className="home">
              <section className="home-hero" aria-labelledby="greeting">
                <h1 className="greeting" id="greeting">
                  <LogoSymbol small className="greet-mark" />
                  {greeting}
                </h1>
                <p className={`ready-line${conn.synced ? ' is-ready' : ''}`} aria-live="polite">
                  {readiness}
                </p>
                <div className="starters" aria-label="Things you can ask">
                  {STARTERS.map((q) => (
                    <button key={q} type="button" className="ask-chip" onClick={() => ask(q)}>
                      {q}
                    </button>
                  ))}
                </div>
                {!narrow && composer(false)}
              </section>

              {conn.firstRun && <Welcome services={conn.services} onConnectAll={connectAll} onChoose={() => openPanel('connections')} onLater={notNow} />}

              <TodayPanel
                glance={glance}
                loading={!conn.synced || glanceLoading}
                offline={conn.offline}
                services={conn.services}
                saved={papers.saved}
                todayLabel={conn.status?.todayLabel ?? new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                onAsk={ask}
                onOpenSaved={(id) => openPanel('saved', id)}
                onOpenConnections={(id) => openPanel('connections', id)}
                onAddFile={openAddMenu}
              />
            </div>
          )}
        </main>

        {dockComposer && <div className="dock">{composer(true)}</div>}
      </div>

      <UploadSheet
        job={uploadJob}
        onClose={() => setUploadJob(null)}
        reader={conn.status?.reader}
        readerAllowed={conn.readerAllowed}
        onAllowReader={() => conn.setReader(true)}
        onSave={saveItem}
        onUndoSave={undoSave}
        onAsk={ask}
        onOpenSaved={(id) => openPanel('saved', id)}
        onNotSaved={() => showToast('Not saved. Nothing was kept.')}
      />

      <Toast
        toast={toast}
        onAction={() => {
          toast?.action?.run();
          setToast(null);
        }}
        onDismiss={() => setToast(null)}
      />
    </div>
  );
}
