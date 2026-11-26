import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, LogoLockup } from '../Icons';

export function AppTopBar({ status, busy, offline, onSetMode, onReset }) {
  const [resetState, setResetState] = useState('idle'); // 'idle' | 'confirm' | 'running'
  const confirmBtnRef = useRef(null);
  const modeRefs = useRef({});

  const options = status
    ? [
        {
          id: 'claude',
          label: 'Claude',
          disabled: !status.planners.claude.credentials,
          title: !status.planners.claude.credentials
            ? 'No Anthropic API key found. Set ANTHROPIC_API_KEY and restart the server.'
            : 'Plan with Claude',
        },
        {
          id: 'offline',
          label: 'Offline',
          disabled: false,
          title: 'Offline script: real MCP calls, hand-written reasoning for the two example questions',
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
                <span className="reset-q">Restarting the MCP servers</span>
              </>
            ) : resetState === 'confirm' ? (
              <>
                <span className="reset-q">Restore the sample data?</span>
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
                disabled={busy || offline}
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

