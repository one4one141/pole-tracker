import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as XLSX from 'xlsx';
import { gridRefToLatLng } from './grid';
import MapView, { type Pole } from './MapView';
import { api, getToken, setToken, clearToken } from './api';
import './style.css';

type Project = { id: string; name: string; created_at: string; source_filename: string | null };
function keyOf(s: string) { return s.toLowerCase().replace(/[^a-z0-9]/g, ''); }
function findValue(row: Record<string, unknown>, aliases: string[]) {
  const k = Object.keys(row).find(x => aliases.includes(keyOf(x)));
  return k ? row[k] : '';
}
function exchangeOf(p: Pole) {
  const entry = Object.entries(p.data || {}).find(([k, v]) =>
    ['exchange', 'exchangename', 'exchangecode', 'exchangeid', 'exchangearea'].includes(keyOf(k)) && String(v ?? '').trim());
  return entry ? String(entry[1]).trim() : '';
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [p, setP] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try { const d = await api('login', { password: p }); setToken(d.token); onLogin(); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Login failed'); }
    finally { setBusy(false); }
  }
  return <div className="login-wrap"><form className="login-card" onSubmit={submit}>
    <div className="brand-mark">PT</div><p className="eyebrow">FIELD OPERATIONS</p><h1>Pole Tracker</h1>
    <p className="muted">Sign in to the shared pole tracking workspace.</p><label>Shared password</label>
    <input type="password" value={p} onChange={e => setP(e.target.value)} autoFocus required />
    <button className="primary full" disabled={busy || !p}>{busy ? 'Signing in…' : 'Sign in'}</button>
    {err && <p className="error">{err}</p>}<p className="tiny muted">Access is shared with authorised team members.</p>
  </form></div>;
}

function Tracker({ onLogout }: { onLogout: () => void }) {
  const [projects, setProjects] = useState<Project[]>([]), [projectId, setProjectId] = useState('');
  const [poles, setPoles] = useState<Pole[]>([]), [selected, setSelected] = useState<Pole | null>(null);
  const [search, setSearch] = useState(''), [status, setStatus] = useState('All'), [exchangeFilters, setExchangeFilters] = useState<string[]>([]);
  const [loading, setLoading] = useState(true), [message, setMessage] = useState('');
  const [projectName, setProjectName] = useState(''), [file, setFile] = useState<File | null>(null), [showImport, setShowImport] = useState(false);

  async function loadProjects() {
    const d = await api('projects', {}, 'GET'); setProjects(d.projects || []);
    setProjectId(current => current && d.projects?.some((p: Project) => p.id === current) ? current : (d.projects?.[0]?.id || ''));
    setLoading(false);
  }
  async function loadPoles(id: string) {
    setPoles([]); setSelected(null);
    if (!id) return;
    const d = await api('poles', { project_id: id }, 'GET'); setPoles(d.poles || []);
  }
  useEffect(() => { loadProjects().catch(e => { setMessage(e.message); setLoading(false); }); }, []);
  useEffect(() => { loadPoles(projectId).catch(e => setMessage(e.message)); }, [projectId]);
  useEffect(() => {
    if (!projectId) return;
    const t = window.setInterval(() => { if (!selected) loadPoles(projectId).catch(() => {}); }, 12000);
    return () => clearInterval(t);
  }, [projectId, selected]);

  const exchanges = useMemo(() => [...new Set(poles.map(exchangeOf).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [poles]);
  const filtered = useMemo(() => poles.filter(p =>
    (status === 'All' || p.status === status) &&
    (exchangeFilters.length === 0 || exchangeFilters.includes(exchangeOf(p))) &&
    (`${p.pole_ref} ${p.grid_reference} ${p.notes} ${exchangeOf(p)} ${JSON.stringify(p.data)}`).toLowerCase().includes(search.toLowerCase())
  ), [poles, status, exchangeFilters, search]);
  const done = poles.filter(p => p.status === 'Completed').length, problems = poles.filter(p => p.status === 'Problem').length;

  async function importFile() {
    if (!file || !projectName.trim()) return;
    setMessage('Reading spreadsheet…');
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      const parsed = raw.map(row => {
        const grid = String(findValue(row, ['gridreference', 'gridref', 'osgridreference', 'osgridref', 'nationalgridreference', 'ngr'])).trim();
        const coords = gridRefToLatLng(grid);
        return { pole_ref: String(findValue(row, ['poleref', 'polenumber', 'poleid', 'assetid', 'reference']) || ''), grid_reference: grid, ...(coords || {}), data: row };
      }).filter(p => 'latitude' in p);
      if (!parsed.length) throw new Error('No valid British National Grid references found. Check the column headings and values.');
      const d = await api('create_project', { name: projectName, filename: file.name, poles: parsed });
      setMessage(`Imported ${d.imported} poles successfully.`); setShowImport(false); setProjectName(''); setFile(null);
      await loadProjects(); setProjectId(d.project.id);
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Import failed.'); }
  }
  async function savePole() {
    if (!selected) return;
    try {
      const d = await api('update_pole', { id: selected.id, status: selected.status, notes: selected.notes, data: selected.data });
      setPoles(old => old.map(p => p.id === selected.id ? d.pole : p)); setSelected(null); setMessage('Pole updated.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Save failed.'); }
  }
  async function renameProject() {
    const current = projects.find(p => p.id === projectId); if (!current) return;
    const next = window.prompt('Enter a new project name:', current.name)?.trim();
    if (!next || next === current.name) return;
    try { await api('rename_project', { id: projectId, name: next }); setProjects(old => old.map(p => p.id === projectId ? { ...p, name: next } : p)); setMessage('Project renamed.'); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Could not rename project.'); }
  }
  async function deleteProject() {
    const current = projects.find(p => p.id === projectId); if (!current) return;
    if (!window.confirm(`Delete "${current.name}" and all ${poles.length} poles in it? This cannot be undone.`)) return;
    try {
      await api('delete_project', { id: projectId });
      const remaining = projects.filter(p => p.id !== projectId); setProjects(remaining); setPoles([]); setSelected(null);
      setProjectId(remaining[0]?.id || ''); setMessage('Project deleted.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not delete project.'); }
  }

  if (loading) return <div className="loading-screen">Loading Pole Tracker…</div>;
  return <main className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-mark small">PT</div><div><strong>Pole Tracker</strong><span>FIELD OPERATIONS</span></div></div>
      <div className="top-actions"><span className="live-dot">Shared workspace</span><button className="ghost" onClick={() => { clearToken(); onLogout(); }}>Sign out</button></div>
    </header>
    <section className="page-heading"><div><p className="eyebrow">TEAM OVERVIEW</p><h1>Project map</h1><p className="muted">Explore pole locations and update field records.</p></div>
      <button className="primary" onClick={() => { setShowImport(true); setMessage(''); }}>＋ Import spreadsheet</button></section>
    <section className="stats">
      <div className="stat"><span>Total poles</span><strong>{poles.length}</strong></div><div className="stat"><span>Completed</span><strong>{done}</strong></div>
      <div className="stat"><span>Outstanding</span><strong>{poles.length - done - problems}</strong></div><div className="stat"><span>Problems</span><strong>{problems}</strong></div>
    </section>
    <section className="workspace">
      <aside className="sidebar"><div className="field-label">PROJECT</div>
        <select value={projectId} onChange={e => setProjectId(e.target.value)}>{projects.length === 0 && <option value="">No projects yet</option>}{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <div className="project-actions"><button className="ghost" disabled={!projectId} onClick={renameProject}>Rename</button><button className="ghost danger" disabled={!projectId} onClick={deleteProject}>Delete project</button></div>
        <div className="pole-tools"><input placeholder="Search poles, grid refs or exchanges…" value={search} onChange={e => setSearch(e.target.value)} />
          <select value={status} onChange={e => setStatus(e.target.value)}><option value="All">All statuses</option><option value="Outstanding">Outstanding</option><option value="Completed">Completed</option><option value="Problem">Problem</option></select>
          <select multiple value={exchangeFilters} onChange={e => setExchangeFilters(Array.from(e.target.selectedOptions, o => o.value))} aria-label="Filter by exchange">
            {exchanges.length === 0 && <option disabled>No exchange column found</option>}
            {exchanges.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        <div className="exchange-filter-footer"><p className="filter-hint">{exchanges.length ? 'Select one or more exchanges (⌘/Ctrl-click).' : 'No exchange values found in this spreadsheet.'}</p><button className="text-button" disabled={!exchangeFilters.length} onClick={() => setExchangeFilters([])}>Clear</button></div>
        <div className="list-heading"><strong>Pole records</strong><span>{filtered.length} / {poles.length}</span></div>
        <div className="pole-list">{filtered.map(p => <button key={p.id} className={`pole-row ${selected?.id === p.id ? 'active' : ''}`} onClick={() => setSelected(p)}>
          <span className={`pin-dot ${p.status.toLowerCase()}`} /><span className="pole-row-main"><strong>{p.pole_ref || 'Unlabelled pole'}</strong><small>{p.grid_reference}{exchangeOf(p) ? ` · ${exchangeOf(p)}` : ''}</small></span><span className="row-chevron">›</span>
        </button>)}{filtered.length === 0 && <p className="empty">No poles match these filters.</p>}</div>
      </aside>
      <div className="map-panel"><MapView key={projectId || 'empty'} poles={filtered} selected={selected} onEdit={setSelected} />
        <div className="map-legend"><span><i className="legend-blue" />Outstanding</span><span><i className="legend-green" />Completed</span><span><i className="legend-red" />Problem</span></div>
      </div>
    </section>
    {message && <div className="toast" onClick={() => setMessage('')}>{message} <b>×</b></div>}
    {showImport && <div className="modal-backdrop"><div className="modal"><button className="close" onClick={() => setShowImport(false)}>×</button><p className="eyebrow">NEW PROJECT</p><h2>Import spreadsheet</h2>
      <p className="muted">Each upload creates a separate project. The first worksheet is imported.</p><label>Project name</label><input value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="e.g. North Area – November 2026" />
      <label>Excel or CSV file</label><input type="file" accept=".xlsx,.xls,.csv" onChange={e => setFile(e.target.files?.[0] || null)} />
      <p className="tiny muted">A column containing British National Grid references is required. Exchange columns such as Exchange, Exchange Name or Exchange Code are available as filters.</p>
      <button className="primary full" disabled={!file || !projectName.trim()} onClick={importFile}>Import poles and create project</button></div></div>}
    {selected && <div className="modal-backdrop" onClick={() => setSelected(null)}><div className="modal detail-modal" onClick={e => e.stopPropagation()}>
      <button className="close" onClick={() => setSelected(null)}>×</button><p className="eyebrow">POLE RECORD</p><h2>{selected.pole_ref || 'Pole details'}</h2>
      <div className="detail-grid"><div><span>Grid reference</span><strong>{selected.grid_reference}</strong></div><div><span>Coordinates</span><strong>{selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}</strong></div></div>
      {exchangeOf(selected) && <p className="muted">Exchange: <strong>{exchangeOf(selected)}</strong></p>}
      <label>Status</label><select value={selected.status} onChange={e => setSelected({ ...selected, status: e.target.value })}><option>Outstanding</option><option>Completed</option><option>Problem</option></select>
      <label>Team notes</label><textarea rows={4} value={selected.notes || ''} onChange={e => setSelected({ ...selected, notes: e.target.value })} placeholder="Add notes or access information…" />
      <div className="raw-data"><strong>Imported spreadsheet data</strong>{Object.entries(selected.data || {}).map(([k, v]) => <div key={k} className="raw-data-edit"><label>{k}</label><input value={String(v ?? '')} onChange={e => setSelected({ ...selected, data: { ...selected.data, [k]: e.target.value } })} /></div>)}</div>
      <button className="primary full" onClick={savePole}>Save changes</button></div></div>}
  </main>;
}
function App() { const [logged, setLogged] = useState(!!getToken()); return logged ? <Tracker onLogout={() => setLogged(false)} /> : <Login onLogin={() => setLogged(true)} />; }
createRoot(document.getElementById('root')!).render(<App />);
