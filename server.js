const express = require('express');
const cors = require('cors');
const { Sequelize, DataTypes, Op } = require('sequelize');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const http = require('http');
const { Server } = require("socket.io");

const app = express();
const PORT = 5001;
const SECRET_KEY = 'super-tajny-klucz-do-podmiany-w-produkcji'; // W prawdziwej apce użyj zmiennych środowiskowych

app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000", // Adres Twojego Frontendu
        methods: ["GET", "POST"]
    }
});

// Obsługa połączeń (tylko informacyjnie w konsoli)
io.on('connection', (socket) => {
    console.log('Nowy klient połączony:', socket.id);
});

// --- BAZA DANYCH ---
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './database.sqlite',
    logging: false
});

// --- MODELE ---

// 1. Użytkownik (Lekarz, Pacjent, Admin)
const User = sequelize.define('User', {
    username: { type: DataTypes.STRING, unique: true, allowNull: false },
    password: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.STRING, allowNull: false, defaultValue: 'patient' },
    name: { type: DataTypes.STRING, allowNull: false },
    specialization: { type: DataTypes.STRING, allowNull: true },
    isBanned: { type: DataTypes.BOOLEAN, defaultValue: false }
});

// 2. Slot (Konkretny termin wizyty, np. 2025-02-01 08:30)
const Slot = sequelize.define('Slot', {
    date: { type: DataTypes.STRING, allowNull: false }, // Format YYYY-MM-DD
    time: { type: DataTypes.STRING, allowNull: false }, // Format HH:MM
    status: { type: DataTypes.STRING, defaultValue: 'free' }, // free, booked, cancelled

    // isBooked: { type: DataTypes.BOOLEAN, defaultValue: false },
    visitType: { type: DataTypes.STRING }, // np. "Pierwsza wizyta"
    patientName: { type: DataTypes.STRING },
    patientNotes: { type: DataTypes.TEXT }, // "Informacje dla lekarza"
    patientAge: { type: DataTypes.INTEGER },
    patientGender: { type: DataTypes.STRING }
});

// POPRAWKA: Definiujemy CartItem z jawnymi kluczami, żeby nie było niedomówień
const CartItem = sequelize.define('CartItem', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    // Jawnie wskazujemy, że te pola tu są
    patientId: { type: DataTypes.INTEGER, allowNull: false },
    slotId: { type: DataTypes.INTEGER, allowNull: false }
});

const Rating = sequelize.define('Rating', {
    stars: { type: DataTypes.INTEGER, validate: { min: 1, max: 5 } },
    comment: { type: DataTypes.TEXT },
    reply: { type: DataTypes.TEXT }
});

const Absence = sequelize.define('Absence', {
    date: { type: DataTypes.STRING, allowNull: false },
    reason: { type: DataTypes.STRING }
});

// --- RELACJE ---

User.hasMany(Slot, { foreignKey: 'doctorId', as: 'doctorSlots' });
Slot.belongsTo(User, { foreignKey: 'doctorId', as: 'Doctor' });

User.hasMany(Slot, { foreignKey: 'patientId', as: 'patientVisits' });
Slot.belongsTo(User, { foreignKey: 'patientId', as: 'Patient' });

User.hasMany(CartItem, { foreignKey: 'patientId' });
CartItem.belongsTo(User, { foreignKey: 'patientId' });

Slot.hasOne(CartItem, { foreignKey: 'slotId' });
CartItem.belongsTo(Slot, { foreignKey: 'slotId' });

User.hasMany(Rating, { foreignKey: 'doctorId', as: 'receivedRatings' });
Rating.belongsTo(User, { foreignKey: 'doctorId', as: 'Doctor' });

User.hasMany(Rating, { foreignKey: 'patientId', as: 'givenRatings' });
Rating.belongsTo(User, { foreignKey: 'patientId', as: 'Patient' });

User.hasMany(Absence, { foreignKey: 'doctorId' });
Absence.belongsTo(User, { foreignKey: 'doctorId' });

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Brak tokena' });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ message: 'Token nieprawidłowy' });
        req.user = user;
        next();
    });
};

const authorizeRole = (roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) return res.status(403).json({ message: 'Brak uprawnień' });
        next();
    };
};

// --- LOGIKA POMOCNICZA ---
const generateTimeSlots = (startStr, endStr) => {
    const slots = [];
    let [h, m] = startStr.split(':').map(Number);
    const [endH, endM] = endStr.split(':').map(Number);
    
    while (h < endH || (h === endH && m < endM)) {
        const timeString = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        slots.push(timeString);
        
        m += 30;
        if (m >= 60) {
            h++;
            m -= 60;
        }
    }
    return slots;
};


app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, name } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({ username, password: hashedPassword, name, role: 'patient' });
        res.status(201).json({ message: 'Zarejestrowano' });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ where: { username } });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: 'Błąd logowania' });
        }
        const token = jwt.sign({ id: user.id, role: user.role }, SECRET_KEY, { expiresIn: '2h' });
        res.json({ token, role: user.role, username: user.username, id: user.id, isBanned: user.isBanned });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/doctors', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    try {
        const { username, password, name, specialization } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({ username, password: hashedPassword, name, role: 'doctor', specialization });
        res.status(201).json({ message: 'Lekarz dodany' });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/admin/users', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    try {
        const users = await User.findAll({
            attributes: ['id', 'name', 'username', 'role', 'isBanned']
        });
        res.json(users);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/admin/users/:id/ban', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    try {
        const { isBanned } = req.body;
        const user = await User.findByPk(req.params.id);
        
        if (!user) return res.status(404).json({ error: 'Użytkownik nie istnieje' });
        if (user.role === 'admin') return res.status(400).json({ error: 'Nie można zbanować admina' });

        user.isBanned = isBanned;
        await user.save();

        res.json({ message: `Status użytkownika zmieniony na: ${isBanned ? 'Zbanowany' : 'Aktywny'}` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/doctors', async (req, res) => {
    const doctors = await User.findAll({ where: { role: 'doctor' }, attributes: ['id', 'name', 'specialization'] });
    res.json(doctors);
});

app.post('/api/availability', authenticateToken, authorizeRole(['doctor']), async (req, res) => {
    try {
        const { date, startTime, endTime } = req.body;
        const doctorId = req.user.id;

        const times = generateTimeSlots(startTime, endTime);
        const createdSlots = [];

        for (const time of times) {
            const exists = await Slot.findOne({ where: { doctorId, date, time } });
            if (!exists) {
                const slot = await Slot.create({
                    date,
                    time,
                    doctorId,
                    status: 'free'
                });
                createdSlots.push(slot);
            }
        }

        io.emit('schedule_update');
        res.json({ message: `Dodano ${createdSlots.length} slotów na dzień ${date}`, slots: createdSlots });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/availability/cyclical', authenticateToken, authorizeRole(['doctor']), async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { startDate, endDate, weekDays, timeRanges } = req.body;
        const doctorId = req.user.id;
        const slotDuration = 30;

        const start = new Date(startDate);
        const end = new Date(endDate);
        const generatedSlots = [];

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const currentDayOfWeek = d.getDay();
            const dateStr = d.toISOString().split('T')[0];

            const absence = await Absence.findOne({ where: { doctorId, date: dateStr }, transaction });
            if (absence) {
                console.log(`Pominięto ${dateStr} z powodu nieobecności.`);
                continue;
            }

            if (weekDays.includes(currentDayOfWeek)) {
                
                for (const range of timeRanges) {
                    const [startH, startM] = range.start.split(':').map(Number);
                    const [endH, endM] = range.end.split(':').map(Number);
                    
                    let currentMinutes = startH * 60 + startM;
                    const endMinutes = endH * 60 + endM;

                    while (currentMinutes + slotDuration <= endMinutes) {
                        const h = Math.floor(currentMinutes / 60);
                        const m = currentMinutes % 60;
                        const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

                        const exists = await Slot.findOne({
                            where: { doctorId, date: dateStr, time: timeStr },
                            transaction
                        });

                        if (!exists) {
                            await Slot.create({
                                doctorId,
                                date: dateStr,
                                time: timeStr,
                                status: 'free'
                            }, { transaction });
                            generatedSlots.push(`${dateStr} ${timeStr}`);
                        }

                        currentMinutes += slotDuration;
                    }
                }
            }
        }

        await transaction.commit();
        
        io.emit('schedule_update');
        
        res.json({ 
            message: `Wygenerowano ${generatedSlots.length} slotów.`,
            count: generatedSlots.length 
        });

    } catch (e) {
        await transaction.rollback();
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/doctor/absence', authenticateToken, authorizeRole(['doctor']), async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { date, reason } = req.body;
        const doctorId = req.user.id;

        await Absence.create({ doctorId, date, reason }, { transaction });

        const slots = await Slot.findAll({
            where: { doctorId, date },
            transaction
        });

        let cancelledCount = 0;

        for (const slot of slots) {
            if (slot.status === 'booked' || slot.status === 'pending') {
                slot.status = 'cancelled';
                await slot.save({ transaction });
                cancelledCount++;
            } else {
                await slot.destroy({ transaction });
            }
        }

        await transaction.commit();
        io.emit('schedule_update');

        res.json({ 
            message: `Nieobecność dodana. Odwołano wizyt: ${cancelledCount}.`,
            cancelledCount 
        });

    } catch (e) {
        await transaction.rollback();
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/doctor/:id/absences', async (req, res) => {
    const absences = await Absence.findAll({ where: { doctorId: req.params.id } });
    res.json(absences);
});

app.get('/api/doctor/schedule', authenticateToken, async (req, res) => {
    try {
        const { doctorId, from, to } = req.query;
        const requestingUserId = req.user.id;
        const requestingUserRole = req.user.role;

        const whereClause = {};
        if (doctorId) whereClause.doctorId = doctorId;
        else return res.status(400).json({ message: 'Brak doctorId' });

        if (from && to) {
            whereClause.date = { [Op.between]: [from, to] };
        }

        const slots = await Slot.findAll({
            where: whereClause,
            order: [['date', 'ASC'], ['time', 'ASC']]
        });
        
        const sanitizedSlots = slots.map(slot => {
            const s = slot.toJSON(); 

            if (requestingUserRole === 'doctor') return s;

            const isMySlot = (s.patientId === requestingUserId);

            if (s.status === 'cancelled' && !isMySlot) {
                s.status = 'booked'; 
            }

            if (s.status === 'pending' && !isMySlot) {
                s.status = 'booked';
            }

            if (!isMySlot) {
                s.patientName = null;
                s.patientNotes = null;
                s.patientAge = null;
                s.patientGender = null;
                s.visitType = null;
                s.patientId = null;
            }

            return s;
        });

        res.json(sanitizedSlots);

    } catch (e) {
        console.error("Błąd pobierania grafiku:", e);
        res.status(500).json({ error: e.message });
    }
});



// ETAP 3: LOGIKA PACJENTA

// 1. Dodaj do koszyka
app.post('/api/cart/add', authenticateToken, async (req, res) => {
    if (req.user.role !== 'patient') return res.status(403).json({ message: "Brak uprawnień" });

    const transaction = await sequelize.transaction();
    try {
        const { startSlotId, duration = 1, details } = req.body; 

        const patientId = req.user.id;

        const firstSlot = await Slot.findOne({ where: { id: startSlotId }, transaction });
        if (!firstSlot) throw new Error("Slot nie istnieje");

        const allSlotsToBook = [firstSlot];
        
        let currentH = parseInt(firstSlot.time.split(':')[0]);
        let currentM = parseInt(firstSlot.time.split(':')[1]);

        for (let i = 1; i < duration; i++) {
            currentM += 30;
            if (currentM >= 60) {
                currentH += 1;
                currentM -= 60;
            }
            const nextTimeStr = `${String(currentH).padStart(2,'0')}:${String(currentM).padStart(2,'0')}`;
            
            const nextSlot = await Slot.findOne({
                where: {
                    doctorId: firstSlot.doctorId,
                    date: firstSlot.date,
                    time: nextTimeStr
                },
                transaction
            });

            if (!nextSlot) {
                throw new Error(`Brak wolnego terminu o godzinie ${nextTimeStr} (wymagany ciągły blok czasowy).`);
            }
            allSlotsToBook.push(nextSlot);
        }

        // 3. Walidacja konfliktów - czy WSZYSTKIE są wolne?
        for (const slot of allSlotsToBook) {
            if (slot.status !== 'free') {
                throw new Error(`Konflikt! Termin o ${slot.time} jest już zajęty. Nie można zarezerwować wizyty o tej długości.`);
            }
        }

        for (const slot of allSlotsToBook) {
            slot.status = 'pending';
            slot.patientId = patientId;
            
            if (details) {
                slot.visitType = details.visitType;
                slot.patientName = details.patientName; 
                slot.patientAge = details.patientAge;
                slot.patientGender = details.patientGender;
                slot.patientNotes = details.notes;
            }
            
            await slot.save({ transaction });

            await CartItem.create({
                patientId,
                slotId: slot.id
            }, { transaction });
        }

        await transaction.commit();
        io.emit('schedule_update');
        res.json({ message: "Dodano wizytę do koszyka" });

    } catch (error) {
        await transaction.rollback();
        res.status(400).json({ message: error.message });
    }
});


// 2. Zobacz mój koszyk
app.get('/api/cart', authenticateToken, async (req, res) => {
    try {
        const cartItems = await CartItem.findAll({
            where: { patientId: req.user.id },
            include: [{
                model: Slot,
                include: [{ model: User, as: 'Doctor', attributes: ['name', 'specialization'] }]
            }]
        });
        
        res.json(cartItems);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Usuwanie z koszyka
app.delete('/api/cart/:slotId', authenticateToken, async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { slotId } = req.params;
        const patientId = req.user.id;

        const slot = await Slot.findOne({ where: { id: slotId }, transaction });

        if (!slot) {
            await transaction.rollback();
            return res.status(404).json({ message: "Slot nie istnieje" });
        }

        const cartItem = await CartItem.findOne({
            where: { slotId, patientId },
            transaction
        });

        if (cartItem) {
            await cartItem.destroy({ transaction });
        }

        slot.status = 'free';
        slot.patientId = null;
        
        slot.visitType = null;
        slot.patientName = null;
        slot.patientAge = null;
        slot.patientGender = null;
        slot.patientNotes = null;

        await slot.save({ transaction });

        await transaction.commit();
        
        io.emit('schedule_update'); 
        
        res.json({ message: "Usunięto z koszyka i zwolniono termin" });

    } catch (e) {
        await transaction.rollback();
        res.status(500).json({ error: e.message });
    }
});

// 4. Finalizacja (Checkout)
app.post('/api/cart/checkout', authenticateToken, async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
        const patientId = req.user.id;
        
        const cartItems = await CartItem.findAll({
            where: { patientId },
            include: [Slot],
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        
        if (cartItems.length === 0) {
            await transaction.rollback();
            return res.status(400).json({ message: "Koszyk jest pusty" });
        }
        
        for (const item of cartItems) {
            const slot = item.Slot;

            if (!slot) {
                await transaction.rollback();
                return res.status(400).json({ message: "Jeden z terminów został usunięty przez lekarza." });
            }

            if (slot.status === 'booked') {
                await transaction.rollback();
                return res.status(400).json({ message: `Termin ${slot.time} jest już niedostępny.` });
            }

            if (slot.status === 'cancelled') {
                await transaction.rollback();
                return res.status(400).json({ message: `Termin ${slot.time} został odwołany przez lekarza.` });
            }

            const absence = await Absence.findOne({
                where: { doctorId: slot.doctorId, date: slot.date },
                transaction
            });

            if (absence) {
                await transaction.rollback();
                return res.status(400).json({ message: `Lekarz zgłosił nieobecność w dniu ${slot.date}. Rezerwacja niemożliwa.` });
            }
            
            await slot.update({
                status: 'booked',
                patientId
            }, { transaction });
        }
        
        await CartItem.destroy({
            where: { patientId },
            transaction
        });
        
        await transaction.commit();
        
        io.emit('schedule_update');
        res.json({ message: "Rezerwacja potwierdzona 🎉" });
        
    } catch (error) {
        await transaction.rollback();
        console.error("Błąd checkoutu:", error);
        res.status(500).json({ error: error.message });
    }
});

// Pobierz moje wizyty
app.get('/api/appointments/my', authenticateToken, async (req, res) => {
    try {
        const appointments = await Slot.findAll({
            where: {
                patientId: req.user.id,
                status: {
                    [Op.or]: ['booked', 'cancelled'] 
                }
            },
            include: [{ model: User, as: 'Doctor', attributes: ['name', 'specialization'] }],
            order: [['date', 'DESC'], ['time', 'DESC']]
        });
        res.json(appointments);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Anulowanie wizyty przez pacjenta
app.post('/api/appointments/:id/cancel', authenticateToken, async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const slotId = req.params.id;
        const patientId = req.user.id;

        const slot = await Slot.findOne({
            where: { 
                id: slotId, 
                patientId: patientId,
                status: 'booked'
            },
            transaction
        });

        if (!slot) {
            await transaction.rollback();
            return res.status(404).json({ message: "Wizyta nie znaleziona lub nie można jej anulować." });
        }

        const now = new Date();
        const slotDate = new Date(`${slot.date}T${slot.time}`);
        if (slotDate < now) {
            await transaction.rollback();
            return res.status(400).json({ message: "Nie można odwołać wizyty, która już się odbyła." });
        }

        slot.status = 'free';
        slot.patientId = null;
        
        slot.visitType = null;
        slot.patientName = null;
        slot.patientAge = null;
        slot.patientGender = null;
        slot.patientNotes = null;

        await slot.save({ transaction });

        await transaction.commit();
        
        io.emit('schedule_update');

        res.json({ message: "Wizyta została odwołana. Termin wrócił do puli wolnych." });

    } catch (e) {
        await transaction.rollback();
        res.status(500).json({ error: e.message });
    }
});

// ETAP 5: OCENY I KOMENTARZE

// 1. Dodaj ocenę
app.post('/api/ratings', authenticateToken, authorizeRole(['patient']), async (req, res) => {
    try {
        const { doctorId, stars, comment } = req.body;
        const patientId = req.user.id;
        
        const visit = await Slot.findOne({
            where: {
                doctorId: doctorId,
                patientId: patientId,
                status: 'booked'
            }
        });
        
        if (!visit) {
            return res.status(403).json({ message: "Możesz ocenić tylko lekarza, u którego miałeś wizytę." });
        }
        
        const existingRating = await Rating.findOne({ where: { doctorId, patientId } });
        if (existingRating) {
            return res.status(400).json({ message: "Już oceniłeś tego lekarza." });
        }
        
        await Rating.create({
            patientId,
            doctorId,
            stars,
            comment
        });
        
        res.status(201).json({ message: "Ocena dodana pomyślnie!" });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. Pobierz oceny lekarza (Dla wszystkich)
app.get('/api/doctors/:id/ratings', async (req, res) => {
    try {
        const ratings = await Rating.findAll({
            where: { doctorId: req.params.id },
            include: [{ model: User, as: 'Patient', attributes: ['username'] }] // Pokaż kto ocenił
        });
        res.json(ratings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/ratings', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    try {
        const ratings = await Rating.findAll({
            include: [
                { model: User, as: 'Patient', attributes: ['name', 'username'] }, // Kto wystawił
                { model: User, as: 'Doctor', attributes: ['name', 'specialization'] } // Komu wystawił
            ],
            order: [['createdAt', 'DESC']] // Najnowsze na górze
        });
        res.json(ratings);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/admin/ratings/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    try {
        const result = await Rating.destroy({ where: { id: req.params.id } });
        if (result === 0) return res.status(404).json({ error: 'Opinia nie istnieje' });
        
        res.json({ message: 'Opinia usunięta' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Pobierz moje nadchodzące wizyty (Dla zalogowanego Lekarza)
app.get('/api/doctor/my-appointments', authenticateToken, authorizeRole(['doctor']), async (req, res) => {
    try {
        const myId = req.user.id;
        
        const appointments = await Slot.findAll({
            where: {
                doctorId: myId,
                status: 'booked' // Interesują nas tylko zatwierdzone wizyty
            },
            include: [{
                model: User,
                as: 'Patient', // Pobieramy dane pacjenta
                attributes: ['username'] // W prawdziwej apce byłoby tu name, surname, phone
            }],
            order: [['date', 'ASC'], ['time', 'ASC']]
        });
        
        res.json(appointments);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- START ---
const startServer = async () => {
    try {
        await sequelize.sync()
        console.log('Baza danych OK.');
        
        // Auto-Admin
        const admin = await User.findOne({ where: { role: 'admin' } });
        if (!admin) {
            const pass = await bcrypt.hash('admin123', 10);
            await User.create({ username: 'admin', password: pass, name: 'Admin', role: 'admin' });
            console.log('Stworzono Admina (admin/admin123)');
        }

        server.listen(PORT, () => {
            console.log(`Serwer (z Socket.io) działa na porcie ${PORT}`);
        });
    } catch (e) { console.error(e); }
};


startServer();