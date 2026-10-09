// ===== مدل هر آیتم وظیفه =====
// هر وظیفه سه observable دارد: متن، وضعیت تکمیل و وضعیت ویرایش
function Todo(text, completed) {
  this.text = ko.observable(text);
  this.completed = ko.observable(completed || false);
  this.editing = ko.observable(false);
  this.previousText = text; // متن قبل از شروع ویرایش
}

// ===== ذخیره‌سازی سمت کلاینت (localStorage) =====
var STORAGE_KEY = 'todo-app-state-v1';
var VALID_FILTERS = ['all', 'active', 'completed'];

// خواندن وضعیت ذخیره‌شده؛ در صورت نبودن یا خراب بودن داده، وضعیت پیش‌فرض برمی‌گردد
function loadState() {
  var fallback = { todos: [], currentFilter: 'all' };
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;

    var data = JSON.parse(raw);
    var todos = Array.isArray(data.todos) ? data.todos : [];

    return {
      todos: todos
        .filter(function (t) { return t && typeof t.text === 'string' && t.text.trim() !== ''; })
        .map(function (t) { return new Todo(t.text, t.completed === true); }),
      currentFilter: VALID_FILTERS.indexOf(data.currentFilter) !== -1 ? data.currentFilter : 'all'
    };
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

  // ----- ذخیره‌ی خودکار -----
  // این computed به آرایه‌ی وظایف، متن و وضعیت تکمیل هر وظیفه و فیلتر وابسته است؛
  // با هر تغییری در هرکدام، خودکار دوباره اجرا می‌شود و وضعیت را ذخیره می‌کند.
  self.persistState = ko.computed(function () {
    todos: self.todos().map(function (todo) {
      var text = todo.text().trim() === '' ? todo.previousText : todo.text();
      return { text: text, completed: todo.completed() };
    })
    saveState({
      currentFilter: self.currentFilter(),
      todos: self.todos().map(function (todo) {
        return { text: todo.text(), completed: todo.completed() };
      })
    });
  });
}

// ===== فعال‌سازی Knockout روی صفحه =====
ko.applyBindings(new TodoListViewModel());
