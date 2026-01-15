const bcrypt = require('bcryptjs');
const { User, Rating, Setting } = require('../models');

exports.createDoctor = async (req, res) => {
    try {
        const { username, password, name, specialization } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({ username, password: hashedPassword, name, role: 'doctor', specialization });
        res.status(201).json({ message: 'Lekarz dodany' });
    } catch (e) { res.status(400).json({ error: e.message }); }
};

exports.getUsers = async (req, res) => {
    try {
        const users = await User.findAll({
            attributes: ['id', 'name', 'username', 'role', 'isBanned']
        });
        res.json(users);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.toggleBan = async (req, res) => {
    try {
        const { isBanned } = req.body;
        const user = await User.findByPk(req.params.id);
        
        if (!user) return res.status(404).json({ error: 'Użytkownik nie istnieje' });
        if (user.role === 'admin') return res.status(400).json({ error: 'Nie można zbanować admina' });

        user.isBanned = isBanned;
        await user.save();

        res.json({ message: `Status zmieniony na: ${isBanned ? 'Zbanowany' : 'Aktywny'}` });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getAllRatings = async (req, res) => {
    try {
        const ratings = await Rating.findAll({
            include: [
                { model: User, as: 'Patient', attributes: ['name', 'username'] },
                { model: User, as: 'Doctor', attributes: ['name', 'specialization'] }
            ],
            order: [['createdAt', 'DESC']]
        });
        res.json(ratings);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.deleteRating = async (req, res) => {
    try {
        const result = await Rating.destroy({ where: { id: req.params.id } });
        if (result === 0) return res.status(404).json({ error: 'Opinia nie istnieje' });
        res.json({ message: 'Opinia usunięta' });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

// NOWE: Zmiana trybu autoryzacji (Zadanie 1)
exports.updateAuthMode = async (req, res) => {
    try {
        const { mode } = req.body; // 'LOCAL', 'SESSION', 'NONE'
        
        if (!['LOCAL', 'SESSION', 'NONE'].includes(mode)) {
            return res.status(400).json({ message: 'Nieprawidłowy tryb' });
        }

        // Znajdź lub stwórz ustawienie
        let setting = await Setting.findOne({ where: { key: 'AUTH_MODE' } });
        if (!setting) {
            setting = await Setting.create({ key: 'AUTH_MODE', value: mode });
        } else {
            setting.value = mode;
            await setting.save();
        }

        // Emitujemy zdarzenie do wszystkich klientów (opcjonalne, ale fajne), żeby przeładowali stronę
        if (req.io) {
            req.io.emit('auth_mode_changed', mode);
        }

        res.json({ message: `Zmieniono tryb autoryzacji na: ${mode}` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};