const { User, Rating } = require('../models');

exports.getDoctors = async (req, res) => {
    const doctors = await User.findAll({ where: { role: 'doctor' }, attributes: ['id', 'name', 'specialization'] });
    res.json(doctors);
};

exports.getDoctors = async (req, res) => {
    try {
        const doctors = await User.findAll({
            where: { role: 'doctor' },
            attributes: ['id', 'name', 'specialization'],
            include: [{
                model: Rating,
                as: 'receivedRatings',
                attributes: ['stars']
            }]
        });

        const doctorsWithStats = doctors.map(doc => {
            const ratings = doc.receivedRatings || [];
            const count = ratings.length;
            
            const sum = ratings.reduce((acc, curr) => acc + curr.stars, 0);
            
            const average = count > 0 ? (sum / count).toFixed(1) : 0;

            return {
                id: doc.id,
                name: doc.name,
                specialization: doc.specialization,
                averageRating: parseFloat(average),
                ratingCount: count
            };
        });

        res.json(doctorsWithStats);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
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