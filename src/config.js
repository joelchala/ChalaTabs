/**
 * Configuracion centralizada de ChalaTabs (Suite Chala).
 * Modifica PAYPAL_DONATE_URL y GITHUB_REPO_URL segun tu repositorio o enlace de donaciones.
 */
export const CONFIG = {
  APP_NAME: "ChalaTabs",
  VERSION: "1.0.0",
  PAYPAL_DONATE_URL: "https://www.paypal.com/ncp/payment/VSWPSS7D4ZRH2",
  GITHUB_REPO_URL: "https://github.com/joelchala/ChalaTabs",
  SUITE_LINKS: {
    chalablock: "https://github.com/joelchala/Chalablock",
    chalavpn: "https://github.com/joelchala/ChalaVPN"
  },
  PROTECTED_URL_PREFIXES: [
    "chrome://",
    "edge://",
    "about:",
    "file://",
    "chrome-extension://",
    "extension://",
    "devtools://",
    "view-source:"
  ],
  ESTIMATED_MB_PER_DISCARDED_TAB: 65,
  AUTOSUSPEND_ALARM_NAME: "chalatabs-autosuspend-alarm",
  AUTOSUSPEND_CHECK_INTERVAL_MINUTES: 1,
  DEFAULT_SETTINGS: {
    autoSuspendMinutes: 30
  },
  STORAGE_KEYS: {
    WORKSPACES: "chalatabs_workspaces",
    SETTINGS: "chalatabs_settings",
    TAB_ACTIVITY: "chalatabs_tab_activity"
  },
  WORKSPACE_COLORS: [
    "#10B981",
    "#06B6D4",
    "#3B82F6",
    "#8B5CF6",
    "#F59E0B",
    "#F43F5E"
  ],
  COLORS: {
    PRIMARY: "#10B981",
    ACCENT: "#06B6D4",
    BG_DARK: "#0F172A",
    SURFACE: "#1E293B",
    TEXT_MAIN: "#F8FAFC"
  }
};
