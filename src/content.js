'use strict';
// Content model: defaults (seeded from the approved design), admin form schema and server-side validator.
const T = (k, label, o = {}) => ({ k, label, type: 'text', max: 200, ...o });
const TA = (k, label, o = {}) => ({ k, label, type: 'textarea', max: 1500, ...o });
const SL = (k, label, o = {}) => ({ k, label, type: 'strlist', max: 120, maxItems: 40, hint: 'One per line', ...o });
const IMG = (k, label) => ({ k, label, type: 'image' });
const BOOL = (k, label) => ({ k, label, type: 'bool' });
const LIST = (k, label, fields, o = {}) => ({ k, label, type: 'list', fields, maxItems: 30, ...o });
const URL_ = (k, label) => ({ k, label, type: 'text', max: 300, url: true });

const SCHEMA = {
  settings: { title: 'Site settings', roles: ['owner', 'admin'], fields: [
    T('seoTitle', 'SEO title'), TA('seoDesc', 'SEO description', { max: 300 }),
    T('email', 'Public email', { email: true }), SL('phones', 'Phone numbers', { maxItems: 4 }),
    T('whatsapp', 'WhatsApp number (digits with country code)', { digits: true, max: 15 }),
    T('address', 'Location'), URL_('linkedin', 'LinkedIn URL'), URL_('instagram', 'Instagram URL'),
    SL('facts', 'Facts strip (3 items)', { maxItems: 3 }), T('footerText', 'Footer text')] },
  hero: { title: 'Hero', fields: [T('word', 'Giant background word', { max: 14 }), T('headline', 'Headline'), TA('sub', 'Sub text', { max: 300 }), T('btn1', 'Primary button'), T('btn2', 'Secondary button')] },
  about: { title: 'About', fields: [T('eyebrow', 'Eyebrow'), T('headline', 'Headline'), TA('body', 'Paragraph'), T('button', 'Button label'), T('giant', 'Giant word', { max: 14 })] },
  services: { title: 'Services', fields: [T('heading', 'Heading', { max: 300 }), T('closing', 'Closing line'), T('closingLink', 'Closing link text'),
    LIST('items', 'Services', [T('title', 'Title'), TA('desc', 'Description', { max: 300 }), BOOL('popular', 'Show "Popular" badge')])] },
  industries: { title: 'Industries', fields: [T('heading', 'Heading'), SL('items', 'Industries', { maxItems: 16 })] },
  marquee: { title: 'Scroll marquee', fields: [T('text', 'Marquee sentence', { max: 120 })] },
  work: { title: 'Selected work', fields: [T('eyebrow', 'Eyebrow'), T('heading', 'Heading'), T('devLabel', 'In-development label'), SL('dev', 'In development', { maxItems: 12 }),
    LIST('projects', 'Projects', [T('title', 'Title'), T('category', 'Category'), TA('desc', 'Description', { max: 600 }), SL('chips', 'Highlights', { maxItems: 8, max: 40 }), IMG('image', 'Screenshot')], { maxItems: 12 })] },
  why: { title: 'Why Prevolant & tech stack', fields: [T('eyebrow', 'Eyebrow'), T('heading', 'Heading'), LIST('items', 'Reasons', [T('title', 'Title'), TA('desc', 'Description', { max: 300 })], { maxItems: 8 }), SL('tech', 'Tech stack chips', { maxItems: 30, max: 30 })] },
  process: { title: 'Process', fields: [T('eyebrow', 'Eyebrow'), T('heading', 'Heading'), LIST('steps', 'Steps', [T('title', 'Title'), T('desc', 'Description')], { maxItems: 8 })] },
  team: { title: 'Team', fields: [T('eyebrow', 'Eyebrow'), T('heading', 'Heading'), LIST('members', 'Members', [T('name', 'Name'), T('role', 'Role'), T('focus', 'Focus'), IMG('photo', 'Photo')], { maxItems: 20 })] },
  contact: { title: 'Contact section', fields: [T('eyebrow', 'Eyebrow'), T('heading', 'Heading'), TA('lead', 'Intro text', { max: 400 }), SL('services', 'Service dropdown options', { maxItems: 12 })] },
};

const DEFAULTS = {
  settings: { seoTitle: 'Prevolant – Software Services & Consultancy in Kolhapur', seoDesc: 'Prevolant builds custom software, ERP and business platforms, websites, mobile apps and AI solutions for growing organizations. Based in Kolhapur, India.', email: 'Prevolant04@gmail.com', phones: ['+91 83298 63432', '+91 89997 93636'], whatsapp: '918999793636', address: 'Kolhapur, Maharashtra, India', linkedin: 'https://www.linkedin.com/company/prevolant-technologies/', instagram: 'https://www.instagram.com/prevolant/', facts: ['Full service software company', 'Located at Kolhapur, India', 'Est. 2026'], footerText: '© 2026 Prevolant Software Services & Consultancy · Kolhapur, Maharashtra, India' },
  hero: { word: 'software', headline: 'We build software that grows your business.', sub: 'Custom software, business platforms and digital products from Kolhapur — built around how you work.', btn1: 'Start a project', btn2: 'See our work' },
  about: { eyebrow: 'About agency', headline: 'Technology built around your ambition.', body: 'Prevolant is a Kolhapur-based IT services company established in 2026. We design and develop digital products that help organizations modernize operations, engage customers and grow — with practical engineering and long-term partnerships.', button: 'About us', giant: 'about' },
  services: { heading: 'It’s hard to find a team you can trust. We’re built to be that team.', closing: 'Save your precious time spent finding a solution.', closingLink: 'Contact us now', items: [
    { title: 'Websites & e-commerce', desc: 'Websites, portals, online stores and UI/UX design that turn visitors into customers.', popular: false },
    { title: 'ERP & business software', desc: 'Inventory, billing, purchasing and reporting platforms shaped around your workflow.', popular: true },
    { title: 'Desktop applications', desc: 'Fast, dependable desktop software for day-to-day business operations.', popular: false },
    { title: 'Android & iOS apps', desc: 'Mobile-first apps for your customers and your team.', popular: false },
    { title: 'AI & API solutions', desc: 'AI-enabled applications, API development and integration, and IT consulting.', popular: false }] },
  industries: { heading: 'Serving our clients across diverse industries.', items: ['Retail & wholesale', 'Manufacturing', 'Healthcare', 'Education', 'Hospitality', 'E-commerce', 'Startups', 'Professional services'] },
  marquee: { text: 'Software solutions to grow your business —' },
  work: { eyebrow: 'Selected work', heading: 'Software that simplifies complexity.', devLabel: 'In development', dev: ['Hospital management', 'Hotel management', 'E-commerce solutions', 'School management'], projects: [
    { title: 'Shivraj Masale ERP', category: 'Business operations / ERP', desc: 'A desktop business management system for a masala and rice mill — sales and billing, customers, products, raw materials, production, expenses and reports in one clear dashboard.', chips: ['Sales & billing', 'Inventory', 'Production', 'Reports'], image: '/static/img/projects-shivraj.jpg' },
    { title: 'Prevolant MedPlus+', category: 'Healthcare / Wholesale ERP', desc: 'A medical wholesale management system covering GST billing, medicine master, stock and batches, expiry and recall tracking, purchases, returns, suppliers and ledgers.', chips: ['Batch traceability', 'Expiry alerts', 'Returns', 'Ledgers'], image: '/static/img/projects-medplus.jpg' },
    { title: 'New Model School', category: 'Education / Website', desc: 'A warm, modern website for a pre-school — admissions enquiry, programmes, team, events and careers, designed to build trust with parents from the first scroll.', chips: ['Admissions enquiry', 'Programmes', 'Events', 'Responsive'], image: '/static/img/projects-school.jpg' }] },
  why: { eyebrow: 'Why Prevolant', heading: 'A partner, not just a provider.', items: [
    { title: 'Tailored thinking', desc: 'Solutions shaped by your workflows, not one-size-fits-all templates.' }, { title: 'Business-first mindset', desc: 'Technology selected to support clear operational goals.' },
    { title: 'Collaborative process', desc: 'Transparent communication across planning, development and delivery.' }, { title: 'Built for evolution', desc: 'Maintainable foundations designed to adapt as needs change.' }],
    tech: ['React', 'TypeScript', 'Tailwind', 'Node.js', 'Python', 'Java', 'PHP', 'MySQL', 'PostgreSQL', 'MongoDB', 'Firebase', 'Electron', 'Flutter', 'React Native'] },
  process: { eyebrow: 'How we work', heading: 'A disciplined delivery approach.', steps: [{ title: 'Discover', desc: 'Understand goals' }, { title: 'Design', desc: 'Plan the experience' }, { title: 'Develop', desc: 'Build & integrate' }, { title: 'Validate', desc: 'Test & refine' }, { title: 'Deliver', desc: 'Launch & support' }] },
  team: { eyebrow: 'Leadership', heading: 'Meet the founding team.', members: [
    { name: 'Varun Varute', role: 'Chief Executive Officer', focus: 'Business direction & strategy', photo: '/static/img/team-varun.jpg' },
    { name: 'Ritesh Desai', role: 'Chief Technology Officer', focus: 'Engineering & technology', photo: '/static/img/team-ritesh.jpg' },
    { name: 'Aadarsh Kamate', role: 'Chief Financial Officer', focus: 'Finance & operations', photo: '/static/img/team-aadarsh.jpg' },
    { name: 'Janardan Kharat', role: 'Chief Marketing Officer', focus: 'Marketing & growth', photo: '/static/img/team-janardan.jpg' },
    { name: 'Shreyash Gurav', role: 'Chief AIML Officer', focus: 'AI & machine learning', photo: '/static/img/team-shreyash.jpg' }] },
  contact: { eyebrow: 'Contact us', heading: 'Let’s make something great work together.', lead: 'Tell us about your idea, workflow or challenge. Share a few details and we’ll get back to you.', services: ['Website or e-commerce', 'ERP or business software', 'Desktop application', 'Android or iOS app', 'AI or API solution', 'Something else'] },
};

class ValidationError extends Error {}
const ctrl = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const clean = s => String(s).replace(ctrl, '').trim();
const safeImg = u => /^\/(static\/img|media)\/[A-Za-z0-9._-]+$/.test(u);

function validate(fields, val, path = '') {
  if (!val || typeof val !== 'object' || Array.isArray(val)) throw new ValidationError(`${path || 'content'} must be an object`);
  const out = {};
  for (const f of fields) {
    const v = val[f.k], at = path + f.label;
    switch (f.type) {
      case 'text': case 'textarea': {
        const s = clean(v ?? ''); if (s.length > f.max) throw new ValidationError(`${at}: max ${f.max} characters`);
        if (f.email && s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new ValidationError(`${at}: invalid email`);
        if (f.digits && s && !/^\d{8,15}$/.test(s)) throw new ValidationError(`${at}: digits only, with country code`);
        if (f.url && s && !/^https:\/\/[^\s]+$/.test(s)) throw new ValidationError(`${at}: must be an https:// link`);
        out[f.k] = s; break; }
      case 'bool': out[f.k] = v === true; break;
      case 'image': { const s = clean(v ?? ''); if (s && !safeImg(s)) throw new ValidationError(`${at}: invalid image path`); out[f.k] = s; break; }
      case 'strlist': { const a = Array.isArray(v) ? v : []; if (a.length > f.maxItems) throw new ValidationError(`${at}: too many items`);
        out[f.k] = a.map(x => clean(x)).filter(Boolean).map(x => { if (x.length > f.max) throw new ValidationError(`${at}: item too long`); return x; }); break; }
      case 'list': { const a = Array.isArray(v) ? v : []; if (a.length > f.maxItems) throw new ValidationError(`${at}: too many items`);
        out[f.k] = a.map((it, i) => validate(f.fields, it, `${at} #${i + 1} › `)); break; }
    }
  }
  return out;
}
module.exports = { SCHEMA, DEFAULTS, validate, ValidationError };
