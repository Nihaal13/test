const express = require('express'), fs = require('fs'), path = require('path'), crypto = require('crypto');
let nodemailer = null; try { nodemailer = require('nodemailer'); } catch {}

const PORT = process.env.PORT || 3000;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '0001nihaal@gmail.com';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'change-me-now';
const DB = path.join(__dirname, 'data.json');
const STATUSES = ['Pending', 'Scheduled', 'Solved'];

const load = () => { try { return JSON.parse(fs.readFileSync(DB, 'utf8')); } catch { return []; } };
const save = d => fs.writeFileSync(DB, JSON.stringify(d, null, 1));
const hash = s => crypto.createHash('sha256').update(String(s)).digest();
const same = (a, b) => crypto.timingSafeEqual(hash(a), hash(b));
const clip = (v, n) => String(v ?? '').trim().slice(0, n);

// ---- admin sessions (in memory; admins log in again after a server restart) ----
const sessions = new Map(), tries = new Map();
const cookieOf = req => (/(?:^|; )sid=([a-f0-9]+)/.exec(req.headers.cookie || '') || [])[1];
const isAdmin = req => { const t = cookieOf(req), exp = sessions.get(t); return !!exp && exp > Date.now(); };
const needAdmin = (req, res, next) => isAdmin(req) ? next() : res.status(401).json({ error: 'Admin login required' });

// ---- email alerts ----
const mailer = nodemailer && process.env.SMTP_USER && process.env.SMTP_PASS
  ? nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }) : null;
async function notify(c) {
  const text = `New campus issue at ABC College\n\nTitle: ${c.title}\nCategory: ${c.category}\nLocation: ${c.location}\nPriority: ${c.priority}\nReported by: ${c.name || 'Anonymous'}\nTime: ${new Date(c.created).toLocaleString()}\n\nDetails:\n${c.desc}`;
  if (!mailer) { console.log('[email not configured] would send to', ADMIN_EMAIL, '\n' + text); return false; }
  try { await mailer.sendMail({ from: process.env.SMTP_USER, to: ADMIN_EMAIL, subject: `[ABC Campus Fix] ${c.priority}: ${c.title}`, text }); return true; }
  catch (e) { console.error('Email failed:', e.message); return false; }
}

const app = express();
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Anyone can read complaints
app.get('/api/complaints', (req, res) => res.json(load().sort((a, b) => b.created - a.created)));

// Anyone can raise a complaint (light per-IP limit against spam)
const posts = new Map();
app.post('/api/complaints', async (req, res) => {
  const ip = req.ip, now = Date.now(), recent = (posts.get(ip) || []).filter(t => now - t < 600000);
  if (recent.length >= 10) return res.status(429).json({ error: 'Too many reports. Please try again later.' });
  posts.set(ip, [...recent, now]);
  const b = req.body || {};
  const c = { id: crypto.randomBytes(4).toString('hex'), name: clip(b.name, 60), category: clip(b.category, 40), location: clip(b.location, 100),
    priority: ['Low', 'Medium', 'High', 'Urgent'].includes(b.priority) ? b.priority : 'Medium', title: clip(b.title, 120), desc: clip(b.desc, 2000),
    created: now, status: 'Pending', eta: '', note: '' };
  if (!c.title || !c.location || !c.desc) return res.status(400).json({ error: 'Title, location and details are required.' });
  const all = load(); all.push(c); save(all);
  res.json({ id: c.id, emailed: await notify(c) });
});

// Admin auth
app.post('/api/login', (req, res) => {
  const ip = req.ip, t = tries.get(ip) || { n: 0, at: Date.now() };
  if (Date.now() - t.at > 600000) { t.n = 0; t.at = Date.now(); }
  if (t.n >= 5) return res.status(429).json({ error: 'Too many attempts. Try again in 10 minutes.' });
  const { username, password } = req.body || {};
  if (same(username, ADMIN_USER) && same(password, ADMIN_PASS)) {
    const sid = crypto.randomBytes(24).toString('hex'); sessions.set(sid, Date.now() + 8 * 3600000); tries.delete(ip);
    res.setHeader('Set-Cookie', `sid=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${req.secure ? '; Secure' : ''}`);
    return res.json({ ok: true });
  }
  tries.set(ip, { n: t.n + 1, at: t.at });
  res.status(401).json({ error: 'Wrong username or password' });
});
app.post('/api/logout', (req, res) => { sessions.delete(cookieOf(req)); res.setHeader('Set-Cookie', 'sid=; Path=/; Max-Age=0'); res.json({ ok: true }); });
app.get('/api/me', (req, res) => res.json({ admin: isAdmin(req) }));

// Only admins can change status / fix time / note
app.patch('/api/complaints/:id', needAdmin, (req, res) => {
  const all = load(), c = all.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Complaint not found' });
  const { status, eta, note } = req.body || {};
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  if (status === 'Scheduled' && !clip(eta, 60)) return res.status(400).json({ error: 'Add an approximate fix time for scheduled issues.' });
  Object.assign(c, { status, eta: clip(eta, 60), note: clip(note, 300), updated: Date.now() });
  save(all); res.json(c);
});

app.listen(PORT, () => {
  console.log(`ABC Campus Fix running on http://localhost:${PORT}`);
  if (ADMIN_PASS === 'change-me-now') console.warn('WARNING: set ADMIN_PASSWORD before going live!');
});
