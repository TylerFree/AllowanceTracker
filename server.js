const express = require('express');
const session = require('express-session');
const path = require('path');
const cron = require('node-cron');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_PATH = normalizeBasePath(process.env.BASE_PATH || '/allowance');

function normalizeBasePath(value) {
  if (!value || value === '/') return '';
  return `/${value.replace(/^\/+|\/+$/g, '')}`;
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use((req, res, next) => {
  const forwardedPrefix = normalizeBasePath(req.get('x-forwarded-prefix'));
  const isBasePathRequest = BASE_PATH && (req.path === BASE_PATH || req.path.startsWith(`${BASE_PATH}/`));
  const basePath = forwardedPrefix || (isBasePathRequest ? BASE_PATH : '');

  req.urlFor = (target = '/') => {
    const normalizedTarget = target.startsWith('/') ? target : `/${target}`;
    if (!basePath) return normalizedTarget;
    return normalizedTarget === '/' ? basePath : `${basePath}${normalizedTarget}`;
  };

  res.locals.basePath = basePath;
  res.locals.url = req.urlFor;
  next();
});

app.use(express.static(path.join(__dirname, 'public')));
if (BASE_PATH) {
  app.use(BASE_PATH, express.static(path.join(__dirname, 'public')));
}
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-secret-in-production-' + Math.random(),
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 },
}));

app.use('/', require('./routes/auth'));
app.use('/parent', require('./routes/parent'));
app.use('/child', require('./routes/child'));

if (BASE_PATH) {
  app.use(BASE_PATH, require('./routes/auth'));
  app.use(`${BASE_PATH}/parent`, require('./routes/parent'));
  app.use(`${BASE_PATH}/child`, require('./routes/child'));
}

// Credit allowances every Saturday at 8:00 AM
cron.schedule('0 8 * * 6', () => {
  const count = db.creditWeeklyAllowances();
  console.log(`[${new Date().toISOString()}] Weekly allowances credited for ${count} children`);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Allowance Tracker running at http://0.0.0.0:${PORT}`);
  console.log(`Access from other devices at http://<your-server-ip>:${PORT}`);
});
