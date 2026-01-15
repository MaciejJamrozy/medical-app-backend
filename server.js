const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");
const bcrypt = require('bcryptjs');

const { sequelize, User, Setting } = require('./models');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = 5001;

app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "http://localhost:3000", methods: ["GET", "POST"] }
});

app.use((req, res, next) => {
    req.io = io;
    next();
});

app.use('/api', apiRoutes);

io.on('connection', (socket) => {
    console.log('Nowy klient połączony:', socket.id);

    // 1. Rejestracja użytkownika (Frontend wysyła to po zalogowaniu)
    socket.on('register_user', (userId) => {
        const roomName = `user_${userId}`;
        
        // SINGLE SESSION MAGIC:
        // Zanim ten nowy socket dołączy, wysyłamy do WSZYSTKICH INNYCH w tym pokoju sygnał wylogowania.
        // socket.to(...) wysyła do innych w pokoju, ale NIE do nadawcy.
        socket.to(roomName).emit('force_logout', { 
            reason: 'Zalogowano się na innym urządzeniu (Single Session).' 
        });

        // Teraz nowy socket dołącza (jest bezpieczny)
        socket.join(roomName);
        console.log(`Socket ${socket.id} przypisany do użytkownika ${userId}`);
    });

    // 2. Obsługa ręcznego wylogowania (opcjonalne, do czyszczenia pokoju)
    socket.on('unregister_user', (userId) => {
        socket.leave(`user_${userId}`);
    });

    socket.on('disconnect', () => {
        // Socket sam wyjdzie z pokoju automatycznie
        console.log('Klient rozłączony:', socket.id);
    });
});

const startServer = async () => {
    try {
        await sequelize.sync();
        console.log('Baza danych OK.');
        
        const admin = await User.findOne({ where: { role: 'admin' } });
        if (!admin) {
            const pass = await bcrypt.hash('admin123', 10);
            await User.create({ username: 'admin', password: pass, name: 'Admin', role: 'admin' });
            console.log('Stworzono Admina (admin/admin123)');
        }

        const authSetting = await Setting.findOne({ where: { key: 'AUTH_MODE' } });
        if (!authSetting) {
            await Setting.create({ key: 'AUTH_MODE', value: 'LOCAL' });
            console.log('Ustawiono domyślny tryb auth: LOCAL');
        }

        server.listen(PORT, () => {
            console.log(`Serwer działa na porcie ${PORT}`);
        });
    } catch (e) { console.error(e); }
};

startServer();