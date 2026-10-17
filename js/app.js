// ===== مدل هر آیتم وظیفه =====
// هر وظیفه سه observable دارد: متن، وضعیت تکمیل و وضعیت ویرایش
function Todo(text, completed) {
  this.text = ko.observable(text);
  this.completed = ko.observable(completed || false);
  this.editing = ko.observable(false);
  this.previousText = text; // متن قبل از شروع ویرایش
}

// ===== تنظیمات =====
var STORAGE_KEY = 'todo-app-state-v1';
var VALID_FILTERS = ['all', 'active', 'completed'];

// آدرس API سرور. اگر صفحه را با سرور خودِ پروژه (node server.js) باز کنید همین مقدار درست است.
// اگر صفحه را با Live Server (پورت دیگر) باز می‌کنید، این را بکنید: 'http://localhost:3000/api/state'
var API_URL = 'http://localhost:3000/api/state';

// ===== اعتبارسنجی و تبدیل داده به مدل =====
// داده‌ی خام (از localStorage یا سرور) را بررسی می‌کند و به آبجکت‌های Todo تبدیل می‌کند.
// اگر ساختار داده معتبر نباشد، null برمی‌گرداند.
function normalizeState(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.todos)) return null;

  return {
    todos: data.todos
      .filter(function (t) { return t && typeof t.text === 'string' && t.text.trim() !== ''; })
      .map(function (t) { return new Todo(t.text, t.completed === true); }),
    currentFilter: VALID_FILTERS.indexOf(data.currentFilter) !== -1 ? data.currentFilter : 'all'
  };
}

// ===== ذخیره‌سازی سمت کلاینت (localStorage) =====
// خواندن وضعیت ذخیره‌شده؛ در صورت نبودن یا خراب بودن داده، وضعیت پیش‌فرض برمی‌گردد
function loadState() {
  var fallback = { todos: [], currentFilter: 'all' };
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    return normalizeState(JSON.parse(raw)) || fallback;
  } catch (e) {
    console.warn('Could not load saved todos:', e);
    return fallback;
  }
}

// نوشتن وضعیت در localStorage (وضعیت «در حال ویرایش» عمداً ذخیره نمی‌شود)
function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Could not save todos:', e);
  }
}

// ===== ViewModel اصلی برنامه =====
function TodoListViewModel() {
  var self = this;

  // بازیابی آخرین وضعیت ذخیره‌شده
  var saved = loadState();

  // متن ورودی وظیفه جدید
  self.newTodoText = ko.observable('');

  // لیست همه وظایف
  self.todos = ko.observableArray(saved.todos);

  // فیلتر فعال: 'all' | 'active' | 'completed'
  self.currentFilter = ko.observable(saved.currentFilter);

  // ----- افزودن وظیفه -----
  self.addTodo = function () {
    var text = self.newTodoText().trim();
    if (text === '') {
      alert('لطفاً یک وظیفه وارد کنید!');
      return;
    }
    self.todos.push(new Todo(text));
    self.newTodoText('');
  };

  // افزودن با کلید Enter داخل اینپوت اصلی
  self.addOnEnter = function (data, event) {
    if (event.key === 'Enter') {
      self.addTodo();
    }
    return true; // اجازه رفتار پیش‌فرض input را می‌دهد
  };

  // ----- حذف وظیفه -----
  self.removeTodo = function (todo) {
    self.todos.remove(todo);
  };

  // ----- ویرایش وظیفه -----
  self.startEdit = function (todo) {
    todo.previousText = todo.text(); // ذخیره‌ی متن فعلی
    todo.editing(true);
  };

  // اگر متن خالی بود، متن قبلی برمی‌گردد؛ وگرنه فاصله‌های اضافه حذف می‌شود
  function finishEdit(todo) {
    var trimmed = todo.text().trim();
    todo.text(trimmed === '' ? todo.previousText : trimmed);
    todo.editing(false);
  }

  self.stopEdit = function (todo) {
    finishEdit(todo);
  };

  self.stopEditOnEnter = function (todo, event) {
    if (event.key === 'Enter') {
      finishEdit(todo);
    }
    return true;
  };

  // ----- کپی متن با دابل کلیک -----
  self.copyText = function (todo) {
    navigator.clipboard.writeText(todo.text());
  };

  // ----- فیلتر کردن وظایف -----
  self.setFilter = function (filterName) {
    self.currentFilter(filterName);
  };

  self.filteredTodos = ko.computed(function () {
    var filter = self.currentFilter();
    return ko.utils.arrayFilter(self.todos(), function (todo) {
      if (filter === 'active') return !todo.completed();
      if (filter === 'completed') return todo.completed();
      return true; // 'all'
    });
  });

  // ----- تعداد وظایف باقی‌مانده (جایگزین Counter() قبلی) -----
  self.itemsLeft = ko.computed(function () {
    return ko.utils.arrayFilter(self.todos(), function (todo) {
      return !todo.completed();
    }).length;
  });

  // ----- حذف همه‌ی موارد تکمیل‌شده -----
  self.clearCompleted = function () {
    self.todos.remove(function (todo) {
      return todo.completed();
    });
  };

  // ----- ساخت آبجکت ساده‌ی وضعیت فعلی -----
  // هم برای localStorage و هم برای Upload به سرور استفاده می‌شود.
  // اگر متن یک وظیفه حین ویرایش موقتاً خالی بود، متن قبلی جایگزین می‌شود.
  function getCurrentState() {
    return {
      currentFilter: self.currentFilter(),
      todos: self.todos().map(function (todo) {
        var text = todo.text().trim() === '' ? todo.previousText : todo.text();
        return { text: text, completed: todo.completed() };
      })
    };
  }

  // ----- ذخیره‌ی خودکار در localStorage -----
  // این computed به آرایه‌ی وظایف، متن و وضعیت تکمیل هر وظیفه و فیلتر وابسته است؛
  // با هر تغییری در هرکدام، خودکار دوباره اجرا می‌شود و وضعیت را ذخیره می‌کند.
  self.persistState = ko.computed(function () {
    saveState(getCurrentState());
  });

  // ===== همگام‌سازی با سرور (Upload / Download) =====

  // در حال ارسال/دریافت؟ (برای غیرفعال کردن دکمه‌ها و جلوگیری از درخواست تکراری)
  self.isSyncing = ko.observable(false);

  // پیام وضعیت و نوع آن ('info' | 'success' | 'error') برای نمایش به کاربر
  self.statusMessage = ko.observable('');
  self.statusType = ko.observable('');

  var statusTimer = null;
  function setStatus(message, type) {
    clearTimeout(statusTimer);
    self.statusMessage(message);
    self.statusType(type);
    // پیام‌های موفقیت و خطا بعد از ۶ ثانیه محو می‌شوند
    if (type !== 'info') {
      statusTimer = setTimeout(function () { self.statusMessage(''); }, 6000);
    }
  }

  // خطای HTTP را به یک Error با پیام خوانا تبدیل می‌کند (پیام سرور در صورت وجود)
  function httpError(res) {
    return res.json()
      .catch(function () { return {}; })
      .then(function (body) {
        var err = new Error(body.error || ('خطای سرور (' + res.status + ')'));
        err.status = res.status;
        throw err;
      });
  }

  // پیام مناسب برای خطاهای شبکه (سرور خاموش است / آدرس اشتباه است)
  function errorMessage(err) {
    // fetch در صورت قطع بودن شبکه/سرور یک TypeError پرتاب می‌کند
    if (err && err.name === 'TypeError') {
      return 'اتصال به سرور برقرار نشد. مطمئن شوید «node server.js» اجرا شده است.';
    }
    return err.message;
  }

  // ----- Upload: ارسال وضعیت فعلی به سرور -----
  self.uploadState = function () {
    if (self.isSyncing()) return;

    self.isSyncing(true);
    setStatus('در حال ارسال به سرور...', 'info');

    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(getCurrentState())
    })
      .then(function (res) {
        return res.ok ? res.json() : httpError(res);
      })
      .then(function (result) {
        setStatus('✅ ' + result.count + ' وظیفه با موفقیت روی سرور ذخیره شد.', 'success');
      })
      .catch(function (err) {
        setStatus('❌ ارسال ناموفق بود: ' + errorMessage(err), 'error');
      })
      .finally(function () {
        self.isSyncing(false);
      });
  };

  // ----- Download: دریافت آخرین وضعیت ذخیره‌شده از سرور -----
  self.downloadState = function () {
    if (self.isSyncing()) return;

    // دریافت از سرور، لیست فعلی را جایگزین می‌کند؛ پس قبلش تأیید می‌گیریم
    if (self.todos().length > 0 &&
        !confirm('لیست فعلی با نسخه‌ی ذخیره‌شده روی سرور جایگزین می‌شود. ادامه می‌دهید؟')) {
      return;
    }

    self.isSyncing(true);
    setStatus('در حال دریافت از سرور...', 'info');

    fetch(API_URL)
      .then(function (res) {
        return res.ok ? res.json() : httpError(res);
      })
      .then(function (data) {
        var state = normalizeState(data);
        if (!state) throw new Error('داده‌ی دریافتی از سرور معتبر نیست.');

        // جایگزینی وضعیت؛ چون observable هستند UI و localStorage خودکار به‌روز می‌شوند
        self.todos(state.todos);
        self.currentFilter(state.currentFilter);
        setStatus('✅ ' + state.todos.length + ' وظیفه از سرور دریافت شد.', 'success');
      })
      .catch(function (err) {
        setStatus('❌ دریافت ناموفق بود: ' + errorMessage(err), 'error');
      })
      .finally(function () {
        self.isSyncing(false);
      });
  };
}

// ===== فعال‌سازی Knockout روی صفحه =====
ko.applyBindings(new TodoListViewModel());
