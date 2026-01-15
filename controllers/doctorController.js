const { Slot, Absence, sequelize, User } = require('../models');
const { Op } = require('sequelize');

// Helper lokalny
const generateTimeSlots = (startStr, endStr) => {
    const slots = [];
    let [h, m] = startStr.split(':').map(Number);
    const [endH, endM] = endStr.split(':').map(Number);
    while (h < endH || (h === endH && m < endM)) {
        slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        m += 30;
        if (m >= 60) { h++; m -= 60; }
    }
    return slots;
};

exports.addAvailability = async (req, res) => {
    try {
        const { date, startTime, endTime } = req.body;
        const doctorId = req.user.id;
        const times = generateTimeSlots(startTime, endTime);
        const createdSlots = [];

        for (const time of times) {
            const exists = await Slot.findOne({ where: { doctorId, date, time } });
            if (!exists) {
                const slot = await Slot.create({ date, time, doctorId, status: 'free' });
                createdSlots.push(slot);
            }
        }
        req.io.emit('schedule_update'); // Używamy req.io
        res.json({ message: `Dodano ${createdSlots.length} slotów`, slots: createdSlots });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.addCyclicalAvailability = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { startDate, endDate, weekDays, timeRanges } = req.body;
        const doctorId = req.user.id;
        const start = new Date(startDate);
        const end = new Date(endDate);
        const generatedSlots = [];

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            if (weekDays.includes(d.getDay())) {
                const dateStr = d.toISOString().split('T')[0];
                const absence = await Absence.findOne({ where: { doctorId, date: dateStr }, transaction });
                if (absence) continue;

                for (const range of timeRanges) {
                    const slots = generateTimeSlots(range.start, range.end);
                    for (const timeStr of slots) {
                        const exists = await Slot.findOne({ where: { doctorId, date: dateStr, time: timeStr }, transaction });
                        if (!exists) {
                            await Slot.create({ doctorId, date: dateStr, time: timeStr, status: 'free' }, { transaction });
                            generatedSlots.push(`${dateStr} ${timeStr}`);
                        }
                    }
                }
            }
        }
        await transaction.commit();
        req.io.emit('schedule_update');
        res.json({ message: `Wygenerowano ${generatedSlots.length} slotów.`, count: generatedSlots.length });
    } catch (e) {
        await transaction.rollback();
        res.status(500).json({ error: e.message });
    }
};

exports.addAbsence = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { date, reason } = req.body;
        const doctorId = req.user.id;
        await Absence.create({ doctorId, date, reason }, { transaction });

        const slots = await Slot.findAll({ where: { doctorId, date }, transaction });
        let cancelledCount = 0;
        for (const slot of slots) {
            if (['booked', 'pending'].includes(slot.status)) {
                slot.status = 'cancelled';
                await slot.save({ transaction });
                cancelledCount++;
            } else {
                await slot.destroy({ transaction });
            }
        }
        await transaction.commit();
        req.io.emit('schedule_update');
        res.json({ message: `Nieobecność dodana. Odwołano: ${cancelledCount}`, cancelledCount });
    } catch (e) {
        await transaction.rollback();
        res.status(500).json({ error: e.message });
    }
};

exports.getAbsences = async (req, res) => {
    const absences = await Absence.findAll({ where: { doctorId: req.params.id } });
    res.json(absences);
};

exports.getSchedule = async (req, res) => {
    try {
        const { doctorId, from, to } = req.query;
        if (!doctorId) return res.status(400).json({ message: 'Brak doctorId' });

        const whereClause = { doctorId };
        if (from && to) whereClause.date = { [Op.between]: [from, to] };

        const slots = await Slot.findAll({ where: whereClause, order: [['date', 'ASC'], ['time', 'ASC']] });
        
        const requestingUserRole = req.user.role;
        const requestingUserId = req.user.id;

        const sanitizedSlots = slots.map(slot => {
            const s = slot.toJSON();
            if (requestingUserRole === 'doctor') return s;
            
            const isMySlot = (s.patientId === requestingUserId);
            
            // Jeśli nie moje i anulowane/pending -> pokaż jako zajęte
            if (!isMySlot && ['cancelled', 'pending'].includes(s.status)) s.status = 'booked';
            
            if (!isMySlot) {
                s.patientName = null; s.patientNotes = null; s.patientAge = null;
                s.patientGender = null; s.visitType = null; s.patientId = null;
            }
            return s;
        });

        res.json(sanitizedSlots);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getMyAppointments = async (req, res) => {
    try {
        const appointments = await Slot.findAll({
            where: { doctorId: req.user.id, status: 'booked' },
            include: [{ model: User, as: 'Patient', attributes: ['username'] }],
            order: [['date', 'ASC'], ['time', 'ASC']]
        });
        res.json(appointments);
    } catch (e) { res.status(500).json({ error: e.message }); }
};