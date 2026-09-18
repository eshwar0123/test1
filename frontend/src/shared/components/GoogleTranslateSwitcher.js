import { useState } from "react";
import {
  CDropdown,
  CDropdownToggle,
  CDropdownMenu,
  CDropdownItem,
} from "@coreui/react";

import "./GoogleTranslateSwitcher.css";

const LANG_OPTIONS = [
  { code: "en", label: "English", flag: "EN" },
  { code: "th", label: "ภาษาไทย", flag: "TH" },
];

const isIpAddress = (hostname) => /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);

const getCookieDomainVariants = (hostname) => {
  const variants = [""];

  if (!hostname || hostname === "localhost" || isIpAddress(hostname)) {
    return variants;
  }

  variants.push(hostname);

  const parts = hostname.split(".");
  if (parts.length >= 2) {
    variants.push(`.${parts.slice(-2).join(".")}`);
  }

  return [...new Set(variants)];
};

const writeCookie = (value, maxAgeSeconds) => {
  const domains = getCookieDomainVariants(window.location.hostname);

  domains.forEach((domain) => {
    const domainPart = domain ? `; domain=${domain}` : "";
    document.cookie = `googtrans=${value}; path=/${domainPart}; max-age=${maxAgeSeconds}; SameSite=Lax`;
  });
};

export const getCurrentLang = () => {
  const cookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith("googtrans="));

  if (!cookie) return "en";

  const raw = cookie.split("=").slice(1).join("=");
  const value = decodeURIComponent(raw || "");
  // Match /any-source/target OR just /target — extract the last path segment
  const match = value.match(/\/([a-z-]+)$/i);

  return match?.[1]?.toLowerCase() === "th" ? "th" : "en";
};

export const setGoogleLang = (target) => {
  const safeTarget = target === "th" ? "th" : "en";

  writeCookie("", 0);

  if (safeTarget !== "en") {
    writeCookie(`/en/${safeTarget}`, 60 * 60 * 24 * 365);
  }

  window.location.reload();
};

export default function GoogleTranslateSwitcher() {
  const [currentLang] = useState(() => getCurrentLang());
  const chip = currentLang === "th" ? "TH" : "EN";

  return (
    <div className="gt-lang-switcher notranslate" translate="no">
      <CDropdown alignment="end">
        <CDropdownToggle className="gt-lang-switcher__toggle" caret={false}>
          <span className="gt-lang-switcher__label">
            <span className="gt-lang-switcher__icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2C17.523 2 22 6.477 22 12C22 17.523 17.523 22 12 22C6.477 22 2 17.523 2 12C2 6.477 6.477 2 12 2Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <path
                  d="M3 12H21M12 2C14.6 4.4 16 8 16 12C16 16 14.6 19.6 12 22M12 2C9.4 4.4 8 8 8 12C8 16 9.4 19.6 12 22"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </span>
          <span className="gt-lang-switcher__chip">{chip}</span>
        </CDropdownToggle>
        <CDropdownMenu className="gt-lang-switcher__menu">
          {LANG_OPTIONS.map((lang) => {
            const isActive = currentLang === lang.code;

            return (
              <CDropdownItem
                key={lang.code}
                className={`gt-lang-switcher__item${isActive ? " active" : ""}`}
                onClick={() => {
                  if (!isActive) setGoogleLang(lang.code);
                }}
              >
                <span className="gt-lang-switcher__item-main">
                  <span className="gt-lang-switcher__flag" aria-hidden="true">
                    {lang.code === "th" ? "🇹🇭" : "🇺🇸"}
                  </span>
                  <span className="gt-lang-switcher__name">{lang.label}</span>
                </span>
                <span className="gt-lang-switcher__menu-chip">{lang.flag}</span>
                {isActive && <span className="gt-lang-switcher__check">✓</span>}
              </CDropdownItem>
            );
          })}
        </CDropdownMenu>
      </CDropdown>
    </div>
  );
}
