const { User, Rating } = require('../models');

exports.getDoctors = async (req, res) => {
    const doctors = await User.findAll({ where: { role: 'doctor' }, attributes: ['id', 'name', 'specialization'] });
    res.json(doctors);
};

exports.getDoctors = async (req, res) => {
    try {
        // Pobieramy lekarzy wraz z ich ocenami
        const doctors = await User.findAll({
            where: { role: 'doctor' },
            attributes: ['id', 'name', 'specialization'], // Pobieramy tylko potrzebne dane
            include: [{
                model: Rating,
                as: 'receivedRatings', // Zgodnie z relacją w models/index.js
                attributes: ['stars']
            }]
        });

        // Przetwarzamy każdego lekarza, aby obliczyć średnią
        const doctorsWithStats = doctors.map(doc => {
            const ratings = doc.receivedRatings || [];
            const count = ratings.length;
            
            // Sumujemy gwiazdki
            const sum = ratings.reduce((acc, curr) => acc + curr.stars, 0);
            
            // Obliczamy średnią (jeśli są oceny), zaokrąglamy do 1 miejsca po przecinku
            const average = count > 0 ? (sum / count).toFixed(1) : 0;

            // Zwracamy czysty obiekt JSON z nowymi polami
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