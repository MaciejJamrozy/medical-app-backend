const bcrypt = require('bcryptjs');
const { User, Slot, Rating } = require('./models');

const seedDatabase = async () => {
    try {
        const doctorsCount = await User.count({ where: { role: 'doctor' } });
        if (doctorsCount > 0) {
            console.log('Pomijam seedowanie.');
            return;
        }

        const password = await bcrypt.hash('123', 10);

        const doctorsData = [
            { name: 'Gregory House', username: 'house', specialization: 'Lekarz Rodzinny', role: 'doctor' },
            { name: 'Janusz Walczak', username: 'janusz', specialization: 'Kardiolog', role: 'doctor' },
            { name: 'Anna Nowak', username: 'anna', specialization: 'Pediatra', role: 'doctor' },
            { name: 'Stanisław Kowalski', username: 'stanislaw', specialization: 'Neurolog', role: 'doctor' },
            { name: 'Sylwia Niedziółka', username: 'sylwia', specialization: 'Ortopeda', role: 'doctor' }
        ];

        const createdDoctors = [];
        for (const doc of doctorsData) {
            const user = await User.create({ ...doc, password });
            createdDoctors.push(user);
        }

        const patientsData = [
            { name: 'Jan Kowalski', username: 'jan', role: 'patient' },
            { name: 'Maks Nowak', username: 'max', role: 'patient' },
            { name: 'Jan Gonciarz', username: 'janek', role: 'patient' },
        ];

        const createdPatients = [];
        for (const pat of patientsData) {
            const user = await User.create({ ...pat, password });
            createdPatients.push(user);
        }

        const ratingsData = [
            { doctorId: createdDoctors[0].id, patientId: createdPatients[0].id, stars: 5, comment: "Geniusz!" },
            { doctorId: createdDoctors[0].id, patientId: createdPatients[1].id, stars: 4, comment: "Skuteczny lekarz." },

            { doctorId: createdDoctors[1].id, patientId: createdPatients[0].id, stars: 5, comment: "Polecam!" },
            { doctorId: createdDoctors[1].id, patientId: createdPatients[1].id, stars: 3, comment: "Długo czekałem w kolejce." },

            { doctorId: createdDoctors[2].id, patientId: createdPatients[1].id, stars: 5, comment: "Świetne podejście do pacjenta." },

            { doctorId: createdDoctors[3].id, patientId: createdPatients[0].id, stars: 5, comment: "Operacja udała się." },
            { doctorId: createdDoctors[3].id, patientId: createdPatients[1].id, stars: 5, comment: "Najlepszy neurolog w mieście." },

            { doctorId: createdDoctors[4].id, patientId: createdPatients[2].id, stars: 5, comment: "Dobra diagnoza." },
            { doctorId: createdDoctors[4].id, patientId: createdPatients[0].id, stars: 5, comment: "Polecam." },
            { doctorId: createdDoctors[4].id, patientId: createdPatients[1].id, stars: 5, comment: "Bardzo miła Pani doktor." }
        ];

        await Rating.bulkCreate(ratingsData);

        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const dates = [
            today.toISOString().split('T')[0],
            tomorrow.toISOString().split('T')[0]
        ];

        const times = [
            '09:00', '09:30', '10:00', '10:30', '11:00', 
            '11:30', '12:00', '12:30', '13:00', '13:30', '14:00'
        ];

        const slotsToCreate = [];

        for (const doctor of createdDoctors) {
            for (const date of dates) {
                for (const time of times) {
                    const isBooked = false;

                    slotsToCreate.push({
                        date: date,
                        time: time,
                        status: isBooked ? 'booked' : 'free',
                        doctorId: doctor.id,
                    });
                }
            }
        }

        await Slot.bulkCreate(slotsToCreate);

        console.log('Dane testowe dodane pomyślnie');

    } catch (error) {
        console.error('Błąd podczas seedowania:', error);
    }
};

module.exports = seedDatabase;