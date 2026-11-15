/**
 * Declarative Application Registry Loader
 * Loads and caches app-registry.json conforming to Page 3 of the PDF specification
 */
class AppRegistryLoader {
  constructor() {
    this.version = "1.0.0";
    this.apps = [];
    this.appsById = new Map();
  }

  async loadRegistry() {
    try {
      const response = await fetch('/app-registry.json?t=' + Date.now());
      if (!response.ok) {
        throw new Error(`Failed to load app-registry.json: HTTP ${response.status}`);
      }
      const data = await response.json();
      this.version = data.containerVersion || "1.0.0";
      this.apps = data.apps || [];
      this.appsById.clear();

      // Collect all allowed origins for the EventBus
      const allAllowedOrigins = [];
      this.apps.forEach(app => {
        this.appsById.set(app.id, app);
        if (app.allowedOrigins && Array.isArray(app.allowedOrigins)) {
          allAllowedOrigins.push(...app.allowedOrigins);
        }
      });

      if (window.eventBus) {
        window.eventBus.updateAllowedOrigins(allAllowedOrigins);
      }

      return {
        version: this.version,
        apps: this.apps
      };
    } catch (err) {
      console.error('[RegistryLoader] Error loading registry:', err);
      return { version: "1.0.0", apps: [] };
    }
  }

  getApp(id) {
    return this.appsById.get(id);
  }

  hasAccess(app, userRoles = []) {
    if (!app.requiredRoles || app.requiredRoles.length === 0) {
      return true;
    }
    // Admin has universal access
    if (userRoles.includes('admin')) {
      return true;
    }
    // Check if user has at least one of the required roles
    return app.requiredRoles.some(role => userRoles.includes(role));
  }
}

window.appRegistry = new AppRegistryLoader();
