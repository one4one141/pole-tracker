import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as XLSX from 'xlsx';
import { gridRefToLatLng } from './grid';
import MapView, { type Pole } from './MapView';
import { api, getToken, setToken, clearToken } from './api';
import './style.css';

type Project = { id: string; name: string; created_at: string; source_filename: string | null };
type Page = 'map' | 'spreadsheet' | 'lists';
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
  const [page, setPage] = useState<Page>('map'), [spreadsheetDraft, setSpreadsheetDraft] = useState<Pole[]>([]), [savingSheet, setSavingSheet] = useState(false), [refreshing, setRefreshing] = useState(false);
  const [listStatus, setListStatus] = useState<'Outstanding' | 'Completed' | 'Problem'>('Outstanding');

  async function loadProjects() {
    const d = await api('projects', {}, 'GET'); setProjects(d.projects || []);
    setProjectId(current => current && d.projects?.some((p: Project) => p.id === current) ? current : (d.projects?.[0]?.id || ''));
    setLoading(false);
  }
  async function loadPoles(id: string) {
    if (!id) { setPoles([]); setSelected(null); return; }
    const d = await api('poles', { project_id: id }, 'GET'); setPoles(d.poles || []); setSelected(null);
  }
  useEffect(() => { loadProjects().catch(e => { setMessage(e.message); setLoading(false); }); }, []);
  useEffect(() => { loadPoles(projectId).catch(e => setMessage(e.message)); }, [projectId]);
  // Deliberately no timed polling: the old 12-second refresh cleared the selected pole and
  // reloaded the entire list, which looked like the page was repeatedly refreshing.

  const exchanges = useMemo(() => [...new Set(poles.map(exchangeOf).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [poles]);
  const filtered = useMemo(() => poles.filter(p =>
    (status === 'All' || p.status === status) &&
    (exchangeFilters.length === 0 || exchangeFilters.includes(exchangeOf(p))) &&
    (`${p.pole_ref} ${p.grid_reference} ${p.notes} ${exchangeOf(p)} ${JSON.stringify(p.data)}`).toLowerCase().includes(search.toLowerCase())
  ), [poles, status, exchangeFilters, search]);
  const done = poles.filter(p => p.status === 'Completed').length, problems = poles.filter(p => p.status === 'Problem').length;
  const outstanding = poles.length - done - problems;
  const columns = useMemo(() => [...new Set(poles.flatMap(p => Object.keys(p.data || {})))], [poles]);
  const draftColumns = useMemo(() => [...new Set(spreadsheetDraft.flatMap(p => Object.keys(p.data || {})))], [spreadsheetDraft]);
  const listRows = useMemo(() => poles.filter(p => p.status === listStatus && (`${p.pole_ref} ${p.grid_reference} ${p.notes} ${exchangeOf(p)} ${JSON.stringify(p.data)}`).toLowerCase().includes(search.toLowerCase())), [poles, listStatus, search]);

  async function refreshData() {
    if (!projectId) return; setRefreshing(true);
    try { const d = await api('poles', { project_id: projectId }, 'GET'); const next: Pole[] = d.poles || []; setPoles(next); setSelected(current => current ? next.find(p => p.id === current.id) || null : null); setMessage('Project data refreshed.'); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Could not refresh project data.'); }
    finally { setRefreshing(false); }
  }
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
  function openSpreadsheet() { setSpreadsheetDraft(poles.map(p => ({ ...p, data: { ...(p.data || {}) } }))); setPage('spreadsheet'); }
  function editDraft(id: string, column: string, value: string) {
    setSpreadsheetDraft(rows => rows.map(p => p.id === id ? { ...p, data: { ...p.data, [column]: value } } : p));
  }
  function addColumn() {
    const name = window.prompt('New column name:')?.trim(); if (!name) return;
    if (draftColumns.some(c => keyOf(c) === keyOf(name))) { setMessage('A column with that name already exists.'); return; }
    setSpreadsheetDraft(rows => rows.map(p => ({ ...p, data: { ...p.data, [name]: '' } }))); setMessage(`Column "${name}" added. Save changes to apply it.`);
  }
  function renameColumn(oldName: string) {
    const name = window.prompt(`Rename column "${oldName}" to:`, oldName)?.trim(); if (!name || name === oldName) return;
    if (draftColumns.some(c => c !== oldName && keyOf(c) === keyOf(name))) { setMessage('A column with that name already exists.'); return; }
    setSpreadsheetDraft(rows => rows.map(p => { const data = { ...p.data }; data[name] = data[oldName] ?? ''; delete data[oldName]; return { ...p, data }; }));
  }
  function deleteColumn(name: string) {
    if (!window.confirm(`Remove the "${name}" column from every pole in this project?`)) return;
    setSpreadsheetDraft(rows => rows.map(p => { const data = { ...p.data }; delete data[name]; return { ...p, data }; }));
  }
  async function saveSpreadsheet() {
    setSavingSheet(true); setMessage('Saving spreadsheet changes…');
    try {
      const updates = spreadsheetDraft.map(p => ({ id: p.id, status: p.status, notes: p.notes, data: p.data }));
      await api('update_poles', { poles: updates });
      setPoles(spreadsheetDraft); setMessage(`Saved changes to ${spreadsheetDraft.length} pole records.`); setPage('map');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not save spreadsheet changes.'); }
    finally { setSavingSheet(false); }
  }

  if (loading) return <div className="loading-screen">Loading Pole Tracker…</div>;
  const currentProject = projects.find(p => p.id === projectId);
  return <main className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-mark small">PT</div><div><strong>Pole Tracker</strong><span>FIELD OPERATIONS</span></div></div>
      <div className="top-actions"><span className="live-dot">Shared workspace</span><button className="ghost" onClick={() => { clearToken(); onLogout(); }}>Sign out</button></div>
    </header>
    <section className="page-heading"><div><p className="eyebrow">TEAM OVERVIEW</p><h1>{page === 'map' ? 'Project map' : page === 'spreadsheet' ? 'Spreadsheet editor' : 'Pole lists'}</h1><p className="muted">{currentProject?.name || 'Select or import a project'}{page === 'spreadsheet' ? ' · Edit cells and manage columns' : page === 'lists' ? ' · View records without the map' : ' · Explore locations and update field records'}</p></div>
      <div className="heading-actions">{page !== 'spreadsheet' && <button className="ghost" disabled={!projectId || refreshing} onClick={refreshData}>{refreshing ? 'Refreshing…' : '↻ Refresh data'}</button>}<button className="primary" onClick={() => { setShowImport(true); setMessage(''); }}>＋ Import spreadsheet</button></div></section>
    <nav className="page-tabs"><button className={page === 'map' ? 'active' : ''} onClick={() => setPage('map')}>Map</button><button className={page === 'spreadsheet' ? 'active' : ''} onClick={openSpreadsheet} disabled={!projectId}>Spreadsheet editor</button><button className={page === 'lists' ? 'active' : ''} onClick={() => setPage('lists')}>Completed & outstanding</button></nav>
    <section className="stats">
      <div className="stat"><span>Total poles</span><strong>{poles.length}</strong></div><div className="stat"><span>Completed</span><strong>{done}</strong></div>
      <div className="stat"><span>Outstanding</span><strong>{outstanding}</strong></div><div className="stat"><span>Problems</span><strong>{problems}</strong></div>
    </section>
    {page === 'map' && <section className="workspace">
      <aside className="sidebar"><div className="field-label">PROJECT</div>
        <select value={projectId} onChange={e => setProjectId(e.target.value)}>{projects.length === 0 && <option value="">No projects yet</option>}{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <div className="project-actions"><button className="ghost" disabled={!projectId} onClick={renameProject}>Rename</button><button className="ghost danger" disabled={!projectId} onClick={deleteProject}>Delete project</button></div>
        <div className="pole-tools"><input placeholder="Search poles, grid refs or exchanges…" value={search} onChange={e => setSearch(e.target.value)} />
          <select value={status} onChange={e => setStatus(e.target.value)}><option value="All">All statuses</option><option value="Outstanding">Outstanding</option><option value="Completed">Completed</option><option value="Problem">Problem</option></select>
          <select multiple value={exchangeFilters} onChange={e => setExchangeFilters(Array.from(e.target.selectedOptions, o => o.value))} aria-label="Filter by exchange">
            {exchanges.length === 0 && <option disabled>No exchange column found</option>}{exchanges.map(x => <option key={x} value={x}>{x}</option>)}
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
    </section>}
    {page === 'spreadsheet' && <section className="data-page">
      <div className="data-toolbar"><div><strong>{spreadsheetDraft.length} pole records</strong><p className="tiny muted">Pole reference and grid reference are fixed fields. Imported columns can be edited below.</p></div><div className="toolbar-actions"><button className="ghost" onClick={addColumn}>＋ Add column</button><button className="primary" disabled={savingSheet || !spreadsheetDraft.length} onClick={saveSpreadsheet}>{savingSheet ? 'Saving…' : 'Save all changes'}</button></div></div>
      <div className="table-scroll"><table className="sheet-table"><thead><tr><th className="sticky-col">Pole reference</th><th>Grid reference</th><th>Status</th><th>Notes</th>{draftColumns.map(c => <th key={c}><div className="column-heading"><span>{c}</span><div><button title={`Rename ${c}`} onClick={() => renameColumn(c)}>✎</button><button title={`Delete ${c}`} onClick={() => deleteColumn(c)}>×</button></div></div></th>)}</tr></thead>
        <tbody>{spreadsheetDraft.map(p => <tr key={p.id}><td className="sticky-col">{p.pole_ref || '—'}</td><td>{p.grid_reference}</td><td><select value={p.status} onChange={e => setSpreadsheetDraft(rows => rows.map(x => x.id === p.id ? { ...x, status: e.target.value } : x))}><option>Outstanding</option><option>Completed</option><option>Problem</option></select></td><td><input value={p.notes || ''} onChange={e => setSpreadsheetDraft(rows => rows.map(x => x.id === p.id ? { ...x, notes: e.target.value } : x))} /></td>{draftColumns.map(c => <td key={c}><input value={String(p.data?.[c] ?? '')} onChange={e => editDraft(p.id, c, e.target.value)} /></td>)}</tr>)}</tbody>
      </table></div>
      {!spreadsheetDraft.length && <p className="empty">Choose a project containing poles to edit its spreadsheet.</p>}
    </section>}
    {page === 'lists' && <section className="data-page list-page">
      <div className="list-controls"><div className="status-tabs"><button className={listStatus === 'Outstanding' ? 'active' : ''} onClick={() => setListStatus('Outstanding')}>Outstanding ({outstanding})</button><button className={listStatus === 'Completed' ? 'active' : ''} onClick={() => setListStatus('Completed')}>Completed ({done})</button><button className={listStatus === 'Problem' ? 'active' : ''} onClick={() => setListStatus('Problem')}>Problems ({problems})</button></div><input placeholder="Search this list…" value={search} onChange={e => setSearch(e.target.value)} /></div>
      <div className="record-table-wrap"><table className="record-table"><thead><tr><th>Pole reference</th><th>Grid reference</th><th>Exchange</th><th>Status</th><th>Notes</th><th></th></tr></thead><tbody>{listRows.map(p => <tr key={p.id}><td><strong>{p.pole_ref || 'Unlabelled pole'}</strong></td><td>{p.grid_reference}</td><td>{exchangeOf(p) || '—'}</td><td><span className={`status-pill ${p.status.toLowerCase()}`}>{p.status}</span></td><td>{p.notes || '—'}</td><td><button className="ghost" onClick={() => setSelected(p)}>View / edit</button></td></tr>)}</tbody></table>{!listRows.length && <p className="empty">No {listStatus.toLowerCase()} poles found.</p>}</div>
    </section>}
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
