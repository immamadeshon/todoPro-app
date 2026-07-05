
const addBtn = document.getElementById('add-btn');
const input = document.getElementById('addt');
const todosContainer = document.querySelector('.todos');
const clearBtn = document.querySelector('.clear');
const editBtn = document.querySelectorAll('.edit-btn');
const itemsLeft = document.getElementById('items-left');
const filter = document.querySelector(".filter");
const clearCompleted = document.querySelector("#clear-completed");
const allBtn = document.querySelector("#all");
const activeBtn = document.querySelector("#active");
const completedBtn = document.querySelector("#completed");

const Counter = () => {
  const count = document.querySelectorAll(".card.todo .cb-input:not(:checked)").length;
  return (count);
}

function addTodo() {
  const taskText = input.value.trim();
  if (taskText === '') {
    alert('لطفاً یک وظیفه وارد کنید!');
    return;
  }

  // ایجاد ساختار li جدید مطابق HTML موجود
  const li = document.createElement('li');
  li.classList.add('card');
  li.classList.add('todo');

  const cbContainer = document.createElement('div');
  cbContainer.classList.add('cb-container');

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.classList.add('cb-input');
  checkbox.addEventListener('click', () => {
    if(li.classList.contains("checked")){
      li.classList.remove('checked');
    }else{
    li.classList.add('checked');
    }
  })

  const checkSpan = document.createElement('span');
  checkSpan.classList.add('check');

  cbContainer.appendChild(checkbox);
  cbContainer.appendChild(checkSpan);

  const p = document.createElement('p');
  p.classList.add('item');
  p.classList.add('todo-text')
  p.textContent = taskText;

  const editBtn = document.createElement("button");
  editBtn.classList.add("edit-btn");
  const editImg = document.createElement("img");
  editImg.setAttribute("src", "./assets/images/icons8-edit-96.png");
  editImg.setAttribute("class", "edit-img");
  editImg.setAttribute("alt", "Edit It");

  const clearBtn = document.createElement("button");
  clearBtn.classList.add("clear");
  const img = document.createElement("img");
  img.setAttribute("src", "./assets/images/icon-cross.svg");
  img.setAttribute("alt", "Clear It");

  li.appendChild(cbContainer);
  li.appendChild(p);
  li.appendChild(editBtn);
  li.appendChild(clearBtn);
  editBtn.appendChild(editImg);
  clearBtn.appendChild(img);


  // افزودن به لیست
  todosContainer.appendChild(li);

  //حذف وظیفه
  clearBtn.addEventListener('click', () => {
    li.remove();
    itemsLeft.textContent = Counter();
  });

  // پاک کردن input
  input.value = '';

  // کپی با دوبار کلیک روی متن
  p.addEventListener('dblclick', () => {
    navigator.clipboard.writeText(p.innerText);
  });

  editBtn.addEventListener("click", () => {
    p.setAttribute("contenteditable", "true");
    p.classList.add("editing");
    li.classList.add("in-edit");
    p.focus();
  });

  p.addEventListener("blur", () => {
    p.setAttribute("contenteditable", "false");
    p.classList.remove("editing");
    li.classList.remove("in-edit");
  });

  // دکمه Enter
  p.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      if (p.classList.contains("editing")) {
        p.setAttribute("contenteditable", "false");
        p.classList.remove("editing");
        li.classList.remove("in-edit");
      }
    }
  });

  // استایل‌گذاری وقتی چک‌باکس فعال میشه
  checkbox.addEventListener('change', () => {
    p.style.textDecoration = checkbox.checked ? 'line-through' : 'none';
    p.style.opacity = checkbox.checked ? '0.6' : '1';
    itemsLeft.textContent = Counter();
  });


  itemsLeft.textContent = Counter();


  checkbox.addEventListener("change", () => {

    todosContainer.classList.toggle("checked");


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


allBtn.onclick = () => {

    todosContainer.classList.remove("active");
    todosContainer.classList.remove("completed");

}
activeBtn.onclick = () => {

    todosContainer.classList.remove("completed");
    todosContainer.classList.add("active");

}
completedBtn.onclick = () => {

    todosContainer.classList.remove("active");
    todosContainer.classList.add("completed");

}


filter.addEventListener('click', (e) => {

  const id = e.target.id;
  if (id) {
    document.querySelector(".on").classList.remove("on");
    document.getElementById(id).classList.add("on");
    document.querySelector(".todos").className = `todos ${id}`;
  }


});

clearCompleted.addEventListener("click", () => {

    document
        .querySelectorAll(".card.checked")
        .forEach(todo => {

            todo.remove();

        });



});
