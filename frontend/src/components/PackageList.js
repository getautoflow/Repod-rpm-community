import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { listArtifacts, deleteArtifact, syncIndex, getArtifact, resolveDependencies, getApiBaseUrl, getPackageCve, getPackageDecision, getAuditLogs } from "../api";
import Paginator from "./Paginator";

const REPO_URL = process.env.REACT_APP_REPO_URL || "http://localhost:8180";
const API_URL = getApiBaseUrl();

function formatBytes(bytes) {
  if (!bytes) return "–";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function CveBadge({ cve }) {
  if (!cve) {
    return <span className="text-xs text-gray-300 font-mono">—</span>;
  }
  if (cve.critical > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
        {cve.critical} CRITICAL
      </span>
    );
  }
  if (cve.high > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 border border-orange-200">
        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
        {cve.high} HIGH
      </span>
    );
  }
  if (cve.medium > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700 border border-yellow-200">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 shrink-0" />
        {cve.medium} MEDIUM
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-200">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
      Clean
    </span>
  );
}

function useElapsed(running) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running) { setElapsed(0); return; }
    setElapsed(0);
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  return elapsed;
}

function fmtElapsed(s) {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
}

function LogLine({ line }) {
  if (!line) return null;
  const [level, ...rest] = line.split("|");
  const msg = rest.join("|");
  const styles = {
    info: "text-gray-300", success: "text-green-400",
    error: "text-red-400", warning: "text-yellow-400",
    skip: "text-gray-500", done: "text-blue-400 font-semibold",
  };
  return (
    <p className={`text-xs font-mono leading-relaxed ${styles[level] || "text-gray-300"}`}>
      {msg}
    </p>
  );
}

// ─── Animated log box ────────────────────────────────────────────────────────

function RunningLogBox({ logs, running, logsRef, label }) {
  const elapsed = useElapsed(running);
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</h3>
        {running && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 font-mono">{fmtElapsed(elapsed)}</span>
            <span className="flex gap-0.5">
              {[0,1,2].map((i) => (
                <span key={i} className="w-1 h-1 rounded-full bg-blue-400 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </span>
          </div>
        )}
      </div>
      <div className={`border rounded-xl bg-gray-900 p-4 transition-all ${running ? "border-blue-500/50" : "border-gray-800"}`}>
        <div ref={logsRef} className="max-h-56 overflow-y-auto space-y-0.5 scroll-smooth">
          {logs.map((line, i) => <LogLine key={i} line={line} />)}
          {running && (
            <p className="text-xs text-gray-600 font-mono animate-pulse mt-1">▌</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Panel: Resolve missing dependencies ─────────────────────────────────────

function ResolvePanel({ pkg, onClose, onResolved }) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [hasError, setHasError] = useState(false);
  const logsRef = useRef(null);
  const missing = pkg.deps_missing || [];

  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (done && !hasError) {
      setTimeout(() => { onResolved(false); }, 1500);
    }
  }, [done, hasError, onResolved]);

  const handleImport = async () => {
    if (missing.length === 0) return;
    setLogs([`info|${t('packages.resolve.importingDeps', { count: missing.length })}`]);
    setDone(false);
    setHasError(false);
    setRunning(true);

    const token = localStorage.getItem("token");
    try {
      const resp = await fetch(`${API_URL}/api/v1/import/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          packages: missing,
          distribution: pkg.distribution || "almalinux8",
          with_deps: false,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setLogs((prev) => [...prev, `error|${data.detail || t('packages.resolve.serverError')}`]);
        setHasError(true);
      } else {
        for (const r of data.results || []) {
          const label = r.resolved_as && r.resolved_as !== r.package
            ? `${r.resolved_as} (via ${r.package})`
            : r.package;
          if (r.status === "ok") {
            if (r.imported === 0) {
              setLogs((prev) => [...prev, `skip|  ✓ ${label} ${t('packages.resolve.alreadyPresent')}`]);
            } else {
              setLogs((prev) => [...prev, `success|  ✓ ${label} ${t('packages.resolve.imported')}`]);
            }
          } else {
            setLogs((prev) => [...prev, `error|  ✗ ${label} — ${r.error}`]);
            setHasError(true);
          }
        }
        setLogs((prev) => [
          ...prev,
          `done|${t('packages.resolve.done', { imported: data.imported ?? 0, errors: data.errors ?? 0 })}`,
        ]);
      }
    } catch (e) {
      setLogs((prev) => [...prev, `error|${e.message}`]);
      setHasError(true);
    }

    setDone(true);
    setRunning(false);
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={!running ? onClose : undefined} />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">{t('packages.resolve.title')}</h2>
              <p className="text-xs text-gray-400 font-mono">{pkg.name}</p>
            </div>
          </div>
          <button onClick={onClose} disabled={running}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-40">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Banner */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-sm font-semibold text-amber-800">
              {t('packages.resolve.missingCount', { count: missing.length })}
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              {t('packages.resolve.missingDesc', { name: pkg.name })}
            </p>
          </div>

          {/* Missing deps list */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              {t('packages.resolve.depsToImport')}
            </h3>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <ul className="divide-y divide-gray-100">
                {missing.map((dep) => (
                  <li key={dep} className="flex items-center gap-3 px-4 py-3 bg-white">
                    <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                      <svg className="w-3 h-3 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                    <span className="font-mono text-sm text-gray-800">{dep}</span>
                    <span className="ml-auto text-xs text-red-500 font-medium">{t('packages.resolve.missingLabel')}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Import button */}
          {!done && (
            <button
              onClick={handleImport}
              disabled={running || missing.length === 0}
              className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white
                         text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {running ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {t('packages.resolve.importing')}
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                  </svg>
                  {t('packages.resolve.importButton', { count: missing.length })}
                </>
              )}
            </button>
          )}

          {done && !hasError && (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <svg className="w-5 h-5 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-sm font-semibold text-green-800">{t('packages.resolve.importDone')}</p>
            </div>
          )}
          {done && hasError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-2">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <div>
                  <p className="text-sm font-semibold text-red-800">{t('packages.resolve.importPartial')}</p>
                  <p className="text-xs text-red-600 mt-0.5">{t('packages.resolve.importPartialHint')}</p>
                </div>
              </div>
              <button
                onClick={() => onResolved(true)}
                className="w-full py-2 text-sm font-medium text-red-700 border border-red-300 rounded-lg hover:bg-red-100 transition-colors"
              >
                {t('packages.resolve.close')}
              </button>
            </div>
          )}

          {/* Logs */}
          {logs.length > 0 && (
            <RunningLogBox logs={logs} running={running} logsRef={logsRef} label={t('packages.resolve.progressLabel')} />
          )}

          {/* Index hint */}
          {!running && logs.length === 0 && (
            <p className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
              {t('packages.resolve.syncHint')}
            </p>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Inspect panel ────────────────────────────────────────────────────────────

const SEV_COLOR = { critical:"#DC2626", high:"#EA580C", medium:"#CA8A04", low:"#16A34A", negligible:"#94A3B8" };
const SEV_BG    = { critical:"#FEF2F2", high:"#FFF7ED", medium:"#FEFCE8", low:"#F0FDF4", negligible:"#F8FAFC" };
const DECISION_COLOR = { accept_risk:"#16A34A", exception:"#2563EB", reject:"#DC2626", upgrade_required:"#0891B2" };

function InspectPanel({ pkg, onClose }) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-GB';

  const formatDate = (iso) => {
    if (!iso) return "–";
    return new Date(iso).toLocaleDateString(dateLocale, {
      day: "2-digit", month: "short", year: "numeric",
    });
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success(t('packages.copied')),
      () => toast.error(t('packages.copyError'))
    );
  };

  const [tab, setTab]         = useState("info");
  const [detail, setDetail]   = useState(null);
  const [deps, setDeps]       = useState(null);
  const [cve, setCve]         = useState(null);
  const [decision, setDecision] = useState(null);
  const [auditHistory, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const version = pkg.latest_version || pkg.version || "";
    const arch    = pkg.arch || "x86_64";
    Promise.all([
      getArtifact(pkg.name).catch(() => null),
      resolveDependencies(pkg.name).catch(() => null),
      version ? getPackageCve(pkg.name, version, arch).catch(() => null) : Promise.resolve(null),
      version ? getPackageDecision(pkg.name, version, arch).catch(() => null) : Promise.resolve(null),
      getAuditLogs({ package: pkg.name, per_page: 50, page: 1 }).catch(() => ({ items: [] })),
    ]).then(([d, r, c, dec, audit]) => {
      setDetail(d);
      setDeps(r);
      setCve(c);
      setDecision(dec);
      setAudit(audit?.items || []);
    }).finally(() => setLoading(false));
  }, [pkg.name, pkg.latest_version, pkg.version, pkg.arch]);

  const latest          = detail?.info?.latest;
  const verInfo         = latest ? detail?.info?.versions?.[latest] : null;
  const allDeps         = deps?.dependencies ?? [];
  const missing         = deps?.missing ?? [];
  const satisfied       = deps?.all_satisfied ?? true;
  const validationSteps = detail?.validation_steps ?? [];
  const cveList         = cve?.cve_results ?? cve?.vulnerabilities ?? [];
  const cveSummary      = cve?.summary ?? {};

  const DECISION_LABEL = {
    accept_risk: t('packages.inspect.decisionLabels.accept_risk'),
    exception: t('packages.inspect.decisionLabels.exception'),
    reject: t('packages.inspect.decisionLabels.reject'),
    upgrade_required: t('packages.inspect.decisionLabels.upgrade_required'),
  };

  const TABS = [
    { id: "info",     label: t('packages.inspect.tabs.info') },
    { id: "cve",      label: `${t('packages.inspect.tabs.cve')} ${cveList.length > 0 ? `(${cveList.length})` : ""}` },
    { id: "decision", label: t('packages.inspect.tabs.decision') },
    { id: "history",  label: `${t('packages.inspect.tabs.history')} ${auditHistory.length > 0 ? `(${auditHistory.length})` : ""}` },
  ];

  const validationLabels = {
    format: t('packages.inspect.validationLabels.format'),
    provenance: t('packages.inspect.validationLabels.provenance'),
    antivirus: t('packages.inspect.validationLabels.antivirus'),
    gpg: t('packages.inspect.validationLabels.gpg'),
    checksum: t('packages.inspect.validationLabels.checksum'),
    dependencies: t('packages.inspect.validationLabels.dependencies'),
  };

  const metaFields = [
    { label: t('packages.inspect.fields.name'),         value: pkg.name },
    { label: t('packages.inspect.fields.version'),      value: pkg.latest_version || "–" },
    { label: t('packages.inspect.fields.architecture'), value: pkg.arch || "–" },
    { label: t('packages.inspect.fields.distribution'), value: pkg.distribution || "–" },
    { label: t('packages.inspect.fields.size'),         value: formatBytes(pkg.size_bytes) },
    { label: t('packages.inspect.fields.section'),      value: pkg.section || "–" },
    { label: t('packages.inspect.fields.importedOn'),   value: formatDate(pkg.imported_at) },
    { label: t('packages.inspect.fields.importedBy'),   value: pkg.imported_by || "–" },
    { label: t('packages.inspect.fields.method'),       value: pkg.import_method || "–" },
  ];

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-white shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
              </svg>
            </div>
            <div>
              <h2 className="font-mono font-semibold text-gray-900">{pkg.name}</h2>
              <p className="text-xs text-gray-400">{pkg.latest_version} · {pkg.arch} · {pkg.distribution || "almalinux8"}</p>
            </div>
          </div>
          <button onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-6 shrink-0 bg-gray-50">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setTab(tab.id)}
              className={`px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${
                tab.id === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">{t('common.loading')}</div>
        ) : (
          <div className="flex-1 overflow-y-auto">

            {/* Info tab */}
            {tab === "info" && (
              <>
                <div className={`mx-4 mt-4 rounded-xl px-4 py-3 flex items-center gap-3 ${
                  satisfied ? "bg-green-50 border border-green-200" : "bg-amber-50 border border-amber-200"
                }`}>
                  <div>
                    <p className={`text-sm font-semibold ${satisfied ? "text-green-800" : "text-amber-800"}`}>
                      {satisfied ? t('packages.inspect.allDepsPresent') : t('packages.inspect.missingDeps', { count: missing.length })}
                    </p>
                    {!satisfied && <p className="text-xs text-amber-700 mt-0.5 font-mono">{missing.join(", ")}</p>}
                  </div>
                </div>

                <section className="px-4 mt-5">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{t('packages.inspect.metadata')}</h3>
                  <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
                    {metaFields.map(({ label, value }) => (
                      <div key={label} className="flex items-center px-4 py-2.5 gap-4">
                        <span className="text-xs text-gray-500 w-28 shrink-0">{label}</span>
                        <span className="text-sm text-gray-800 font-mono truncate">{value}</span>
                      </div>
                    ))}
                    {pkg.description && (
                      <div className="flex items-start px-4 py-2.5 gap-4">
                        <span className="text-xs text-gray-500 w-28 shrink-0 mt-0.5">{t('packages.inspect.fields.description')}</span>
                        <span className="text-sm text-gray-800">{pkg.description}</span>
                      </div>
                    )}
                  </div>
                </section>

                {verInfo?.sha256 && (
                  <section className="px-4 mt-5">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{t('packages.inspect.integrity')}</h3>
                    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-gray-500 mb-0.5">SHA-256</p>
                        <p className="text-xs font-mono text-gray-700 break-all">{verInfo.sha256}</p>
                      </div>
                      <button onClick={() => copyToClipboard(verInfo.sha256)} className="shrink-0 p-1 text-gray-400 hover:text-gray-600" title={t('common.copy')}>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                  </section>
                )}

                {validationSteps.length > 0 && (
                  <section className="px-4 mt-5 mb-6">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{t('packages.inspect.validation')}</h3>
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      <ul className="divide-y divide-gray-100">
                        {validationSteps.map((step, i) => {
                          const isWarning = step.warning && !step.passed;
                          return (
                            <li key={i} className={`flex items-start gap-3 px-4 py-3 ${!step.passed && !isWarning ? "bg-red-50/50" : isWarning ? "bg-amber-50/50" : ""}`}>
                              <svg className={`w-4 h-4 shrink-0 mt-0.5 ${step.passed || isWarning ? isWarning ? "text-amber-500" : "text-green-500" : "text-red-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                {step.passed ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /> : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />}
                              </svg>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-gray-700">{validationLabels[step.name] || step.name}</p>
                                <p className="text-xs text-gray-500 mt-0.5">{step.message}</p>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </section>
                )}

                <section className="px-4 mt-5 mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('packages.inspect.deps')}</h3>
                    <span className="text-xs text-gray-400">
                      {allDeps.length === 0
                        ? t('packages.inspect.noDepsLabel')
                        : t('packages.inspect.depsAvailable', { present: allDeps.length - missing.length, total: allDeps.length })}
                    </span>
                  </div>
                  {allDeps.length === 0 ? (
                    <div className="bg-white border border-gray-200 rounded-xl px-4 py-6 text-center text-sm text-gray-400">{t('packages.inspect.noDepsDecl')}</div>
                  ) : (
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      <ul className="divide-y divide-gray-100">
                        {allDeps.map((dep) => {
                          const present = dep.available_internally !== false;
                          return (
                            <li key={dep.name} className={`flex items-center justify-between px-4 py-3 ${!present ? "bg-red-50/60" : ""}`}>
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${present ? "bg-green-100" : "bg-red-100"}`}>
                                  <svg className={`w-3 h-3 ${present ? "text-green-600" : "text-red-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    {present ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /> : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />}
                                  </svg>
                                </div>
                                <div className="min-w-0">
                                  <p className="font-mono text-sm text-gray-800 truncate">{dep.name}</p>
                                  {dep.version_constraint && <p className="text-xs text-gray-400">{dep.version_constraint}</p>}
                                </div>
                              </div>
                              <span className={`text-xs font-medium shrink-0 ml-3 ${present ? "text-green-600" : "text-red-500"}`}>
                                {present ? t('packages.inspect.inRepo') : t('packages.inspect.missing')}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </section>
              </>
            )}

            {/* CVE tab */}
            {tab === "cve" && (
              <section className="px-4 py-5">
                {Object.keys(cveSummary).length > 0 && (
                  <div className="flex gap-2 mb-4 flex-wrap">
                    {["critical","high","medium","low","negligible"].map(sev => cveSummary[sev] > 0 && (
                      <span key={sev} style={{ background: SEV_BG[sev], color: SEV_COLOR[sev], border:`1px solid ${SEV_COLOR[sev]}30` }}
                        className="px-3 py-1 rounded-full text-xs font-bold">
                        {cveSummary[sev]} {sev.toUpperCase()}
                      </span>
                    ))}
                  </div>
                )}

                {cveList.length === 0 ? (
                  <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-8 text-center">
                    <p className="text-green-700 font-semibold text-sm">{t('packages.inspect.noCveDetected')}</p>
                    <p className="text-green-600 text-xs mt-1">{t('packages.inspect.noCveClean')}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {cveList.map((vuln, i) => {
                      const sev = (vuln.severity || "unknown").toLowerCase();
                      return (
                        <div key={i} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-mono text-sm font-bold text-gray-900">{vuln.id || vuln.cve_id}</span>
                                <span style={{ background: SEV_BG[sev]||"#F8FAFC", color: SEV_COLOR[sev]||"#64748B" }}
                                  className="px-2 py-0.5 rounded text-xs font-bold">{sev.toUpperCase()}</span>
                                {vuln.kev && <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700">KEV</span>}
                              </div>
                              <p className="text-xs text-gray-600">{vuln.package} {vuln.installed_version && `(${vuln.installed_version})`}</p>
                              {vuln.fix_version && <p className="text-xs text-green-700 mt-0.5">Fix : {vuln.fix_version}</p>}
                              {vuln.epss_percent && <p className="text-xs text-gray-400 mt-0.5">EPSS : {vuln.epss_percent}</p>}
                            </div>
                            {vuln.cvss_score && (
                              <span className="shrink-0 text-sm font-bold text-gray-700">CVSS {vuln.cvss_score}</span>
                            )}
                          </div>
                          {vuln.description && (
                            <p className="text-xs text-gray-500 mt-2 line-clamp-2">{vuln.description}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* Decision tab */}
            {tab === "decision" && (
              <section className="px-4 py-5">
                {!decision?.decision ? (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-8 text-center">
                    <p className="text-gray-600 font-semibold text-sm">{t('packages.inspect.noDecision')}</p>
                    <p className="text-gray-400 text-xs mt-1">{t('packages.inspect.noDecisionHint')}</p>
                  </div>
                ) : (
                  <>
                    <div style={{ background: `${DECISION_COLOR[decision.decision.action] || "#64748B"}15`, border: `1px solid ${DECISION_COLOR[decision.decision.action] || "#64748B"}30` }}
                      className="rounded-xl px-4 py-4 mb-4">
                      <div className="flex items-center gap-3">
                        <span style={{ background: DECISION_COLOR[decision.decision.action] || "#64748B", color:"#fff" }}
                          className="px-3 py-1 rounded-lg text-sm font-bold">
                          {DECISION_LABEL[decision.decision.action] || decision.decision.action}
                        </span>
                        {decision.sla?.days_remaining != null && (
                          <span className={`text-xs font-medium ${decision.sla.days_remaining < 7 ? "text-red-600" : "text-gray-600"}`}>
                            {decision.sla.days_remaining > 0
                              ? t('packages.inspect.sla.expiringSoon', { days: decision.sla.days_remaining })
                              : t('packages.inspect.sla.expired')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
                      {[
                        { label: t('packages.inspect.decisionFields.decidedBy'), value: decision.decision.decided_by },
                        { label: t('packages.inspect.decisionFields.date'),      value: decision.decision.decided_at ? new Date(decision.decision.decided_at).toLocaleString(dateLocale) : "–" },
                        { label: t('packages.inspect.decisionFields.expiresAt'), value: decision.decision.expires_at ? new Date(decision.decision.expires_at).toLocaleDateString(dateLocale) : t('packages.inspect.decisionFields.never') },
                        { label: t('packages.inspect.decisionFields.justification'), value: decision.decision.justification || "—" },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex items-start px-4 py-3 gap-4">
                          <span className="text-xs text-gray-500 w-28 shrink-0 mt-0.5">{label}</span>
                          <span className="text-sm text-gray-800">{value}</span>
                        </div>
                      ))}
                    </div>
                    {decision.sla && (
                      <div className={`mt-3 px-4 py-2.5 rounded-xl text-xs font-medium ${
                        decision.sla.status === "expired" ? "bg-red-50 text-red-700 border border-red-200" :
                        decision.sla.status === "expiring_soon" ? "bg-amber-50 text-amber-700 border border-amber-200" :
                        "bg-green-50 text-green-700 border border-green-200"
                      }`}>
                        SLA : {decision.sla.status === "expired" ? t('packages.inspect.sla.expired') :
                               decision.sla.status === "expiring_soon" ? t('packages.inspect.sla.expiringSoon', { days: decision.sla.days_remaining }) :
                               decision.sla.status === "no_sla" ? t('packages.inspect.sla.noSla') :
                               t('packages.inspect.sla.valid', { days: decision.sla.days_remaining })}
                      </div>
                    )}
                  </>
                )}
              </section>
            )}

            {/* History tab */}
            {tab === "history" && (
              <section className="px-4 py-5">
                {auditHistory.length === 0 ? (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-8 text-center">
                    <p className="text-gray-500 text-sm">{t('packages.inspect.noHistory')}</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {auditHistory.map((entry, i) => {
                      const resultColor = entry.result === "SUCCESS" ? "#16A34A" : entry.result === "FAILURE" ? "#DC2626" : "#CA8A04";
                      return (
                        <div key={i} className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-start gap-3">
                          <div className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ background: resultColor }} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-gray-700">{entry.action}</span>
                              <span className="text-xs text-gray-400">{t('packages.inspect.byUser')} {entry.user}</span>
                              <span className="text-xs text-gray-300">·</span>
                              <span className="text-xs text-gray-400">{entry.timestamp ? new Date(entry.timestamp).toLocaleString(dateLocale) : "–"}</span>
                            </div>
                            {entry.detail && <p className="text-xs text-gray-500 mt-0.5 truncate">{entry.detail}</p>}
                          </div>
                          <span className="shrink-0 text-xs font-semibold" style={{ color: resultColor }}>{entry.result}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const DISTRIB_COLORS = {
  almalinux8:         "bg-blue-100 text-blue-700",
  rocky8:             "bg-green-100 text-green-700",
  "centos-stream9":    "bg-purple-100 text-purple-700",
  fedora:             "bg-indigo-100 text-indigo-700",
  "opensuse-tumbleweed": "bg-cyan-100 text-cyan-700",
};

const PER_PAGE = 50;

export default function PackageList() {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-GB';

  const formatDate = (iso) => {
    if (!iso) return "–";
    return new Date(iso).toLocaleDateString(dateLocale, {
      day: "2-digit", month: "short", year: "numeric",
    });
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success(t('packages.copied')),
      () => toast.error(t('packages.copyError'))
    );
  };

  const DISTRIB_TABS = [
    { id: "all",      label: t('packages.allDistributions') },
    { id: "almalinux8",         label: "AlmaLinux 8" },
    { id: "rocky8",             label: "Rocky Linux 8" },
    { id: "centos-stream9",     label: "CentOS Stream 9" },
    { id: "fedora",             label: "Fedora" },
    { id: "opensuse-tumbleweed", label: "openSUSE Tumbleweed" },
  ];

  const [packages, setPackages]             = useState([]);
  const [page, setPage]                     = useState(1);
  const [pages, setPages]                   = useState(1);
  const [total, setTotal]                   = useState(0);
  const [searchInput, setSearchInput]       = useState("");
  const [filter, setFilter]                 = useState("");
  const [distribFilter, setDistribFilter]   = useState("all");
  const [loading, setLoading]               = useState(true);
  const [deleting, setDeleting]             = useState("");
  const [syncing, setSyncing]               = useState(false);
  const [inspecting, setInspecting]         = useState(null);
  const [resolving, setResolving]           = useState(null);
  const [fetchTrigger, setFetchTrigger]     = useState(0);

  const timerRef = useRef(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setFilter(searchInput);
      setPage(1);
    }, 350);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [searchInput]);

  useEffect(() => {
    setLoading(true);
    listArtifacts(page, PER_PAGE, filter || null, distribFilter === "all" ? null : distribFilter)
      .then((data) => {
        setPackages(data.items || []);
        setPage(data.page   || 1);
        setPages(data.pages || 1);
        setTotal(data.total || 0);
      })
      .catch(() => toast.error(t('packages.loadError')))
      .finally(() => setLoading(false));
  }, [page, filter, distribFilter, fetchTrigger]); // eslint-disable-line

  const refresh = useCallback(() => setFetchTrigger((v) => v + 1), []);

  const handleDelete = async (name) => {
    if (!window.confirm(t('packages.deleteConfirmMsg', { name }))) return;
    setDeleting(name);
    try {
      await deleteArtifact(name);
      toast.success(t('packages.deleteSuccess', { name }));
      if (inspecting?.name === name) setInspecting(null);
      refresh();
    } catch {
      toast.error(t('packages.deleteError', { name }));
    } finally {
      setDeleting("");
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncIndex();
      toast.success(t('packages.syncSuccess', { count: result.packages_indexed }));
      refresh();
    } catch {
      toast.error(t('packages.syncError'));
    } finally {
      setSyncing(false);
    }
  };

  const handleResolved = useCallback((hadErrors) => {
    setResolving(null);
    refresh();
    if (hadErrors) {
      toast.error(t('packages.resolvePartialError'), { duration: 6000 });
    } else {
      toast.success(t('packages.resolveSuccess'));
    }
  }, [refresh, t]);

  const handleDistribChange = (id) => {
    setDistribFilter(id);
    setPage(1);
  };

  const visible = packages;

  return (
    <>
      {resolving && (
        <ResolvePanel
          pkg={resolving}
          onClose={() => setResolving(null)}
          onResolved={handleResolved}
        />
      )}
      {inspecting && !resolving && (
        <InspectPanel pkg={inspecting} onClose={() => setInspecting(null)} />
      )}

      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('packages.title')}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {t('packages.subtitle', { count: total })}{" "}
              <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">dnf install</code>
            </p>
          </div>
          <button onClick={handleSync} disabled={syncing}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 border rounded-lg
                       hover:bg-gray-50 disabled:opacity-40 transition-colors">
            <svg className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {syncing ? t('packages.syncing') : t('packages.syncIndex')}
          </button>
        </div>

        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" />
          </svg>
          <input type="text" placeholder={t('packages.searchPlaceholder')} value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        </div>

        {/* Distribution filter */}
        <div className="flex items-center gap-2 flex-wrap">
          {DISTRIB_TABS.map((tabItem) => {
            const isActive = distribFilter === tabItem.id;
            return (
              <button
                key={tabItem.id}
                onClick={() => handleDistribChange(tabItem.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  isActive
                    ? "bg-blue-600 text-white border-blue-600"
                    : "text-gray-500 border-gray-200 hover:border-blue-400 hover:text-blue-600"
                }`}
              >
                {tabItem.label}
                {isActive && (
                  <span className="px-1.5 py-0.5 rounded text-xs bg-white/20 text-white">
                    {total}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-10 text-center text-gray-400 text-sm">{t('common.loading')}</div>
          ) : visible.length === 0 ? (
            <div className="p-10 text-center text-gray-400 text-sm">
              {filter ? t('packages.noMatch') : t('packages.emptyRepo')}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                  <th className="text-left px-5 py-3 font-semibold">{t('packages.tableHeaders.package')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t('packages.tableHeaders.version')}</th>
                  <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">{t('packages.tableHeaders.arch')}</th>
                  <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">{t('packages.tableHeaders.size')}</th>
                  <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">{t('packages.tableHeaders.addedOn')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t('packages.tableHeaders.status')}</th>
                  <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">{t('packages.tableHeaders.cve')}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t('packages.tableHeaders.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map((pkg) => {
                  const debUrl       = pkg.filename ? `${REPO_URL}/repos/pool/${pkg.filename}` : null;
                  const aptCmd       = `sudo dnf install ${pkg.name}`;
                  const isInspecting = inspecting?.name === pkg.name;
                  const isResolving  = resolving?.name === pkg.name;
                  const hasMissing   = pkg.deps_missing?.length > 0;

                  return (
                    <tr key={pkg.name}
                      className={`transition-colors ${
                        isResolving ? "bg-amber-50" : isInspecting ? "bg-blue-50" : "hover:bg-gray-50"
                      }`}>

                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 bg-blue-100 rounded-md flex items-center justify-center shrink-0">
                            <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
                            </svg>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-mono font-medium text-gray-900">{pkg.name}</p>
                              {pkg.distribution && (
                                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${DISTRIB_COLORS[pkg.distribution] || "bg-gray-100 text-gray-600"}`}>
                                  {pkg.distribution}
                                </span>
                              )}
                            </div>
                            {pkg.description && (
                              <p className="text-xs text-gray-400 truncate max-w-xs">{pkg.description}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="font-mono text-gray-700">{pkg.latest_version || "–"}</span>
                        {pkg.versions?.length > 1 && (
                          <span className="ml-1 text-xs text-gray-400">(+{pkg.versions.length - 1})</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 hidden md:table-cell">
                        <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600 font-mono">
                          {pkg.arch}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-gray-500 hidden lg:table-cell">
                        {formatBytes(pkg.size_bytes)}
                      </td>

                      <td className="px-4 py-3.5 text-gray-500 hidden lg:table-cell">
                        {formatDate(pkg.imported_at)}
                      </td>

                      {/* Status — clickable if missing deps */}
                      <td className="px-4 py-3.5">
                        {hasMissing ? (
                          <button
                            onClick={() => setResolving(isResolving ? null : pkg)}
                            title={`Missing: ${pkg.deps_missing.join(", ")}`}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
                                        transition-colors cursor-pointer ${
                              isResolving
                                ? "bg-amber-300 text-amber-900"
                                : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                            }`}
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            {t('packages.status.missingDeps', { count: pkg.deps_missing.length })}
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            {t('packages.status.available')}
                          </span>
                        )}
                      </td>

                      {/* CVE */}
                      <td className="px-4 py-3.5 hidden lg:table-cell">
                        <CveBadge cve={pkg.cve_summary} />
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-1.5">

                          {/* Inspect */}
                          <button
                            onClick={() => setInspecting(isInspecting ? null : pkg)}
                            className={`p-2 rounded-lg transition-colors border ${
                              isInspecting
                                ? "bg-blue-600 text-white border-blue-600"
                                : "text-gray-500 border-gray-200 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50"
                            }`}
                            title={t('packages.actions.inspect')}
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                          </button>

                          {/* Resolve deps or copy dnf install */}
                          {hasMissing ? (
                            <button
                              onClick={() => setResolving(isResolving ? null : pkg)}
                              className={`p-2 rounded-lg transition-colors border ${
                                isResolving
                                  ? "bg-amber-500 text-white border-amber-500"
                                  : "text-amber-600 border-amber-200 hover:bg-amber-50 hover:border-amber-400"
                              }`}
                              title={t('packages.actions.resolveDeps')}
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                              </svg>
                            </button>
                          ) : (
                            <button
                              onClick={() => copyToClipboard(aptCmd)}
                              className="p-2 rounded-lg transition-colors border text-gray-500 border-gray-200
                                         hover:bg-gray-900 hover:text-white hover:border-gray-900"
                              title={t('packages.actions.copy', { cmd: aptCmd })}
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </button>
                          )}

                          {/* Download .rpm */}
                          {debUrl && (
                            <a href={debUrl} download
                              className="p-2 rounded-lg transition-colors border text-gray-500 border-gray-200
                                         hover:bg-gray-50 hover:text-gray-700"
                              title={t('packages.actions.download')}>
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                            </a>
                          )}

                          {/* Delete */}
                          <button onClick={() => handleDelete(pkg.name)} disabled={deleting === pkg.name}
                            className="p-2 rounded-lg transition-colors border border-transparent
                                       text-red-400 hover:bg-red-50 hover:border-red-200 hover:text-red-600
                                       disabled:opacity-40"
                            title={t('packages.actions.delete')}>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <Paginator
            page={page}
            pages={pages}
            total={total}
            perPage={PER_PAGE}
            onPageChange={(p) => setPage(p)}
            loading={loading}
          />
        </div>
      </div>
    </>
  );
}
