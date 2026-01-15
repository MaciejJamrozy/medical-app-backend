const bcrypt = require('bcryptjs');
const { User, Rating } = require('../models');

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