const BASE_URL = 'https://task-reminder-app-i748.onrender.com/login';

let tasks = [];
let currentFilter = 'all';

function loadTasks() {
    const user_id = localStorage.getItem('user_id');

    if (!user_id) {
        alert('لازم تسجل دخول أولاً');
        window.location.href = 'login.html';
        return;
    }

    fetch(`${BASE_URL}/tasks/${user_id}`)
        .then(res => res.json())
        .then(data => {
            tasks = data;
            showTasks();
        })
        .catch(err => console.log(err));
}

function addTask() {
    const input = document.getElementById('taskInput');
    const category = document.getElementById('categorySelect');
    const date = document.getElementById('dateInput');

    const text = input.value.trim();
    const user_id = localStorage.getItem('user_id');

    if (!user_id) {
        alert('سجل دخول أولاً');
        window.location.href = 'login.html';
        return;
    }

    if (text === '') {
        alert('اكتب المهمة');
        return;
    }

    if (date.value === '') {
        alert('حدد التاريخ');
        return;
    }

    fetch(`${BASE_URL}/add-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            user_id: user_id,
            text: text,
            category: category.value,
            date: date.value
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            input.value = '';
            date.value = '';
            loadTasks();
        } else {
            alert('صار خطأ في حفظ المهمة');
        }
    })
    .catch(err => console.log(err));
}

function showTasks() {
    const list = document.getElementById('taskList');
    const emptyState = document.getElementById('emptyState');

    list.innerHTML = '';

    let filteredTasks = tasks;

    if (currentFilter !== 'all') {
        filteredTasks = tasks.filter(task => task.category === currentFilter);
    }

    if (filteredTasks.length === 0) {
        emptyState.style.display = 'block';
        return;
    } else {
        emptyState.style.display = 'none';
    }

    filteredTasks.forEach(task => {
        const li = document.createElement('li');
        li.className = `task-item ${task.completed == 1 ? 'completed' : ''}`;

        const catText = {
            work: '💼 عمل',
            personal: '🏠 شخصي',
            study: '📚 دراسة',
            health: '💪 صحة'
        }[task.category] || task.category;

        li.innerHTML = `
            <div class="task-content">
                <div class="task-text">${task.text}</div>
                <div class="task-meta">
                    <span class="category-badge cat-${task.category}">${catText}</span>
                    ${task.date ? `<span>📅 ${task.date}</span>` : ''}
                </div>
            </div>

            <div class="task-actions">
                <button class="icon-btn complete-btn" onclick="completeTask(${task.id})" title="إنجاز">
                    ${task.completed == 1 ? '↩️' : '✅'}
                </button>

                <button class="icon-btn edit-btn" onclick="editTask(${task.id})" title="تعديل">
                    ✏️
                </button>

                <button class="icon-btn delete-btn" onclick="deleteTask(${task.id})" title="حذف">
                    🗑️
                </button>
            </div>
        `;

        list.appendChild(li);
    });
}

function deleteTask(id) {
    if (!confirm('هل أنت متأكد من حذف المهمة؟')) return;

    fetch(`${BASE_URL}/delete-task/${id}`, {
        method: 'DELETE'
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) loadTasks();
    })
    .catch(err => console.log(err));
}

function completeTask(id) {
    fetch(`${BASE_URL}/complete-task/${id}`, {
        method: 'PUT'
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) loadTasks();
    })
    .catch(err => console.log(err));
}

function editTask(id) {
    const task = tasks.find(t => t.id === id);
    const newText = prompt('عدّل المهمة:', task.text);

    if (!newText || newText.trim() === '') return;

    fetch(`${BASE_URL}/update-task/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            text: newText.trim()
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) loadTasks();
    })
    .catch(err => console.log(err));
}

function filterTasks(category) {
    currentFilter = category;

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    event.target.classList.add('active');
    showTasks();
}

document.addEventListener('DOMContentLoaded', function () {
    loadTasks();

    document.getElementById('taskInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            addTask();
        }
    });
});