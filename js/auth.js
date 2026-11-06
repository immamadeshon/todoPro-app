// ===== ماژول مشترک احراز هویت سمت کلاینت =====
// این فایل در هر سه صفحه (index / signin / signup) لود می‌شود و این کارها را انجام می‌دهد:
//   • نگه‌داری نشست (توکن و اطلاعات کاربر) در localStorage
//   • Auth.fetch: جایگزین fetch که توکن را خودکار به «همه‌ی» درخواست‌های API اضافه می‌کند
//   • مدیریت پاسخ 401 (توکن نامعتبر یا منقضی): پاک کردن نشست و رفتن به صفحه‌ی ورود
//   • redirectIfLoggedIn برای صفحه‌های signin/signup
//   • تشخیص اینکه سرور در دسترس است یا نه (serverEnabled)؛ مثلاً روی GitHub Pages سرور نداریم
//
// توجه: صفحه‌ی اصلی دیگر اجباری به ورود ندارد؛ کاربر وارد‌نشده «مهمان» است و برنامه برایش
// فقط با ذخیره‌ی محلی (localStorage) کار می‌کند.

var Auth = (function () {
  // تنظیمات از js/config.js خوانده می‌شوند (اگر آن فایل لود نشده باشد، مقادیر پیش‌فرض استفاده می‌شوند)
  var CONFIG = window.TODO_CONFIG || {};

  // آدرس پایه‌ی API.
  //   '' (خالی)  → صفحه از همان سرور (node server.js) باز شده است
  //   'http://localhost:3000' → اگر صفحه را با Live Server (پورت دیگر) باز می‌کنید
  var API_BASE = CONFIG.API_BASE || '';

  // آیا سرور (بک‌اند) در دسترس است؟
  // GitHub Pages فقط فایل استاتیک سرو می‌کند و نمی‌تواند server.js را اجرا کند؛ پس اگر برنامه روی
  // *.github.io باشد و آدرس بک‌اندی تنظیم نشده باشد، حالت «بدون سرور» (فقط مهمان) فعال می‌شود.
  var onGithubPages = /\.github\.io$/i.test(window.location.hostname);
  var serverEnabled = CONFIG.SERVER_ENABLED !== false && !(API_BASE === '' && onGithubPages);

  var TOKEN_KEY = 'todo-auth-token';
  var USER_KEY = 'todo-auth-user';

  // ----- دسترسی امن به localStorage (ممکن است در حالت private یا بسته بودن storage خطا بدهد) -----
  function read(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* ignore */ }
  }
  function remove(key) {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  // ----- نشست -----
  function getToken() {
    return read(TOKEN_KEY);
  }

  function getUser() {
    try {
      var user = JSON.parse(read(USER_KEY));
      return user && typeof user.id === 'string' ? user : null;
    } catch (e) {
      return null;
    }
  }

  // بدون سرور، ورود معنا ندارد؛ پس همه «مهمان» حساب می‌شوند
  function isLoggedIn() {
    return serverEnabled && !!getToken() && !!getUser();
  }

  // کاربر واردشده، یا null برای مهمان
  function currentUser() {
    return isLoggedIn() ? getUser() : null;
  }

  function setSession(token, user) {
    write(TOKEN_KEY, token);
    write(USER_KEY, JSON.stringify({ id: user.id, username: user.username }));
  }

  function clearSession() {
    remove(TOKEN_KEY);
    remove(USER_KEY);
  }

  // ----- ناوبری (جدا شده تا در تست‌ها قابل جایگزینی باشد) -----
  var api = {};
  api.navigate = function (url) {
    window.location.replace(url);
  };

  function goToSignIn(reason) {
    api.navigate('signin.html' + (reason ? '?' + reason + '=1' : ''));
  }

  // ----- ساخت آدرس کامل API -----
  function apiUrl(path) {
    return API_BASE + path;
  }

  // ----- جایگزین fetch: توکن را به هر درخواست اضافه می‌کند -----
  // مثل یک «interceptor»: همه‌ی درخواست‌های برنامه از اینجا عبور می‌کنند، پس هیچ درخواستی
  // بدون هدر Authorization ارسال نمی‌شود و جای دیگری لازم نیست دستی توکن اضافه شود.
  function authFetch(path, options) {
    options = options || {};

    var headers = {};
    for (var k in options.headers) {
      if (Object.prototype.hasOwnProperty.call(options.headers, k)) headers[k] = options.headers[k];
    }

    var token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;

    var finalOptions = {};
    for (var o in options) {
      if (Object.prototype.hasOwnProperty.call(options, o)) finalOptions[o] = options[o];
    }
    finalOptions.headers = headers;

    return fetch(apiUrl(path), finalOptions).then(function (res) {
      // 401 یعنی توکن نامعتبر/منقضی است؛ نشست را پاک کن و به صفحه‌ی ورود برو
      if (res.status === 401) {
        clearSession();
        goToSignIn('expired');
      }
      return res;
    });
  }

  // ----- بررسی اعتبار نشست با سرور -----
  // اگر توکن معتبر نباشد، authFetch خودش کاربر را به صفحه‌ی ورود می‌برد.
  // اگر سرور در دسترس نباشد (خطای شبکه)، نشست حفظ می‌شود تا برنامه به‌صورت آفلاین کار کند.
  function verifySession() {
    return authFetch('/api/auth/me')
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (data && data.user) setSession(getToken(), data.user);
        return data;
      })
      .catch(function () { return null; });
  }

  // ----- خروج -----
  // نشست پاک می‌شود و برنامه به‌صورت «مهمان» دوباره بارگذاری می‌شود
  // (لیست خود کاربر در مرورگر می‌ماند و با ورود بعدی برمی‌گردد).
  function signOut() {
    clearSession();
    api.navigate('index.html');
  }

  // ----- محافظ صفحه‌ی ورود/ثبت‌نام -----
  // در signin.html و signup.html: اگر قبلاً وارد شده باشد به صفحه‌ی اصلی می‌رود
  function redirectIfLoggedIn() {
    if (isLoggedIn()) {
      api.navigate('index.html');
      return true;
    }
    return false;
  }

  // ----- درخواست ورود/ثبت‌نام (عمومی؛ بدون توکن) -----
  // خروجی: Promise که با { token, user } موفق می‌شود یا با Error (حاوی پیام خوانا) رد می‌شود
  function submitCredentials(path, username, password) {
    if (!serverEnabled) {
      return Promise.reject(new Error('در این نسخه سرور وجود ندارد؛ ورود و ثبت‌نام فعال نیست.'));
    }
    return fetch(apiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password })
    }).then(function (res) {
      return res.json()
        .catch(function () { return {}; })
        .then(function (body) {
          if (!res.ok) {
            // 404/405 بدون پیام JSON یعنی آن آدرس اصلاً API ما نیست (مثلاً میزبان استاتیک)
            if (!body.error && (res.status === 404 || res.status === 405)) {
              throw new Error('سرور احراز هویت در دسترس نیست. آدرس API_BASE را در js/config.js بررسی کنید.');
            }
            throw new Error(body.error || ('خطای سرور (' + res.status + ')'));
          }
          return body;
        });
    }).catch(function (err) {
      // fetch در صورت قطع بودن سرور TypeError پرتاب می‌کند
      if (err && err.name === 'TypeError') {
        throw new Error('اتصال به سرور برقرار نشد. اگر روی سرور محلی هستید مطمئن شوید «node server.js» اجرا شده است.');
      }
      throw err;
    });
  }

  api.API_BASE = API_BASE;
  api.serverEnabled = serverEnabled;
  api.apiUrl = apiUrl;
  api.getToken = getToken;
  api.getUser = getUser;
  api.isLoggedIn = isLoggedIn;
  api.currentUser = currentUser;
  api.setSession = setSession;
  api.clearSession = clearSession;
  api.fetch = authFetch;
  api.verifySession = verifySession;
  api.signOut = signOut;
  api.redirectIfLoggedIn = redirectIfLoggedIn;
  api.submitCredentials = submitCredentials;
  return api;
})();
