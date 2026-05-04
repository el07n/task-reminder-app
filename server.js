const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type']
}));app.use(express.json());

// DATABASE
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
    family: 4
});

console.log('DB URL CHECK:', process.env.DATABASE_URL ? 'EXISTS' : 'MISSING');

if (process.env.DATABASE_URL) {
    const dbUrl = new URL(process.env.DATABASE_URL);
    console.log('DB USER:', dbUrl.username);
    console.log('DB HOST:', dbUrl.hostname);
    console.log('DB PORT:', dbUrl.port);
    console.log('DB PASS LENGTH:', dbUrl.password.length);
}

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
    let { name, email, password } = req.body;

    console.log('REGISTER BODY:', req.body);

    if (!name || !email || !password) {
        return res.json({
            success: false,
            message: 'Please fill all fields'
        });
    }

    name = name.trim();
    email = email.trim().toLowerCase();
    password = password.trim();

    try {
        // Check if email already exists
        const existingUser = await pool.query(
            'SELECT id FROM users WHERE LOWER(email) = $1',
            [email]
        );

        if (existingUser.rows.length > 0) {
            return res.json({
                success: false,
                message: 'Email already exists'
            });
        }

        // Insert new user
        const result = await pool.query(
            'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email',
            [name, email, password]
        );

        res.json({
            success: true,
            user: result.rows[0]
        });

    } catch (err) {
        console.log('REGISTER ERROR:', err);

        res.json({
            success: false,
            message: 'Database error: ' + err.message
        });
    }
});

// LOGIN
app.post('/login', async (req, res) => {
    let { email, password } = req.body;

    console.log('LOGIN BODY:', req.body);

    if (!email || !password) {
        return res.json({
            success: false,
            message: 'Please fill all fields'
        });
    }

    email = email.trim().toLowerCase();
    password = password.trim();

    try {
        // Search user by email only
        const result = await pool.query(
            'SELECT * FROM users WHERE LOWER(email) = $1',
            [email]
        );

        if (result.rows.length === 0) {
            return res.json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        const user = result.rows[0];

        // Compare password
        if (user.password !== password) {
            return res.json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email
            }
        });

    } catch (err) {
        console.log('LOGIN ERROR:', err);

        res.json({
            success: false,
            message: 'Server error: ' + err.message
        });
    }
});

// ADD TASK
app.post('/add-task', async (req, res) => {
    const { user_id, text, category, date } = req.body;

    if (!user_id || !text || !date) {
        return res.status(400).json({
            success: false,
            error: 'Missing data'
        });
    }

    try {
        await pool.query(
            'INSERT INTO tasks (user_id, text, category, date) VALUES ($1, $2, $3, $4)',
            [user_id, text.trim(), category || 'General', date]
        );

        res.json({ success: true });

    } catch (err) {
        console.log('ADD TASK ERROR:', err.message);

        res.status(500).json({
            success: false,
            error: 'Database error'
        });
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

        res.status(500).json({
            error: 'Database error'
        });
    }
});

// DELETE TASK
app.delete('/delete-task/:id', async (req, res) => {
    const id = req.params.id;

    try {
        await pool.query(
            'DELETE FROM tasks WHERE id = $1',
            [id]
        );

        res.json({ success: true });

    } catch (err) {
        console.log('DELETE ERROR:', err.message);

        res.status(500).json({
            success: false,
            error: 'Database error'
        });
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

        res.status(500).json({
            success: false,
            error: 'Database error'
        });
    }
});

// UPDATE TASK
app.put('/update-task/:id', async (req, res) => {
    const id = req.params.id;
    const { text } = req.body;

    if (!text || text.trim() === '') {
        return res.status(400).json({
            success: false,
            error: 'Task text is required'
        });
    }

    try {
        await pool.query(
            'UPDATE tasks SET text = $1 WHERE id = $2',
            [text.trim(), id]
        );

        res.json({ success: true });

    } catch (err) {
        console.log('UPDATE ERROR:', err.message);

        res.status(500).json({
            success: false,
            error: 'Database error'
        });
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