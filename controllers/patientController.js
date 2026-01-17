const { Slot, CartItem, User, Rating, Absence, Doctor, sequelize } = require('../models');
const { Op } = require('sequelize');
const fs = require('fs');
const path = require('path');

// Funkcja pomocnicza do usuwania pliku
const deleteAttachment = (attachmentPath) => {
    if (!attachmentPath) return;
    
    const fullPath = path.join(__dirname, '..', attachmentPath);

    fs.unlink(fullPath, (err) => {
        if (err && err.code !== 'ENOENT') {
            console.error("Błąd usuwania pliku:", err);
        }
    });
};

exports.addToCart = async (req, res) => {
    if (req.user.role !== 'patient') return res.status(403).json({ message: "Brak uprawnień" });
    
    // --- 1. OBSŁUGA PLIKU ---
    // Jeśli Multer zapisał plik, jego dane są w req.file
    const attachmentPath = req.file ? `/uploads/${req.file.filename}` : null;

    const transaction = await sequelize.transaction();
    try {
        let { startSlotId, duration = 1, details } = req.body;

        if (typeof details === 'string') {
            try {
                details = JSON.parse(details);
            } catch (e) {
                // Fallback jeśli to nie JSON (mało prawdopodobne przy naszym frontendzie)
                details = {}; 
            }
        }

        const patientId = req.user.id;

        const firstSlot = await Slot.findOne({ where: { id: startSlotId }, transaction });
        if (!firstSlot) throw new Error("Slot nie istnieje");

        const allSlotsToBook = [firstSlot];
        let [currentH, currentM] = firstSlot.time.split(':').map(Number);

        for (let i = 1; i < duration; i++) {
            currentM += 30;
            if (currentM >= 60) { currentH += 1; currentM -= 60; }
            const nextTimeStr = `${String(currentH).padStart(2,'0')}:${String(currentM).padStart(2,'0')}`;
            const nextSlot = await Slot.findOne({
                where: { doctorId: firstSlot.doctorId, date: firstSlot.date, time: nextTimeStr },
                transaction
            });
            if (!nextSlot) throw new Error(`Brak ciągłości terminu (${nextTimeStr})`);
            allSlotsToBook.push(nextSlot);
        }

        for (const slot of allSlotsToBook) {
            if (slot.status !== 'free') throw new Error(`Termin ${slot.time} jest zajęty.`);
        }

        for (const slot of allSlotsToBook) {
            slot.status = 'pending';
            slot.patientId = patientId;
            if (details) {
                Object.assign(slot, {
                    visitType: details.visitType,
                    patientName: details.patientName,
                    patientAge: details.patientAge,
                    patientGender: details.patientGender,
                    patientNotes: details.notes,
                    attachmentPath: attachmentPath
                });
            }
            await slot.save({ transaction });
            await CartItem.create({ patientId, slotId: slot.id }, { transaction });
        }

        await transaction.commit();
        req.io.emit('schedule_update');
        res.json({ message: "Dodano do koszyka" });
    } catch (error) {
        await transaction.rollback();
        res.status(400).json({ message: error.message });
    }
};

exports.getCart = async (req, res) => {
    try {
        const cartItems = await CartItem.findAll({
            where: { patientId: req.user.id },
            include: [{ model: Slot, include: [{ model: User, as: 'Doctor', attributes: ['name', 'specialization'] }] }]
        });
        res.json(cartItems);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.removeFromCart = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { slotId } = req.params;
        const patientId = req.user.id;
        const slot = await Slot.findByPk(slotId, { transaction });

        if (!slot) { 
            await transaction.rollback(); 
            return res.status(404).json({ message: "Slot nie istnieje" }); 
        }

        await CartItem.destroy({ where: { slotId, patientId }, transaction });

        // --- USUWANIE PLIKU ---
        if (slot.attachmentPath) {
            deleteAttachment(slot.attachmentPath);
        }
        // ----------------------

        slot.status = 'free';
        slot.patientId = null;
        
        // Czyścimy też attachmentPath
        Object.assign(slot, { 
            visitType: null, 
            patientName: null, 
            patientAge: null, 
            patientGender: null, 
            patientNotes: null,
            attachmentPath: null // <--- WAŻNE
        });
        
        await slot.save({ transaction });

        await transaction.commit();
        req.io.emit('schedule_update');
        res.json({ message: "Usunięto z koszyka" });
    } catch (e) {
        await transaction.rollback();
        res.status(500).json({ error: e.message });
    }
};

exports.checkout = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const patientId = req.user.id;
        const cartItems = await CartItem.findAll({
            where: { patientId }, include: [Slot], transaction, lock: transaction.LOCK.UPDATE
        });

        if (cartItems.length === 0) { await transaction.rollback(); return res.status(400).json({ message: "Pusty koszyk" }); }

        for (const item of cartItems) {
            const slot = item.Slot;
            if (!slot || slot.status === 'booked') { await transaction.rollback(); return res.status(400).json({ message: "Termin niedostępny" }); }
            if (slot.status === 'cancelled') { await transaction.rollback(); return res.status(400).json({ message: "Termin odwołany" }); }
            
            const absence = await Absence.findOne({ where: { doctorId: slot.doctorId, date: slot.date }, transaction });
            if (absence) { await transaction.rollback(); return res.status(400).json({ message: "Lekarz ma nieobecność" }); }

            await slot.update({ status: 'booked', patientId }, { transaction });
        }

        await CartItem.destroy({ where: { patientId }, transaction });
        await transaction.commit();
        req.io.emit('schedule_update');
        res.json({ message: "Rezerwacja potwierdzona" });
    } catch (e) {
        await transaction.rollback();
        res.status(500).json({ error: e.message });
    }
};

exports.getMyAppointments = async (req, res) => {
    try {
        const appointments = await Slot.findAll({
            where: { patientId: req.user.id, status: { [Op.or]: ['booked', 'cancelled'] } },
            include: [{ model: User, as: 'Doctor', attributes: ['name', 'specialization'] }],
            order: [['date', 'DESC'], ['time', 'DESC']]
        });
        res.json(appointments);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.cancelAppointment = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const slot = await Slot.findOne({ where: { id: req.params.id, patientId: req.user.id, status: 'booked' }, transaction });
        if (!slot) { 
            await transaction.rollback(); 
            return res.status(404).json({ message: "Błąd anulowania" }); 
        }

        const slotDate = new Date(`${slot.date}T${slot.time}`);
        if (slotDate < new Date()) { 
            await transaction.rollback(); 
            return res.status(400).json({ message: "Wizyta już się odbyła" }); 
        }

        // --- USUWANIE PLIKU ---
        if (slot.attachmentPath) {
            deleteAttachment(slot.attachmentPath);
        }
        // ----------------------

        slot.status = 'free';
        slot.patientId = null;
        
        // Czyścimy attachmentPath
        Object.assign(slot, { 
            visitType: null, 
            patientName: null, 
            patientAge: null, 
            patientGender: null, 
            patientNotes: null,
            attachmentPath: null // <--- WAŻNE
        });
        
        await slot.save({ transaction });

        await transaction.commit();
        req.io.emit('schedule_update');
        res.json({ message: "Anulowano wizytę" });
    } catch (e) {
        await transaction.rollback();
        res.status(500).json({ error: e.message });
    }
};

exports.addRating = async (req, res) => {
    try {
        const { doctorId, stars, comment } = req.body;
        const patientId = req.user.id;

        // --- 1. SPRAWDZENIE BANA (NOWE) ---
        // Pobieramy aktualny stan pacjenta z bazy
        const patient = await User.findByPk(patientId);
        
        // Jeśli pacjent jest zbanowany, przerywamy i zwracamy błąd
        if (patient.isBanned) {
            return res.status(403).json({ 
                message: "Twoje konto zostało zbanowane. Nie możesz dodawać opinii." 
            });
        }
        // ----------------------------------

        // --- 2. RESZTA TWOJEJ LOGIKI (BEZ ZMIAN) ---
        
        // Sprawdzamy czy była wizyta (wymóg: oceniać mogą tylko pacjenci lekarza)
        const visit = await Slot.findOne({ where: { doctorId, patientId, status: 'booked' } });
        if (!visit) return res.status(403).json({ message: "Brak wizyty u tego lekarza" });

        // Sprawdzamy czy już nie ocenił (wymóg: brak wielokrotnego głosowania)
        const exists = await Rating.findOne({ where: { doctorId, patientId } });
        if (exists) return res.status(400).json({ message: "Już oceniono tego lekarza" });

        // Dodajemy opinię
        await Rating.create({ patientId, doctorId, stars, comment });
        res.status(201).json({ message: "Ocena dodana" });

    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    }
};

exports.getRatings = async (req, res) => {
    try {
        const patientId = req.user.id; // ID z tokena

        // Pobieramy oceny TYLKO tego pacjenta
        const ratings = await Rating.findAll({
            where: { patientId },
            include: [{ model: User, as: 'Doctor', attributes: ['name', 'specialization'] }] // Opcjonalnie: info o lekarzu
        });

        res.json(ratings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};