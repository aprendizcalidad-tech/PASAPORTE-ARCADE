'use strict';

const project = 'https://ztswmfmnknpmvamulxcm.supabase.co';
const publishableKey = 'sb_publishable_3d8oXyuU4UPEpVQ7ycvMwg_Gzq6c6JR';
const get = (id) => document.getElementById(id);
const login = get('login-form');
const form = get('import-form');
const preview = get('preview');
const kind = get('kind');
let token;
let batch;
let busy = false;

function report(message, tone = '') {
  get('status').dataset.tone = tone;
  get('status').textContent = message;
}

async function request(path, body, accessToken) {
  const headers = { apikey: publishableKey, 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = 'Bearer ' + accessToken;
  const response = await fetch(project + path, {
    method: 'POST', headers, body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || result.msg || result.error_description || 'Error al conectar con Supabase');
  }
  return result;
}

const rpc = (action, parameters = {}) => request(
  '/rest/v1/rpc/passport_admin_import', { action, ...parameters }, token
);

async function run(task) {
  if (busy) return;
  busy = true;
  const controls = [...document.querySelectorAll('button, input, select')];
  for (const control of controls) control.disabled = true;
  try {
    await task();
  } catch (error) {
    report(error.message === 'JWT expired' ? 'La sesión venció. Cierra sesión y vuelve a ingresar.' : error.message, 'error');
  } finally {
    for (const control of controls) control.disabled = false;
    busy = false;
  }
}

login.addEventListener('submit', (event) => {
  event.preventDefault();
  run(async () => {
    report('Verificando acceso…');
    const session = await request('/auth/v1/token?grant_type=password', {
      email: get('email').value.trim(), password: get('password').value
    });
    try {
      await request('/rest/v1/rpc/passport_admin_import', { action: 'access' }, session.access_token);
    } finally {
      get('password').value = '';
    }
    token = session.access_token;
    get('login').hidden = true;
    get('workspace').hidden = false;
    get('logout').hidden = false;
    await openPanel('dashboard');
  });
});

get('logout').addEventListener('click', () => location.reload());

const panelButtons = [...document.querySelectorAll('[data-view]')];
const panels = [...document.querySelectorAll('[data-panel]')];
const formatCount = new Intl.NumberFormat('es-CO');

function renderDashboard(data) {
  const { people, courses, badges, approvals, year, top_courses: topCourses } = data;
  get('reference-year').textContent = 'Catálogo activo · ' + year;
  for (const [key, count] of Object.entries({ people, courses, badges })) {
    get('metric-' + key).textContent = formatCount.format(count);
  }
  const coverage = courses ? badges / courses : 0;
  get('badge-ring').style.setProperty('--coverage', coverage * 100 + '%');
  const percent = new Intl.NumberFormat('es-CO', { style: 'percent', maximumFractionDigits: 1 });
  get('badge-percent').textContent = percent.format(coverage);
  get('badge-covered').textContent = formatCount.format(badges);
  get('badge-missing').textContent = formatCount.format(courses - badges);
  get('approval-total').textContent = approvals
    ? formatCount.format(approvals) + ' aprobaciones registradas en total'
    : 'Todavía no hay aprobaciones registradas.';

  const maximum = topCourses[0]?.approvals;
  get('top-courses').replaceChildren(...topCourses.map((course) => {
    const item = document.createElement('li');
    const title = document.createElement('span');
    const count = document.createElement('strong');
    const bar = document.createElement('span');
    title.textContent = course.title;
    count.textContent = formatCount.format(course.approvals);
    bar.className = 'rank-bar';
    bar.style.setProperty('--rank', course.approvals / maximum * 100 + '%');
    bar.setAttribute('aria-hidden', 'true');
    item.append(title, count, bar);
    return item;
  }));
}

function renderAccess(accounts) {
  const current = accounts.find((account) => account.current);
  get('account-email').textContent = current.email;
  get('account-role').textContent = current.role;
  get('access-list').replaceChildren(...accounts.map((account) => {
    const item = document.createElement('li');
    const email = document.createElement('span');
    const role = document.createElement('span');
    email.textContent = account.email + (account.current ? ' · Mi cuenta' : '');
    role.textContent = account.role + (account.confirmed ? '' : ' · Correo pendiente de confirmar');
    role.className = 'panel-role';
    item.append(email, role);
    return item;
  }));
}

async function openPanel(view) {
  panels.forEach((panel) => { panel.hidden = panel.id !== view; });
  panelButtons.forEach((button) => {
    if (button.dataset.view === view) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  get('back-menu').hidden = view !== 'update';
  get('back-passport').hidden = view === 'update';
  get(view).querySelector('h1').focus();
  report('');

  if (view === 'update') {
    report(batch ? 'Revisa la vista previa antes de publicar.' : 'Selecciona el archivo que quieres actualizar.');
    return;
  }

  const state = get(view + '-state');
  const content = get(view + '-data');
  content.hidden = true;
  state.textContent = 'Consultando información…';
  try {
    const data = await request('/rest/v1/rpc/passport_admin_overview', { section: view }, token);
    if (view === 'dashboard' && !data) {
      state.textContent = 'Todavía no hay un catálogo activo.';
      return;
    }
    if (view === 'dashboard') renderDashboard(data);
    else renderAccess(data);
    state.textContent = '';
    content.hidden = false;
  } catch (error) {
    state.textContent = error.message === 'JWT expired'
      ? 'La sesión venció. Cierra sesión y vuelve a ingresar.'
      : 'No se pudo cargar la información. Vuelve a seleccionar esta opción para reintentar.';
  }
}

panelButtons.forEach((button) => {
  button.addEventListener('click', () => run(() => openPanel(button.dataset.view)));
});
get('back-menu').addEventListener('click', () => run(() => openPanel('dashboard')));


function resetPreview() {
  batch = undefined;
  preview.hidden = true;
  get('format').textContent = kind.value === 'catalog'
    ? 'Columnas ID, CAPACITACION e INSIGNIAS. Deja el enlace vacío para conservar la insignia guardada.'
    : 'Columnas ID, CAPACITACION, NOMBRE, CEDULA y última_accion. Incluye solo cursos aprobados. El historial se conserva.';
}

function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function identifier(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('Identificador numérico sin precisión');
  const text = String(value ?? '').trim();
  if (!/^\d{1,20}$/.test(text)) throw new Error('ID o cédula inválidos');
  return text;
}

function activityDate(value) {
  const text = value instanceof Date ? value.toISOString().slice(0, 19) : String(value ?? '').trim();
  const match = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}:\d{2})(?:\.\d+)?)?$/.exec(text);
  if (!match) throw new Error('Fecha inválida. Usa una fecha de Excel o AAAA-MM-DD');
  const date = match[1] + 'T' + (match[2] || '00:00:00');
  const parsed = new Date(date + 'Z');
  if (isNaN(parsed) || parsed.toISOString().slice(0, 19) !== date) throw new Error('Fecha inválida');
  return date.replace('T', ' ');
}

async function readRows(file, type) {
  if (file.size > 25 * 1024 * 1024) throw new Error('El Excel supera los 25 MB');
  const book = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  const required = type === 'catalog'
    ? ['id', 'capacitacion', 'insignias']
    : ['id', 'capacitacion', 'nombre', 'cedula', 'ultima_accion'];
  let sheet;
  let columns;
  let start;
  for (const name of book.SheetNames) {
    const candidate = book.Sheets[name];
    if (!candidate['!ref']) continue;
    const range = XLSX.utils.decode_range(candidate['!ref']);
    const indices = required.map((header) => {
      for (let c = range.s.c; c <= range.e.c && c < 256; c++) {
        if (normalize(candidate[XLSX.utils.encode_cell({ r: range.s.r, c })]?.v) === header) return c;
      }
      return -1;
    });
    if (indices.every((index) => index >= 0)) {
      sheet = candidate;
      columns = indices;
      start = range.s.r;
      break;
    }
  }
  if (!sheet) throw new Error('Faltan columnas: ' + required.join(', '));
  const end = XLSX.utils.decode_range(sheet['!ref']).e.r;
  if (end - start > 125000) throw new Error('El archivo supera las 125.000 filas');
  const rows = [];
  const errors = [];
  let invalid = 0;
  let missing = 0;
  for (let r = start + 1; r <= end; r++) {
    const cells = columns.map((c) => sheet[XLSX.utils.encode_cell({ r, c })]);
    if (cells.every((cell) => cell?.v == null || cell.v === '')) continue;
    try {
      const id = identifier(cells[0]?.v);
      if (type === 'catalog') {
        const title = String(cells[1]?.v ?? '').trim();
        const url = String(cells[2]?.l?.Target ?? cells[2]?.v ?? '').trim();
        if (!title || title.length > 1000) throw new Error('Nombre del curso inválido');
        if (url && (!/^https:\/\/[^\s/]+\/\S+$/.test(url) || url.length > 2047)) throw new Error('Enlace HTTPS inválido');
        rows.push({ id, title, url: url || null });
      } else {
        if (!String(cells[3]?.v ?? '').trim()) {
          missing++;
          continue;
        }
        const cedula = identifier(cells[3].v);
        const name = String(cells[2]?.v ?? '').trim().replace(/\s+/g, ' ');
        if (!name || name.length > 300) throw new Error('Nombre inválido');
        rows.push({ id, cedula, name, activity: activityDate(cells[4]?.v) });
      }
    } catch (error) {
      invalid++;
      if (errors.length < 8) errors.push('Fila ' + (r + 1) + ': ' + error.message);
    }
  }
  if (invalid) throw new Error(invalid + ' filas con errores. ' + errors.join(' · '));
  if (!rows.length) throw new Error('El archivo no contiene registros válidos');
  return { rows, missing };
}

const labels = {
  nuevos: 'Cursos nuevos', cambios: 'Cursos que cambiarán', personas: 'Personas en el archivo',
  personas_nuevas: 'Personas nuevas', aprobaciones_nuevas: 'Aprobaciones nuevas',
  fechas_actualizadas: 'Fechas más recientes', filas_repetidas: 'Filas repetidas consolidadas',
  sin_cedula: 'Filas omitidas por falta de cédula'
};

function showSummary(stats) {
  const list = get('summary');
  list.replaceChildren();
  for (const [name, value] of Object.entries(stats)) {
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = labels[name];
    description.textContent = Number(value).toLocaleString('es-CO');
    list.append(term, description);
  }
}

for (const option of form.querySelectorAll('[name="import-type"]')) {
  option.addEventListener('change', () => {
    kind.value = option.value;
    resetPreview();
    report('Selecciona el archivo que quieres actualizar.');
  });
}
get('excel').addEventListener('change', () => {
  resetPreview();
  report(get('excel').files.length ? 'Archivo listo para revisar.' : 'Selecciona el archivo que quieres actualizar.');
});
form.addEventListener('submit', (event) => {
  event.preventDefault();
  run(async () => {
    resetPreview();
    report('Leyendo el Excel…');
    const { rows, missing } = await readRows(get('excel').files[0], kind.value);
    const size = 500;
    const total = Math.ceil(rows.length / size);
    const draft = await rpc('start', { kind: kind.value, part: total });
    for (let part = 0; part < total; part++) {
      report('Cargando bloque ' + (part + 1) + ' de ' + total + '…');
      await rpc('chunk', { batch: draft.batch, part, payload: rows.slice(part * size, (part + 1) * size) });
    }
    const stats = await rpc('preview', { batch: draft.batch });
    showSummary({ ...stats, ...(missing ? { sin_cedula: missing } : {}) });
    batch = draft.batch;
    preview.hidden = false;
    preview.focus();
    report('Revisa la vista previa antes de publicar.');
  });
});

get('publish').addEventListener('click', () => run(async () => {
  if (!batch) return;
  report('Publicando cambios…');
  await rpc('publish', { batch });
  form.reset();
  resetPreview();
  report('Cambios publicados en el Pasaporte del Conocimiento.', 'success');
}));

resetPreview();
