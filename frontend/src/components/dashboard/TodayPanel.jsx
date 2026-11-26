import React from 'react';
import { Icon } from '../Icons';
import { fmtDate, imageFor, nounFor, savedReminder, daysFromToday } from '../../lib/savedPapers';
import { DAILY } from '../../lib/followUps';

const to12 = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
};
const minutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

function eventWhen(e, nowHhmm) {
  const days = daysFromToday(e.date);
  if (days === 0) {
    if (e.start <= nowHhmm) return `Now, until ${to12(e.end)}`;
    const mins = minutes(e.start) - minutes(nowHhmm);
    const soon = mins < 60 ? ` · in ${mins} min` : mins < 180 ? ` · in ${Math.round(mins / 60)} h` : '';
    return `Today, ${to12(e.start)}${soon}`;
  }
  return `${days === 1 ? 'Tomorrow' : fmtDate(e.date)}, ${to12(e.start)}`;
}

function ago(iso) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

function Card({ yarn, icon, thumb, label, title, meta, tag, onClick, muted, loading }) {
  if (loading) {
    return (
      <div className="card is-loading" aria-hidden="true">
        <span className="card-art" />
        <span className="card-body">
          <span />
          <span />
        </span>
      </div>
    );
  }
  return (
    <button type="button" className={`card${muted ? ' is-muted' : ''}`} data-yarn={yarn} onClick={onClick} disabled={!onClick}>
      <span className="card-art" aria-hidden="true">
        {thumb ? <img src={thumb} alt="" /> : <Icon name={icon} />}
      </span>
      <span className="card-body">
        <span className="card-label">
          {label}
          {tag ? <span className="tag">{tag}</span> : null}
        </span>
        <span className="card-title">{title}</span>
        {meta ? <span className="card-meta">{meta}</span> : null}
      </span>
    </button>
  );
}

/** Three things worth knowing right now, under the ask box. */
export function TodayPanel({ glance, loading, offline, services, saved, todayLabel, onAsk, onOpenSaved, onOpenConnections, onAddFile }) {
  const calendar = services.find((s) => s.id === 'calendar');
  const newest = [...saved].sort((a, b) => (b.savedAt ?? '').localeCompare(a.savedAt ?? ''))[0];
  const reminder = savedReminder(saved);
  const task = glance?.tasks?.status === 'ok' ? glance.tasks.due?.[0] : null;

  let next;
  if (loading) next = <Card loading />;
  else if (offline || glance?.calendar?.status === 'error' || calendar?.state === 'unavailable') {
    next = <Card yarn="calendar" icon="i-calendar" label="Next up" title="Calendar is out of reach" meta="Saved papers still work" onClick={() => onOpenConnections('calendar')} muted />;
  } else if (glance?.calendar?.status === 'ok') {
    const e = glance.calendar.next;
    next = e ? (
      <Card yarn="calendar" icon="i-calendar" label="Next up" title={e.title} meta={[eventWhen(e, glance.now), e.location].filter(Boolean).join(' · ')} onClick={() => onAsk('When is my next meeting?')} />
    ) : (
      <Card yarn="calendar" icon="i-calendar" label="Next up" title="Nothing else this week" meta="Your calendar is clear" onClick={() => onAsk('When is my next meeting?')} muted />
    );
  } else {
    next = <Card yarn="calendar" icon="i-calendar" label="Next up" title="Connect your calendar" meta="See what’s coming next" onClick={() => onOpenConnections('calendar')} muted />;
  }

  return (
    <section className="today" aria-labelledby="today-title">
      <div className="today-head">
        <h2 id="today-title">Today</h2>
        <p>{todayLabel}</p>
      </div>
      <div className="cards">
        {next}
        {newest ? (
          <Card
            yarn="saved"
            icon="i-file"
            thumb={imageFor(newest)}
            label="Recently saved"
            tag={newest.sample ? 'Sample' : null}
            title={newest.title}
            meta={`Saved ${ago(newest.savedAt)}`}
            onClick={() => onOpenSaved(newest.id)}
          />
        ) : (
          <Card yarn="saved" icon="i-receipt" label="Recently saved" title="Add a receipt or warranty" meta="It’ll show up here" onClick={onAddFile} muted />
        )}
        {reminder ? (
          <Card
            yarn="saved"
            icon="i-shield"
            label="Coming up"
            tag={reminder.item.sample ? 'Sample' : null}
            title={reminder.text}
            meta={reminder.when}
            onClick={() => onAsk(`Show me the warranty for my ${nounFor(reminder.item)}`)}
          />
        ) : task ? (
          <Card yarn="tasks" icon="i-tasks" label="Coming up" title={task.title} meta={`Due ${daysFromToday(task.due) <= 0 ? 'today' : fmtDate(task.due)} · To-dos`} onClick={() => onAsk(DAILY)} />
        ) : (
          <Card yarn="tasks" icon="i-clock" label="Coming up" title="Nothing due soon" meta="Enjoy the quiet" muted />
        )}
      </div>
    </section>
  );
}
