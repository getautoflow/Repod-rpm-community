import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  searchImportPackages,
  resolveImportDeps,
  getImportSyncStatus,
  getImportGroups,
  deleteImportGroup,
  getApiBaseUrl,
} from "../api";

const API_URL = getApiBaseUrl();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Badge({ children, color = "gray" }) {
  const colors = {
    gray: "bg-gray-100 text-gray-600",
    green: "bg-green-100 text-green-700",
    yellow: "bg-yellow-100 text-yellow-700",
    red: "bg-red-100 text-red-700",
    blue: "bg-blue-100 text-blue-700",
    orange: "bg-orange-100 text-orange-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[color]}`}>
      {children}
    </span>
  );
}

function LogLine({ line }) {
  if (!line) return null;
  const [level, ...rest] = line.split("|");
  const msg = rest.join("|");

  const styles = {
    info: "text-gray-300",
    success: "text-green-400",
    error: "text-red-400",
    warning: "text-yellow-400",
    skip: "text-gray-500",
    done: "text-blue-400 font-semibold",
  };

  return (
    <p className={`text-xs font-mono leading-relaxed ${styles[level] || "text-gray-300"}`}>
      {msg}
    </p>
  );
}

// ─── Timer ────────────────────────────────────────────────────────────────────

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

// ─── Log box with animation ───────────────────────────────────────────────────

function LogBox({ logs, running, done, logsRef, label }) {
  const { t } = useTranslation();
  const elapsed = useElapsed(running);
  if (logs.length === 0) return null;
  return (
    <div className={`border rounded-lg bg-gray-900 p-4 transition-all ${running ? "border-blue-500/50 shadow-[0_0_0_1px_rgba(59,130,246,0.2)]" : "border-gray-800"}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {label}
          {done && <span className="text-green-400 ml-2">— {t('import.logDone')}</span>}
          {running && <span className="text-yellow-400 ml-2">— {t('import.logRunning')}</span>}
        </p>
        {running && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-mono">{fmtElapsed(elapsed)}</span>
            <span className="flex gap-0.5">
              {[0,1,2].map((i) => (
                <span key={i} className="w-1 h-1 rounded-full bg-blue-400 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </span>
          </div>
        )}
      </div>
      <div ref={logsRef} className="max-h-64 overflow-y-auto space-y-0.5 scroll-smooth">
        {logs.map((line, i) => <LogLine key={i} line={line} />)}
        {running && (
          <p className="text-xs text-gray-600 font-mono animate-pulse mt-1">▌</p>
        )}
      </div>
    </div>
  );
}

// ─── SSE streaming ────────────────────────────────────────────────────────────

function useSSEStream(t) {
  const [logs, setLogs] = useState([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const esRef = useRef(null);

  const start = (url) => {
    if (esRef.current) esRef.current.close();
    setLogs([]);
    setDone(false);
    setRunning(true);

    const token = localStorage.getItem("token");
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    }).then(async (resp) => {
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: t('import.unknownError') }));
        setLogs((prev) => [...prev, `error|${err.detail || t('import.serverError')}`]);
        setRunning(false);
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop();
        for (const part of parts) {
          const dataLine = part.split("\n").find((l) => l.startsWith("data:"));
          if (!dataLine) continue;
          const payload = dataLine.slice(5).trim();
          setLogs((prev) => [...prev, payload]);
          if (payload.startsWith("done|")) {
            setDone(true);
            setRunning(false);
          }
        }
      }
      setRunning(false);
    }).catch((e) => {
      setLogs((prev) => [...prev, `error|${e.message}`]);
      setRunning(false);
    });
  };

  const startWithBody = (url, body) => {
    if (esRef.current) esRef.current.close();
    setLogs([]);
    setDone(false);
    setRunning(true);

    const token = localStorage.getItem("token");
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    }).then(async (resp) => {
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: t('import.unknownError') }));
        setLogs((prev) => [...prev, `error|${err.detail || t('import.serverError')}`]);
        setRunning(false);
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop();
        for (const part of parts) {
          const dataLine = part.split("\n").find((l) => l.startsWith("data:"));
          if (!dataLine) continue;
          const payload = dataLine.slice(5).trim();
          setLogs((prev) => [...prev, payload]);
          if (payload.startsWith("done|")) {
            setDone(true);
            setRunning(false);
          }
        }
      }
      setRunning(false);
    }).catch((e) => {
      setLogs((prev) => [...prev, `error|${e.message}`]);
      setRunning(false);
    });
  };

  return { logs, running, done, start, startWithBody };
}

// ─── Tab: Search & Import ─────────────────────────────────────────────────────

const DISTRIBUTIONS = [
  { codename: "almalinux8",         label: "AlmaLinux 8" },
  { codename: "rocky8",             label: "Rocky Linux 8" },
  { codename: "centos-stream9",     label: "CentOS Stream 9" },
  { codename: "oraclelinux8",       label: "Oracle Linux 8" },
  { codename: "fedora",             label: "Fedora" },
  { codename: "opensuse-leap-15.5", label: "openSUSE Leap 15.5" },
  { codename: "opensuse-leap-15.6", label: "openSUSE Leap 15.6" },
  { codename: "opensuse-leap",      label: "openSUSE Leap" },
  { codename: "opensuse-tumbleweed",label: "openSUSE Tumbleweed" },
];

function guessDistrib(distro) {
  if (!distro) return "almalinux8";
  if (distro.includes("rocky")) return "rocky8";
  if (distro.includes("centos")) return "centos-stream9";
  if (distro.includes("oracle")) return "oraclelinux8";
  if (distro.includes("fedora")) return "fedora";
  if (distro.includes("tumbleweed")) return "opensuse-tumbleweed";
  if (distro.includes("opensuse")) return "opensuse-leap";
  return "almalinux8";
}

function SearchImportTab() {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-GB';
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [deps, setDeps] = useState(null);
  const [resolvingDeps, setResolvingDeps] = useState(false);
  const [distribution, setDistribution] = useState("almalinux8");
  const [logs, setLogs] = useState([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const logsRef = useRef(null);

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setSelected(null);
    setDeps(null);
    try {
      const data = await searchImportPackages(query.trim());
      setResults(data.results || []);
      if ((data.results || []).length === 0) toast(t('import.search.noResults'));
    } catch (err) {
      if (err.response?.status === 424) {
        toast.error(t('import.search.noIndexSynced'));
      } else {
        toast.error(t('import.search.searchError'));
      }
    } finally {
      setSearching(false);
    }
  };

  const handleSelect = async (pkg) => {
    setSelected(pkg);
    setDeps(null);
    setResolvingDeps(true);
    setDistribution(guessDistrib(pkg.distro));
    try {
      const data = await resolveImportDeps(pkg.name);
      setDeps(data);
    } catch {
      setDeps(null);
    } finally {
      setResolvingDeps(false);
    }
  };

  const handleImport = async () => {
    if (!selected) return;
    setLogs([`info|${t('import.search.importPackage', { name: selected.name })}`]);
    setRunning(true);
    setDone(false);
    const token = localStorage.getItem("token");
    try {
      const resp = await fetch(`${API_URL}/api/v1/import/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ package: selected.name, distribution, with_deps: true }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setLogs([`error|${data.detail || t('import.serverError')}`]);
      } else if (data.success) {
        const msgs = [];
        if ((data.skipped || []).length > 0 && !(data.results || []).length) {
          msgs.push(`success|${t('import.search.alreadyInRepo', { name: selected.name })}`);
        } else {
          msgs.push(`success|${t('import.search.importedCount', { name: selected.name, count: data.imported ?? 0 })}`);
          (data.results || []).forEach((r) =>
            msgs.push(`info|  • ${r.name}-${r.version} · ${r.arch} (${r.source})`)
          );
        }
        if (data.errors > 0)
          msgs.push(`error|${t('import.search.errorsCount', { count: data.errors })}`);
        msgs.push(`done|${t('import.search.importDone')}`);
        setLogs(msgs);
        setDone(true);
      } else {
        setLogs([`error|${data.error || t('import.search.importFailed')}`]);
      }
    } catch (e) {
      setLogs([`error|${e.message}`]);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ex: nginx, curl, python3..."
          className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={searching}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {searching ? t('common.loading') : t('common.search')}
        </button>
      </form>

      <div className="grid grid-cols-2 gap-6">
        {/* Results */}
        <div>
          {results.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  {t('import.search.results_other', { count: results.length })}
                </p>
              </div>
              <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                {results.map((pkg, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelect(pkg)}
                    className={`w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors ${
                      selected?.name === pkg.name ? "bg-blue-50 border-l-2 border-l-blue-500" : ""
                    } ${pkg.security ? "border-l-2 border-l-red-300" : ""}`}
                  >
                    <div className="flex items-center justify-between mb-0.5 gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate">{pkg.name}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {pkg.security ? (
                          <Badge color="red"><svg className="w-3 h-3 inline mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> {t('import.search.securityBadge')}</Badge>
                        ) : null}
                        <Badge color="gray">{pkg.version}</Badge>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-1">{pkg.description}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{pkg.distro}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Detail + dependencies */}
        <div className="space-y-4">
          {selected && (
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{selected.name}</h3>
                    {selected.security ? <Badge color="red"><svg className="w-3 h-3 inline mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> {t('import.search.securityPatchBadge')}</Badge> : null}
                  </div>
                  <p className="text-sm text-gray-500">{selected.version} · {selected.arch}</p>
                </div>
                <button
                  onClick={handleImport}
                  disabled={running}
                  className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {running ? t('import.search.importRunning') : t('import.search.import')}
                </button>
              </div>
              {/* Distribution selector */}
              <div className="mb-3">
                <p className="text-xs text-gray-500 mb-1.5 font-medium">{t('import.search.targetDistribution')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {DISTRIBUTIONS.map((d) => (
                    <button key={d.codename} type="button"
                      onClick={() => setDistribution(d.codename)}
                      className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                        distribution === d.codename
                          ? "bg-blue-600 text-white border-blue-600"
                          : "text-gray-500 border-gray-200 hover:border-blue-400 hover:text-blue-600"
                      }`}>{d.label}</button>
                  ))}
                </div>
              </div>
              {selected.description && (
                <p className="text-sm text-gray-600 mb-3">{selected.description}</p>
              )}

              {/* Dependencies */}
              {resolvingDeps && (
                <p className="text-xs text-gray-400 italic">{t('import.search.resolvingDeps')}</p>
              )}
              {deps && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">
                    {t('import.search.deps')} — {t('import.search.depsCount', { present: deps.already_present, total: deps.total, toDownload: deps.to_download?.length ?? 0 })}
                  </p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {deps.packages.map((p, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-gray-700">{p.name}</span>
                        {p.already_in_repo ? (
                          <Badge color="green">{t('import.search.inRepo')}</Badge>
                        ) : (
                          <Badge color="yellow">{t('import.search.toDownload')}</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <LogBox logs={logs} running={running} done={done} logsRef={logsRef} label={t('import.search.logHeader')} />
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Batch import ────────────────────────────────────────────────────────

function BatchImportTab() {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [distribution, setDistribution] = useState("almalinux8");
  const [logs, setLogs] = useState([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const logsRef = useRef(null);

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs]);

  const handleBatch = async () => {
    const packages = input
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (packages.length === 0) {
      toast.error(t('import.batch.atLeastOne'));
      return;
    }
    if (packages.length > 50) {
      toast.error(t('import.batch.max50'));
      return;
    }
    setLogs([`info|${t('import.batch.importing', { count: packages.length })}`]);
    setRunning(true);
    setDone(false);
    const token = localStorage.getItem("token");
    let ok = 0, errors = 0;
    for (const pkg of packages) {
      setLogs((prev) => [...prev, `info|${t('import.batch.importPackage', { name: pkg })}`]);
      try {
        const resp = await fetch(`${API_URL}/api/v1/import/`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ package: pkg, distribution, with_deps: true }),
        });
        const data = await resp.json();
        if (!resp.ok || !data.success) {
          errors++;
          setLogs((prev) => [...prev, `error|${pkg} — ${data.detail || data.error || t('common.error')}`]);
        } else if (data.imported === 0) {
          ok++;
          setLogs((prev) => [...prev, `success|${pkg} — ${t('import.batch.alreadyInRepo')}`]);
        } else {
          ok++;
          setLogs((prev) => [...prev, `success|${pkg} — ${t('import.batch.addedCount', { count: data.imported })}`]);
        }
      } catch (e) {
        errors++;
        setLogs((prev) => [...prev, `error|${pkg} — ${e.message}`]);
      }
    }
    setLogs((prev) => [...prev, `done|${t('import.batch.done', { ok, errors })}`]);
    setDone(true);
    setRunning(false);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        {t('import.batch.infoBox')}
      </div>

      {/* Distribution */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">{t('import.search.targetDistribution')}</p>
        <div className="flex flex-wrap gap-2">
          {DISTRIBUTIONS.map((d) => (
            <button key={d.codename} type="button"
              onClick={() => setDistribution(d.codename)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                distribution === d.codename
                  ? "bg-blue-600 text-white border-blue-600"
                  : "text-gray-500 border-gray-200 hover:border-blue-400 hover:text-blue-600"
              }`}>{d.label}</button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">
          {t('import.batch.textareaLabel')}
        </label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={"nginx\ncurl\npython3\njq"}
          rows={8}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">
            {t('import.batch.detected', { count: input.split(/[\n,]+/).filter((s) => s.trim()).length })}
          </p>
          <button
            onClick={handleBatch}
            disabled={running || !input.trim()}
            className="px-5 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {running ? t('import.batch.importRunning') : t('import.batch.launchImport')}
          </button>
        </div>
      </div>

      <LogBox logs={logs} running={running} done={done} logsRef={logsRef} label={t('import.search.logHeader')} />
    </div>
  );
}

// ─── Tab: Synchronisation ─────────────────────────────────────────────────────

function SyncTab() {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-GB';
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const { logs, running, done, startWithBody } = useSSEStream(t);
  const logsRef = useRef(null);

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    if (done) loadStatus();
  }, [done]);

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs]);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const data = await getImportSyncStatus();
      setSources(data.sources || []);
    } catch {
      toast.error(t('import.sync.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleSyncAll = () => {
    startWithBody(`${API_URL}/api/v1/import/sync`, {});
  };

  const totalPackages = sources.reduce((acc, s) => acc + (s.pkg_count || 0), 0);

  const statusBadge = (s) => {
    if (s.status === "ok") return <Badge color="green">{t('import.sync.status.synced')}</Badge>;
    if (s.status === "error") return <Badge color="red">{t('import.sync.status.error')}</Badge>;
    return <Badge color="gray">{t('import.sync.status.neverSynced')}</Badge>;
  };

  return (
    <div className="space-y-6 p-6">
      {/* Info banner */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
        <svg className="w-4 h-4 mt-0.5 shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>{t('import.sync.allSourcesActive')}</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">{t('import.sync.sources')}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{sources.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">{t('import.sync.indexedPackages')}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {totalPackages.toLocaleString(dateLocale)}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">{t('import.sync.globalStatus')}</p>
          <p className="text-2xl font-bold mt-1">
            {sources.every((s) => s.status === "ok") ? (
              <span className="text-green-600">{t('import.sync.status.synced')}</span>
            ) : sources.some((s) => s.status === "ok") ? (
              <span className="text-yellow-600">{t('import.sync.partial')}</span>
            ) : (
              <span className="text-gray-500">{t('import.sync.notSynced')}</span>
            )}
          </p>
        </div>
      </div>

      {/* Sources table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-800">{t('import.sync.tableHeaders.source')}</h3>
          <button
            onClick={handleSyncAll}
            disabled={running}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {running ? t('import.sync.synchronizing') : t('import.sync.synchronizeAll')}
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">{t('common.loading')}</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('import.sync.tableHeaders.source')}</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('import.sync.tableHeaders.packages')}</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('import.sync.tableHeaders.lastSync')}</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('import.sync.tableHeaders.status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sources.map((s, i) => (
                <tr key={i} className={`hover:bg-gray-50 ${s.security ? "bg-red-50/30" : ""}`}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      {s.security && (
                        <span title={t('import.sync.securitySource')}>
                          <svg className="w-3 h-3 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                        </span>
                      )}
                      <div>
                        <p className="text-sm font-medium text-gray-900">{s.label}</p>
                        <p className="text-xs text-gray-400">{s.source_id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-700">
                    {(s.pkg_count || 0).toLocaleString(dateLocale)}
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-500">
                    {s.last_sync
                      ? new Date(s.last_sync).toLocaleString(dateLocale)
                      : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {statusBadge(s)}
                      {s.security && <Badge color="red">{t('import.sync.security')}</Badge>}
                    </div>
                    {s.error && (
                      <p className="text-xs text-red-500 mt-0.5 max-w-xs truncate">{s.error}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <LogBox logs={logs} running={running} done={done} logsRef={logsRef} label={t('import.sync.syncProgress')} />
    </div>
  );
}

// ─── Tab: Import groups ───────────────────────────────────────────────────────

function GroupsTab() {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-GB';
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const loadGroups = () => {
    getImportGroups()
      .then((d) => setGroups(d.groups || []))
      .catch(() => toast.error(t('import.groups.loadError')))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadGroups(); }, []);

  const handleDelete = async (name) => {
    if (!window.confirm(t('import.groups.deleteConfirm', { name }))) return;
    setDeleting(name);
    try {
      await deleteImportGroup(name);
      toast.success(t('import.groups.deleted', { name }));
      if (expanded === name) setExpanded(null);
      loadGroups();
    } catch {
      toast.error(t('import.groups.deleteError'));
    } finally {
      setDeleting(null);
    }
  };

  const fmt = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  if (loading) return <div className="text-center text-gray-400 text-sm py-12">{t('common.loading')}</div>;

  if (groups.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <p className="text-sm">{t('import.groups.noGroups')}</p>
        <p className="text-xs mt-1">{t('import.groups.noGroupsHint')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        {t('import.groups.count', { count: groups.length })}
      </p>
      {groups.map((g) => (
        <div key={g.name} className="border border-gray-200 rounded-lg overflow-hidden">
          {/* Group header */}
          <button
            onClick={() => setExpanded(expanded === g.name ? null : g.name)}
            className="w-full flex items-center justify-between px-5 py-4 bg-white hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-gray-900">{g.name}</p>
                <p className="text-xs text-gray-400">
                  {t('import.groups.fileCount', { count: g.package_count })} · {fmt(g.total_size_bytes)} ·{" "}
                  {t('import.groups.importedOn', { date: new Date(g.imported_at).toLocaleDateString(dateLocale) })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge color="blue">{g.package_count} .rpm</Badge>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(g.name); }}
                disabled={deleting === g.name}
                className="p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors disabled:opacity-40"
                title={t('import.groups.deleteTitle')}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
              <svg
                className={`w-4 h-4 text-gray-400 transition-transform ${expanded === g.name ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>

          {/* File list */}
          {expanded === g.name && (
            <div className="border-t border-gray-100 bg-gray-50">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-5 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('import.groups.file')}</th>
                    <th className="px-5 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('import.groups.size')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {g.packages.map((p, i) => (
                    <tr key={i} className="bg-white">
                      <td className="px-5 py-2.5">
                        <span className={`text-sm font-mono ${p.filename.startsWith(g.name + "_") ? "text-blue-700 font-semibold" : "text-gray-700"}`}>
                          {p.filename}
                        </span>
                        {p.filename.startsWith(g.name + "_") && (
                          <span className="ml-2 text-xs text-blue-500">{t('import.groups.main')}</span>
                        )}
                      </td>
                      <td className="px-5 py-2.5 text-right text-xs text-gray-500 font-mono">
                        {fmt(p.size_bytes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("search");

  const TABS = [
    { id: "search", label: t('import.tabs.search'), icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" },
    { id: "batch", label: t('import.tabs.batch'), icon: "M4 6h16M4 10h16M4 14h16M4 18h16" },
    { id: "sync", label: t('import.tabs.sync'), icon: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" },
    { id: "groups", label: t('import.tabs.groups'), icon: "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('import.title')}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {t('import.description')}
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
              </svg>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "search" && <SearchImportTab />}
        {activeTab === "batch" && <BatchImportTab />}
        {activeTab === "sync" && <SyncTab />}
        {activeTab === "groups" && <GroupsTab />}
      </div>
    </div>
  );
}
