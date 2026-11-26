import React, { useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Icon, LogoLockup } from '../Icons';

export function AppTopBar({ status, busy, offline, reminderCount = 0, onSetMode, onReset }) {
  const [resetState, setResetState] = useState('idle'); // 'idle' | 'confirm' | 'running'
  const confirmBtnRef = useRef(null);
  const modeRefs = useRef({});

  const options = status
    ? [
        {
          id: 'nvidia',
          label: 'NVIDIA',
          disabled: !status.planners.nvidia.credentials,
          title: !status.planners.nvidia.credentials
            ? 'No NVIDIA API key found. Set NVIDIA_API_KEY and restart the server.'
            : 'Plan with NVIDIA',
        },
        {
          id: 'offline',
          label: 'Offline',
          disabled: false,
          title: 'Offline script: real MCP calls, hand-written reasoning for demo and wishlist questions',
        },
      ]
    : [];

  const handleConfirmReset = async () => {
    setResetState('running');
    await onReset();
    setResetState('idle');
  };

  return (
    <header className="bar">
      <div className="bar-inner">
        <Link className="brand" to="/" aria-label="Weave, back to the landing page">
          <LogoLockup />
        </Link>
        <span className="bar-tag">Prototype</span>

        <nav className="bar-nav" aria-label="Workspace views">
          <NavLink
            to="/app"
            end
            className={({ isActive }) => `bar-nav-link${isActive ? ' is-active' : ''}`}
          >
            Ask Weave
          </NavLink>
          <NavLink
            to="/app/connections"
            className={({ isActive }) => `bar-nav-link${isActive ? ' is-active' : ''}`}
          >
            Apps &amp; Sources
          </NavLink>
          <NavLink
            to="/app/wishlist"
            className={({ isActive }) => `bar-nav-link${isActive ? ' is-active' : ''}`}
          >
            <span>Wishlist</span>
            {reminderCount > 0 && <span className="bar-nav-badge">{reminderCount}</span>}
          </NavLink>
          <NavLink
            to="/app/size-profile"
            className={({ isActive }) => `bar-nav-link${isActive ? ' is-active' : ''}`}
          >
            My Size Profile
          </NavLink>
          <NavLink
            to="/app/appliances"
            className={({ isActive }) => `bar-nav-link${isActive ? ' is-active' : ''}`}
          >
            Appliances
          </NavLink>
        </nav>

        <span className="bar-date">{status?.todayLabel ?? ''}</span>
        <div className="bar-tools">
          <div className="planner" role="radiogroup" aria-label="Planner">
            {options.map((o) => {
              const checked = o.id === status?.mode;
              return (
                <button
                  key={o.id}
                  ref={(el) => { modeRefs.current[o.id] = el; }}
                  type="button"
                  role="radio"
                  aria-checked={String(checked)}
                  tabIndex={checked ? 0 : -1}
                  disabled={busy || (o.disabled && !checked)}
                  title={o.title}
                  onClick={() => onSetMode(o.id)}
                  onKeyDown={(e) => {
                    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
                    const other = options.find((x) => x.id !== o.id);
                    if (other && !other.disabled) {
                      onSetMode(other.id);
                      requestAnimationFrame(() => modeRefs.current[other.id]?.focus());
                    }
                  }}
                >
                  {o.label}
                </button>
              );
            })}
          </div>

          <div className="reset">
            {resetState === 'running' ? (
              <>
                <span className="spinner" aria-hidden="true" />
                <span className="reset-q">Restarting</span>
              </>
            ) : resetState === 'confirm' ? (
              <>
                <span className="reset-q">Restore sample data?</span>
                <button
                  ref={confirmBtnRef}
                  className="btn btn-primary btn-sm"
                  type="button"
                  onClick={handleConfirmReset}
                >
                  Reset
                </button>
                <button
                  className="btn btn-link btn-sm"
                  type="button"
                  onClick={() => setResetState('idle')}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                className="btn btn-quiet btn-sm"
                type="button"
                disabled={busy}
                title={offline ? 'Restore sample Wishlist & Size Profile data' : 'Restore sample MCP and Wishlist data'}
                onClick={() => {
                  setResetState('confirm');
                  requestAnimationFrame(() => confirmBtnRef.current?.focus());
                }}
              >
                <Icon name="i-replay" />
                <span>Reset demo</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
