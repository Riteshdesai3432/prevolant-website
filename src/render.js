'use strict';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const tel = p => 'tel:' + String(p).replace(/[^\d+]/g, '');
const ARW = '<span class="ar" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>';
const IC = p => `<i aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg></i>`;
const d = (i, s = .08) => i ? ` style="--d:${(i * s).toFixed(2)}s"` : '';

function head(c, s, siteUrl, title, desc, extra = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><meta name="theme-color" content="#FDFEFF">
<link rel="canonical" href="${esc(siteUrl)}/"><link rel="icon" href="/static/img/icon.png" type="image/png">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(siteUrl)}/"><meta property="og:image" content="${esc(siteUrl)}/static/img/logo.png">
<meta name="twitter:card" content="summary"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"><link rel="stylesheet" href="/static/site.css">${extra}</head>`;
}

function render(c, opts) {
  const { siteUrl, turnstile, preview } = opts;
  const s = c.settings, h = c.hero, a = c.about, sv = c.services, ind = c.industries, w = c.work, y = c.why, p = c.process, t = c.team, ct = c.contact;
  const ld = { '@context': 'https://schema.org', '@type': 'Organization', name: 'Prevolant Software Services & Consultancy', url: siteUrl, logo: siteUrl + '/static/img/logo.png', email: s.email, telephone: s.phones[0], address: { '@type': 'PostalAddress', addressLocality: 'Kolhapur', addressRegion: 'Maharashtra', addressCountry: 'IN' }, sameAs: [s.linkedin, s.instagram].filter(Boolean) };
  const links = [['#top', 'Home'], ['#about', 'About'], ['#services', 'Services'], ['#work', 'Work'], ['#team', 'Team']];
  const svcNames = sv.items.map(i => i.title);
  const raw = svcNames.length;

  const nav = `<nav class="top" id="nav"><div class="nb"><a href="#top" aria-label="Prevolant home"><img src="/static/img/logo.png" alt="Prevolant" width="150" height="34"></a>
<div class="links"><a href="#top">Home</a><a href="#about">About</a><div class="dd"><a href="#services">Services</a><div class="pn">${svcNames.map(n => `<a href="#services">${esc(n)}</a>`).join('')}</div></div><a href="#work">Work</a><a href="#team">Team</a></div>
<a class="btn" href="#contact">Hire us ${ARW}</a>
<button class="burger" id="burger" type="button" aria-expanded="false" aria-controls="mnav" aria-label="Open menu"><span></span></button></div></nav>
<div class="mnav" id="mnav" role="dialog" aria-label="Menu">${links.map(l => `<a href="${l[0]}">${l[1]}</a>`).join('')}
<details><summary>Our services</summary>${svcNames.map(n => `<a href="#services">${esc(n)}</a>`).join('')}</details><a href="#contact">Contact</a>
<div class="mf">${s.phones.map(p => `<a href="${tel(p)}">${esc(p)}</a>`).join('<br>')}<br><a href="mailto:${esc(s.email)}">${esc(s.email)}</a></div></div>`;

  const rail = `<div class="rail l"><span>Follow us</span><i></i>${s.linkedin ? `<a href="${esc(s.linkedin)}" target="_blank" rel="noopener" aria-label="LinkedIn">Li.</a>` : ''}${s.instagram ? `<a href="${esc(s.instagram)}" target="_blank" rel="noopener" aria-label="Instagram">Ig.</a>` : ''}</div>
<a class="rail r" href="#top" aria-label="Scroll to top"><span>Scroll to top</span><i></i></a>
${s.whatsapp ? `<a class="wa" href="https://wa.me/${esc(s.whatsapp)}" target="_blank" rel="noopener" aria-label="Chat on WhatsApp"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21l1.6-4.8A8.5 8.5 0 1 1 8 19.5z"/><path d="M9 9c0 3 3 6 6 6l1.3-1.6-2-1-1 .8a4 4 0 0 1-2-2l.8-1-1-2z"/></svg></a>` : ''}`;

  const hero = `<section class="hero" id="top"><div class="gw" id="g1" aria-hidden="true">${esc(h.word)}</div><svg id="rays" viewBox="-200 -200 400 400" aria-hidden="true"></svg><div id="dots" aria-hidden="true"></div>
<div class="wrap" style="position:relative"><h1 data-split>${esc(h.headline)}</h1><p class="sub rv" style="--d:.6s">${esc(h.sub)}</p>
<div class="hb rv" style="--d:.75s"><a class="btn" href="#contact">${esc(h.btn1)} ${ARW}</a><a class="btn ol" href="#work">${esc(h.btn2)}</a></div></div></section>
<div class="facts"><div class="wrap">${s.facts.map(f => `<span>${esc(f)}</span>`).join('<hr>')}</div></div>`;

  const about = `<section class="sec ab" id="about"><div class="gw" id="g2" aria-hidden="true">${esc(a.giant)}</div><div class="wrap ag">
<svg class="rv" viewBox="0 0 420 340" role="img" aria-label="Illustration of a developer workspace" style="width:100%;max-width:480px"><rect x="40" y="40" width="250" height="170" rx="14" fill="#fff" stroke="#0D0F12" stroke-width="3"/><rect x="40" y="40" width="250" height="30" rx="14" fill="#1284ff"/><g stroke="#0D0F12" stroke-width="5" stroke-linecap="round" opacity=".7"><path d="M62 98h110M62 120h150M62 142h90M62 164h130"/></g><rect x="196" y="120" width="74" height="54" rx="10" fill="#1284ff"/><path d="M222 135l-12 12 12 12M244 135l12 12-12 12" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M165 210v34M115 250h100" stroke="#0D0F12" stroke-width="4" stroke-linecap="round"/><rect x="20" y="262" width="380" height="8" rx="4" fill="#0D0F12"/><g class="fl"><rect x="300" y="60" width="96" height="62" rx="14" fill="#0D0F12"/><path d="M322 82l24 0M322 98h48" stroke="#fff" stroke-width="5" stroke-linecap="round"/></g><g class="fl" style="animation-delay:-2s"><circle cx="352" cy="190" r="32" fill="#1284ff"/><path d="M340 202l24-24M346 178h18v18" stroke="#0D0F12" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g></svg>
<div><span class="eb rv">${esc(a.eyebrow)}</span><h2 data-split>${esc(a.headline)}</h2><p class="lead rv">${esc(a.body)}</p><a class="cb rv" href="#services">${esc(a.button)}</a></div></div></section>`;

  const services = `<section class="sec dk" id="services"><div class="wrap"><h2 data-split style="max-width:900px">${esc(sv.heading)}</h2><div style="margin-top:70px">
${sv.items.map((i, n) => `<div class="row rv"><small>${pad(n + 1)}</small><b>${esc(i.title)}${i.popular ? '<span class="pop">POPULAR</span>' : ''}</b><p>${esc(i.desc)}</p></div>`).join('\n')}</div>
<p class="rv" style="text-align:center;margin:44px 0 110px">${esc(sv.closing)} <a href="#contact" style="text-decoration:underline;text-underline-offset:4px;font-weight:700">${esc(sv.closingLink)}</a></p>
<h2 data-split style="font-size:clamp(30px,4vw,52px);text-align:center;max-width:680px;margin:0 auto">${esc(ind.heading)}</h2>
<div class="ind">${ind.items.map((i, n) => `<div class="rv"><small>${pad(n + 1)}</small>${esc(i)}</div>`).join('')}</div></div></section>
<section class="mq" aria-hidden="true"><div id="mq">${esc(c.marquee.text)} ${esc(c.marquee.text)}</div></section>`;

  const work = `<section class="sec" id="work" style="padding-top:40px"><div class="wrap"><span class="eb rv">${esc(w.eyebrow)}</span><h2 data-split>${esc(w.heading)}</h2>
${w.projects.map(pr => `<div class="pj"><div class="fr rv" data-tilt><div class="tb"><i></i><i></i><i></i></div><div class="ph"><img src="${esc(pr.image)}" alt="${esc(pr.title)} screenshot" loading="lazy" width="1000" height="563"></div></div>
<div class="rv"><span class="eb">${esc(pr.category)}</span><h3>${esc(pr.title)}</h3><p>${esc(pr.desc)}</p><div class="chips">${pr.chips.map(x => `<span class="chip">${esc(x)}</span>`).join('')}</div></div></div>`).join('\n')}
${w.dev.length ? `<div class="dv rv"><span class="eb">${esc(w.devLabel)}</span><div class="chips">${w.dev.map(x => `<span class="chip">${esc(x)}</span>`).join('')}</div></div>` : ''}</div></section>`;

  const why = `<section class="sec dk"><div class="wrap"><span class="eb rv">${esc(y.eyebrow)}</span><h2 data-split>${esc(y.heading)}</h2>
<div class="cg">${y.items.map((i, n) => `<div class="cd rv"${d(n)}><h3>${esc(i.title)}</h3><p>${esc(i.desc)}</p></div>`).join('')}</div>
<div class="tc rv">${y.tech.map(x => `<span>${esc(x)}</span>`).join('')}</div></div></section>`;

  const process = `<section class="sec" id="process"><div class="wrap"><span class="eb rv">${esc(p.eyebrow)}</span><h2 data-split>${esc(p.heading)}</h2>
<div class="ps" id="ps"><div class="ln"><i id="ln"></i></div>${p.steps.map((x, n) => `<div class="st"><em>${n + 1}</em><b>${esc(x.title)}</b><p>${esc(x.desc)}</p></div>`).join('')}</div></div></section>`;

  const team = `<section class="sec" id="team" style="padding-top:0"><div class="wrap"><span class="eb rv">${esc(t.eyebrow)}</span><h2 data-split>${esc(t.heading)}</h2>
<div class="cg" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">${t.members.map((m, n) => `<div class="tm rv"${d(n)}><div class="av">${m.photo ? `<img src="${esc(m.photo)}" alt="${esc(m.name)}, ${esc(m.role)}" loading="lazy" width="460" height="460">` : ''}</div><b>${esc(m.name)}</b><span>${esc(m.role)}</span><p>${esc(m.focus)}</p></div>`).join('')}</div></div></section>`;

  const footer = `<footer class="ft" id="footer"><div class="gz" id="gz"><div class="bg" id="bg"><svg viewBox="0 0 120 120" aria-hidden="true"><defs><path id="cp" d="M60,60 m-47,0 a47,47 0 1,1 94,0 a47,47 0 1,1 -94,0"/></defs><text font-size="9" font-weight="700" fill="#0D0F12"><textPath href="#cp" textLength="290" lengthAdjust="spacing">PREVOLANT • SOFTWARE &amp; CONSULTANCY • KOLHAPUR •</textPath></text></svg><div class="ct" aria-hidden="true">↗</div></div>
<div class="gw" id="g3" aria-hidden="true">work <span>together</span></div></div>
<div class="wrap"><div class="cx" id="contact"><div><span class="eb">${esc(ct.eyebrow)}</span><h3>${esc(ct.heading)}</h3><p class="lead">${esc(ct.lead)}</p>
<div class="ci">${IC('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>')}<div><small>Call us</small>${s.phones.map(p => `<a href="${tel(p)}">${esc(p)}</a>`).join('<br>')}</div></div>
<div class="ci">${IC('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 8 8 6 8-6"/>')}<div><small>Email us</small><a href="mailto:${esc(s.email)}">${esc(s.email)}</a></div></div>
<div class="ci">${IC('<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>')}<div><small>Based in</small><span>${esc(s.address)}</span></div></div>
<div class="soc">${s.linkedin ? `<a href="${esc(s.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>` : ''}${s.instagram ? `<a href="${esc(s.instagram)}" target="_blank" rel="noopener">Instagram</a>` : ''}${s.whatsapp ? `<a href="https://wa.me/${esc(s.whatsapp)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</div></div>
<form class="fm" id="fm" novalidate><div class="fr2"><label>Your name<input name="name" required maxlength="100" autocomplete="name" placeholder="Full name"></label><label>Phone<input name="phone" type="tel" maxlength="20" autocomplete="tel" inputmode="tel" placeholder="+91"></label></div>
<div class="fr2"><label>Email<input name="email" type="email" required maxlength="160" autocomplete="email" inputmode="email" placeholder="you@company.com"></label><label>Service<select name="service">${ct.services.map(x => `<option>${esc(x)}</option>`).join('')}</select></label></div>
<label>Tell us about your project<textarea name="message" required minlength="10" maxlength="3000" placeholder="What would you like to build?"></textarea></label>
<input class="cf" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">${turnstile ? `<div class="cf-turnstile" data-sitekey="${esc(turnstile.site)}" data-theme="dark"></div>` : ''}
<button class="btn" id="sb" type="submit">Send message ${ARW}</button><p class="ok" id="ok" role="status" aria-live="polite"></p></form></div>
<div class="fb"><nav aria-label="Footer"><a href="#top">Home</a><a href="#about">About</a><a href="#services">Services</a><a href="#work">Work</a><a href="#contact">Contact</a><a href="/privacy">Privacy</a></nav><span>${esc(s.footerText)}</span></div></div></footer>`;

  const banner = preview ? '<div style="position:fixed;z-index:99;left:50%;bottom:16px;transform:translateX(-50%);background:#ffe433;color:#111;font:700 13px Inter,sans-serif;padding:8px 16px;border-radius:99px">DRAFT PREVIEW – not public</div>' : '';
  return head(c, s, siteUrl, s.seoTitle, s.seoDesc) + `<body><div id="bar"></div>${nav}${rail}${hero}${about}${services}${work}${why}${process}${team}${footer}${banner}
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
${turnstile ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>' : ''}<script src="/static/site.js" defer></script></body></html>`;
}

function simplePage(s, siteUrl, title, bodyHtml, status) {
  return head({}, s, siteUrl, title + ' – Prevolant', title, '<meta name="robots" content="noindex">') + `<body style="background:#fdfeff"><nav class="top sc"><div class="nb"><a href="/" aria-label="Prevolant home"><img src="/static/img/logo.png" alt="Prevolant" width="150" height="34"></a><a class="btn" href="/">Back to home ${ARW}</a></div></nav>
<main class="wrap" style="padding:150px 28px 100px;max-width:820px;position:relative;z-index:1">${bodyHtml}</main></body></html>`;
}
const notFound = (s, u) => simplePage(s, u, 'Page not found', '<span class="eb">404</span><h1 style="font-size:clamp(40px,7vw,80px)">This page doesn’t exist.</h1><p class="lead">The page you are looking for may have moved. Head back to the homepage.</p>');
const privacy = (s, u) => simplePage(s, u, 'Privacy notice', `<span class="eb">Privacy</span><h1 style="font-size:clamp(36px,6vw,64px)">Privacy notice</h1>
<p class="lead" style="max-width:none">This is a draft notice and should be reviewed by a legal professional before launch.</p>
<h2 style="font-size:26px;margin:36px 0 10px">What we collect</h2><p class="lead" style="max-width:none">When you use the contact form we collect the name, phone number, email address and message you provide, so we can respond to your enquiry. We do not use advertising trackers.</p>
<h2 style="font-size:26px;margin:36px 0 10px">How we protect it</h2><p class="lead" style="max-width:none">Data is sent over HTTPS and stored encrypted. Only authorised Prevolant team members can read enquiries.</p>
<h2 style="font-size:26px;margin:36px 0 10px">How long we keep it</h2><p class="lead" style="max-width:none">Enquiries are deleted automatically after the retention period (12 months by default). You can ask us to delete your data at any time at ${esc(s.email)}.</p>`);
module.exports = { render, notFound, privacy, esc };
