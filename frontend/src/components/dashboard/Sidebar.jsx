import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Icon, LogoLockup } from '../Icons';
import { WeaveSwatch } from './WovenStrip';

function SettingsMenu({ busy, techDetails, onToggleTech, onReset, onClearHistory, hasHistory }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(null); // 'reset' | 'history'
  const [working, setWorking] = useState(false);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (!menuRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) setOpen(false);
    };
    const esc = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const confirm = async (fn) => {
    setWorking(true);
    await fn();
    setWorking(false);
    setConfirming(null);
    setOpen(false);
  };

  return (
    <div className="side-settings">
      <button
        ref={btnRef}
        type="button"
        className="side-me"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          setConfirming(null);
        }}
      >
        <span className="side-avatar" aria-hidden="true">Y</span>
        <span className="side-me-text">
          You <span>· Prototype</span>
        </span>
        <Icon name="i-sliders" />
      </button>
      {open && (
        <div className="menu side-menu" ref={menuRef}>
          <p className="menu-title">Settings</p>
          <label className="menu-switch">
            <span>
              Show technical details
              <small>MCP calls, tools and timings</small>
            </span>
            <input type="checkbox" role="switch" checked={techDetails} onChange={(e) => onToggleTech(e.target.checked)} />
          </label>
          <div className="menu-reset">
            {confirming ? (
              <>
                <p>
                  {confirming === 'reset'
                    ? 'This brings back the sample data and removes papers you saved.'
                    : 'This deletes every conversation in the sidebar. Saved papers stay.'}
                </p>
                <div className="row-actions">
                  <button
                    type="button"
                    className="d-btn is-ink is-sm"
                    disabled={working}
                    onClick={() => confirm(confirming === 'reset' ? onReset : onClearHistory)}
                  >
                    {working ? <span className="spin" aria-hidden="true" /> : null}
                    {confirming === 'reset' ? 'Reset' : 'Delete all'}
                  </button>
                  <button type="button" className="d-btn is-plain is-sm" onClick={() => setConfirming(null)}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <button type="button" className="menu-item" disabled={!hasHistory} onClick={() => setConfirming('history')}>
                  <Icon name="i-trash" />
                  Delete all conversations
                </button>
                <button type="button" className="menu-item" disabled={busy} onClick={() => setConfirming('reset')}>
                  <Icon name="i-replay" />
                  Reset sample data
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  chats,
  activeId,
  onNew,
  onOpenChat,
  onDeleteChat,
  savedCount,
  connected,
  offline,
  reminderCount,
  onCollapse,
  busy,
  techDetails,
  onToggleTech,
  onReset,
  onClearHistory,
}) {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef(null);
  const shown = query.trim() ? chats.filter((c) => c.title.toLowerCase().includes(query.trim().toLowerCase())) : chats;

  return (
    <aside className="side" aria-label="Weave">
      <div className="side-top">
        <Link className="side-brand" to="/" aria-label="Weave, back to the home page">
          <LogoLockup />
        </Link>
        <div className="side-top-tools">
          <button
            type="button"
            className={`side-icon${searching ? ' is-on' : ''}`}
            aria-label="Search chats"
            aria-expanded={searching}
            title="Search chats"
            onClick={() => {
              setSearching((v) => !v);
              setQuery('');
              requestAnimationFrame(() => searchRef.current?.focus());
            }}
          >
            <Icon name="i-search" />
          </button>
          <button type="button" className="side-icon" onClick={onCollapse} aria-label="Close sidebar" title="Close sidebar">
            <Icon name="i-panel" />
          </button>
        </div>
      </div>

      {searching && (
        <div className="side-search">
          <Icon name="i-search" />
          <label className="visually-hidden" htmlFor="side-search">
            Search your conversations
          </label>
          <input
            id="side-search"
            ref={searchRef}
            value={query}
            placeholder="Search chats"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearching(false);
                setQuery('');
              }
            }}
          />
          <button type="button" aria-label="Close search" onClick={() => { setSearching(false); setQuery(''); }}>
            <Icon name="i-x" />
          </button>
        </div>
      )}

      <nav className="side-nav" aria-label="Weave">
        <button type="button" className="side-item" onClick={onNew}>
          <Icon name="i-new" />
          New chat
        </button>
        <NavLink to="/app/saved" className={({ isActive }) => `side-item${isActive ? ' is-on' : ''}`}>
          <Icon name="i-archive" />
          Saved
          <span className="side-meta">{savedCount}</span>
        </NavLink>
        <NavLink to="/app/connections" className={({ isActive }) => `side-item${isActive ? ' is-on' : ''}`}>
          <Icon name="i-link" />
          Connections
          <span className="side-meta">{offline ? 'Offline' : <WeaveSwatch yarns={connected.map((s) => s.id)} />}</span>
        </NavLink>
        <NavLink to="/app/wishlist" className={({ isActive }) => `side-item${isActive ? ' is-on' : ''}`}>
          <Icon name="i-heart" />
          Wishlist
          {reminderCount > 0 ? <span className="side-meta">{reminderCount}</span> : null}
        </NavLink>
        <NavLink to="/app/size-profile" className={({ isActive }) => `side-item${isActive ? ' is-on' : ''}`}>
          <Icon name="i-ruler" />
          Sizes
        </NavLink>
        <NavLink to="/app/appliances" className={({ isActive }) => `side-item${isActive ? ' is-on' : ''}`}>
          <Icon name="i-receipt" />
          Appliances &amp; Bills
        </NavLink>
        <NavLink to="/app/wardrobe" className={({ isActive }) => `side-item${isActive ? ' is-on' : ''}`}>
          <Icon name="i-heart" />
          Wardrobe
        </NavLink>
        <NavLink to="/app/timetable" className={({ isActive }) => `side-item${isActive ? ' is-on' : ''}`}>
          <Icon name="i-calendar" />
          Timetable
        </NavLink>
      </nav>

      <div className="side-recents">
        <p className="side-label">{query.trim() ? 'Results' : 'Recents'}</p>
        {shown.length ? (
          <ul>
            {shown.map((c) => (
              <li key={c.id} className={c.id === activeId ? 'is-on' : ''}>
                <button type="button" className="side-chat" onClick={() => onOpenChat(c.id)} aria-current={c.id === activeId ? 'page' : undefined}>
                  {c.title}
                </button>
                <button type="button" className="side-del" onClick={() => onDeleteChat(c)} aria-label={`Delete “${c.title}”`}>
                  <Icon name="i-trash" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="side-empty">{query ? 'No conversations match.' : 'Your conversations will show up here.'}</p>
        )}
      </div>

      <SettingsMenu
        busy={busy}
        techDetails={techDetails}
        onToggleTech={onToggleTech}
        onReset={onReset}
        onClearHistory={onClearHistory}
        hasHistory={chats.length > 0}
      />
    </aside>
  );
}
