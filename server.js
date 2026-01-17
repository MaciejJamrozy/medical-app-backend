const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const { sequelize, User, Setting } = require('./models');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = 5001;

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)){
    fs.mkdirSync(uploadsDir);
}

app.use(cors());
app.use(express.json());

app.use('/uploads', express.static(uploadsDir));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { 
    origin: ["http://localhost:3000", "http://localhost:5173"], 
    methods: ["GET", "POST"] 
  }
});

app.use((req, res, next) => {
    req.io = io;
    next();
});

app.use('/api', apiRoutes);

io.on('connection', (socket) => {
    console.log('Nowy klient połączony:', socket.id);
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