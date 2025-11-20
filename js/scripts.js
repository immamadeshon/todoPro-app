
  const addBtn = document.getElementById('add-btn');
  const input = document.getElementById('addt');
  const todosContainer = document.querySelector('.todos');

 
  function addTodo() {
    const taskText = input.value.trim();
    if (taskText === '') {
      alert('لطفاً یک وظیفه وارد کنید!');
      return;
    }

    // ایجاد ساختار li جدید مطابق HTML موجود
    const li = document.createElement('li');
    li.classList.add('card');

    const cbContainer = document.createElement('div');
    cbContainer.classList.add('cb-container');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.classList.add('cb-input');

    const checkSpan = document.createElement('span');
    checkSpan.classList.add('check');

    cbContainer.appendChild(checkbox);
    cbContainer.appendChild(checkSpan);

    const p = document.createElement('p');
    p.classList.add('item');
    p.textContent = taskText;

    li.appendChild(cbContainer);
    li.appendChild(p);

    // افزودن به لیست
    todosContainer.appendChild(li);

    // پاک کردن input
    input.value = '';

    // حذف با دوبار کلیک روی متن
    p.addEventListener('dblclick', () => {
      li.remove();
    });

    // استایل‌گذاری وقتی چک‌باکس فعال میشه
    checkbox.addEventListener('change', () => {
      p.style.textDecoration = checkbox.checked ? 'line-through' : 'none';
      p.style.opacity = checkbox.checked ? '0.6' : '1';
    });
  }

  // دکمه کلیک
  addBtn.addEventListener('click', addTodo);

  // دکمه Enter
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addTodo();
    }
  });