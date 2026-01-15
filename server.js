const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");
const bcrypt = require('bcryptjs');

const { sequelize, User } = require('./models');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = 5001;

app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "http://localhost:3000", methods: ["GET", "POST"] }
});

// Socket.io Middleware - dzięki temu w kontrolerach mamy dostęp do req.io
app.use((req, res, next) => {
    req.io = io;
    next();
});

// Podpinamy trasy
app.use('/api', apiRoutes);

// Socket info
io.on('connection', (socket) => {
    console.log('Nowy klient połączony:', socket.id);
});

// Start serwera
const startServer = async () => {
    try {
        await sequelize.sync();
        console.log('Baza danych OK.');
        
        // Auto-Admin
        const admin = await User.findOne({ where: { role: 'admin' } });
        if (!admin) {
            const pass = await bcrypt.hash('admin123', 10);
            await User.create({ username: 'admin', password: pass, name: 'Admin', role: 'admin' });
            console.log('Stworzono Admina (admin/admin123)');
        }

        server.listen(PORT, () => {
            console.log(`Serwer działa na porcie ${PORT}`);
        });
    } catch (e) { console.error(e); }
};

startServer();