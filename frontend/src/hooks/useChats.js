import { useCallback, useEffect, useRef, useState } from 'react';

// Conversations, kept in this browser like a chat app's history.
const KEY = 'weave:chats:v1';
const MAX_CHATS = 40;

function load() {
  try {
    const chats = JSON.parse(localStorage.getItem(KEY)) ?? [];
    return chats.map((c) => ({
      ...c,
      turns: c.turns.map((t) => ({
        ...t,
        fresh: false,
        done: true,
        // Still pending if the server remembers it; approving one it has forgotten marks it expired.
        proposals: (t.proposals ?? []).map((p) => (p.status === 'running' ? { ...p, status: 'pending' } : p)),
        error: t.done ? t.error : t.error ?? { message: 'This answer was interrupted.', hint: 'Ask again to get a fresh one.' },
      })),
    }));
  } catch {
    return [];
  }
}

const titleFor = (q) => (q.length > 48 ? `${q.slice(0, 46).trimEnd()}…` : q);

export function useChats() {
  const [chats, setChats] = useState(load);
  const [activeId, setActiveId] = useState(null);
  const saveTimer = useRef(null);

  useEffect(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(chats.slice(0, MAX_CHATS)));
      } catch {
        // History just isn't remembered if storage is full.
      }
    }, 300);
    return () => clearTimeout(saveTimer.current);
  }, [chats]);

  const active = chats.find((c) => c.id === activeId) ?? null;

  /** Add a turn to the open conversation, starting one if needed. Returns the conversation id. */
  const addTurn = useCallback(
    (turn) => {
      const now = new Date().toISOString();
      const id = activeId ?? `chat-${Date.now().toString(36)}`;
      setChats((cs) => {
        const existing = cs.find((c) => c.id === id);
        if (existing) return [{ ...existing, turns: [...existing.turns, turn], updatedAt: now }, ...cs.filter((c) => c.id !== id)];
        return [{ id, title: titleFor(turn.question), createdAt: now, updatedAt: now, turns: [turn] }, ...cs];
      });
      setActiveId(id);
      return id;
    },
    [activeId],
  );

  /** Change one turn wherever it lives (answers keep streaming even if you switch chats). */
  const updateTurn = useCallback((seq, fn) => {
    setChats((cs) => cs.map((c) => (c.turns.some((t) => t.seq === seq) ? { ...c, turns: c.turns.map((t) => (t.seq === seq ? fn(t) : t)) } : c)));
  }, []);

  /** Change every turn in every conversation, e.g. to update a draft's status. */
  const updateAllTurns = useCallback((fn) => setChats((cs) => cs.map((c) => ({ ...c, turns: c.turns.map(fn) }))), []);

  const remove = useCallback(
    (id) => {
      setChats((cs) => cs.filter((c) => c.id !== id));
      if (id === activeId) setActiveId(null);
    },
    [activeId],
  );

  const restore = useCallback((chat) => setChats((cs) => [chat, ...cs.filter((c) => c.id !== chat.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))), []);

  const clearAll = useCallback(() => {
    setChats([]);
    setActiveId(null);
  }, []);

  return { chats, active, activeId, open: setActiveId, startNew: () => setActiveId(null), addTurn, updateTurn, updateAllTurns, remove, restore, clearAll };
}
