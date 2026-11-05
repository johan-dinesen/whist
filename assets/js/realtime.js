import {getWhistClient} from './supabase-client.js';

// Listen to a revision counter, never to the protected game tables themselves.
// Existing modules already update when they receive "whist:datachanged".
const SIGNAL_TABLE = 'whist_change_signal';
const DEBOUNCE_MS = 250;
const previewMode = new URLSearchParams(window.location.search).has('preview');
let client = null;
let channel = null;
let lastRevision = null;
let checking = null;
let refreshTimer = null;
let playersChanged = false;

function scheduleRefresh(needPlayers = false) {
  playersChanged ||= needPlayers;
  if (refreshTimer !== null) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    const kind = playersChanged ? 'players' : 'games';
    playersChanged = false;
    window.dispatchEvent(new CustomEvent('whist:datachanged', {
      detail: {kind, origin: 'realtime'}
    }));
  }, DEBOUNCE_MS);
}

function acceptRevision(record, catchUp = false) {
  const next = Number(record?.revision);
  if (!Number.isSafeInteger(next) || next < 0) return;
  if (lastRevision === null) {
    lastRevision = next;
    return;
  }
  if (next <= lastRevision) return;
  lastRevision = next;
  // A catch-up read may span multiple types of change. Refresh the player
  // list too, rather than assuming that only the last changed table matters.
  scheduleRefresh(catchUp || record.source === 'players');
}

async function checkRevision() {
  if (!client || checking) return checking;
  checking = (async () => {
    const {data, error} = await client.from(SIGNAL_TABLE)
      .select('revision,source').eq('id', 1).single();
    if (error) throw error;
    acceptRevision(data, true);
  })();
  try { return await checking; }
  finally { checking = null; }
}

function subscribeRealtime() {
  if (channel || !client) return;
  channel = client.channel('whist-change-signal')
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: SIGNAL_TABLE
    }, payload => acceptRevision(payload.new))
    .subscribe((status, error) => {
      if (status === 'SUBSCRIBED') {
        void checkRevision().catch(err => console.warn('Whist Realtime check:', err));
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('Whist Realtime connection:', status, error ?? '');
      }
    });
}

async function initRealtime() {
  if (previewMode) return;
  try {
    client = await getWhistClient();
    // Read before subscribing and again after connecting. That closes the
    // gap where an event could occur while the WebSocket is connecting.
    await checkRevision();
    subscribeRealtime();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void checkRevision().catch(console.warn);
    });
    window.addEventListener('online', () => void checkRevision().catch(console.warn));
    window.addEventListener('focus', () => void checkRevision().catch(console.warn));
    window.addEventListener('whist:pagechange', () => {
      // Also catches changes missed while a phone has suspended its tab.
      void checkRevision().catch(console.warn);
    });
    // iOS Safari can restore pages from the back-forward cache. Reconnect
    // when restored, and compare revisions to recover any missed changes.
    window.addEventListener('pagehide', () => {
      if (channel) void client.removeChannel(channel);
      channel = null;
    });
    window.addEventListener('pageshow', () => {
      if (!channel) subscribeRealtime();
      void checkRevision().catch(console.warn);
    });
  } catch (error) {
    // Database notifications are optional: registration and existing modules
    // must remain functional even if this SQL migration is not yet installed.
    console.warn('Whist Realtime unavailable:', error);
  }
}

void initRealtime();
