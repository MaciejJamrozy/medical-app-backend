const bcrypt = require('bcryptjs');
const { User, Slot, Rating } = require('./models'); // <--- 1. DODANO Rating

const seedDatabase = async () => {
    try {
        // 1. Sprawdź, czy mamy już lekarzy w bazie.
        const doctorsCount = await User.count({ where: { role: 'doctor' } });
        if (doctorsCount > 0) {
            console.log('Dane testowe już istnieją. Pomijam seedowanie.');
            return;
        }

        console.log('🌱 Rozpoczynam dodawanie danych testowych...');

        const password = await bcrypt.hash('123', 10);

        // 2. TWORZENIE LEKARZY
        const doctorsData = [
            { name: 'Grzegorz House', username: 'house', specialization: 'Diagnostyk', role: 'doctor' },   // Index 0
            { name: 'Janusz Kardiolog', username: 'janusz', specialization: 'Kardiolog', role: 'doctor' }, // Index 1
            { name: 'Anna Pediatra', username: 'anna', specialization: 'Pediatra', role: 'doctor' },       // Index 2
            { name: 'Stephen Strange', username: 'strange', specialization: 'Chirurg', role: 'doctor' }    // Index 3
        ];

        const createdDoctors = [];
        for (const doc of doctorsData) {
            const user = await User.create({ ...doc, password });
            createdDoctors.push(user);
        }

        // 3. TWORZENIE PACJENTÓW
        const patientsData = [
            { name: 'Jan Kowalski', username: 'jan', role: 'patient' }, // Index 0
            { name: 'Max Nowak', username: 'max', role: 'patient' }     // Index 1
        ];

        // <--- 2. ZMIANA: Zapisujemy pacjentów do tablicy, żeby mieć ich ID
        const createdPatients = [];
        for (const pat of patientsData) {
            const user = await User.create({ ...pat, password });
            createdPatients.push(user);
        }

        // 4. GENEROWANIE OPINII (NOWE)
        // Tworzymy opinie, łącząc ID lekarzy i pacjentów z tablic powyżej
        const ratingsData = [
            // Opinie dla Dr. House (Index 0)
            { doctorId: createdDoctors[0].id, patientId: createdPatients[0].id, stars: 5, comment: "Geniusz! Wyleczył mnie w minutę, chociaż był niemiły." },
            { doctorId: createdDoctors[0].id, patientId: createdPatients[1].id, stars: 4, comment: "Skuteczny, ale sarkastyczny." },

            // Opinie dla Dr. Kardiolog (Index 1)
            { doctorId: createdDoctors[1].id, patientId: createdPatients[0].id, stars: 5, comment: "Serce jak dzwon po wizycie. Polecam!" },
            { doctorId: createdDoctors[1].id, patientId: createdPatients[1].id, stars: 3, comment: "Długo czekałem w kolejce." },

            // Opinie dla Dr. Pediatra (Index 2)
            { doctorId: createdDoctors[2].id, patientId: createdPatients[1].id, stars: 5, comment: "Świetne podejście do dzieci. Synek przestał płakać." },

            // Opinie dla Dr. Strange (Index 3)
            { doctorId: createdDoctors[3].id, patientId: createdPatients[0].id, stars: 5, comment: "Ma magiczne ręce. Operacja udała się idealnie." },
            { doctorId: createdDoctors[3].id, patientId: createdPatients[1].id, stars: 5, comment: "Najlepszy chirurg w multiwersum." }
        ];

        await Rating.bulkCreate(ratingsData); // <--- Zapisujemy opinie masowo

        // 5. GENEROWANIE SLOTÓW (GRAFIKU)
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
                    const isBooked = Math.random() < 0.1; 

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

        console.log('✅ Dane testowe (lekarze, pacjenci, sloty, opinie) dodane pomyślnie!');

    } catch (error) {
        console.error('Błąd podczas seedowania:', error);
    }
};

module.exports = seedDatabase;