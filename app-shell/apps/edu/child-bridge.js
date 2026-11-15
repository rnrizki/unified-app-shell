/**
 * Child App Event Bus Client (postMessage bridge)
 */
let badgeCounter = 1;

window.addEventListener('message', (event) => {
  // Validate structure
  if (!event.data || event.data.source !== 'UNIFIED_APP_SHELL') return;

  const { type, payload } = event.data;
  logEvent(`Menerima pesan: ${type} dari origin ${event.origin}`);

  switch (type) {
    case 'SHELL:INIT_SESSION':
      handleInitSession(payload);
      break;
    case 'SHELL:SET_THEME':
      handleSetTheme(payload);
      break;
    default:
      console.log('[Child] Unhandled event type:', type);
  }
});

function handleInitSession(payload) {
  if (payload.user) {
    document.getElementById('userName').textContent = payload.user.name || '-';
    document.getElementById('userEmail').textContent = payload.user.email || '-';
    document.getElementById('userRoles').textContent = (payload.user.roles || []).join(', ') || 'member';
  }
  if (payload.theme) {
    document.body.setAttribute('data-theme', payload.theme);
  }
  logEvent(`Sesi berhasil dimuat untuk ${payload.user?.email || 'User'}`);
}

function handleSetTheme(payload) {
  if (payload.theme) {
    document.body.setAttribute('data-theme', payload.theme);
    logEvent(`Tema disinkronkan ke: ${payload.theme}`);
  }
}

function sendBadgeToShell() {
  const count = badgeCounter++;
  const msg = {
    source: 'CHILD_APP',
    type: 'APP:SET_BADGE',
    payload: {
      appId: 'portal-edukasi',
      title: 'Tugas Baru Diterbitkan',
      message: `Modul Pembelajaran #${count} siap dipelajari!`,
      count: count
    }
  };
  window.parent.postMessage(msg, '*');
  logEvent(`Mengirim APP:SET_BADGE (Count: ${count}) ke Shell Container`);
}

function navigateToApp(targetId) {
  const msg = {
    source: 'CHILD_APP',
    type: 'APP:NAVIGATE',
    payload: { targetAppId: targetId }
  };
  window.parent.postMessage(msg, '*');
  logEvent(`Mengirim APP:NAVIGATE ke target "${targetId}"`);
}

function logEvent(text) {
  const logBox = document.getElementById('eventLogs');
  if (logBox) {
    const item = document.createElement('div');
    item.className = 'log-item';
    item.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
    logBox.prepend(item);
  }
}

// Announce ready to Shell
window.parent.postMessage({ source: 'CHILD_APP', type: 'APP:READY', payload: {} }, '*');
