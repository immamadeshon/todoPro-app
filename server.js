// ===== سرور Todo App (بدون نیاز به نصب هیچ پکیج) =====
// اجرا:  node server.js   ←  سپس  http://localhost:3000
//
// بخش‌های سرور:
//   1) فایل‌های استاتیک پروژه (index.html, signin.html, signup.html, css, js, assets)
//   2) احراز هویت:
//        POST /api/auth/signup  → ثبت‌نام (و ورود خودکار)
//        POST /api/auth/signin  → ورود
//        GET  /api/auth/me      → بررسی اعتبار توکن (نیازمند ورود)
//   3) ذخیره/بازیابی وضعیت هر کاربر (نیازمند ورود):
//        POST /api/state  → ذخیره در data/states/<userId>.json   (Upload)
//        GET  /api/state  → برگرداندن آخرین وضعیت همان کاربر      (Download)

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const STATES_DIR = path.join(DATA_DIR, 'states');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SECRET_FILE = path.join(DATA_DIR, 'secret.key');

const MAX_BODY_BYTES = 1024 * 1024; // حداکثر ۱ مگابایت برای هر درخواست
const VALID_FILTERS = ['all', 'active', 'completed'];

const TOKEN_TTL_SECONDS = 24 * 60 * 60; // اعتبار توکن: ۲۴ ساعت
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,30}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

// این مسیرها هرگز به کاربر سرو نمی‌شوند (کد سرور، داده‌ها و کلید امضا)
const BLOCKED = ['data', 'server.js', 'package.json', 'package-lock.json', 'node_modules'];

// =====================================================================
//  ابزارهای عمومی
// =====================================================================

function sendJson(res, status, payload, extraHeaders) {
  res.writeHead(status, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }, extraHeaders));
  res.end(JSON.stringify(payload));
}

function setCorsHeaders(res) {
  // اگر صفحه با Live Server (پورت دیگر) باز شود، مرورگر درخواست را مسدود نکند
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// خواندن بدنه‌ی درخواست با محدودیت حجم
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    req.on('data', (chunk) => {
      if (tooLarge) return; // بقیه‌ی داده‌ها را دور می‌ریزیم تا پاسخ 413 فرصت ارسال داشته باشد
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// خواندن و پارس JSON از بدنه؛ در صورت خرابی، خطا با status مناسب پرتاب می‌شود
async function readJsonBody(req) {
  const body = await readBody(req);
  try {
    return JSON.parse(body);
  } catch {
    throw Object.assign(new Error('فرمت JSON نامعتبر است.'), { status: 400 });
  }
}

// نوشتن اتمیک: اول فایل موقت، بعد جایگزینی؛ تا فایل اصلی هیچ‌وقت نیمه‌کاره نماند
async function writeJsonAtomic(file, data, mode) {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
  await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: mode || 0o644 });
  await fs.promises.rename(tmp, file);
}

// =====================================================================
//  کلید امضای توکن
// =====================================================================
// اولویت: متغیر محیطی JWT_SECRET ؛ در غیر این صورت یک کلید تصادفی در data/secret.key ساخته و نگه داشته می‌شود
// (تا با ری‌استارت سرور، توکن کاربران نامعتبر نشود). این فایل را هرگز روی گیت‌هاب نگذارید.
function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  try {
    return fs.readFileSync(SECRET_FILE, 'utf8').trim();
  } catch {
    const secret = crypto.randomBytes(48).toString('hex');
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SECRET_FILE, secret, { encoding: 'utf8', mode: 0o600 });
    return secret;
  }
}
const SECRET = loadSecret();

// =====================================================================
//  توکن امضاشده (JWT با الگوریتم HS256)
// =====================================================================
// ساختار: header.payload.signature  —  هر سه با base64url
// امضا = HMAC-SHA256(header + '.' + payload, SECRET)؛ هر تغییری در محتوا، امضا را باطل می‌کند.

function base64urlJson(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function hmac(data) {
  return crypto.createHmac('sha256', SECRET).update(data).digest();
}

function signToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64urlJson({ alg: 'HS256', typ: 'JWT' });
  const payload = base64urlJson({ sub: user.id, usr: user.username, iat: now, exp: now + TOKEN_TTL_SECONDS });
  const signature = hmac(header + '.' + payload).toString('base64url');
  return { token: header + '.' + payload + '.' + signature, expiresAt: (now + TOKEN_TTL_SECONDS) * 1000 };
}

// اگر توکن معتبر باشد payload را برمی‌گرداند، در غیر این صورت null
function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (header.alg !== 'HS256') return null; // جلوگیری از حمله‌ی alg=none

    const expected = hmac(parts[0] + '.' + parts[1]);
    const given = Buffer.from(parts[2], 'base64url');
    // مقایسه‌ی زمان‌ثابت تا از روی زمان پاسخ نتوان امضا را حدس زد
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null; // منقضی شده
    if (typeof payload.sub !== 'string') return null;
    return payload;
  } catch {
    return null;
  }
}

// =====================================================================
//  رمز عبور (scrypt + salt تصادفی)
// =====================================================================
// رمز هرگز ذخیره نمی‌شود؛ فقط هشِ آن با یک salt یکتا برای هر کاربر.

function hashPassword(password, saltHex) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, Buffer.from(saltHex, 'hex'), 64, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

async function createPasswordRecord(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = (await hashPassword(password, salt)).toString('hex');
  return { salt, hash };
}

async function passwordMatches(password, user) {
  const actual = await hashPassword(password, user.salt);
  const stored = Buffer.from(user.hash, 'hex');
  return actual.length === stored.length && crypto.timingSafeEqual(actual, stored);
}

// برای کاربر ناموجود هم یک هش واقعی محاسبه می‌کنیم تا زمان پاسخ، وجود یا نبود نام کاربری را لو ندهد
const DUMMY_USER = { salt: crypto.randomBytes(16).toString('hex'), hash: crypto.randomBytes(64).toString('hex') };

// =====================================================================
//  ذخیره‌ی کاربران (data/users.json)
// =====================================================================

async function readUsers() {
  try {
    const data = JSON.parse(await fs.promises.readFile(USERS_FILE, 'utf8'));
    return Array.isArray(data.users) ? data.users : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

// قفل ساده: عملیات «خواندن ← تغییر ← نوشتن» پشت‌سرهم اجرا می‌شوند تا دو ثبت‌نام هم‌زمان همدیگر را بازنویسی نکنند
let usersLock = Promise.resolve();
function withUsersLock(task) {
  const run = usersLock.then(task);
  usersLock = run.catch(() => {});
  return run;
}

const findByKey = (users, key) => users.find((u) => u.usernameKey === key);

// =====================================================================
//  محدودکننده‌ی تلاش (ضد حدس زدن رمز)
// =====================================================================
const attempts = new Map(); // key → { count, resetAt }

// اگر کلید قفل باشد، ثانیه‌ی باقی‌مانده تا آزاد شدن را برمی‌گرداند، وگرنه 0
function lockedSeconds(key, limit) {
  const entry = attempts.get(key);
  if (!entry) return 0;
  if (entry.resetAt <= Date.now()) { attempts.delete(key); return 0; }
  return entry.count >= limit ? Math.ceil((entry.resetAt - Date.now()) / 1000) : 0;
}

function recordAttempt(key, windowMs) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) attempts.set(key, { count: 1, resetAt: now + windowMs });
  else entry.count += 1;
}

// پاک‌سازی دوره‌ای تا Map بی‌نهایت بزرگ نشود
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of attempts) if (v.resetAt <= now) attempts.delete(k);
}, 10 * 60 * 1000).unref();

const clientIp = (req) => req.socket.remoteAddress || 'unknown';

// =====================================================================
//  اعتبارسنجی ورودی‌ها
// =====================================================================

// خروجی: پیام خطا (رشته) یا null اگر معتبر باشد
function validateCredentials(username, password) {
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    return 'نام کاربری باید ۳ تا ۳۰ حرف از حروف انگلیسی، عدد و . _ - باشد.';
  }
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) {
    return 'رمز عبور باید حداقل ' + PASSWORD_MIN + ' کاراکتر باشد.';
  }
  if (password.length > PASSWORD_MAX) {
    return 'رمز عبور نباید بیشتر از ' + PASSWORD_MAX + ' کاراکتر باشد.';
  }
  return null;
}

// اعتبارسنجی وضعیت تودو (هرگز به داده‌ی کلاینت اعتماد نمی‌کنیم)
function sanitizeState(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.todos)) return null;

  const todos = data.todos
    .filter((t) => t && typeof t.text === 'string' && t.text.trim() !== '')
    .map((t) => ({ text: t.text.trim().slice(0, 500), completed: t.completed === true }));

  return {
    currentFilter: VALID_FILTERS.includes(data.currentFilter) ? data.currentFilter : 'all',
    todos
  };
}

// =====================================================================
//  هندلرهای احراز هویت
// =====================================================================

const publicUser = (u) => ({ id: u.id, username: u.username });

function methodNotAllowed(res, allow) {
  res.setHeader('Allow', allow);
  return sendJson(res, 405, { error: 'متد مجاز نیست.' });
}

async function handleSignup(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST, OPTIONS');

  const ipKey = 'signup|' + clientIp(req);
  const wait = lockedSeconds(ipKey, 10);
  if (wait) {
    return sendJson(res, 429, { error: 'تعداد ثبت‌نام‌های شما زیاد بود. بعداً دوباره تلاش کنید.' }, { 'Retry-After': String(wait) });
  }

  const body = await readJsonBody(req);
  const username = body && body.username;
  const password = body && body.password;
  const problem = validateCredentials(username, password);
  if (problem) return sendJson(res, 400, { error: problem });

  const passwordRecord = await createPasswordRecord(password);

  const user = await withUsersLock(async () => {
    const users = await readUsers();
    const key = username.toLowerCase();
    if (findByKey(users, key)) return null;

    const created = {
      id: crypto.randomBytes(12).toString('hex'),
      username,
      usernameKey: key,
      salt: passwordRecord.salt,
      hash: passwordRecord.hash,
      createdAt: new Date().toISOString()
    };
    users.push(created);
    await writeJsonAtomic(USERS_FILE, { users }, 0o600);
    return created;
  });

  if (!user) return sendJson(res, 409, { error: 'این نام کاربری قبلاً ثبت شده است.' });

  recordAttempt(ipKey, 60 * 60 * 1000); // حداکثر ۱۰ ثبت‌نام در ساعت برای هر IP
  const { token, expiresAt } = signToken(user);
  return sendJson(res, 201, { token, expiresAt, user: publicUser(user) });
}

async function handleSignin(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST, OPTIONS');

  const body = await readJsonBody(req);
  const username = body && body.username;
  const password = body && body.password;
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return sendJson(res, 400, { error: 'نام کاربری و رمز عبور را وارد کنید.' });
  }

  // بعد از ۵ ورود ناموفق برای همین کاربر و IP، ۱۵ دقیقه قفل می‌شود
  const key = username.toLowerCase();
  const failKey = 'signin|' + clientIp(req) + '|' + key;
  const wait = lockedSeconds(failKey, 5);
  if (wait) {
    return sendJson(res, 429, { error: 'تلاش‌های ناموفق زیاد بود. چند دقیقه بعد دوباره امتحان کنید.' }, { 'Retry-After': String(wait) });
  }

  const users = await readUsers();
  const user = findByKey(users, key);
  const valid = await passwordMatches(password, user || DUMMY_USER);

  if (!user || !valid) {
    recordAttempt(failKey, 15 * 60 * 1000);
    // پیام عمداً یکسان است تا مشخص نشود کدام‌یک (نام کاربری یا رمز) اشتباه بوده
    return sendJson(res, 401, { error: 'نام کاربری یا رمز عبور اشتباه است.' });
  }

  attempts.delete(failKey); // ورود موفق، شمارنده‌ی خطا را صفر می‌کند
  const { token, expiresAt } = signToken(user);
  return sendJson(res, 200, { token, expiresAt, user: publicUser(user) });
}

// =====================================================================
//  میان‌افزار احراز هویت: روی «همه‌ی» درخواست‌های /api/ (به‌جز signup و signin) اجرا می‌شود
// =====================================================================
// توکن را از هدر  Authorization: Bearer <token>  می‌خواند، امضا و انقضا را بررسی می‌کند
// و مطمئن می‌شود کاربر هنوز وجود دارد. اگر چیزی درست نباشد null برمی‌گرداند.
async function authenticate(req) {
  const match = /^Bearer (\S+)$/.exec(req.headers.authorization || '');
  if (!match) return null;

  const payload = verifyToken(match[1]);
  if (!payload) return null;

  const users = await readUsers();
  return users.find((u) => u.id === payload.sub) || null;
}

// =====================================================================
//  هندلرهای محافظت‌شده (فقط با ورود معتبر قابل دسترسی هستند)
// =====================================================================

async function handleMe(req, res, user) {
  if (req.method !== 'GET') return methodNotAllowed(res, 'GET, OPTIONS');
  return sendJson(res, 200, { user: publicUser(user) });
}

// فایل وضعیت هر کاربر جداست؛ نام فایل از شناسه‌ی تصادفیِ خودِ سرور ساخته می‌شود (نه ورودی کاربر)
const stateFileFor = (user) => path.join(STATES_DIR, user.id + '.json');

async function handleState(req, res, user) {
  // Download: آخرین وضعیت ذخیره‌شده‌ی همین کاربر
  if (req.method === 'GET') {
    try {
      const raw = await fs.promises.readFile(stateFileFor(user), 'utf8');
      return sendJson(res, 200, JSON.parse(raw));
    } catch (err) {
      if (err.code === 'ENOENT') {
        return sendJson(res, 404, { error: 'هنوز هیچ وضعیتی روی سرور ذخیره نشده است.' });
      }
      throw err;
    }
  }

  // Upload: ذخیره‌ی وضعیت جدید برای همین کاربر
  if (req.method === 'POST') {
    const state = sanitizeState(await readJsonBody(req));
    if (!state) return sendJson(res, 400, { error: 'ساختار داده نامعتبر است.' });

    state.updatedAt = new Date().toISOString();
    await writeJsonAtomic(stateFileFor(user), state);
    return sendJson(res, 200, { ok: true, count: state.todos.length, updatedAt: state.updatedAt });
  }

  return methodNotAllowed(res, 'GET, POST, OPTIONS');
}

const PROTECTED_ROUTES = {
  '/api/auth/me': handleMe,
  '/api/state': handleState
};

// =====================================================================
//  مسیریابی API
// =====================================================================
async function handleApi(req, res, pathname) {
  setCorsHeaders(res);

  // درخواست preflight مرورگر (برای حالت چندمنبعی) نباید توکن بخواهد
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  try {
    // ----- تنها دو مسیر عمومی -----
    if (pathname === '/api/auth/signup') return await handleSignup(req, res);
    if (pathname === '/api/auth/signin') return await handleSignin(req, res);

    // ----- هر مسیر دیگرِ /api/ به‌صورت پیش‌فرض محافظت می‌شود -----
    const user = await authenticate(req);
    if (!user) {
      return sendJson(res, 401, { error: 'برای ادامه باید وارد شوید.' }, { 'WWW-Authenticate': 'Bearer' });
    }

    const handler = PROTECTED_ROUTES[pathname];
    if (!handler) return sendJson(res, 404, { error: 'مسیر یافت نشد.' });
    return await handler(req, res, user);
  } catch (err) {
    if (err.status === 413) {
      // بعد از ارسال پاسخ، اتصال را می‌بندیم تا ادامه‌ی آپلود حجیم قطع شود
      res.setHeader('Connection', 'close');
      res.on('finish', () => req.destroy());
      return sendJson(res, 413, { error: 'حجم داده بیش از حد مجاز است.' });
    }
    if (err.status === 400) return sendJson(res, 400, { error: err.message });
    console.error('API error:', err);
    return sendJson(res, 500, { error: 'خطای داخلی سرور.' });
  }
}

// =====================================================================
//  فایل‌های استاتیک
// =====================================================================
function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    return res.end('Method Not Allowed');
  }

  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400);
    return res.end('Bad Request');
  }

  let filePath = path.normalize(path.join(ROOT, decoded));

  // جلوگیری از Path Traversal (مثل /../../etc/passwd)
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  // مسدود کردن فایل‌های حساس و فایل‌های مخفی
  const firstSegment = path.relative(ROOT, filePath).split(path.sep)[0];
  if (BLOCKED.includes(firstSegment) || firstSegment.startsWith('.')) {
    res.writeHead(404);
    return res.end('Not Found');
  }

  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isDirectory()) filePath = path.join(filePath, 'index.html');

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Not Found');
      }
      const type = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : content);
    });
  });
}

// =====================================================================
//  سرور اصلی
// =====================================================================
const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');

  if (pathname.startsWith('/api/')) return handleApi(req, res, pathname);
  return serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`✅ Todo server running at http://localhost:${PORT}`);
});
