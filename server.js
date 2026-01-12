const express = require('express');
const cors = require('cors');
const { Sequelize, DataTypes, Op } = require('sequelize'); // Dodano Op
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// NOWE IMPORTY DLA SOCKET.IO
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
    date: { type: DataTypes.STRING, allowNull: false }, // Format YYYY-MM-DD
    reason: { type: DataTypes.STRING }
});

// --- RELACJE (Skopiuj to dokładnie) ---

// 1. Lekarz <-> Sloty
User.hasMany(Slot, { foreignKey: 'doctorId', as: 'doctorSlots' });
Slot.belongsTo(User, { foreignKey: 'doctorId', as: 'Doctor' }); // Wielka litera 'Doctor'

// 2. Pacjent <-> Wizyty (Zarezerwowane)
User.hasMany(Slot, { foreignKey: 'patientId', as: 'patientVisits' });
Slot.belongsTo(User, { foreignKey: 'patientId', as: 'Patient' });

// 3. Koszyk (Kluczowe poprawki)
// Jeden pacjent ma wiele rzeczy w koszyku
User.hasMany(CartItem, { foreignKey: 'patientId' });
CartItem.belongsTo(User, { foreignKey: 'patientId' });

// Jedna pozycja w koszyku wskazuje na jeden Slot
Slot.hasOne(CartItem, { foreignKey: 'slotId' });
CartItem.belongsTo(Slot, { foreignKey: 'slotId' }); // Bez aliasu, domyślnie 'Slot'

// 4. Oceny
User.hasMany(Rating, { foreignKey: 'doctorId', as: 'receivedRatings' });
Rating.belongsTo(User, { foreignKey: 'doctorId', as: 'Doctor' });

User.hasMany(Rating, { foreignKey: 'patientId', as: 'givenRatings' });
Rating.belongsTo(User, { foreignKey: 'patientId', as: 'Patient' });

// 5. Nieobecności
User.hasMany(Absence, { foreignKey: 'doctorId' });
Absence.belongsTo(User, { foreignKey: 'doctorId' });

// --- MIDDLEWARE ---
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

// --- LOGIKA POMOCNICZA (Generowanie Slotów) ---
const generateTimeSlots = (startStr, endStr) => {
    const slots = [];
    let [h, m] = startStr.split(':').map(Number);
    const [endH, endM] = endStr.split(':').map(Number);
    
    // Pętla co 30 minut
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

// --- ENDPOINTY: AUTH & USERS (Z Etapu 1) ---

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
        res.json({ token, role: user.role, username: user.username, id: user.id });
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

app.get('/api/doctors', async (req, res) => {
    const doctors = await User.findAll({ where: { role: 'doctor' }, attributes: ['id', 'name', 'specialization'] });
    res.json(doctors);
});


// 1. Dodawanie dostępności (Tylko Lekarz)
// Body: { date: "2025-02-01", startTime: "08:00", endTime: "12:00" }
// (Wersja uproszczona: dodaje sloty na jeden dzień. Pętla "cykliczna" powinna być zrobiona na froncie lub w pętli tutaj)
app.post('/api/availability', authenticateToken, authorizeRole(['doctor']), async (req, res) => {
    try {
        const { date, startTime, endTime } = req.body;
        const doctorId = req.user.id;

        // 1. Wygeneruj godziny (np. 08:00, 08:30, 09:00...)
        const times = generateTimeSlots(startTime, endTime);
        const createdSlots = [];

        // 2. Dla każdej godziny stwórz wpis w bazie
        for (const time of times) {
            // Sprawdź czy taki slot już nie istnieje, żeby nie dublować
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

        io.emit('schedule_update'); // POWIADOMIENIE: Termin zwolniony!
        res.json({ message: `Dodano ${createdSlots.length} slotów na dzień ${date}`, slots: createdSlots });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- GENEROWANIE CYKLICZNE ---
app.post('/api/availability/cyclical', authenticateToken, authorizeRole(['doctor']), async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { startDate, endDate, weekDays, timeRanges } = req.body;
        const doctorId = req.user.id;
        const slotDuration = 30; // minuty

        const start = new Date(startDate);
        const end = new Date(endDate);
        const generatedSlots = [];

        // Pętla po dniach z zakresu
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const currentDayOfWeek = d.getDay(); // 0=Nd, 1=Pn...
            const dateStr = d.toISOString().split('T')[0];

            // WALIDACJA ABSENCJI: Czy w tym dniu jest nieobecność?
            const absence = await Absence.findOne({ where: { doctorId, date: dateStr }, transaction });
            if (absence) {
                console.log(`Pominięto ${dateStr} z powodu nieobecności.`);
                continue; // Przeskocz ten dzień, nie generuj slotów
            }

            // Sprawdź czy dzień pasuje do maski (weekDays to np. [1, 2, 4])
            if (weekDays.includes(currentDayOfWeek)) {
                

                // Pętla po przedziałach godzinowych (np. rano i wieczorem)
                for (const range of timeRanges) {
                    // Konwersja czasu "08:00" na minuty od północy
                    const [startH, startM] = range.start.split(':').map(Number);
                    const [endH, endM] = range.end.split(':').map(Number);
                    
                    let currentMinutes = startH * 60 + startM;
                    const endMinutes = endH * 60 + endM;

                    // Generowanie slotów co 30 min wewnątrz przedziału
                    while (currentMinutes + slotDuration <= endMinutes) {
                        const h = Math.floor(currentMinutes / 60);
                        const m = currentMinutes % 60;
                        const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

                        // Sprawdź czy taki slot już nie istnieje (żeby nie dublować)
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
        
        io.emit('schedule_update'); // Powiadom wszystkich!
        
        res.json({ 
            message: `Wygenerowano ${generatedSlots.length} slotów.`,
            count: generatedSlots.length 
        });

    } catch (e) {
        await transaction.rollback();
        res.status(500).json({ error: e.message });
    }
});

// Zgłoś nieobecność (Absencja)
app.post('/api/doctor/absence', authenticateToken, authorizeRole(['doctor']), async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { date, reason } = req.body;
        const doctorId = req.user.id;

        // 1. Stwórz wpis o nieobecności
        await Absence.create({ doctorId, date, reason }, { transaction });

        // 2. KONFLIKTY - Znajdź wszystkie sloty w tym dniu
        const slots = await Slot.findAll({
            where: { doctorId, date },
            transaction
        });

        let cancelledCount = 0;

        for (const slot of slots) {
            if (slot.status === 'booked' || slot.status === 'pending') {
                // JEŚLI ZAJĘTY -> Zmień na 'cancelled' (Powiadomienie pacjenta = status w jego panelu)
                slot.status = 'cancelled';
                await slot.save({ transaction });
                cancelledCount++;
            } else {
                // JEŚLI WOLNY -> Usuń go całkowicie, skoro lekarza nie ma
                await slot.destroy({ transaction });
            }
        }

        await transaction.commit();
        io.emit('schedule_update'); // Odśwież widoki u wszystkich

        res.json({ 
            message: `Nieobecność dodana. Odwołano wizyt: ${cancelledCount}.`,
            cancelledCount 
        });

    } catch (e) {
        await transaction.rollback();
        res.status(500).json({ error: e.message });
    }
});

// Pobierz nieobecności lekarza (potrzebne do kolorowania kalendarza)
app.get('/api/doctor/:id/absences', async (req, res) => {
    const absences = await Absence.findAll({ where: { doctorId: req.params.id } });
    res.json(absences);
});

// 2. Pobieranie harmonogramu lekarza (Dla wszystkich - żeby widzieć kiedy wolne)
// Query params: ?doctorId=1
// POPRAWIONY ENDPOINT: Pobieranie harmonogramu z filtrowaniem dat
// URL: /api/doctor/schedule?doctorId=1&from=2026-01-05&to=2026-01-11
app.get('/api/doctor/schedule', async (req, res) => {
    try {
        const { doctorId, from, to } = req.query;

        // Budujemy warunki zapytania (WHERE)
        const whereClause = {};

        // 1. Obowiązkowo po ID lekarza
        if (doctorId) {
            whereClause.doctorId = doctorId;
        } else {
            return res.status(400).json({ message: 'Brak doctorId' });
        }

        // 2. Jeśli podano zakres dat, filtrujemy (WHERE date BETWEEN from AND to)
        if (from && to) {
            whereClause.date = {
                [Op.between]: [from, to] // To jest ta magia Sequelize
            };
        }

        const slots = await Slot.findAll({
            where: whereClause,
            order: [['date', 'ASC'], ['time', 'ASC']]
        });
        
        res.json(slots);
    } catch (e) {
        console.error("Błąd pobierania grafiku:", e);
        res.status(500).json({ error: e.message });
    }
});



// ==========================================
// ETAP 3: LOGIKA PACJENTA (KOSZYK I REZERWACJE)
// ==========================================

// 1. Dodaj do koszyka
// Dodawanie do koszyka z FORMULARZEM i DETEKCJĄ KONFLIKTÓW
app.post('/api/cart/add', authenticateToken, async (req, res) => {
    if (req.user.role !== 'patient') return res.status(403).json({ message: "Brak uprawnień" });

    const transaction = await sequelize.transaction();
    try {
        const { startSlotId, duration = 1, details } = req.body; 
        // duration: 1 (30min), 2 (60min), 3 (90min)...
        // details: { type, age, gender, notes }

        const patientId = req.user.id;

        // 1. Pobierz slot startowy
        const firstSlot = await Slot.findOne({ where: { id: startSlotId }, transaction });
        if (!firstSlot) throw new Error("Slot nie istnieje");

        // 2. Znajdź WSZYSTKIE potrzebne sloty (startowy + kolejne)
        // Logika: Szukamy slotów tego samego lekarza, w ten sam dzień, o kolejnych godzinach
        const allSlotsToBook = [firstSlot];
        
        // Obliczamy kolejne godziny
        let currentH = parseInt(firstSlot.time.split(':')[0]);
        let currentM = parseInt(firstSlot.time.split(':')[1]);

        for (let i = 1; i < duration; i++) {
            // Dodaj 30 min
            currentM += 30;
            if (currentM >= 60) {
                currentH += 1;
                currentM -= 60;
            }
            const nextTimeStr = `${String(currentH).padStart(2,'0')}:${String(currentM).padStart(2,'0')}`;
            
            // Szukaj kolejnego slotu w bazie
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

        // 4. Rezerwacja (Update slotów + Insert do CartItems)
        for (const slot of allSlotsToBook) {
            // Aktualizacja Slota danymi z formularza
            slot.status = 'pending';
            // slot.isBooked = false; // Zgodnie z wymaganiem
            slot.patientId = patientId;
            
            // Zapisujemy szczegóły wizyty
            if (details) {
                slot.visitType = details.visitType;
                slot.patientAge = details.patientAge;
                slot.patientGender = details.patientGender;
                slot.patientNotes = details.notes;
            }
            
            await slot.save({ transaction });

            // Dodanie do koszyka
            await CartItem.create({
                patientId,
                slotId: slot.id
            }, { transaction });
        }

        await transaction.commit();
        io.emit('schedule_update'); // Sockety
        res.json({ message: "Dodano wizytę do koszyka" });

    } catch (error) {
        await transaction.rollback();
        res.status(400).json({ message: error.message });
    }
});

// app.post('/api/cart/add', authenticateToken, async (req, res) => {
//     if (req.user.role !== 'patient')
//         return res.status(403).json({ message: "Tylko pacjent może rezerwować wizyty" });
    
//     const { slotId } = req.body;
//     const patientId = req.user.id;
    
//     try {
//         const slot = await Slot.findOne({
//             where: { id: slotId, status: 'free' }
//         });
        
//         if (!slot)
//             return res.status(400).json({ message: "Termin niedostępny" });
        
//         // Czy slot nie jest już w czyimś koszyku
//         const exists = await CartItem.findOne({ where: { slotId } });
//         if (exists)
//             return res.status(400).json({ message: "Termin jest w koszyku innego pacjenta" });
        
//         const cartItem = await CartItem.create({
//             slotId,
//             patientId
//         });
        
//         io.emit('schedule_update'); // POWIADOMIENIE: Ktoś zajął termin!
//         res.json({ message: "Dodano do koszyka", cartItem });
        
//     } catch (error) {
//         res.status(500).json({ error: error.message });
//     }
// });

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

// 3. Usuń z koszyka (POPRAWIONE dla tabeli CartItems)
// app.delete('/api/cart/:slotId', authenticateToken, async (req, res) => {
//     try {
//         const deleted = await CartItem.destroy({
//             where: {
//                 slotId: req.params.slotId,
//                 patientId: req.user.id
//             }
//         });
        
//         if (!deleted)
//             return res.status(404).json({ message: "Nie znaleziono pozycji w koszyku" });
        
//         io.emit('schedule_update'); // POWIADOMIENIE: Termin zwolniony!
//         res.json({ message: "Usunięto z koszyka" });
        
//     } catch (error) {
//         res.status(500).json({ error: error.message });
//     }
// });

// Usuwanie z koszyka (Przywracanie slotu do wolnych)
app.delete('/api/cart/:slotId', authenticateToken, async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { slotId } = req.params;
        const patientId = req.user.id;

        // 1. Znajdź slot
        const slot = await Slot.findOne({ where: { id: slotId }, transaction });

        if (!slot) {
            await transaction.rollback();
            return res.status(404).json({ message: "Slot nie istnieje" });
        }

        // 2. Znajdź i usuń wpis w koszyku
        const cartItem = await CartItem.findOne({
            where: { slotId, patientId },
            transaction
        });

        if (cartItem) {
            await cartItem.destroy({ transaction });
        }

        // 3. KLUCZOWE: Przywróć slot do stanu początkowego!
        slot.status = 'free';
        slot.patientId = null;
        
        // Czyścimy dane formularza ("śmieci" po niedoszłej rezerwacji)
        slot.visitType = null;
        slot.patientName = null;
        slot.patientAge = null;
        slot.patientGender = null;
        slot.patientNotes = null;

        await slot.save({ transaction });

        await transaction.commit();
        
        // 4. Powiadom wszystkich, że slot jest znowu wolny (zielony)
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
        
        // 1. Pobierz koszyk pacjenta
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
        
        // 2. Zarezerwuj sloty
        for (const item of cartItems) {
            if (item.Slot.status === 'booked') {
                await transaction.rollback();
                return res.status(400).json({
                    message: `Termin ${item.Slot.id} jest już niedostępny`
                });
            }
            
            await item.Slot.update({
                status: 'booked',
                isBooked: true, 
                patientId
            }, { transaction });
        }
        
        // 3. Wyczyść koszyk
        await CartItem.destroy({
            where: { patientId },
            transaction
        });
        
        await transaction.commit();
        
        io.emit('schedule_update');
        res.json({ message: "Rezerwacja potwierdzona 🎉" });
        
    } catch (error) {
        await transaction.rollback();
        res.status(500).json({ error: error.message });
    }
});

// 5. Moje wizyty
// app.get('/api/appointments/my', authenticateToken, async (req, res) => {
//     try {
//         const appointments = await Slot.findAll({
//             where: { 
//                 patientId: req.user.id,
//                 status: 'booked'
//             },
//             // TU TEŻ ZMIANA: as: 'Doctor'
//             include: [{ model: User, as: 'Doctor', attributes: ['name', 'specialization'] }],
//             order: [['date', 'ASC'], ['time', 'ASC']]
//         });
//         res.json(appointments);
//     } catch (error) {
//         res.status(500).json({ error: error.message });
//     }
// });
// Pobierz moje wizyty (Dla Pacjenta - POPRAWIONE)
app.get('/api/appointments/my', authenticateToken, async (req, res) => {
    try {
        const appointments = await Slot.findAll({
            where: {
                patientId: req.user.id,
                // WAŻNE: Pobieramy 'booked' ORAZ 'cancelled'
                status: {
                    [Op.or]: ['booked', 'cancelled'] 
                }
            },
            include: [{ model: User, as: 'Doctor', attributes: ['name', 'specialization'] }],
            order: [['date', 'DESC'], ['time', 'DESC']] // Najnowsze na górze
        });
        res.json(appointments);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// ETAP 5: OCENY I KOMENTARZE
// ==========================================

// 1. Dodaj ocenę
app.post('/api/ratings', authenticateToken, authorizeRole(['patient']), async (req, res) => {
    try {
        const { doctorId, stars, comment } = req.body;
        const patientId = req.user.id;
        
        // WALIDACJA 1: Czy pacjent w ogóle był u tego lekarza?
        // Szukamy wizyty, która jest ZATWIERDZONA (booked)
        const visit = await Slot.findOne({
            where: {
                doctorId: doctorId,
                patientId: patientId,
                status: 'booked'
                // Opcjonalnie: date < dzisiaj (żeby oceniać tylko wizyty, które się odbyły)
            }
        });
        
        if (!visit) {
            return res.status(403).json({ message: "Możesz ocenić tylko lekarza, u którego miałeś wizytę." });
        }
        
        // WALIDACJA 2: Czy już nie oceniono tego lekarza?
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
        await sequelize.sync(); 
        console.log('Baza danych OK.');
        
        // Auto-Admin
        const admin = await User.findOne({ where: { role: 'admin' } });
        if (!admin) {
            const pass = await bcrypt.hash('admin123', 10);
            await User.create({ username: 'admin', password: pass, name: 'Admin', role: 'admin' });
            console.log('Stworzono Admina (admin/admin123)');
        }

        // app.listen(PORT, () => console.log(`Serwer na porcie ${PORT}`));
        server.listen(PORT, () => {
            console.log(`Serwer (z Socket.io) działa na porcie ${PORT}`);
        });
    } catch (e) { console.error(e); }
};


startServer();