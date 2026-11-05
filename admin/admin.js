(function () {
  'use strict';
  var BASE = document.querySelector('meta[name=base]').content, API = BASE + '/api', csrf = '', me = null, root = document.getElementById('app');
  var fmt = function (t) { return t ? new Date(t).toLocaleString() : '—'; };
  // Safe DOM builder: text is always inserted as text nodes (never as HTML).
  function h(tag, attrs) {
    var e = document.createElement(tag), kids = Array.prototype.slice.call(arguments, 2);
    for (var k in (attrs || {})) { var v = attrs[k]; if (k === 'class') e.className = v; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v); else if (v === true) e.setAttribute(k, ''); else if (v !== false && v != null) e.setAttribute(k, v); }
    (function add(list) { list.forEach(function (c) { if (Array.isArray(c)) add(c); else if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); }); })(kids);
    return e;
  }
  function fill(el) { var kids = Array.prototype.slice.call(arguments, 1); el.replaceChildren(); (function add(l) { l.forEach(function (c) { if (Array.isArray(c)) add(c); else if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c))); }); })(kids); }
  function toast(m) { var t = h('div', { class: 'toast', role: 'status' }, m); document.body.append(t); setTimeout(function () { t.remove(); }, 2600); }
  function mount(el) { fill(root, el); window.scrollTo(0, 0); }

  function api(method, path, body, form) {
    var opt = { method: method, credentials: 'same-origin', headers: {} };
    if (csrf) opt.headers['X-CSRF-Token'] = csrf;
    if (form) opt.body = form; else if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    return fetch(API + path, opt).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || 'Request failed'); e.status = r.status; e.data = j; throw e; } return j; }); });
  }
  function withReauth(fn) {
    return fn().catch(function (e) {
      if (!(e.data && e.data.reauth)) throw e;
      return new Promise(function (res, rej) {
        var pw = h('input', { type: 'password', autocomplete: 'current-password', required: true }), code = h('input', { inputmode: 'numeric', maxlength: 6, autocomplete: 'one-time-code', required: true }), err = h('p', { class: 'err' });
        var m = h('div', { class: 'modal' }, h('form', { class: 'card', onsubmit: function (ev) { ev.preventDefault(); api('POST', '/reauth', { password: pw.value, code: code.value }).then(function () { m.remove(); fn().then(res, rej); }, function (x) { err.textContent = x.message; }); } },
          h('h2', null, 'Confirm it’s you'), h('p', { class: 'mut' }, 'This is a sensitive action. Enter your password and a current 2FA code.'),
          h('label', null, 'Password', pw), h('label', null, '6-digit code', code), err,
          h('div', { class: 'row' }, h('button', { class: 'btn', type: 'submit' }, 'Confirm'), h('button', { class: 'btn gh', type: 'button', onclick: function () { m.remove(); rej(new Error('Cancelled')); } }, 'Cancel'))));
        document.body.append(m); pw.focus();
      });
    });
  }
  function fail(e) { if (e.status === 401) { boot(); } toast(e.message || 'Something went wrong'); }

  // ---------- auth screens
  function authBox(title, sub) { var box = h('div', { class: 'box' }, h('img', { src: '/static/img/logo.png', alt: 'Prevolant' }), h('h1', null, title), sub ? h('p', { class: 'mut', style: 'margin:0' }, sub) : null); mount(h('div', { class: 'auth' }, box)); return box; }
  function loginView() {
    var email = h('input', { type: 'email', autocomplete: 'username', required: true }), pw = h('input', { type: 'password', autocomplete: 'current-password', required: true }), err = h('p', { class: 'err' }), btn = h('button', { class: 'btn', type: 'submit' }, 'Continue');
    var box = authBox('Admin sign in', 'Authorised Prevolant team only.');
    box.append(h('form', { class: 'form', onsubmit: function (ev) { ev.preventDefault(); btn.disabled = true; err.textContent = ''; api('POST', '/login', { email: email.value, password: pw.value }).then(function (r) { csrf = r.csrf; r.next === 'totp' ? totpView() : enrollView(); }, function (e) { err.textContent = e.message; btn.disabled = false; }); } }, h('label', null, 'Email', email), h('label', null, 'Password', pw), err, btn)); email.focus();
  }
  function go() { me.mustChangePw ? forcedPwView() : shell('dashboard'); }
  function afterLogin(r) { csrf = r.csrf; me = r.user; go(); }
  function totpView() {
    var code = h('input', { autocomplete: 'one-time-code', required: true, maxlength: 12, placeholder: '123456' }), err = h('p', { class: 'err' });
    var box = authBox('Two-factor code', 'Enter the 6-digit code from your authenticator app, or a backup code.');
    box.append(h('form', { class: 'form', onsubmit: function (ev) { ev.preventDefault(); api('POST', '/login/totp', { code: code.value }).then(afterLogin, function (e) { err.textContent = e.message; }); } }, h('label', null, 'Code', code), err, h('button', { class: 'btn', type: 'submit' }, 'Sign in'), h('button', { class: 'btn gh', type: 'button', onclick: loginView }, 'Back'))); code.focus();
  }
  function enrollView() {
    var box = authBox('Set up two-factor authentication', '2FA is required for every admin account. Scan the QR code with Google Authenticator, Microsoft Authenticator or Authy.');
    api('POST', '/2fa/setup', {}).then(function (s) {
      var code = h('input', { inputmode: 'numeric', maxlength: 6, autocomplete: 'one-time-code', required: true, placeholder: '123456' }), err = h('p', { class: 'err' });
      box.append(h('img', { src: s.qr, alt: 'QR code for authenticator app', width: 220, height: 220, style: 'height:220px;justify-self:center' }), h('p', { class: 'mut', style: 'word-break:break-all;margin:0' }, 'Or enter this key manually: ', h('b', null, s.secret)),
        h('form', { class: 'form', onsubmit: function (ev) { ev.preventDefault(); api('POST', '/2fa/confirm', { code: code.value }).then(function (r) { csrf = r.csrf; me = r.user; codesView(r.backupCodes); }, function (e) { err.textContent = e.message; }); } }, h('label', null, 'Enter the 6-digit code to confirm', code), err, h('button', { class: 'btn', type: 'submit' }, 'Enable 2FA')));
    }, function (e) { box.append(h('p', { class: 'err' }, e.message)); });
  }
  function codesView(codes) {
    var box = authBox('Save your backup codes', 'Each code works once if you lose your phone. They are shown only now. Store them somewhere safe (a password manager).');
    box.append(h('div', { class: 'codes' }, codes.map(function (c) { return h('span', null, c); })), h('button', { class: 'btn gh', type: 'button', onclick: function () { navigator.clipboard && navigator.clipboard.writeText(codes.join('\n')).then(function () { toast('Copied'); }); } }, 'Copy codes'), h('button', { class: 'btn', type: 'button', onclick: function () { me.mustChangePw ? forcedPwView() : shell('dashboard'); } }, 'I saved them – continue'));
  }
  function forcedPwView() {
    var cur = h('input', { type: 'password', autocomplete: 'current-password', required: true }), nw = h('input', { type: 'password', autocomplete: 'new-password', required: true, minlength: 12 }), err = h('p', { class: 'err' });
    var box = authBox('Choose a new password', 'Use at least 12 characters. A long passphrase works best.');
    box.append(h('form', { class: 'form', onsubmit: function (ev) { ev.preventDefault(); api('POST', '/password', { current: cur.value, next: nw.value }).then(function () { me.mustChangePw = false; shell('dashboard'); }, function (e) { err.textContent = e.message; }); } }, h('label', null, 'Temporary / current password', cur), h('label', null, 'New password', nw), err, h('button', { class: 'btn', type: 'submit' }, 'Save password')));
  }

  // ---------- shell + routing
  var VIEWS = {};
  function shell(view) {
    var items = [['dashboard', 'Dashboard'], ['enquiries', 'Enquiries', 1], ['content', 'Content'], ['media', 'Media'], ['users', 'Users', 2], ['audit', 'Audit log', 2], ['security', 'Security']];
    var main = h('main', { id: 'main' });
    var nav = items.filter(function (i) { return !i[2] || (i[2] === 1 && me.role !== 'editor') || (i[2] === 2 && me.role === 'owner'); }).map(function (i) { return h('a', { class: 'nv' + (i[0] === view ? ' on' : ''), href: '#' + i[0], onclick: function (e) { e.preventDefault(); shell(i[0]); } }, i[1]); });
    mount(h('div', { class: 'shell' }, h('nav', { class: 'side', 'aria-label': 'Admin' }, h('img', { src: '/static/img/logo.png', alt: 'Prevolant' }), nav, h('a', { class: 'nv', href: '/', target: '_blank', rel: 'noopener' }, 'View site ↗'), h('a', { class: 'nv', href: '#out', onclick: function (e) { e.preventDefault(); api('POST', '/logout', {}).then(function () { csrf = ''; me = null; loginView(); }); } }, 'Sign out'), h('div', { class: 'who' }, me.name + ' · ' + me.role)), main));
    (VIEWS[view] || VIEWS.dashboard)(main);
  }
  function head(t, right) { return h('div', { class: 'top' }, h('h1', null, t), right || null); }

  VIEWS.dashboard = function (m) {
    m.append(head('Welcome, ' + me.name.split(' ')[0]));
    api('GET', '/dashboard').then(function (d) {
      var s = function (n, l) { return h('div', { class: 'card stat' }, h('b', null, n == null ? '–' : n), h('span', null, l)); };
      m.append(h('div', { class: 'grid' }, s(d.newEnquiries, 'New enquiries'), s(d.totalEnquiries, 'Total enquiries'), s(d.unpublished.length, 'Sections with unpublished changes'), s(d.media, 'Media files')));
      if (d.unpublished.length) m.append(h('p', { class: 'card' }, h('b', null, 'Unpublished drafts: '), d.unpublished.join(', '), '. Open Content to review and publish.'));
      if (d.recent.length) m.append(h('div', { class: 'card', style: 'margin-top:16px' }, h('h2', null, 'Recent activity'), h('table', null, h('tbody', null, d.recent.map(function (r) { return h('tr', null, h('td', null, fmt(r.ts)), h('td', null, r.email || '—'), h('td', null, r.action)); })))));
    }, fail);
  };

  VIEWS.enquiries = function (m) {
    var st = h('select', { 'aria-label': 'Filter by status' }, ['', 'new', 'read', 'replied'].map(function (v) { return h('option', { value: v }, v || 'All statuses'); })), q = h('input', { type: 'search', placeholder: 'Search…', 'aria-label': 'Search enquiries' }), box = h('div');
    m.append(head('Enquiries', h('button', { class: 'btn gh', onclick: exportCsv }, 'Export CSV')));
    m.append(h('div', { class: 'row', style: 'margin-bottom:14px' }, st, q), box);
    function csvFetch() { return fetch(API + '/enquiries/export.csv', { credentials: 'same-origin' }).then(function (r) { if (!r.ok) return r.json().then(function (j) { var er = new Error(j.error || 'Export failed'); er.data = j; er.status = r.status; throw er; }); return r.blob(); }); }
    function exportCsv() { withReauth(csvFetch).then(function (b) { var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'enquiries.csv'; document.body.append(a); a.click(); a.remove(); }, function (e) { if (e.message !== 'Cancelled') fail(e); }); }
    function load() {
      api('GET', '/enquiries?status=' + st.value + '&q=' + encodeURIComponent(q.value)).then(function (rows) {
        fill(box, rows.length ? h('table', { class: 'rt' }, h('thead', null, h('tr', null, ['Date', 'Name', 'Service', 'Message', 'Status'].map(function (x) { return h('th', null, x); }))), h('tbody', null, rows.map(function (r) {
          return h('tr', { class: 'click', tabindex: 0, onclick: function () { open(r.id); }, onkeydown: function (e) { if (e.key === 'Enter') open(r.id); } }, h('td', { 'data-l': 'Date' }, fmt(r.created_at)), h('td', { 'data-l': 'Name' }, h('b', null, r.name)), h('td', { 'data-l': 'Service' }, r.service), h('td', { 'data-l': 'Message' }, r.preview), h('td', { 'data-l': 'Status' }, h('span', { class: 'badge ' + (r.status === 'new' ? 'y' : r.status === 'replied' ? 'g' : '') }, r.status)));
        }))) : h('p', { class: 'card mut' }, 'No enquiries yet.'));
      }, fail);
    }
    function open(id) {
      api('GET', '/enquiries/' + id).then(function (e) {
        var note = h('textarea', { maxlength: 2000, placeholder: 'Internal note (encrypted)' }, e.note), mod = h('div', { class: 'modal', onclick: function (ev) { if (ev.target === mod) { mod.remove(); load(); } } });
        var setS = function (s) { api('PATCH', '/enquiries/' + id, { status: s }).then(function () { toast('Marked ' + s); }, fail); };
        mod.append(h('div', { class: 'card', style: 'max-width:640px' }, h('div', { class: 'row sp' }, h('h2', null, e.name), h('button', { class: 'btn gh sm', onclick: function () { mod.remove(); load(); } }, 'Close')),
          h('p', { class: 'mut', style: 'margin:0' }, fmt(e.created_at), ' · ', e.service), h('p', { style: 'margin:0' }, h('a', { href: 'mailto:' + encodeURI(e.email) }, e.email), e.phone ? ' · ' : '', e.phone ? h('a', { href: 'tel:' + e.phone.replace(/[^\d+]/g, '') }, e.phone) : ''),
          h('div', { class: 'msg' }, e.message), note,
          h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: function () { api('PATCH', '/enquiries/' + id, { note: note.value }).then(function () { toast('Note saved'); }, fail); } }, 'Save note'), h('button', { class: 'btn gh sm', onclick: function () { setS('replied'); } }, 'Mark replied'), h('button', { class: 'btn gh sm', onclick: function () { setS('new'); } }, 'Mark unread'),
            h('button', { class: 'btn rd sm', onclick: function () { if (confirm('Delete this enquiry permanently?')) api('DELETE', '/enquiries/' + id).then(function () { mod.remove(); load(); }, fail); } }, 'Delete'))));
        document.body.append(mod);
      }, fail);
    }
    st.onchange = load; var tm; q.oninput = function () { clearTimeout(tm); tm = setTimeout(load, 250); }; load();
  };

  // ---------- content editor (schema driven)
  function fieldsEl(fields, obj, media) {
    return h('div', { class: 'form' }, fields.map(function (f) {
      if (f.type === 'text') return h('label', null, f.label, h('input', { value: obj[f.k] || '', maxlength: f.max, oninput: function (e) { obj[f.k] = e.target.value; } }));
      if (f.type === 'textarea') return h('label', null, f.label, h('textarea', { maxlength: f.max, oninput: function (e) { obj[f.k] = e.target.value; } }, obj[f.k] || ''));
      if (f.type === 'bool') return h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: !!obj[f.k], onchange: function (e) { obj[f.k] = e.target.checked; } }), f.label);
      if (f.type === 'strlist') return h('label', null, f.label + (f.hint ? ' (' + f.hint.toLowerCase() + ')' : ''), h('textarea', { oninput: function (e) { obj[f.k] = e.target.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean); } }, (obj[f.k] || []).join('\n')));
      if (f.type === 'image') {
        var img = h('img', { src: obj[f.k] || '', alt: '' }), url = h('small', null, obj[f.k] || 'No image'), file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', style: 'display:none', onchange: function (e) { var fd = new FormData(); fd.append('file', e.target.files[0]); api('POST', '/media', undefined, fd).then(function (r) { obj[f.k] = r.url; img.src = r.url; url.textContent = r.url; toast('Uploaded'); }, fail); } });
        var pick = h('select', { 'aria-label': 'Choose from library', onchange: function (e) { if (e.target.value) { obj[f.k] = e.target.value; img.src = e.target.value; url.textContent = e.target.value; } } }, h('option', { value: '' }, 'Choose from library…'), (media || []).map(function (x) { return h('option', { value: x }, x.replace('/media/', '').replace('/static/img/', '')); }));
        return h('div', { class: 'imgf' }, img, h('div', { class: 'form', style: 'gap:8px;flex:1;min-width:200px' }, h('b', { style: 'font-size:13px' }, f.label), url, h('div', { class: 'row' }, h('button', { class: 'btn gh sm', type: 'button', onclick: function () { file.click(); } }, 'Upload new'), pick), file));
      }
      if (f.type === 'list') {
        obj[f.k] = obj[f.k] || []; var wrap = h('div', { class: 'form' });
        var draw = function () {
          fill(wrap, obj[f.k].map(function (it, i) {
            return h('div', { class: 'item' }, h('div', { class: 'row sp' }, h('b', null, f.label.replace(/s$/, '') + ' ' + (i + 1)), h('div', { class: 'row' },
              h('button', { class: 'btn gh sm', type: 'button', 'aria-label': 'Move up', disabled: i === 0, onclick: function () { obj[f.k].splice(i - 1, 0, obj[f.k].splice(i, 1)[0]); draw(); } }, '↑'),
              h('button', { class: 'btn gh sm', type: 'button', 'aria-label': 'Move down', disabled: i === obj[f.k].length - 1, onclick: function () { obj[f.k].splice(i + 1, 0, obj[f.k].splice(i, 1)[0]); draw(); } }, '↓'),
              h('button', { class: 'btn rd sm', type: 'button', onclick: function () { obj[f.k].splice(i, 1); draw(); } }, 'Remove'))), fieldsEl(f.fields, it, media));
          }), h('button', { class: 'btn gh', type: 'button', onclick: function () { obj[f.k].push({}); draw(); } }, '+ Add ' + f.label.toLowerCase().replace(/s$/, '')));
        };
        draw(); return h('div', { class: 'form' }, h('h3', null, f.label), wrap);
      }
    }));
  }
  VIEWS.content = function (m) {
    m.append(head('Content'), h('p', { class: 'mut' }, 'Edit a section, save your draft, preview it, then publish to update the live site.'));
    var box = h('div', { class: 'grid' }); m.append(box);
    api('GET', '/content').then(function (rows) {
      fill(box, rows.map(function (r) { return h('a', { class: 'card', href: '#c', style: 'text-decoration:none;color:inherit', onclick: function (e) { e.preventDefault(); edit(r.key); } }, h('div', { class: 'row sp' }, h('h3', null, r.title), r.dirty ? h('span', { class: 'badge y' }, 'Draft') : h('span', { class: 'badge g' }, 'Live')), h('p', { class: 'mut', style: 'margin:6px 0 0' }, 'Updated ' + fmt(r.updated_at))); }));
    }, fail);
    function edit(key) {
      Promise.all([api('GET', '/content/' + key), api('GET', '/media').catch(function () { return []; })]).then(function (rs) {
        var c = rs[0], media = rs[1].map(function (x) { return x.url; }).concat(['/static/img/projects-shivraj.jpg', '/static/img/projects-medplus.jpg', '/static/img/projects-school.jpg', '/static/img/team-varun.jpg', '/static/img/team-ritesh.jpg', '/static/img/team-aadarsh.jpg', '/static/img/team-janardan.jpg', '/static/img/team-shreyash.jpg']);
        var data = c.draft, body = fieldsEl(c.fields, data, media);
        var save = function (pub) { return api('PUT', '/content/' + key, { value: data }).then(function (r) { data = r.draft; return pub ? api('POST', '/content/' + key + '/publish', {}).then(function () { toast('Published – the live site is updated'); }) : toast('Draft saved'); }).catch(fail); };
        var bar = h('div', { class: 'row' }, h('button', { class: 'btn', onclick: function () { save(true); } }, 'Save & publish'), h('button', { class: 'btn gh', onclick: function () { save(false); } }, 'Save draft'), h('a', { class: 'btn gh', href: API + '/preview', target: '_blank', rel: 'noopener' }, 'Preview draft ↗'),
          h('button', { class: 'btn gh', onclick: function () { if (confirm('Discard unpublished changes?')) api('POST', '/content/' + key + '/discard', {}).then(function () { edit(key); }, fail); } }, 'Discard changes'));
        fill(m, head(c.title, h('button', { class: 'btn gh', onclick: function () { shell('content'); } }, '← All sections')), h('p', { class: 'mut' }, 'Use “Save draft” and “Preview draft” first if you want to check changes before they go live.'), h('div', { class: 'card' }, body), h('div', { style: 'margin-top:16px' }, bar));
      }, fail);
    }
  };

  VIEWS.media = function (m) {
    var grid = h('div', { class: 'mgrid' }), file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', style: 'display:none', onchange: function (e) { var fd = new FormData(); fd.append('file', e.target.files[0]); api('POST', '/media', undefined, fd).then(function () { toast('Uploaded'); load(); }, fail); } });
    m.append(head('Media library', h('button', { class: 'btn', onclick: function () { file.click(); } }, 'Upload image')), file, h('p', { class: 'mut' }, 'JPEG, PNG or WebP up to 5 MB. Images are re-encoded and stripped of metadata for safety.'), grid);
    function load() { api('GET', '/media').then(function (rows) { fill(grid, rows.length ? rows.map(function (r) { return h('figure', null, h('img', { src: r.url, alt: '', loading: 'lazy' }), h('div', { class: 'row', style: 'margin-top:8px' }, h('button', { class: 'btn gh sm', onclick: function () { navigator.clipboard && navigator.clipboard.writeText(r.url); toast('URL copied'); } }, 'Copy URL'), me.role !== 'editor' ? h('button', { class: 'btn rd sm', onclick: function () { if (confirm('Delete this image?')) api('DELETE', '/media/' + r.id).then(load, fail); } }, 'Delete') : null)); }) : h('p', { class: 'mut' }, 'No uploads yet.')); }, fail); }
    load();
  };

  VIEWS.users = function (m) {
    var box = h('div'), name = h('input', { required: true, placeholder: 'Full name' }), email = h('input', { type: 'email', required: true, placeholder: 'Email' }), role = h('select', null, ['editor', 'admin', 'owner'].map(function (r) { return h('option', { value: r }, r); }));
    var shown = function (title, pw) { var mod = h('div', { class: 'modal' }, h('div', { class: 'card' }, h('h2', null, title), h('p', { class: 'mut' }, 'Share this temporary password securely. It is shown only once. The user must change it and set up 2FA at first sign-in.'), h('div', { class: 'codes', style: 'grid-template-columns:1fr' }, h('span', null, pw)), h('button', { class: 'btn', onclick: function () { mod.remove(); load(); } }, 'Done'))); document.body.append(mod); };
    m.append(head('Users'), h('form', { class: 'card form', style: 'margin-bottom:16px', onsubmit: function (e) { e.preventDefault(); withReauth(function () { return api('POST', '/users', { name: name.value, email: email.value, role: role.value }); }).then(function (r) { name.value = email.value = ''; shown('User created', r.tempPassword); }, fail); } }, h('h2', null, 'Add a user'), h('div', { class: 'grid' }, h('label', null, 'Name', name), h('label', null, 'Email', email), h('label', null, 'Role', role)), h('p', { class: 'mut', style: 'margin:0' }, 'Owner: everything · Admin: content and enquiries · Editor: content and media only.'), h('div', null, h('button', { class: 'btn', type: 'submit' }, 'Create user'))), box);
    function load() { api('GET', '/users').then(function (rows) { fill(box, h('div', { class: 'card' }, h('table', { class: 'rt' }, h('thead', null, h('tr', null, ['User', 'Role', '2FA', 'Last sign-in', ''].map(function (x) { return h('th', null, x); }))), h('tbody', null, rows.map(function (u) {
      var self = u.id === me.id, act = function (fn) { return function () { withReauth(fn).then(load, fail); }; };
      return h('tr', null, h('td', { 'data-l': 'User' }, h('b', null, u.name), h('br'), u.email, u.disabled ? h('span', { class: 'badge r' }, 'disabled') : null), h('td', { 'data-l': 'Role' }, self ? u.role : h('select', { onchange: function (e) { act(function () { return api('PATCH', '/users/' + u.id, { role: e.target.value }); })(); } }, ['editor', 'admin', 'owner'].map(function (r) { return h('option', { value: r, selected: r === u.role }, r); }))), h('td', { 'data-l': '2FA' }, u.totp ? 'On' : 'Not set'), h('td', { 'data-l': 'Last sign-in' }, fmt(u.last_login_at)),
        h('td', null, self ? h('span', { class: 'mut' }, 'You') : h('div', { class: 'row' }, h('button', { class: 'btn gh sm', onclick: act(function () { return api('PATCH', '/users/' + u.id, { disabled: !u.disabled }); }) }, u.disabled ? 'Enable' : 'Disable'),
          h('button', { class: 'btn gh sm', onclick: function () { if (confirm('Reset password and 2FA for ' + u.email + '?')) withReauth(function () { return api('POST', '/users/' + u.id + '/reset', {}); }).then(function (r) { shown('Password reset', r.tempPassword); }, fail); } }, 'Reset'),
          h('button', { class: 'btn rd sm', onclick: function () { if (confirm('Delete ' + u.email + '?')) act(function () { return api('DELETE', '/users/' + u.id); })(); } }, 'Delete'))));
    }))))); }, fail); }
    load();
  };

  VIEWS.audit = function (m) {
    var tb = h('tbody'), last = null, more = h('button', { class: 'btn gh', onclick: load }, 'Load more');
    m.append(head('Audit log'), h('div', { class: 'card' }, h('table', { class: 'rt' }, h('thead', null, h('tr', null, ['Time', 'User', 'Action', 'Detail', 'IP'].map(function (x) { return h('th', null, x); }))), tb)), h('div', { style: 'margin-top:14px' }, more));
    function load() { api('GET', '/audit' + (last ? '?before=' + last : '')).then(function (rows) { rows.forEach(function (r) { last = r.id; tb.append(h('tr', null, h('td', { 'data-l': 'Time' }, fmt(r.ts)), h('td', { 'data-l': 'User' }, r.email || '—'), h('td', { 'data-l': 'Action' }, h('b', null, r.action)), h('td', { 'data-l': 'Detail' }, r.detail || ''), h('td', { 'data-l': 'IP' }, r.ip || ''))); }); if (rows.length < 100) more.remove(); }, fail); }
    load();
  };

  VIEWS.security = function (m) {
    var cur = h('input', { type: 'password', autocomplete: 'current-password', required: true }), nw = h('input', { type: 'password', autocomplete: 'new-password', required: true, minlength: 12 }), sess = h('div');
    m.append(head('Security'), h('form', { class: 'card form', style: 'margin-bottom:16px;max-width:520px', onsubmit: function (e) { e.preventDefault(); withReauth(function () { return api('POST', '/password', { current: cur.value, next: nw.value }); }).then(function () { cur.value = nw.value = ''; toast('Password changed. Other sessions were signed out.'); load(); }, fail); } }, h('h2', null, 'Change password'), h('label', null, 'Current password', cur), h('label', null, 'New password (12+ characters)', nw), h('div', null, h('button', { class: 'btn', type: 'submit' }, 'Update password'))),
      h('div', { class: 'card' }, h('div', { class: 'row sp' }, h('h2', null, 'Active sessions'), h('button', { class: 'btn gh sm', onclick: function () { api('POST', '/sessions/revoke-others', {}).then(function () { toast('Other sessions signed out'); load(); }, fail); } }, 'Sign out all other sessions')), sess));
    function load() { api('GET', '/sessions').then(function (rows) { fill(sess, h('table', { class: 'rt' }, h('thead', null, h('tr', null, ['Device', 'IP', 'Last active', ''].map(function (x) { return h('th', null, x); }))), h('tbody', null, rows.map(function (s) { return h('tr', null, h('td', { 'data-l': 'Device' }, (s.ua || '').slice(0, 60), s.current ? h('span', { class: 'badge g' }, 'this device') : null), h('td', { 'data-l': 'IP' }, s.ip || ''), h('td', { 'data-l': 'Last active' }, fmt(s.last_seen)), h('td', null, s.current ? '' : h('button', { class: 'btn rd sm', onclick: function () { api('DELETE', '/sessions/' + s.handle).then(load, fail); } }, 'Sign out'))); })))); }, fail); }
    load();
  };

  function boot() {
    api('GET', '/me').then(function (r) { csrf = r.csrf; me = r.user; go(); }, function () { loginView(); });
  }
  boot();
})();
