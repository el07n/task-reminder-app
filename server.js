const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// DATABASE
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    },
    family: 4
});

// EMAIL
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// HOME
app.get('/', (req, res) => {
    res.send('Task Reminder Backend is running ✅');
});

// REGISTER
app.post('/register', async (req, res) => {
    const { name, email, password } = req.body;

    try {
        await pool.query(
            'INSERT INTO users (name, email, password) VALUES ($1, $2, $3)',
            [name, email, password]
        );

        res.json({ success: true });
    } catch (err) {
        console.log('REGISTER ERROR:', err.message);
        res.json({ success: false, message: 'Email already exists' });
    }
});

// LOGIN
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1 AND password = $2',
            [email, password]
        );

        if (result.rows.length > 0) {
            res.json({ success: true, user: result.rows[0] });
        } else {
            res.json({ success: false, message: 'Invalid login' });
        }
    } catch (err) {
        console.log('LOGIN ERROR:', err.message);
        res.json({ success: false });
    }
});

// ADD TASK
app.post('/add-task', async (req, res) => {
    const { user_id, text, category, date } = req.body;

    if (!user_id || !text || !date) {
        return res.status(400).json({ success: false, error: 'Missing data' });
    }

    try {
        await pool.query(
            'INSERT INTO tasks (user_id, text, category, date) VALUES ($1, $2, $3, $4)',
            [user_id, text, category, date]
        );

        res.json({ success: true });
    } catch (err) {
        console.log('ADD TASK ERROR:', err.message);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// GET TASKS
app.get('/tasks/:user_id', async (req, res) => {
    const user_id = req.params.user_id;

    try {
        const result = await pool.query(
            'SELECT * FROM tasks WHERE user_id = $1 ORDER BY id DESC',
            [user_id]
        );

        res.json(result.rows);
    } catch (err) {
        console.log('GET TASKS ERROR:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

// DELETE TASK
app.delete('/delete-task/:id', async (req, res) => {
    const id = req.params.id;

    try {
        await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err) {
        console.log('DELETE ERROR:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

// COMPLETE / UNCOMPLETE TASK
app.put('/complete-task/:id', async (req, res) => {
    const id = req.params.id;

    try {
        await pool.query(
            'UPDATE tasks SET completed = CASE WHEN completed = 1 THEN 0 ELSE 1 END WHERE id = $1',
            [id]
        );

        res.json({ success: true });
    } catch (err) {
        console.log('COMPLETE ERROR:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

// UPDATE TASK
app.put('/update-task/:id', async (req, res) => {
    const id = req.params.id;
    const { text } = req.body;

    try {
        await pool.query(
            'UPDATE tasks SET text = $1 WHERE id = $2',
            [text, id]
        );

        res.json({ success: true });
    } catch (err) {
        console.log('UPDATE ERROR:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

// EMAIL REMINDER EVERY DAY AT 9 AM
cron.schedule('0 9 * * *', async () => {
    const today = new Date().toISOString().split('T')[0];

    try {
        const result = await pool.query(`
            SELECT tasks.*, users.email
            FROM tasks
            JOIN users ON tasks.user_id = users.id
            WHERE tasks.date = $1
            AND tasks.completed = 0
            AND tasks.notified = 0
        `, [today]);

        for (const task of result.rows) {
            try {
                await transporter.sendMail({
                    from: process.env.EMAIL_USER,
                    to: task.email,
                    subject: 'Task Reminder',
                    text: `لا تنسَ: ${task.text} 💪 شد حيلك اليوم!`
                });

                await pool.query(
                    'UPDATE tasks SET notified = 1 WHERE id = $1',
                    [task.id]
                );

                console.log(`Email sent to ${task.email}`);
            } catch (emailErr) {
                console.log('EMAIL ERROR:', emailErr.message);
            }
        }

        console.log('Checked reminders');
    } catch (err) {
        console.log('REMINDER ERROR:', err.message);
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});