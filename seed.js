const bcrypt = require('bcryptjs');
const { User, Slot } = require('./models'); // Importujemy modele

const seedDatabase = async () => {
    try {
        // 1. Sprawdź, czy mamy już lekarzy w bazie. Jeśli tak, przerywamy (żeby nie dublować).
        const doctorsCount = await User.count({ where: { role: 'doctor' } });
        if (doctorsCount > 0) {
            console.log('Pomijam seedowanie.');
            return;
        }

        // Wspólne hasło dla wszystkich: "12345"
        const password = await bcrypt.hash('123', 10);

        // 2. TWORZENIE LEKARZY
        const doctorsData = [
            { name: 'Grzegorz House', username: 'house', specialization: 'Diagnostyk', role: 'doctor' },
            { name: 'Janusz Kardiolog', username: 'janusz', specialization: 'Kardiolog', role: 'doctor' },
            { name: 'Anna Pediatra', username: 'anna', specialization: 'Pediatra', role: 'doctor' },
            { name: 'Stephen Strange', username: 'strange', specialization: 'Chirurg', role: 'doctor' }
        ];

        // Zapisujemy lekarzy i zachowujemy ich instancje (żeby mieć ich ID do slotów)
        const createdDoctors = [];
        for (const doc of doctorsData) {
            const user = await User.create({ ...doc, password });
            createdDoctors.push(user);
        }

        // 3. TWORZENIE PACJENTÓW
        const patientsData = [
            { name: 'Jan Kowalski', username: 'jan', role: 'patient' },
            { name: 'Max Nowak', username: 'max', role: 'patient' }
        ];

        for (const pat of patientsData) {
            await User.create({ ...pat, password });
        }

        // 4. GENEROWANIE SLOTÓW (GRAFIKU)
        // Generujemy sloty na DZIŚ i JUTRO w godzinach 09:00 - 14:00
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const dates = [
            today.toISOString().split('T')[0],    // Format YYYY-MM-DD
            tomorrow.toISOString().split('T')[0]
        ];

        // Godziny przyjęć: 09:00, 09:30 ... do 14:00
        const times = [
            '09:00', '09:30', '10:00', '10:30', '11:00', 
            '11:30', '12:00', '12:30', '13:00', '13:30', '14:00'
        ];

        const slotsToCreate = [];

        // Dla każdego lekarza...
        for (const doctor of createdDoctors) {
            // Dla każdego dnia (dziś, jutro)...
            for (const date of dates) {
                // Dla każdej godziny...
                for (const time of times) {
                    // Co trzeci slot zróbmy losowo zajęty (booked), żeby było ciekawiej
                    // Ale większość niech będzie 'free'
                    const isBooked = Math.random() < 0.1; // 10% szans na zajęty termin (symulacja)

                    slotsToCreate.push({
                        date: date,
                        time: time,
                        status: isBooked ? 'booked' : 'free',
                        doctorId: doctor.id,
                        // Jeśli booked, to teoretycznie powinniśmy przypisać pacjenta, 
                        // ale dla uproszczenia zostawmy sam status 'booked' (będzie widoczny jako czerwony)
                    });
                }
            }
        }

        await Slot.bulkCreate(slotsToCreate);

    } catch (error) {
        console.error('Błąd podczas seedowania:', error);
    }
};

module.exports = seedDatabase;