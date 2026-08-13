import { color } from "chart.js/helpers";

// src/views/theme/colors/apptheme.js
export const apptheme = {
  // =========================================================
  // 1) GLOBAL COLORS (used across many components)
  // =========================================================
  // Changes in:
  // - Login.js: button text/bg, links, card text
  // - Register.js: links, buttons, borders, text
  // - Dashboard.js: cards, text, borders (when you replace hardcoded colors)
  // - Sidebar.js: sidebar background + text (when you replace hardcoded colors)
  colors: {
    primary: "#4b2c88",       // main brand color (titles, links, sidebar bg)
    primary2: "#6062ee",      // secondary brand color (buttons, accents)
    white: "#ffffff",
    black: "#000000",
    mutedText: "#6b7280",
    cardBg: "#ffffff",        // default card background
    border: "rgba(15,23,42,0.08)", // default border for cards/sections
  },

  // =========================================================
  // 2) PAGE BACKGROUNDS (full page gradient)
  // =========================================================
  // Changes in:
  // - Login.js: full page background (outer div)
  // - Register.js: full page background (outer div)
  // - (optional) Any other page you apply it to
  gradients: {
    authBg: "linear-gradient(135deg,rgb(245, 246, 252),rgba(224, 231, 230, 0.91))",
    // Used in: Login page background, Register page background

    registerBg: "linear-gradient(135deg, #ffffff, rgb(40, 43, 197))",
    // Use this if you want Register page background different from Login

    roleActive: "linear-gradient(135deg, #6f42c1, #8f5ae8)",
    // Used in: Register role cards active state (Radiologist/organization)
  },

  // =========================================================
  // 3) SHADOWS (depth / elevation)
  // =========================================================
  // Changes in:
  // - Login.js: login/signup card shadow (when you apply theme to cards)
  // - Register.js: register card shadow + role card shadow
  // - Dashboard.js: dashboard cards shadow (when you apply theme)
  shadow: {
    card: "0 12px 30px rgba(148,163,184,0.35)", // strong card shadow
    soft: "0 8px 18px rgba(15,23,42,0.12)",     // softer shadow
  },

  // =========================================================
  // 4) RADIUS (rounded corners)
  // =========================================================
  // Changes in:
  // - Login.js: cards rounding (when you apply)
  // - Register.js: main card + role cards rounding
  // - Dashboard.js: card rounding (when you apply)
  // - Sidebar.js: menu items rounding (if you apply)
  radius: {
    card: 24,   // big cards
    pill: 999,  // pill buttons
    md: 14,     // medium rounding
  },

  // =========================================================
  // 5) REGISTER ROLE CARDS (Radiologist / organization selection)
  // =========================================================
  // Changes in:
  // - Register.js: Radiologist/organization selection cards
  //   - active gradient, border, text color, shadow
  //   - inactive background + text color
  //   - hover background
  card: {
    base: {
      background: "#ffffff",
      border: "1px solid rgba(15,23,42,0.08)",
      borderRadius: 18,
      boxShadow: "0 12px 30px rgba(148,163,184,0.35)",
    },
  
    authLeft: {
      background: "#ffffff",
      borderRadius: 18,
      boxShadow: "0 12px 30px rgba(148,163,184,0.35)",
    },
  
    authRight: {
      background: "linear-gradient(135deg,rgb(113, 227, 255),rgb(0, 1, 78))",
      color: "#ffffff",
      borderRadius: 18,
      boxShadow: "0 12px 30px rgba(148,163,184,0.35)",
    },
  },
  


  roleCard: {
    base: {
      borderRadius: "12px",
      padding: "20px",
      cursor: "pointer",
      transition: "all 0.3s ease",
    },

    radiologist: {
      active: {
        color: "#ffffff",
        background: "linear-gradient(135deg,rgb(66, 178, 193),rgb(7, 12, 87))",
        border: "2px solidrgb(30, 20, 128)",
        boxShadow: "0 4px 12px rgba(66, 100, 193, 0.4)",
      },
      inactive: {
        color: "#4b2c88",
        background: "rgba(12, 52, 230, 0.1)",
        border: "1px solid #ccc",
        boxShadow: "none",
      },
      hover: "rgba(12, 33, 218, 0.23)",
    },

    organization: {
      active: {
        color: "#ffffff",
        background: "linear-gradient(135deg,rgb(66, 178, 193),rgb(7, 12, 87))",
        border: "2px solidrgb(30, 20, 128)",
        boxShadow: "0 4px 12px rgba(66, 100, 193, 0.4)",
      },
      inactive: {
        color: "#4b2c88",
        background: "rgba(0, 45, 248, 0.1)",
        border: "1px solid #ccc",
        boxShadow: "none",
      },
      hover: "rgba(10, 33, 236, 0.23)",
    },

  },

  // =========================================================
  // 6) READY-MADE COMMON STYLES (reusable blocks)
  // =========================================================
  // Changes in:
  // - Login.js: "Get verification code" link style, show/hide button style (if used)
  // - Register.js: link-like buttons ("Get OTP", "Resend", show/hide)
  // - Any file: if you reuse these style blocks
  styles: {
    pageCenter: {
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
    },

    authPage: {
      position: "relative",
      background: "linear-gradient(135deg, #ffffff, rgb(96, 98, 238))",
    },

    linkButton: {
      background: "transparent",
      border: "none",
      boxShadow: "none",
      fontWeight: 600,
      cursor: "pointer",
    },
  },
 
    // =========================================================
  // 7) DASHBOARD BACKGROUNDS & CARDS
  // =========================================================
  // Changes in:
  // - Dashboard.js (left panel, right panel, section cards)

  layout: {
    sidebar: {
      bg: "linear-gradient(135deg,rgb(253, 254, 255),rgba(220, 222, 230, 0.84))",
      rightBorder: "rgb(199, 178, 178)",
      text: "rgb(0, 0, 0)",
      icon: "rgba(15, 15, 231, 0.92)",
      hoverBg: "linear-gradient(135deg,rgba(219, 217, 82, 0.28),rgba(17, 19, 110, 0.12)",
      activeBg: "linear-gradient(135deg,rgba(245, 237, 123, 0.66),rgba(17, 19, 129, 0.49)",
      activeText: "black",
  
      // ✅ ADD THIS (sidebar font control)
      fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      fontSize: "17px",
      fontWeight: 400,
      letterSpacing: "0.2px",
    },

      // ✅ ADD THIS
    sidebarFooter: {
      fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      fontSize: "14px",
      fontWeight: 400,
      letterSpacing: "0.2px",
      text: "#0f172a",
      mutedText: "rgba(15,23,42,0.75)",
    },
    

    header: {
      bg: "linear-gradient(135deg,rgba(255, 255, 255, 0.66),rgba(255, 131, 162, 0.84))", // ✅ YOUR HEADER COLOR/GRADIENT
      overlay: "rgba(199, 24, 24, 0)",
      topMinHeight: 44,
      crumbMinHeight: 28,
    },

      // ... your existing layout
    headerDropdown: {
      // top-right area (bell + avatar)
      icon: "rgba(10, 10, 10, 0.92)",
      iconHover: "rgba(255, 255, 255, 0.95)",
      badgeBg: "rgba(220, 53, 69, 0.92)",
      badgeText: "rgba(233, 233, 243, 0.92)",

      // dropdown menu
      menuBg: "rgb(216, 216, 219)",
      menuText: "BLACK",
      menuHeaderBg: "linear-gradient(135deg,rgba(219, 198, 82, 0.66),rgba(16, 17, 99, 0.49)",
      menuHeaderText: "BLACK",
      menuHoverBg: "linear-gradient(135deg,rgba(219, 198, 82, 0.27),rgba(16, 17, 99, 0.18)",

      // notification drawer (offcanvas)
      drawerBg: "rgba(221, 221, 235, 0.92)",
      drawerText: "black",
      drawerHeaderBg: "rgba(238, 0, 131, 0.55)",
      drawerHeaderText: "black",
      drawerItemHoverBg: "rgba(0, 0, 0, 0.14)",
    },
    
  },

  dashboard: {
    pageBg: "linear-gradient(135deg,rgb(248, 250, 252),rgba(230, 229, 220, 0.84))",
    
    overlay: "rgba(255, 255, 255, 0.6)",


  
    leftPanel: {
      background: "linear-gradient(135deg,rgba(247, 239, 171, 0.7),rgb(146, 127, 19)",
    },

    rightPanel: {
      background: "linear-gradient(135deg,rgba(87, 89, 219, 0.32),rgba(14, 16, 88, 0.87)",
     
    },

    softCard: {
      background: "rgb(255, 255, 255)",
    },

    pendingCard: {  
      background: "rgb(255, 255, 255)",
    },

    highlightCard: {
      background: "linear-gradient(135deg,rgba(85, 83, 194, 0.32),rgba(4, 13, 39, 0.99)",
    },

    searchAppearancesCard: {  
      background: "rgb(255, 255, 255)",
    },

    topVisitorsCard: {
      background: "rgb(255, 255, 255)",
    },

    visitorCard: {
      background: "rgb(241, 238, 238)",
    },

    nextActionCard: {
      background: "rgb(255, 255, 255)",
    },
  },

  // =========================================================
  // 8) LAYOUT THEME (Sidebar + Header)
  // =========================================================

  profileView: {
    pageBg: "transparent",
    cardBg: "#ffffff",
    cardBorder: "rgba(15,23,42,0.10)",
    headerBg: "rgba(0,0,0,0.03)",
    headerText: "#111827",
    text: "#111827",
    muted: "#6b7280",
    valueBg: "rgba(248,250,252,0.95)",
    valueBorder: "rgba(15,23,42,0.10)",
    badgeOkBg: "#198754",
    badgeWarnBg: "#ffc107",

    radius: 16,
    sectionGap: 12,
    photoSize: 112,

    // defaults for page “View Controls”
    cardMaxWidth: 1220,
    labelWidth: 190,
    valueMinWidth: 20,
    fontScale: 1.25,

    backBtn: { color: "secondary", variant: "outline" },
    dashboardBtn: { color: "primary" },
  },
  // =========================================================
  // DASHBOARD TYPOGRAPHY (replaces Dashboard useMemo text)
  // =========================================================
  dashboardTypography: {
    fontBase: {
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"',
      color: "#000000",
    },
    fonts: {
      family: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    },
    

    h1: {
      size: 20,
      weight: 600,
      letterSpacing: "-0.01em",
    },

    h2: {
      size: 18,
      weight: 600,
      letterSpacing: "-0.01em",
    },

    title: {
      size: 18,
      weight: 500,
      letterSpacing: "-0.01em",
    },

    body: {
      size: 13,
      weight: 400,
    },

    small: {
      size: 12,
      weight: 400,
    },

    menu: {
      size: 12,
      weight: 400,
    },

    label: {
      size: 17,
      weight: 500,
    },
  },


  tx(key = "body", overrides = {}) {
    // ===============================
    // DASHBOARD TYPOGRAPHY (h1, h2…)
    // ===============================
    if (apptheme.dashboardTypography?.[key]) {
      const base = apptheme.dashboardTypography.fontBase || {}
      const v = apptheme.dashboardTypography[key]
  
      return {
        ...base,
        fontSize: v.size,
        fontWeight: v.weight,
        letterSpacing: v.letterSpacing,
        lineHeight: 1.25,
        ...overrides,
      }
    }
  
    // ===============================
    // FALLBACK (other app text)
    // ===============================
    return {
      fontFamily: apptheme.fonts?.family || "inherit",
      fontSize: 14,
      fontWeight: 400,
      color: apptheme.colors.black,
      ...overrides,
    }
  },
  typography: {
    fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont",
    base: {
      fontSize: 14,
      fontWeight: 500,
      lineHeight: 1.45,
      color: "#111827",
    },

    h1: { fontSize: 22, fontWeight: 800 },
    h2: { fontSize: 18, fontWeight: 600 },
    h3: { fontSize: 17, fontWeight: 600, color:"rgb(77, 75, 75)"},

    title: { fontSize: 16, fontWeight: 700 },
    label: { fontSize: 18, fontWeight: 500 },
    body: { fontSize: 14, fontWeight: 500 },
    small: { fontSize: 12, fontWeight: 500 },
    muted: { fontSize: 12, fontWeight: 500, color: "#6b7280" },
  },

  tx(key, overrides = {}) {
    const t = this.typography;
    const base = t.base || {};
    const def = t[key] || {};

    return {
      fontFamily: t.fontFamily,
      fontSize: def.fontSize ?? base.fontSize,
      fontWeight: def.fontWeight ?? base.fontWeight,
      lineHeight: base.lineHeight,
      color: def.color ?? base.color,
      ...overrides,
    };
  },
  
};
  







