//  مدل هر آیتم وظیفه 
function Todo(text, completed) {
  this.text = ko.observable(text);
  this.completed = ko.observable(completed || false);
  this.editing = ko.observable(false);
}

//  ViewModel اصلی برنامه 
function TodoListViewModel() {
  var self = this;

  // متن ورودی وظیفه جدید
  self.newTodoText = ko.observable('');

  // لیست همه وظایف
  self.todos = ko.observableArray([]);

  // فیلتر فعال: 'all' | 'active' | 'completed'
  self.currentFilter = ko.observable('all');

  
  self.addTodo = function () {
    var text = self.newTodoText().trim();
    if (text === '') {
      alert('لطفاً یک وظیفه وارد کنید!');
      return;
    }
    self.todos.push(new Todo(text));
    self.newTodoText('');
  };

  
  self.addOnEnter = function (data, event) {
    if (event.key === 'Enter') {
      self.addTodo();
    }
    return true; // اجازه رفتار پیش‌فرض input را می‌دهد
  };

  
  self.removeTodo = function (todo) {
    self.todos.remove(todo);
  };


  self.startEdit = function (todo) {
    todo.editing(true);
  };

  self.stopEdit = function (todo) {
    todo.editing(false);
  };

  
  self.stopEditOnEnter = function (todo, event) {
    if (event.key === 'Enter') {
      todo.editing(false);
    }
    return true;
  };

  
  self.copyText = function (todo) {
    navigator.clipboard.writeText(todo.text());
  };

 
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

 
  self.itemsLeft = ko.computed(function () {
    return ko.utils.arrayFilter(self.todos(), function (todo) {
      return !todo.completed();
    }).length;
  });

  self.clearCompleted = function () {
    self.todos.remove(function (todo) {
      return todo.completed();
    });
  };
}

//  فعال‌سازی Knockout 
ko.applyBindings(new TodoListViewModel());
