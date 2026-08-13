export type InstallState = "unsupported" | "available" | "installed" | "unknown";

export type PwaUpdateStrategy = "prompt" | "immediate" | "deferred";

export type ServiceWorkerRegistrationResult = {
  registered: boolean;
  reason?: string;
};

export type RegisterSWOptions = {
  immediate?: boolean;
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
  onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
  onRegisterError?: (error: unknown) => void;
};

export type RegisterSW = (options?: RegisterSWOptions) => (reloadPage?: boolean) => Promise<void>;

/**
 * Service worker / install boundary.
 * Registration uses vite-plugin-pwa (Workbox) in production builds.
 * Updates use prompt strategy so field sessions are not force-reloaded.
 */
export type ServiceWorkerBoundary = {
  register(): Promise<ServiceWorkerRegistrationResult>;
  getInstallState(): Promise<InstallState>;
  getUpdateStrategy(): PwaUpdateStrategy;
  /** True when a waiting worker is ready; user must opt in via applyUpdate. */
  isUpdateAvailable(): boolean;
  subscribeUpdateAvailable(listener: (available: boolean) => void): () => void;
  /** Activate waiting worker and reload — only after explicit user action. */
  applyUpdate(): Promise<void>;
  /** Dismiss update banner without applying (stays available until next navigation cycle). */
  dismissUpdatePrompt(): void;
  isUpdatePromptDismissed(): boolean;
  isOfflineReady(): boolean;
  subscribeOfflineReady(listener: (ready: boolean) => void): () => void;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function createNoopServiceWorkerBoundary(): ServiceWorkerBoundary {
  return {
    async register() {
      return { registered: false, reason: "noop" };
    },
    async getInstallState() {
      return "unsupported";
    },
    getUpdateStrategy() {
      return "prompt";
    },
    isUpdateAvailable() {
      return false;
    },
    subscribeUpdateAvailable() {
      return () => undefined;
    },
    async applyUpdate() {
      return;
    },
    dismissUpdatePrompt() {
      return;
    },
    isUpdatePromptDismissed() {
      return false;
    },
    isOfflineReady() {
      return false;
    },
    subscribeOfflineReady() {
      return () => undefined;
    },
  };
}

export type PromptServiceWorkerDeps = {
  /** Injected in tests; production loads `virtual:pwa-register`. */
  loadRegisterSW?: () => Promise<RegisterSW>;
};

/**
 * Production boundary: Workbox via virtual:pwa-register, prompt-for-update,
 * and beforeinstallprompt tracking. Never clears IndexedDB.
 */
export function createPromptServiceWorkerBoundary(
  deps: PromptServiceWorkerDeps = {},
): ServiceWorkerBoundary {
  const updateListeners = new Set<(available: boolean) => void>();
  const offlineListeners = new Set<(ready: boolean) => void>();
  let updateAvailable = false;
  let updateDismissed = false;
  let offlineReady = false;
  let registered = false;
  let deferredPrompt: BeforeInstallPromptEvent | null = null;
  let applyUpdateFn: ((reloadPage?: boolean) => Promise<void>) | null = null;
  let displayModeInstalled = false;

  function notifyUpdate() {
    for (const listener of updateListeners) listener(updateAvailable && !updateDismissed);
  }

  function notifyOffline() {
    for (const listener of offlineListeners) listener(offlineReady);
  }

  function syncDisplayMode() {
    if (typeof window === "undefined") return;
    displayModeInstalled =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
  }

  if (typeof window !== "undefined") {
    syncDisplayMode();
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredPrompt = event as BeforeInstallPromptEvent;
    });
    window.addEventListener("appinstalled", () => {
      deferredPrompt = null;
      displayModeInstalled = true;
    });
  }

  async function loadRegisterSW(): Promise<RegisterSW> {
    if (deps.loadRegisterSW) return deps.loadRegisterSW();
    const mod = await import("virtual:pwa-register");
    return mod.registerSW;
  }

  return {
    async register() {
      if (registered) {
        return { registered: true, reason: "already-registered" };
      }
      if (typeof window === "undefined") {
        return { registered: false, reason: "no-window" };
      }
      if (!("serviceWorker" in navigator)) {
        return { registered: false, reason: "unsupported" };
      }

      try {
        const registerSW = await loadRegisterSW();
        applyUpdateFn = registerSW({
          immediate: true,
          onNeedRefresh() {
            updateAvailable = true;
            updateDismissed = false;
            notifyUpdate();
          },
          onOfflineReady() {
            offlineReady = true;
            notifyOffline();
          },
          onRegisteredSW(_swUrl, registration) {
            if (registration) {
              const hour = 60 * 60 * 1000;
              window.setInterval(() => {
                void registration.update();
              }, hour);
            }
          },
        });
        registered = true;
        syncDisplayMode();
        return { registered: true };
      } catch (error) {
        return {
          registered: false,
          reason: error instanceof Error ? error.message : "register-failed",
        };
      }
    },

    async getInstallState() {
      syncDisplayMode();
      if (typeof window === "undefined") return "unsupported";
      if (!("serviceWorker" in navigator)) return "unsupported";
      if (displayModeInstalled) return "installed";
      if (deferredPrompt) return "available";
      return "unknown";
    },

    getUpdateStrategy() {
      return "prompt";
    },

    isUpdateAvailable() {
      return updateAvailable && !updateDismissed;
    },

    subscribeUpdateAvailable(listener) {
      updateListeners.add(listener);
      listener(updateAvailable && !updateDismissed);
      return () => {
        updateListeners.delete(listener);
      };
    },

    async applyUpdate() {
      if (!applyUpdateFn) return;
      updateDismissed = false;
      await applyUpdateFn(true);
    },

    dismissUpdatePrompt() {
      updateDismissed = true;
      notifyUpdate();
    },

    isUpdatePromptDismissed() {
      return updateDismissed;
    },

    isOfflineReady() {
      return offlineReady;
    },

    subscribeOfflineReady(listener) {
      offlineListeners.add(listener);
      listener(offlineReady);
      return () => {
        offlineListeners.delete(listener);
      };
    },
  };
}
