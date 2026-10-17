// ===== سرور ساده‌ی Todo App (بدون نیاز به نصب هیچ پکیج) =====
// اجرا:  node server.js   ←  سپس  http://localhost:3000
//
// دو کار انجام می‌دهد:
//   1) فایل‌های استاتیک پروژه (index.html, css, js, assets) را سرو می‌کند
//   2) API ذخیره/بازیابی وضعیت:
//        POST /api/state  → ذخیره‌ی وضعیت در data/state.json   (Upload)
//        GET  /api/state  → برگرداندن آخرین وضعیت ذخیره‌شده    (Download)

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'state.json');
const MAX_BODY_BYTES = 1024 * 1024; // حداکثر ۱ مگابایت برای هر درخواست
const VALID_FILTERS = ['all', 'active', 'completed'];

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

// این مسیرها هرگز به کاربر سرو نمی‌شوند (کد سرور و داده‌ها)
const BLOCKED = ['data', 'server.js', 'package.json', 'package-lock.json', 'node_modules'];

// ----- ابزارهای پاسخ -----
function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function setCorsHeaders(res) {
  // اگر صفحه با Live Server (پورت دیگر) باز شود، مرورگر درخواست را مسدود نکند
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ----- اعتبارسنجی داده‌ی دریافتی (هرگز به داده‌ی کلاینت اعتماد نمی‌کنیم) -----
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

// ----- خواندن بدنه‌ی درخواست با محدودیت حجم -----
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

// ----- API -----
async function handleApi(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // Download: آخرین وضعیت ذخیره‌شده
  if (req.method === 'GET') {
    try {
      const raw = await fs.promises.readFile(DATA_FILE, 'utf8');
      return sendJson(res, 200, JSON.parse(raw));
    } catch (err) {
      if (err.code === 'ENOENT') {
        return sendJson(res, 404, { error: 'هنوز هیچ وضعیتی روی سرور ذخیره نشده است.' });
      }
      console.error('Read error:', err);
      return sendJson(res, 500, { error: 'خواندن اطلاعات از سرور ناموفق بود.' });
    }
  }

  // Upload: ذخیره‌ی وضعیت جدید
  if (req.method === 'POST') {
    try {
      const body = await readBody(req);
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        return sendJson(res, 400, { error: 'فرمت JSON نامعتبر است.' });
      }

      const state = sanitizeState(parsed);
      if (!state) return sendJson(res, 400, { error: 'ساختار داده نامعتبر است.' });

      state.updatedAt = new Date().toISOString();

      // نوشتن اتمیک: اول فایل موقت، بعد جایگزینی؛ تا فایل اصلی هیچ‌وقت نیمه‌کاره نماند
      await fs.promises.mkdir(DATA_DIR, { recursive: true });
      const tmpFile = DATA_FILE + '.tmp';
      await fs.promises.writeFile(tmpFile, JSON.stringify(state, null, 2), 'utf8');
      await fs.promises.rename(tmpFile, DATA_FILE);

      return sendJson(res, 200, { ok: true, count: state.todos.length, updatedAt: state.updatedAt });
    } catch (err) {
      if (err.status === 413) {
        // بعد از ارسال پاسخ، اتصال را می‌بندیم تا ادامه‌ی آپلود حجیم قطع شود
        res.setHeader('Connection', 'close');
        res.on('finish', () => req.destroy());
        return sendJson(res, 413, { error: 'حجم داده بیش از حد مجاز است.' });
      }
      console.error('Write error:', err);
      return sendJson(res, 500, { error: 'ذخیره‌ی اطلاعات روی سرور ناموفق بود.' });
    }
  }

  res.setHeader('Allow', 'GET, POST, OPTIONS');
  return sendJson(res, 405, { error: 'متد مجاز نیست.' });
}

// ----- فایل‌های استاتیک -----
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
      res.writeHead(200, { 'Content-Type': type });
      res.end(req.method === 'HEAD' ? undefined : content);
    });
  });
}

// ----- سرور اصلی -----
const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');

  if (pathname === '/api/state') return handleApi(req, res);
  return serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`✅ Todo server running at http://localhost:${PORT}`);
});
