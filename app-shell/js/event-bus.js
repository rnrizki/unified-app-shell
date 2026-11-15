/**
 * Cross-App Event Bus (Tier 2: Container & Identity Layer)
 * Implements window.postMessage bridge with strict origin validation
 * based on allowedOrigins specified in app-registry.json
 */
class CrossAppEventBus {
  constructor() {
    this.allowedOrigins = new Set();
    this.handlers = new Map();
    this.targetFrame = null;
    this.activeAppOrigin = null;

    // Attach native postMessage listener
    window.addEventListener('message', this.handleIncomingMessage.bind(this));
  }

  setTargetFrame(iframeElement, appOrigin) {
    this.targetFrame = iframeElement;
    this.activeAppOrigin = appOrigin || '*';
  }

  updateAllowedOrigins(origins) {
    if (Array.isArray(origins)) {
      origins.forEach(orig => this.allowedOrigins.add(orig));
    }
  }

  on(eventType, callback) {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType).push(callback);
  }

  emitToChild(type, payload = {}) {
    if (!this.targetFrame || !this.targetFrame.contentWindow) {
      console.warn('[EventBus] No active child frame to emit message');
      return;
    }
    const message = {
      source: 'UNIFIED_APP_SHELL',
      timestamp: Date.now(),
      type,
      payload
    };
    const targetOrigin = (this.activeAppOrigin && this.activeAppOrigin !== '*') ? this.activeAppOrigin : '*';
    this.targetFrame.contentWindow.postMessage(message, targetOrigin);
    this.flashBusIndicator();
  }

  handleIncomingMessage(event) {
    // 1. Validate data structure
    if (!event.data || typeof event.data !== 'object' || event.data.source === 'UNIFIED_APP_SHELL') {
      return;
    }

    // 2. Strict Origin Validation
    const isOriginAllowed = this.allowedOrigins.has(event.origin) || 
                            event.origin === window.location.origin ||
                            event.origin.endsWith('.lmrei.id');

    if (!isOriginAllowed) {
      console.warn(`[EventBus] Rejected message from unauthorized origin: ${event.origin}`, event.data);
      return;
    }

    this.flashBusIndicator();

    const { type, payload } = event.data;
    if (this.handlers.has(type)) {
      this.handlers.get(type).forEach(cb => {
        try {
          cb(payload, event.origin);
        } catch (err) {
          console.error(`[EventBus] Error executing handler for ${type}:`, err);
        }
      });
    }
  }

  flashBusIndicator() {
    const indicator = document.getElementById('eventBusIndicator');
    if (indicator) {
      indicator.style.borderColor = '#38bdf8';
      indicator.style.background = 'rgba(56, 189, 248, 0.2)';
      setTimeout(() => {
        indicator.style.borderColor = '';
        indicator.style.background = '';
      }, 500);
    }
  }
}

window.eventBus = new CrossAppEventBus();
