/**
 * Unified App Shell Controller (Tier 2: Container Layer)
 * Lightweight bundle (< 15 KB), pure Vanilla JS, zero external dependencies.
 */
class UnifiedAppShell {
  constructor() {
    this.currentUser = null;
    this.currentApp = null;
    this.currentTheme = localStorage.getItem('shell_theme') || 'dark';
    this.notifications = [];
    this.unreadCount = 0;

    this.init();
  }

  async init() {
    this.applyTheme(this.currentTheme);
    this.bindDOMEvents();
    this.bindBusEvents();

    // 1. Load active user session
    await this.resolveSession();

    // 2. Load application registry
    await window.appRegistry.loadRegistry();
    this.renderAppSwitcher();

    // 3. Mount initial application from URL hash or first accessible app
    this.mountInitialApp();
  }

  async resolveSession() {
    try {
      // Try local reverse-proxied /api/auth/session first
      let res = await fetch('/api/auth/session', { credentials: 'include' });
      if (!res.ok) {
        // Try direct user-shell-login if available
        res = await fetch('https://user-shell-login.lmrei.id/api/auth/session', { credentials: 'include' });
      }

      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          this.currentUser = data.user;
          this.updateUserUI();
          return;
        }
      }
    } catch (err) {
      console.warn('[Shell] Session check via API failed, checking cookie fallback:', err);
    }

    // Check document.cookie fallback
    const cookieUser = this.getCookie('portal_user');
    if (cookieUser) {
      try {
        this.currentUser = JSON.parse(decodeURIComponent(cookieUser));
        this.updateUserUI();
        return;
      } catch (e) {}
    }

    // Default guest state
    this.currentUser = {
      name: "Guest User",
      email: "guest@lmrei.id",
      roles: ["member"]
    };
    this.updateUserUI();
  }

  updateUserUI() {
    const user = this.currentUser;
    const nameEl = document.getElementById('userDisplayName');
    const roleEl = document.getElementById('userPrimaryRole');
    const avatarEl = document.getElementById('userAvatar');
    const menuName = document.getElementById('menuUserName');
    const menuEmail = document.getElementById('menuUserEmail');
    const menuRoles = document.getElementById('menuUserRoles');
    const roleFilterBadge = document.getElementById('userRoleFilterBadge');

    if (nameEl) nameEl.textContent = user.name || user.email.split('@')[0];
    if (roleEl) roleEl.textContent = (user.roles && user.roles[0]) ? user.roles[0].toUpperCase() : 'USER';
    if (avatarEl) avatarEl.textContent = (user.name ? user.name[0] : 'U').toUpperCase();
    if (menuName) menuName.textContent = user.name || 'User';
    if (menuEmail) menuEmail.textContent = user.email || 'user@lmrei.id';

    if (menuRoles) {
      menuRoles.innerHTML = '';
      (user.roles || []).forEach(r => {
        const badge = document.createElement('span');
        badge.className = `role-badge ${r}`;
        badge.textContent = r;
        menuRoles.appendChild(badge);
      });
    }

    if (roleFilterBadge) {
      roleFilterBadge.textContent = `Akses Aktif: ${(user.roles || []).join(', ') || 'member'}`;
    }
  }

  mountInitialApp() {
    const hash = window.location.hash.replace('#', '');
    const apps = window.appRegistry.apps;
    let targetApp = null;

    if (hash) {
      targetApp = window.appRegistry.getApp(hash);
    }

    if (!targetApp) {
      // Find first app accessible to this user
      targetApp = apps.find(a => window.appRegistry.hasAccess(a, this.currentUser.roles)) || apps[0];
    }

    if (targetApp) {
      this.switchApp(targetApp.id);
    }
  }

  switchApp(appId) {
    const app = window.appRegistry.getApp(appId);
    if (!app) return;

    const userRoles = this.currentUser ? this.currentUser.roles : [];
    if (!window.appRegistry.hasAccess(app, userRoles)) {
      alert(`Akses ditolak: Aplikasi "${app.name}" membutuhkan role [${app.requiredRoles.join(', ')}]. Role Anda saat ini: [${userRoles.join(', ')}]`);
      return;
    }

    this.currentApp = app;
    window.location.hash = app.id;

    // Update Topbar UI
    const nameEl = document.getElementById('activeAppName');
    const modeEl = document.getElementById('activeAppMode');
    if (nameEl) nameEl.textContent = app.name;
    if (modeEl) modeEl.textContent = app.embedMode;

    // Smart Iframe Handling
    const frame = document.getElementById('appFrame');
    const loadingIndicator = document.getElementById('iframeLoadingIndicator');

    if (loadingIndicator) loadingIndicator.classList.remove('hidden');

    // Register target frame with event bus
    const appOrigin = app.entryUrl.startsWith('http') ? new URL(app.entryUrl).origin : window.location.origin;
    window.eventBus.setTargetFrame(frame, appOrigin);

    // Frame onload listener
    frame.onload = () => {
      if (loadingIndicator) loadingIndicator.classList.add('hidden');
      // Dispatch session initialization to child app
      this.dispatchSessionToChild();
    };

    frame.src = app.entryUrl;

    // Close switcher modal if open
    this.closeSwitcher();
  }

  dispatchSessionToChild() {
    if (!this.currentApp) return;
    const sessionToken = this.getCookie('portal_session') || 'demo_oidc_jwt_token';
    window.eventBus.emitToChild('SHELL:INIT_SESSION', {
      user: this.currentUser,
      token: sessionToken,
      theme: this.currentTheme,
      appId: this.currentApp.id
    });
  }

  bindBusEvents() {
    // Child sends badge update
    window.eventBus.on('APP:SET_BADGE', (payload) => {
      this.addNotification({
        id: Date.now(),
        appId: payload.appId || (this.currentApp ? this.currentApp.id : 'app'),
        title: payload.title || 'Pemberitahuan dari Aplikasi',
        message: payload.message || `Badge update: ${payload.count || 1}`,
        time: new Date().toLocaleTimeString()
      });
      if (payload.count !== undefined) {
        this.setUnreadBadge(payload.count);
      }
    });

    // Child requests navigation
    window.eventBus.on('APP:NAVIGATE', (payload) => {
      if (payload && payload.targetAppId) {
        this.switchApp(payload.targetAppId);
      }
    });

    // Child reports ready
    window.eventBus.on('APP:READY', () => {
      this.dispatchSessionToChild();
    });

    // Child requests logout
    window.eventBus.on('APP:LOGOUT', () => {
      this.handleLogout();
    });
  }

  addNotification(notif) {
    this.notifications.unshift(notif);
    this.unreadCount++;
    this.updateNotificationUI();
  }

  setUnreadBadge(count) {
    this.unreadCount = count;
    this.updateNotificationUI();
  }

  updateNotificationUI() {
    const badge = document.getElementById('unreadBadge');
    const list = document.getElementById('notificationList');

    if (badge) {
      if (this.unreadCount > 0) {
        badge.textContent = this.unreadCount > 9 ? '9+' : this.unreadCount;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    if (list) {
      if (this.notifications.length === 0) {
        list.innerHTML = '<div class="empty-state">Belum ada notifikasi baru</div>';
      } else {
        list.innerHTML = this.notifications.map(n => `
          <div class="notification-item">
            <strong style="color:var(--text-main);">${this.escapeHtml(n.title)}</strong>
            <span style="color:var(--text-muted);">${this.escapeHtml(n.message)}</span>
            <small style="color:#64748b; font-size:10px;">${n.time} • ${n.appId}</small>
          </div>
        `).join('');
      }
    }
  }

  applyTheme(theme) {
    this.currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('shell_theme', theme);

    const darkIcon = document.getElementById('themeIconDark');
    const lightIcon = document.getElementById('themeIconLight');
    if (darkIcon && lightIcon) {
      if (theme === 'dark') {
        darkIcon.classList.remove('hidden');
        lightIcon.classList.add('hidden');
      } else {
        darkIcon.classList.add('hidden');
        lightIcon.classList.remove('hidden');
      }
    }

    // Broadcast theme change to active child app
    window.eventBus.emitToChild('SHELL:SET_THEME', { theme });
  }

  toggleTheme() {
    const nextTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.applyTheme(nextTheme);
  }

  renderAppSwitcher() {
    const container = document.getElementById('appsGridContainer');
    if (!container) return;

    const apps = window.appRegistry.apps;
    const userRoles = this.currentUser ? this.currentUser.roles : [];

    container.innerHTML = apps.map(app => {
      const hasAccess = window.appRegistry.hasAccess(app, userRoles);
      const rolesText = app.requiredRoles && app.requiredRoles.length ? app.requiredRoles.join(', ') : 'All';
      
      return `
        <div class="app-card ${hasAccess ? '' : 'locked'}" data-app-id="${app.id}">
          <div class="app-card-top">
            <span class="app-card-title">${this.escapeHtml(app.name)}</span>
            <span class="mode-tag">${app.embedMode}</span>
          </div>
          <div class="app-card-desc">${app.routePrefix} • ${app.entryUrl}</div>
          <div class="app-card-meta">
            <span class="required-roles-tag">Peran: [${rolesText}]</span>
            <span class="access-status">${hasAccess ? '🟢 Akses Diberikan' : '🔒 Terkunci'}</span>
          </div>
        </div>
      `;
    }).join('');

    // Bind card clicks
    container.querySelectorAll('.app-card').forEach(card => {
      card.addEventListener('click', () => {
        const appId = card.getAttribute('data-app-id');
        this.switchApp(appId);
      });
    });
  }

  openSwitcher() {
    this.renderAppSwitcher();
    const overlay = document.getElementById('switcherOverlay');
    if (overlay) overlay.classList.remove('hidden');
  }

  closeSwitcher() {
    const overlay = document.getElementById('switcherOverlay');
    if (overlay) overlay.classList.add('hidden');
  }

  bindDOMEvents() {
    // App Switcher toggle
    const switcherBtn = document.getElementById('appSwitcherBtn');
    const closeSwitcherBtn = document.getElementById('closeSwitcherBtn');
    const overlay = document.getElementById('switcherOverlay');

    if (switcherBtn) switcherBtn.addEventListener('click', () => this.openSwitcher());
    if (closeSwitcherBtn) closeSwitcherBtn.addEventListener('click', () => this.closeSwitcher());
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.closeSwitcher();
      });
    }

    // Theme toggle
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) themeBtn.addEventListener('click', () => this.toggleTheme());

    // Notification dropdown
    const notifBtn = document.getElementById('notificationBtn');
    const notifPanel = document.getElementById('notificationPanel');
    const clearNotifBtn = document.getElementById('clearNotificationsBtn');

    if (notifBtn && notifPanel) {
      notifBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        notifPanel.classList.toggle('hidden');
        if (!notifPanel.classList.contains('hidden')) {
          this.unreadCount = 0;
          this.updateNotificationUI();
        }
      });
    }

    if (clearNotifBtn) {
      clearNotifBtn.addEventListener('click', () => {
        this.notifications = [];
        this.unreadCount = 0;
        this.updateNotificationUI();
      });
    }

    // User profile dropdown
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userPanel = document.getElementById('userDropdownPanel');
    if (userMenuBtn && userPanel) {
      userMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        userPanel.classList.toggle('hidden');
      });
    }

    // Global click to close panels
    document.addEventListener('click', () => {
      if (notifPanel) notifPanel.classList.add('hidden');
      if (userPanel) userPanel.classList.add('hidden');
    });

    // Global Search
    const searchInput = document.getElementById('globalSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const cards = document.querySelectorAll('.app-card');
        cards.forEach(card => {
          const text = card.textContent.toLowerCase();
          card.style.display = text.includes(query) ? '' : 'none';
        });
        if (query.trim().length > 0) {
          this.openSwitcher();
        }
      });

      // '/' shortcut to focus search
      document.addEventListener('keydown', (e) => {
        if (e.key === '/' && document.activeElement !== searchInput) {
          e.preventDefault();
          searchInput.focus();
        } else if (e.key === 'Escape') {
          this.closeSwitcher();
        }
      });
    }

    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.handleLogout());
    }
  }

  handleLogout() {
    window.location.href = 'https://user-shell-login.lmrei.id/api/auth/logout';
  }

  getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
  }

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.shell = new UnifiedAppShell();
});
