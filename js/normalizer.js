/* Compartido SIN modificaciones entre navegador, pruebas y Apps Script (Normalizer.gs). */
(function (root) {
  'use strict';
  const key = v => String(v == null ? '' : v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  function id(v) {
    if (typeof v === 'number') {
      if (!Number.isSafeInteger(v) || v < 0) return '';
      return String(v);
    }
    const s = String(v == null ? '' : v).trim();
    if (/^\d+\.0+$/.test(s)) return s.split('.')[0];
    return /^\d+$/.test(s) ? s : '';
  }
  function url(v) {
    const s = String(v || '').trim();
    return /^https:\/\/[^\s]+$/i.test(s) && s.length < 2048 ? s : '';
  }
  function date(v) {
    if (!v) return '';
    if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
    if (typeof v === 'number') return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000).toISOString().slice(0, 10);
    const s = String(v).trim();
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return iso[0];
    const local = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    return local ? local[3] + '-' + local[2].padStart(2, '0') + '-' + local[1].padStart(2, '0') : '';
  }
  function headers(rows, required, sheet) {
    if (!rows.length) throw new Error('La pestaña ' + sheet + ' está vacía.');
    const cols = rows[0].map(key);
    const out = {};
    required.forEach(name => {
      const index = cols.indexOf(key(name));
      if (index < 0) throw new Error('Falta la columna "' + name + '" en ' + sheet + '.');
      out[name] = index;
    });
    return out;
  }
  function build(flat, badges) {
    const h = headers(flat, ['fechaInicio','ultimaAccion','fechaFinal','percAprob','capCapacitacionId','Capacitación','capUsuarioId','Nombre','Cedula','Insignia'], 'Archivo Plano');
    const b = headers(badges, ['Id','Nombre','Insignia'], 'Insignias');
    const catalog = new Map(), people = new Map(), courseIds = new Set(), catalogBadgeUrls = new Set();
    const report = { rows: 0, approved: 0, duplicates: 0, invalid: 0, notApproved: 0, missingBadge: 0, warnings: [] };
    badges.slice(1).forEach(row => {
      const courseId = id(row[b.Id]);
      if (courseId) catalog.set(courseId, {name: String(row[b.Nombre] || '').trim(), image: url(row[b.Insignia])});
    });
    flat.slice(1).forEach((row, index) => {
      if (!row.some(v => v !== '' && v != null)) return;
      report.rows++;
      const cedula = id(row[h.Cedula]), courseId = id(row[h.capCapacitacionId]);
      const name = String(row[h.Nombre] || '').trim(), title = String(row[h['Capacitación']] || '').trim();
      if (!cedula || !courseId || !name || !title || cedula.length > 20) {
        report.invalid++;
        if (report.warnings.length < 15) report.warnings.push('Fila ' + (index + 2) + ': cédula, ID, nombre o capacitación inválidos.');
        return;
      }
      courseIds.add(courseId);
      const badge = catalog.get(courseId);
      const image = url(row[h.Insignia]) || (badge ? badge.image : '');
      if (image) catalogBadgeUrls.add(image);
      const percentage = Number(String(row[h.percAprob] == null ? '' : row[h.percAprob]).trim().replace('%','').replace(',','.'));
      if (percentage !== 100) { report.notApproved++; return; }
      report.approved++;
      if (!people.has(cedula)) people.set(cedula, {cedula, name, nameDate: '', courses: new Map()});
      const person = people.get(cedula);
      const updated = date(row[h.ultimaAccion]) || date(row[h.fechaFinal]) || date(row[h.fechaInicio]);
      if (updated >= person.nameDate) { person.name = name; person.nameDate = updated; }
      const course = {id: courseId, title, date: date(row[h.fechaFinal]) || updated, image, badgeName: badge && badge.name ? badge.name : title, approval:100};
      const previous = person.courses.get(courseId);
      if (previous) {
        report.duplicates++;
        if (course.date >= previous.date) person.courses.set(courseId, {...course, image: course.image || previous.image});
        else if (!previous.image && course.image) previous.image = course.image;
      } else person.courses.set(courseId, course);
    });
    const profiles = Array.from(people.values()).map(p => {
      const courses = Array.from(p.courses.values()).sort((a,b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
      const earned = new Map();
      courses.forEach(c => {
        if (!c.image) report.missingBadge++;
        else if (!earned.has(c.image)) earned.set(c.image, {image:c.image, name:c.badgeName, date:c.date});
      });
      return {cedula:p.cedula, name:p.name, courses, badges:Array.from(earned.values())};
    }).sort((a,b) => a.cedula.localeCompare(b.cedula));
    return {profiles, report, summary:{people:profiles.length, courseCount:courseIds.size, badgeCount:catalogBadgeUrls.size, rows:report.rows, completed:profiles.reduce((n,p)=>n+p.courses.length,0)}};
  }
  root.ArcadeNormalizer = {build,id,url,date};
  if (typeof module !== 'undefined' && module.exports) module.exports = root.ArcadeNormalizer;
})(typeof globalThis !== 'undefined' ? globalThis : this);
