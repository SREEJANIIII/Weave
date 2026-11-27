// Standard real-world format parsers for Calendar (.ics), Notes (.md folder/files),
// Tasks (checklists), and Money (.csv bank/card statements).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { isoDate, pad } from './dates.js';

const OCCASION_KEYWORDS = ['Diwali', 'Wedding', 'Birthday', 'Party', 'Vacation', 'Festival'];

export function detectOccasion(text = '') {
  const low = String(text).toLowerCase();
  if (/diwali|deepavali/.test(low)) return 'Diwali';
  if (/wedding|sangeet|reception|mehendi|shaadi/.test(low)) return 'Wedding';
  if (/birthday|bday/.test(low)) return 'Birthday';
  if (/party|mixer|cocktail/.test(low)) return 'Party';
  if (/vacation|trip|holiday|travel|flight/.test(low)) return 'Vacation';
  if (/festival|puja|eid|navratri|holi/.test(low)) return 'Festival';
  return OCCASION_KEYWORDS.find((k) => low.includes(k.toLowerCase())) || '';
}

function unescapeIcs(s = '') {
  return String(s)
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function parseIcsDateTime(raw = '') {
  const val = String(raw).trim();
  // Pure date: YYYYMMDD
  const dateOnly = val.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    return { date: `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`, time: null, allDay: true };
  }
  // DateTime: YYYYMMDDTHHMMSS(Z)?
  const dt = val.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/i);
  if (dt) {
    if (dt[7]) {
      const utc = new Date(Date.UTC(Number(dt[1]), Number(dt[2]) - 1, Number(dt[3]), Number(dt[4]), Number(dt[5]), Number(dt[6] || 0)));
      return {
        date: isoDate(utc),
        time: `${pad(utc.getHours())}:${pad(utc.getMinutes())}`,
        allDay: false,
      };
    }
    return {
      date: `${dt[1]}-${dt[2]}-${dt[3]}`,
      time: `${dt[4]}:${dt[5]}`,
      allDay: false,
    };
  }
  return null;
}

/** Parse standard RFC 5545 iCalendar text (Google Calendar / Apple / Outlook .ics). */
export function parseIcs(icsText) {
  const unfolded = String(icsText ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]/g, '');
  const lines = unfolded.split('\n');
  const events = [];
  let current = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (trimmed === 'END:VEVENT') {
      if (current && current.title && current.startParsed) {
        const startTime = current.startParsed.allDay ? '09:00' : current.startParsed.time;
        let endTime = current.endParsed && !current.endParsed.allDay ? current.endParsed.time : null;
        if (!endTime || endTime <= startTime) {
          endTime = current.startParsed.allDay ? '10:00' : `${pad((Number(startTime.slice(0, 2)) + 1) % 24)}:${startTime.slice(3, 5)}`;
          if (endTime <= startTime) endTime = '23:59';
        }
        const occasion = detectOccasion(`${current.title} ${current.categories ?? ''} ${current.notes ?? ''}`);
        events.push({
          id: current.uid ? `ics_${current.uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24)}` : `ics_${crypto.randomUUID().slice(0, 8)}`,
          title: current.title,
          date: current.startParsed.date,
          start: startTime,
          end: endTime,
          location: current.location ?? '',
          attendees: current.attendees ?? [],
          notes: current.notes ?? '',
          ...(occasion ? { occasion } : {}),
        });
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx < 0) continue;
    const rawKey = line.slice(0, colonIdx);
    const propName = rawKey.split(';')[0].toUpperCase();
    const value = line.slice(colonIdx + 1);

    if (propName === 'UID') current.uid = unescapeIcs(value);
    else if (propName === 'SUMMARY') current.title = unescapeIcs(value);
    else if (propName === 'LOCATION') current.location = unescapeIcs(value);
    else if (propName === 'DESCRIPTION') current.notes = unescapeIcs(value).slice(0, 400);
    else if (propName === 'CATEGORIES') current.categories = unescapeIcs(value);
    else if (propName === 'DTSTART') current.startParsed = parseIcsDateTime(value);
    else if (propName === 'DTEND') current.endParsed = parseIcsDateTime(value);
    else if (propName === 'ATTENDEE') {
      const cn = rawKey.match(/CN=([^;:]+)/i)?.[1] || value.replace(/^mailto:/i, '');
      if (cn) {
        current.attendees = current.attendees ?? [];
        current.attendees.push(unescapeIcs(cn.replace(/^"|"$/g, '')));
      }
    }
  }
  return events;
}

export async function fetchIcsFeed(rawUrl) {
  const normalized = String(rawUrl ?? '').trim().replace(/^webcal:\/\//i, 'https://');
  let parsedUrl;
  try {
    parsedUrl = new URL(normalized);
  } catch {
    throw new Error('Invalid calendar feed URL.');
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('Only http://, https://, or webcal:// calendar URLs are supported.');
  }
  const res = await fetch(parsedUrl.href, {
    headers: { Accept: 'text/calendar, text/plain' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`Calendar feed returned HTTP ${res.status}.`);
  const text = await res.text();
  if (text.length > 2_000_000) throw new Error('Calendar feed exceeds 2 MB limit.');
  const events = parseIcs(text);
  if (!events.length) throw new Error('No valid VEVENT entries were found in that ICS feed.');
  return events;
}

/** Parse one Markdown (.md / .txt) note into Weave's note record shape. */
export function parseMarkdownNote(filename, content, updatedIso) {
  const raw = String(content ?? '').replace(/\r\n/g, '\n');
  let body = raw;
  const tags = new Set();

  // Frontmatter if present
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  let fmTitle = '';
  if (fm) {
    body = fm[2];
    const tMatch = fm[1].match(/^title:\s*(.+)$/m);
    if (tMatch) fmTitle = tMatch[1].replace(/^["']|["']$/g, '').trim();
    const tagBlock = fm[1].match(/^tags:\s*\[([^\]]+)\]/m);
    if (tagBlock) {
      for (const t of tagBlock[1].split(',')) {
        const clean = t.replace(/["'#\s]/g, '').toLowerCase();
        if (clean) tags.add(clean);
      }
    }
  }

  for (const m of body.matchAll(/(?:^|\s)#([a-zA-Z0-9_-]{2,24})/g)) {
    tags.add(m[1].toLowerCase());
  }
  if (/- \[( |x)\] /m.test(body)) tags.add('meeting');

  const h1 = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const baseName = path.basename(String(filename || 'Untitled'), path.extname(String(filename || '')));
  const title = fmTitle || h1 || baseName || 'Untitled note';

  return {
    id: `md_${crypto.createHash('sha1').update(`${filename}:${title}`).digest('hex').slice(0, 10)}`,
    title,
    updated: updatedIso || isoDate(new Date()),
    tags: tags.size ? [...tags] : ['imported'],
    body: body.trim(),
  };
}

/** Safely read .md/.txt files from a local folder (up to depth 2, 100 files max). */
export function readMarkdownFolder(dirPath) {
  const resolved = path.resolve(String(dirPath ?? '').trim());
  if (!resolved || !fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error('Folder path does not exist or is not a directory.');
  }
  const files = [];
  const walk = (dir, depth) => {
    if (depth > 2 || files.length >= 100) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (files.length >= 100) break;
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (/\.(md|markdown|txt)$/i.test(entry.name)) {
        const stat = fs.statSync(full);
        if (stat.size <= 256_000) {
          files.push({
            name: path.relative(resolved, full),
            content: fs.readFileSync(full, 'utf8'),
            updated: isoDate(stat.mtime),
          });
        }
      }
    }
  };
  walk(resolved, 0);
  if (!files.length) throw new Error('No .md or .txt files found in that folder.');
  return files.map((f) => parseMarkdownNote(f.name, f.content, f.updated));
}

function splitCsvRow(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function normalizeCsvDate(raw = '') {
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const slashDmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashDmy) {
    const a = Number(slashDmy[1]);
    const b = Number(slashDmy[2]);
    // Heuristic: DD/MM/YYYY if first > 12 or default DD/MM
    const day = a > 12 ? a : b > 12 ? b : a;
    const month = a > 12 ? b : b > 12 ? a : b;
    return `${slashDmy[3]}-${pad(month)}-${pad(day)}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return isoDate(d);
  return null;
}

function inferTransactionCategory(merchant = '', rawCat = '') {
  if (rawCat && rawCat.trim()) return rawCat.trim();
  const m = merchant.toLowerCase();
  if (/swiggy|zomato|quickbite|blinkit|zepto|instamart|eats/.test(m)) return 'Food delivery';
  if (/grocery|basket|fresh|mart|supermarket|organic/.test(m)) return 'Groceries';
  if (/cafe|coffee|brew|bistro|table|restaurant|dining|bakery/.test(m)) return 'Dining out';
  if (/uber|ola|metro|cab|fuel|petrol|train|flight/.test(m)) return 'Transport';
  if (/electric|bill|broadband|airtel|jio|rent|water|gas/.test(m)) return 'Bills';
  return 'Shopping';
}

/** Parse CSV bank/card statement rows into Weave transaction objects. */
export function parseStatementCsv(csvText) {
  const lines = String(csvText ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) throw new Error('CSV must include a header row and at least one transaction row.');

  const cols = splitCsvRow(lines[0]).map((c) => c.toLowerCase());
  const findCol = (...names) => cols.findIndex((c) => names.some((n) => c === n || c.includes(n)));
  const dateIdx = findCol('date', 'txn_date', 'posted', 'value date');
  const merchantIdx = findCol('merchant', 'description', 'narration', 'payee', 'particulars', 'paid to');
  const amountIdx = findCol('amount', 'debit', 'withdrawal', 'spent', 'value', 'cost');
  const catIdx = findCol('category', 'type', 'group');

  if (dateIdx < 0 || merchantIdx < 0 || amountIdx < 0) {
    throw new Error('CSV header must include date, merchant/description, and amount columns.');
  }

  const transactions = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitCsvRow(lines[i]);
    const date = normalizeCsvDate(cells[dateIdx]);
    const merchant = cells[merchantIdx]?.trim();
    const rawNum = String(cells[amountIdx] ?? '').replace(/[₹$€£,\s]/g, '');
    const amount = Math.abs(Number(rawNum));
    if (!date || !merchant || !Number.isFinite(amount) || amount === 0) continue;
    transactions.push({
      id: `txn_csv_${i}`,
      date,
      merchant,
      amount: Math.round(amount * 100) / 100,
      category: inferTransactionCategory(merchant, catIdx >= 0 ? cells[catIdx] : ''),
    });
  }

  if (!transactions.length) throw new Error('No valid transaction rows could be parsed from that CSV.');
  return transactions;
}

/** Extract checklist tasks ("- [ ] ...", "- [x] ...") or plain lines for Tasks import. */
export function parseTasksText(text, defaultList = 'Personal') {
  const tasks = [];
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const chk = line.match(/^[-*]\s*\[( |x|X)\]\s*(?:@\S+\s+)?(.+)$/);
    if (chk) {
      tasks.push({ title: chk[2].trim(), status: chk[1].toLowerCase() === 'x' ? 'done' : 'open', list: defaultList });
    } else if (!line.startsWith('#')) {
      const plain = line.replace(/^[-*]\s+/, '').trim();
      if (plain.length >= 3) tasks.push({ title: plain, status: 'open', list: defaultList });
    }
  }
  return tasks;
}

/** Parse Apple Reminders / CalDAV VTODO entries inside an .ics file. */
export function parseIcsTodos(icsText, defaultList = 'Reminders') {
  const unfolded = String(icsText ?? '').replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
  const tasks = [];
  let cur = null;
  for (const line of unfolded.split('\n')) {
    const t = line.trim();
    if (t === 'BEGIN:VTODO') { cur = {}; continue; }
    if (t === 'END:VTODO') {
      if (cur && cur.title) {
        tasks.push({
          title: cur.title,
          due: cur.due ?? null,
          status: cur.done ? 'done' : 'open',
          list: defaultList,
          notes: cur.notes ?? '',
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const prop = line.slice(0, idx).split(';')[0].toUpperCase();
    const val = line.slice(idx + 1);
    if (prop === 'SUMMARY') cur.title = unescapeIcs(val);
    else if (prop === 'DESCRIPTION') cur.notes = unescapeIcs(val).slice(0, 300);
    else if (prop === 'STATUS' && val.trim().toUpperCase() === 'COMPLETED') cur.done = true;
    else if (prop === 'DUE') {
      const parsed = parseIcsDateTime(val);
      if (parsed?.date) cur.due = parsed.date;
    }
  }
  return tasks;
}

/** Parse Google Keep Takeout JSON files (supports notes and checklists). */
export function parseGoogleKeepJson(filename, jsonText) {
  const data = JSON.parse(String(jsonText ?? '{}'));
  if (data.isTrashed) return null;
  const title = (data.title || '').trim() || path.basename(String(filename || 'Keep Note'), path.extname(String(filename || '')));
  const labels = (data.labels ?? []).map((l) => String(l.name ?? '').trim().toLowerCase()).filter(Boolean);
  let body = String(data.textContent ?? '').trim();
  if (Array.isArray(data.listContent) && data.listContent.length) {
    const lines = data.listContent.map((it) => `- [${it.isChecked ? 'x' : ' '}] @me ${String(it.text ?? '').trim()}`);
    body = body ? `${body}\n\n${lines.join('\n')}` : lines.join('\n');
    if (!labels.includes('meeting')) labels.push('checklist');
  }
  const updated = data.userEditedTimestampUsec
    ? isoDate(new Date(Math.floor(Number(data.userEditedTimestampUsec) / 1000)))
    : isoDate(new Date());
  return {
    id: `keep_${crypto.createHash('sha1').update(`${filename}:${title}`).digest('hex').slice(0, 10)}`,
    title,
    updated,
    tags: labels.length ? labels : ['keep'],
    body,
  };
}

/** Parse Todoist CSV export format (TYPE,CONTENT,DESCRIPTION,PRIORITY,DATE,...). */
export function parseTodoistCsv(csvText, defaultList = 'Todoist') {
  const lines = String(csvText ?? '').replace(/\r\n/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error('Todoist CSV needs a header row and task rows.');
  const cols = splitCsvRow(lines[0]).map((c) => c.toLowerCase());
  const contentIdx = cols.findIndex((c) => c === 'content' || c === 'task' || c === 'title');
  const typeIdx = cols.findIndex((c) => c === 'type');
  const dateIdx = cols.findIndex((c) => c === 'date' || c === 'due' || c === 'due date');
  const descIdx = cols.findIndex((c) => c === 'description' || c === 'notes');
  if (contentIdx < 0) throw new Error('CSV must include a CONTENT or Title column.');

  const out = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitCsvRow(lines[i]);
    if (typeIdx >= 0 && cells[typeIdx] && !/task/i.test(cells[typeIdx])) continue;
    const title = cells[contentIdx]?.trim();
    if (!title || title.length < 2) continue;
    const rawDate = dateIdx >= 0 ? normalizeCsvDate(cells[dateIdx]) : null;
    out.push({
      title,
      due: rawDate,
      list: defaultList,
      status: 'open',
      notes: descIdx >= 0 ? (cells[descIdx] ?? '') : '',
    });
  }
  if (!out.length) throw new Error('No task rows found in Todoist CSV.');
  return out;
}

/** Standard HTTPS CalDAV sync (Apple iCloud caldav.icloud.com with App-Specific Password, Fastmail, Nextcloud). */
export async function fetchCalDavEvents({ serverUrl = 'https://caldav.icloud.com/', username, password }) {
  if (!username || !password) throw new Error('Apple ID / username and app-specific password are required for private CalDAV sync.');
  let baseUrl = String(serverUrl || 'https://caldav.icloud.com/').trim();
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) baseUrl = `https://${baseUrl}`;
  const authHeader = `Basic ${Buffer.from(`${username.trim()}:${password.trim()}`).toString('base64')}`;

  const dav = async (targetUrl, method, depth, xmlBody) => {
    const res = await fetch(targetUrl, {
      method,
      headers: {
        Authorization: authHeader,
        Depth: String(depth),
        'Content-Type': 'application/xml; charset=utf-8',
      },
      body: xmlBody,
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401 || res.status === 403) throw new Error('CalDAV rejected these credentials (check your email and Apple App-Specific Password).');
    if (!res.ok) throw new Error(`CalDAV server returned HTTP ${res.status}.`);
    return res.text();
  };

  // 1. Discover principal -> calendar-home-set
  const origin = new URL(baseUrl).origin;
  const principalXml = await dav(
    baseUrl,
    'PROPFIND',
    0,
    `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`,
  );
  const principalHref = principalXml.match(/<(?:[a-z0-9]+:)?current-user-principal[^>]*>[\s\S]*?<(?:[a-z0-9]+:)?href[^>]*>([^<]+)<\//i)?.[1]?.trim();
  const principalUrl = principalHref ? new URL(principalHref, origin).href : baseUrl;

  const homeXml = await dav(
    principalUrl,
    'PROPFIND',
    0,
    `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>`,
  );
  const homeHref = homeXml.match(/<(?:[a-z0-9]+:)?calendar-home-set[^>]*>[\s\S]*?<(?:[a-z0-9]+:)?href[^>]*>([^<]+)<\//i)?.[1]?.trim();
  const homeUrl = homeHref ? new URL(homeHref, origin).href : principalUrl;

  // 2. List calendar collections under homeUrl
  const listXml = await dav(
    homeUrl,
    'PROPFIND',
    1,
    `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:resourcetype/><d:displayname/></d:prop></d:propfind>`,
  );
  const calUrls = [];
  for (const resp of listXml.split(/<(?:[a-z0-9]+:)?response\b/i).slice(1)) {
    if (!/<(?:[a-z0-9]+:)?calendar\b/i.test(resp)) continue;
    const href = resp.match(/<(?:[a-z0-9]+:)?href[^>]*>([^<]+)<\//i)?.[1]?.trim();
    if (href && !/inbox|outbox|notification/i.test(href)) calUrls.push(new URL(href, origin).href);
  }
  if (!calUrls.length) calUrls.push(homeUrl);

  // 3. Query events for the next 180 days & past 14 days
  const startDt = new Date();
  startDt.setDate(startDt.getDate() - 14);
  const endDt = new Date();
  endDt.setDate(endDt.getDate() + 180);
  const fmtCalUtc = (d) => `${d.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;

  const allEvents = [];
  for (const calUrl of calUrls.slice(0, 4)) {
    const reportXml = await dav(
      calUrl,
      'REPORT',
      1,
      `<?xml version="1.0" encoding="utf-8"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${fmtCalUtc(startDt)}" end="${fmtCalUtc(endDt)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`,
    ).catch(() => '');
    for (const block of reportXml.matchAll(/<(?:[a-z0-9]+:)?calendar-data[^>]*>([\s\S]*?)<\/(?:[a-z0-9]+:)?calendar-data>/gi)) {
      const decoded = block[1]
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
      allEvents.push(...parseIcs(decoded));
    }
  }
  if (!allEvents.length) throw new Error('Connected to CalDAV, but no upcoming events were found.');
  return allEvents;
}

/** Optional Google OAuth 2.0 direct Calendar + Tasks sync (when GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET are set). */
export function getGoogleOAuthConfig(port = Number(process.env.PORT) || 4321) {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
  const redirectUri = String(process.env.GOOGLE_REDIRECT_URI || `http://127.0.0.1:${port}/api/oauth/google/callback`).trim();
  return { configured: Boolean(clientId && clientSecret), clientId, clientSecret, redirectUri };
}

export function createGoogleAuthUrl({ clientId, redirectUri, state, includeDrive = false }) {
  const scopes = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/tasks.readonly',
    ...(includeDrive ? ['https://www.googleapis.com/auth/drive.readonly'] : []),
  ];
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('prompt', 'consent');
  u.searchParams.set('scope', scopes.join(' '));
  u.searchParams.set('state', state);
  return u.href;
}

/** Google Drive & Docs OAuth URL — works with personal @gmail.com accounts via drive.readonly. */
export function createGoogleNotesAuthUrl({ clientId, redirectUri, state }) {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('prompt', 'consent');
  u.searchParams.set('scope', 'https://www.googleapis.com/auth/drive.readonly');
  u.searchParams.set('state', state);
  return u.href;
}

/** Fetch Google Docs, text/Markdown notes, and Keep Takeout .json files from Google Drive. */
export async function fetchGoogleDriveNotes(accessToken) {
  const q = "trashed = false and (mimeType = 'application/vnd.google-apps.document' or mimeType = 'text/plain' or mimeType = 'text/markdown' or name contains '.md' or name contains '.txt')";
  const listUrl = new URL('https://www.googleapis.com/drive/v3/files');
  listUrl.searchParams.set('q', q);
  listUrl.searchParams.set('orderBy', 'modifiedTime desc');
  listUrl.searchParams.set('pageSize', '25');
  listUrl.searchParams.set('fields', 'files(id,name,mimeType,modifiedTime)');

  const res = await fetch(listUrl.href, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Could not list Google Docs / Drive notes.');

  const files = data.files ?? [];
  const notes = [];
  for (const file of files.slice(0, 20)) {
    const isGDoc = file.mimeType === 'application/vnd.google-apps.document';
    const contentUrl = isGDoc
      ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export?mimeType=text%2Fplain`
      : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`;
    const fileRes = await fetch(contentUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!fileRes || !fileRes.ok) continue;
    const raw = (await fileRes.text()).replace(/\r\n/g, '\n').replace(/^\uFEFF/, '').trim();
    if (!raw) continue;
    const body = raw
      .replace(/^[☐□]\s*/gm, '- [ ] @me ')
      .replace(/^[☑✓✔]\s*/gm, '- [x] @me ')
      .slice(0, 20_000);
    const updated = file.modifiedTime ? String(file.modifiedTime).slice(0, 10) : isoDate(new Date());
    const parsed = parseMarkdownNote(file.name, body, updated);
    const tags = new Set(parsed.tags ?? []);
    tags.delete('imported');
    tags.add('google-docs');
    notes.push({
      id: `gdrive_${String(file.id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24)}`,
      title: parsed.title || file.name,
      updated,
      tags: [...tags],
      body: parsed.body,
    });
  }
  return notes;
}

/** Workspace-only Google Keep OAuth helper (not valid for personal @gmail.com accounts). */
export function createGoogleKeepAuthUrl({ clientId, redirectUri, state }) {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('prompt', 'consent');
  u.searchParams.set('scope', 'https://www.googleapis.com/auth/keep.readonly');
  u.searchParams.set('state', state);
  return u.href;
}

/** Fetch all notes from Google Keep API (requires keep.readonly OAuth token). */
export async function fetchGoogleKeepNotes(accessToken) {
  let notes = [];
  let pageToken = null;
  do {
    const url = new URL('https://keep.googleapis.com/v1/notes');
    url.searchParams.set('pageSize', '100');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url.href, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Could not fetch Google Keep notes.');
    const batch = (data.notes ?? []).filter((n) => !n.trashed);
    for (const n of batch) {
      const title = (n.title || '').trim();
      let body = '';
      let tags = [];
      if (n.body?.text?.text) {
        body = n.body.text.text.trim();
      } else if (n.body?.list?.listItems?.length) {
        // Checklist note → convert items to Markdown checkboxes
        body = n.body.list.listItems
          .map((item) => `- [${item.checked ? 'x' : ' '}] ${item.text?.text || ''}`)
          .join('\n');
        tags.push('checklist');
      }
      if (n.labels?.length) tags.push(...n.labels.map((l) => (l.name || '').toLowerCase().replace(/\s+/g, '-')).filter(Boolean));
      if (n.color && n.color !== 'DEFAULT') tags.push(n.color.toLowerCase());
      notes.push({
        id: `keep_${String(n.name || '').split('/').pop().slice(0, 20)}`,
        title: title || body.slice(0, 60) || 'Untitled Note',
        body,
        tags: [...new Set(tags)],
        updated: n.updateTime ? String(n.updateTime).slice(0, 10) : null,
        pinned: Boolean(n.pinned),
      });
    }
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return notes;
}

export async function exchangeGoogleCode({ code, clientId, clientSecret, redirectUri }) {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(12_000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'Google OAuth exchange failed.');
  return data;
}

export async function refreshGoogleToken({ refreshToken, clientId, clientSecret }) {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(12_000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'Google OAuth refresh failed.');
  return data;
}

export async function fetchGoogleCalendarEvents(accessToken) {
  const timeMin = new Date(Date.now() - 14 * 86400_000).toISOString();
  const timeMax = new Date(Date.now() + 180 * 86400_000).toISOString();
  const u = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  u.searchParams.set('timeMin', timeMin);
  u.searchParams.set('timeMax', timeMax);
  u.searchParams.set('singleEvents', 'true');
  u.searchParams.set('orderBy', 'startTime');
  u.searchParams.set('maxResults', '200');
  const res = await fetch(u.href, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(12_000) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Could not fetch Google Calendar events.');

  return (data.items ?? [])
    .filter((ev) => ev.status !== 'cancelled' && ev.start)
    .map((ev) => {
      const startIso = ev.start.dateTime || ev.start.date;
      const endIso = ev.end?.dateTime || ev.end?.date;
      const allDay = Boolean(ev.start.date && !ev.start.dateTime);
      const sd = new Date(allDay ? `${startIso}T09:00:00` : startIso);
      const ed = endIso ? new Date(allDay ? `${endIso}T10:00:00` : endIso) : new Date(sd.getTime() + 3600_000);
      const start = allDay ? '09:00' : `${pad(sd.getHours())}:${pad(sd.getMinutes())}`;
      let end = allDay ? '10:00' : `${pad(ed.getHours())}:${pad(ed.getMinutes())}`;
      if (end <= start) end = '23:59';
      const title = ev.summary || '(No title)';
      const occasion = detectOccasion(`${title} ${ev.description ?? ''}`);
      return {
        id: `gcal_${ev.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24)}`,
        title,
        date: allDay ? startIso : isoDate(sd),
        start,
        end,
        location: ev.location ?? '',
        attendees: (ev.attendees ?? []).map((a) => a.displayName || a.email).filter(Boolean),
        notes: String(ev.description ?? '').slice(0, 300),
        ...(occasion ? { occasion } : {}),
      };
    });
}

export async function fetchGoogleTasks(accessToken) {
  const res = await fetch('https://www.googleapis.com/tasks/v1/lists/@default/tasks?showCompleted=true&maxResults=100', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(12_000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Could not fetch Google Tasks.');
  return (data.items ?? [])
    .filter((t) => t.title)
    .map((t) => ({
      title: t.title.trim(),
      due: t.due ? String(t.due).slice(0, 10) : null,
      list: 'Google Tasks',
      status: t.status === 'completed' ? 'done' : 'open',
      notes: t.notes ?? '',
    }));
}

/** Public OpenGraph preview helper (only plain HTTP 200 pages; never bypasses auth/CAPTCHA/blocks). */
export async function fetchWishlistUrlMetadata(rawUrl) {
  const parsed = new URL(String(rawUrl ?? '').trim());
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Enter an http:// or https:// product URL.');
  const res = await fetch(parsed.href, {
    headers: { Accept: 'text/html' },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) {
    throw new Error(`Product page returned HTTP ${res.status} — please fill product details manually.`);
  }
  const html = (await res.text()).slice(0, 200_000);
  if (/captcha|cf-turnstile|verify you are human|access denied/i.test(html)) {
    throw new Error('This storefront blocks automated preview — please enter product details manually.');
  }
  const meta = (prop) => {
    const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))
      || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'));
    return m ? m[1].trim() : '';
  };
  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || '';
  const name = meta('og:title') || meta('twitter:title') || titleTag;
  const image = meta('og:image') || meta('twitter:image');
  const brand = meta('product:brand') || meta('og:site_name') || parsed.hostname.replace(/^www\./, '').split('.')[0];
  const priceStr = meta('product:price:amount') || meta('og:price:amount');
  const price = priceStr && Number.isFinite(Number(priceStr)) ? Number(priceStr) : undefined;
  return { name, brand, image, url: parsed.href, price };
}


