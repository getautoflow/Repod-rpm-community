/**
 * EnterpriseGate — shown instead of enterprise page content in Community Edition.
 * Displays a full-page upgrade prompt with feature name, value props, and demo CTA.
 */

const DEMO_URL = "https://repod.getautoflow.dev/#demo";
const DOCS_URL = "https://docs.repod.getautoflow.dev";

const FEATURE_META = {
  security: {
    title: "CVE Review Queue",
    subtitle: "Vulnerability management & CISO approval workflow",
    description:
      "Automatically scan every uploaded RPM for known CVEs with Grype, triage results by CVSS severity, enrich with CISA KEV and EPSS scores, and require a Security Officer sign-off before any vulnerable package reaches your DNF/Zypper repositories.",
    benefits: [
      "CVE scanning on every RPM upload with CVSS scores",
      "CISA KEV cross-reference — flag actively exploited vulnerabilities",
      "EPSS exploit-probability enrichment",
      "CISO approval workflow — dual-control before promotion to repo",
      "Configurable SLA alerts (e.g. CRITICAL reviewed within 24 h)",
    ],
    icon: "shield",
  },
  audit: {
    title: "Immutable Audit Trail",
    subtitle: "Full traceability for every action, every package",
    description:
      "Every upload, approval, rejection, download, and login is recorded with timestamp, user identity, and IP address. Export as JSON or CSV for your SIEM or compliance audit.",
    benefits: [
      "Immutable log — every action recorded with actor + IP",
      "Export to JSON / CSV for SIEM integration",
      "Filter by action type, result, date range",
      "NIS2 Article 21 evidence-ready",
      "ISO 27001 controls A.12.5 & A.12.6 covered",
    ],
    icon: "audit",
  },
  users: {
    title: "Role-Based Access Control",
    subtitle: "Fine-grained permissions for your whole team",
    description:
      "Manage your team with 5 built-in roles: Admin, Security Officer, Maintainer, Developer, and Reader. Assign permissions at distribution level. Integrates with LDAP/AD.",
    benefits: [
      "5 built-in roles with fine-grained permissions",
      "Permission scoped per RPM distribution",
      "LDAP / Active Directory integration",
      "Invite users by email with role pre-assigned",
      "Full login history per user",
    ],
    icon: "users",
  },
  sbom: {
    title: "Software Bill of Materials (SBOM)",
    subtitle: "Complete RPM package dependency inventory",
    description:
      "Generate SBOM reports in SPDX or CycloneDX format for any RPM package or your entire repository, including PURL identifiers. Export SARIF 2.1.0 for GitHub Code Scanning and GitLab SAST. Required for NIS2 supply chain transparency.",
    benefits: [
      "SPDX 2.3 and CycloneDX 1.5 formats with RPM PURL",
      "SARIF 2.1.0 export for GitHub / GitLab SAST",
      "Export per-package or full repository",
      "Dependency graph with licence analysis",
      "CI/CD integration via API",
    ],
    icon: "sbom",
  },
  downloads: {
    title: "Download Analytics",
    subtitle: "Understand how your RPM packages are consumed",
    description:
      "Track which packages are downloaded by DNF/Zypper clients, how often, from which distributions, and from which IPs. Identify unused packages and monitor adoption across your fleet.",
    benefits: [
      "Per-package download counters per distribution",
      "Breakdown by client IP and user-agent",
      "Time-series charts (daily / weekly / monthly)",
      "Identify stale and over-used packages",
      "REST API for custom dashboards",
    ],
    icon: "download",
  },
  settings: {
    title: "Advanced Settings",
    subtitle: "Fine-tune CVE sync, retention, notifications and more",
    description:
      "Configure scheduled CVE sync, email & webhook notifications, package retention policies, GPG key management, and LDAP authentication — all from the UI.",
    benefits: [
      "Scheduled CVE database sync (configurable cron)",
      "Email & webhook notifications on CVE findings",
      "Automatic package retention policies",
      "GPG key rotation UI",
      "LDAP / AD connection testing",
    ],
    icon: "settings",
  },
  sso: {
    title: "SSO / Single Sign-On",
    subtitle: "OpenID Connect with PKCE — Azure AD, Okta, Keycloak & more",
    description:
      "Let your team log in with your existing identity provider via OpenID Connect (OIDC). Zero password fatigue, centralized access revocation, and automatic user provisioning from your directory.",
    benefits: [
      "OIDC Authorization Code + PKCE flow",
      "Compatible with Azure AD, Okta, Keycloak, Google Workspace",
      "Automatic user provisioning on first login",
      "Role mapping from IdP groups to Repod roles",
      "Active Directory / LDAP integration included",
    ],
    icon: "sso",
  },
};

// ─── SVG icons ───────────────────────────────────────────────────────────────

function Icon({ name, className = "w-6 h-6" }) {
  const paths = {
    shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
    audit: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 3h6a1 1 0 010 2H9a1 1 0 010-2zm0 7h6m-6 4h4",
    users: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100 8 4 4 0 000-8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
    sbom: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
    download: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3",
    settings:
      "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z",
    sso: "M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {(paths[name] || paths.shield).split("M").filter(Boolean).map((d, i) => (
        <path key={i} d={"M" + d} />
      ))}
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function EnterpriseGate({ feature = "security" }) {
  const meta = FEATURE_META[feature] || FEATURE_META.security;

  return (
    <div className="flex-1 flex items-center justify-center p-8 bg-slate-50 min-h-full">
      <div className="max-w-xl w-full space-y-8">

        {/* Header */}
        <div className="text-center space-y-4">
          {/* Lock badge */}
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 text-slate-400 mx-auto">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
                 strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold mb-3">
              Enterprise feature
            </div>
            <h2 className="text-2xl font-bold text-slate-800">{meta.title}</h2>
            <p className="text-slate-500 mt-1">{meta.subtitle}</p>
          </div>
        </div>

        {/* Description card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-white flex-shrink-0">
                <Icon name={meta.icon} className="w-5 h-5" />
              </div>
              <p className="text-sm text-slate-600 leading-relaxed pt-1">{meta.description}</p>
            </div>
          </div>

          {/* Benefits list */}
          <div className="p-6 space-y-3">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              What you unlock
            </p>
            <ul className="space-y-2.5">
              {meta.benefits.map((b, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-slate-700">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
                       strokeLinecap="round" strokeLinejoin="round"
                       className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* CTAs */}
        <div className="space-y-3">
          <a
            href={DEMO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700 transition-colors shadow-sm"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                 strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z"/>
            </svg>
            Request a demo — see it live
          </a>

          <div className="flex gap-3">
            <a
              href={`mailto:contact@getautoflow.dev?subject=Repod Enterprise — ${meta.title}`}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
                   strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              Contact sales
            </a>
            <a
              href={DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
                   strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/>
              </svg>
              Compare editions
            </a>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400">
          Repod Community Edition — free & open core ·{" "}
          <a href={DOCS_URL} target="_blank" rel="noopener noreferrer"
             className="underline hover:text-slate-600">
            docs.repod.getautoflow.dev
          </a>
        </p>

      </div>
    </div>
  );
}
