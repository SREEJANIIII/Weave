import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icons';
import { ACCEPT } from '../../lib/readFile';
import { WeaveSwatch } from './WovenStrip';

function shortList(names) {
  if (!names.length) return 'Connect your services';
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
}

/**
 * The ask box: type, speak, or add a photo or file. Under it, what Weave can see and where
 * answers come from. On phones it sits at the bottom of the screen, under the thumb.
 */
export function Composer({
  value,
  onChange,
  onAsk,
  busy,
  voice,
  onFile,
  onSample,
  docked,
  inputRef,
  openMenuSignal = 0,
  connected,
  offline,
  status,
  onOpenConnections,
  onSetMode,
  followUp = false,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);
  const cameraRef = useRef(null);
  const menuRef = useRef(null);
  const addBtnRef = useRef(null);
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const hasText = value.trim().length > 0;
  const state = voice.listening ? 'listening' : busy ? 'thinking' : 'idle';

  useEffect(() => {
    if (!openMenuSignal) return;
    addBtnRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    setMenuOpen(true);
  }, [openMenuSignal]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (e) => {
      if (!menuRef.current?.contains(e.target) && !addBtnRef.current?.contains(e.target)) setMenuOpen(false);
    };
    const esc = (e) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        addBtnRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    requestAnimationFrame(() => menuRef.current?.querySelector('button')?.focus());
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [menuOpen]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value, inputRef, voice.listening]);

  const pick = (input) => {
    setMenuOpen(false);
    input.current?.click();
  };
  const takeFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onFile(file);
  };
  const menuKeys = (e) => {
    const items = [...(menuRef.current?.querySelectorAll('button') ?? [])];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(i + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length]?.focus();
    }
  };

  const nvidiaReady = status?.planners?.nvidia?.credentials;

  return (
    <div className={`composer${docked ? ' is-docked' : ''}`}>
      <form
        className={`ask${dragging ? ' is-dragging' : ''}`}
        data-state={state}
        data-has-text={hasText}
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          if (hasText && !busy) onAsk(value);
        }}
        onDragOver={(e) => {
          if ([...e.dataTransfer.types].includes('Files')) {
            e.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) onFile(file);
        }}
      >
        <div className="ask-field">
          {voice.listening ? (
            <div className="ask-listening">
              <p className="ask-heard" aria-live="polite">
                {voice.heard || 'Listening…'}
              </p>
              <p className="ask-listening-note">I’ll ask when you pause. Your browser turns your voice into text.</p>
            </div>
          ) : (
            <>
              <label className="visually-hidden" htmlFor="ask-input">
                Ask Weave a question
              </label>
              <textarea
                ref={inputRef}
                id="ask-input"
                rows={1}
                maxLength={600}
                placeholder={followUp ? 'Ask a follow-up…' : 'Ask Weave anything…'}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    if (hasText && !busy) onAsk(value);
                  }
                }}
              />
            </>
          )}
          {dragging ? <p className="ask-drop">Drop it here to add it</p> : null}
        </div>

        <div className="ask-bar">
          <div className="ask-add">
            <button
              ref={addBtnRef}
              className="round-btn"
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Add a photo or file"
              title="Add a photo or file"
              disabled={busy || voice.listening}
              onClick={() => setMenuOpen((o) => !o)}
            >
              <Icon name="i-plus" />
            </button>
            {menuOpen && (
              <div className="menu ask-menu" role="menu" ref={menuRef} onKeyDown={menuKeys}>
                {coarse && (
                  <button type="button" role="menuitem" onClick={() => pick(cameraRef)}>
                    <Icon name="i-camera" />
                    <span>
                      Take a photo<small>Receipt, warranty card, bill or note</small>
                    </span>
                  </button>
                )}
                <button type="button" role="menuitem" onClick={() => pick(fileRef)}>
                  <Icon name="i-paperclip" />
                  <span>
                    Add a photo or file<small>Photos, PDFs, calendar files (.ics) and text notes</small>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="menu-quiet"
                  onClick={() => {
                    setMenuOpen(false);
                    onSample();
                  }}
                >
                  <Icon name="i-receipt" />
                  <span>
                    Try a sample receipt<small>See how adding works, with made-up details</small>
                  </span>
                </button>
              </div>
            )}
            <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={takeFile} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={takeFile} />
          </div>

          <div className="ask-right">
            {voice.listening ? (
              <>
                <button className="text-btn" type="button" onClick={voice.cancel}>
                  Cancel
                </button>
                <button className="round-btn is-live" type="button" aria-pressed="true" aria-label="Stop listening and ask" onClick={voice.stop}>
                  <span className="bars" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                    <i />
                  </span>
                </button>
              </>
            ) : (
              <>
                <button
                  className="round-btn is-quiet"
                  type="button"
                  aria-pressed="false"
                  aria-label="Ask by voice"
                  title="Ask by voice"
                  disabled={busy}
                  onClick={() => {
                    onChange('');
                    voice.start();
                  }}
                >
                  <Icon name="i-mic" />
                </button>
                <button className="send-btn" type="submit" disabled={!hasText || busy} aria-label={busy ? 'Weave is answering' : 'Ask'}>
                  {busy ? <span className="spin" aria-hidden="true" /> : <Icon name="i-arrow-up" />}
                </button>
              </>
            )}
          </div>
        </div>
      </form>

      {voice.error ? (
        <p className="ask-note" role="alert">
          <Icon name="i-info" />
          <span>{voice.error}</span>
          <button type="button" className="link-btn" onClick={voice.clearError}>
            OK
          </button>
        </p>
      ) : null}

      <div className="ask-under">
        <button type="button" className="under-btn" onClick={() => onOpenConnections()}>
          {offline ? <Icon name="i-alert" /> : <WeaveSwatch yarns={connected.map((s) => s.id)} />}
          <span>{offline ? 'Services out of reach' : shortList(connected.map((s) => s.name))}</span>
          <Icon name="i-chevron-down" />
        </button>
        {status && (
          <label className="under-select" title={nvidiaReady ? undefined : 'To use NVIDIA, add NVIDIA_API_KEY to backend/.env and restart the server.'}>
            <span>Answers</span>
            <select value={status.mode} disabled={busy} onChange={(e) => onSetMode(e.target.value)}>
              <option value="offline">Offline demo</option>
              <option value="nvidia" disabled={!nvidiaReady}>
                NVIDIA
              </option>
            </select>
            <Icon name="i-chevron-down" />
          </label>
        )}
      </div>
    </div>
  );
}
