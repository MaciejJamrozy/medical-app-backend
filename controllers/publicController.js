const { User, Rating } = require('../models');

exports.getDoctors = async (req, res) => {
    const doctors = await User.findAll({ where: { role: 'doctor' }, attributes: ['id', 'name', 'specialization'] });
    res.json(doctors);
};

exports.getDoctorRatings = async (req, res) => {
    try {
        const ratings = await Rating.findAll({
            where: { doctorId: req.params.id },
            include: [{ model: User, as: 'Patient', attributes: ['username'] }]
        });
        res.json(ratings);
    } catch (e) { res.status(500).json({ error: e.message }); }
};