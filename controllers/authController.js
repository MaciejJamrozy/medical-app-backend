const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Setting } = require('../models');
const { ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET } = require('../middleware/auth');

exports.register = async (req, res) => {
    try {
        const { username, password, name } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({ username, password: hashedPassword, name, role: 'patient' });
        res.status(201).json({ message: 'Zarejestrowano' });
    } catch (e) { res.status(400).json({ error: e.message }); }
};

// Logowanie generuje TERAZ dwa tokeny
exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ where: { username } });
        
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: 'Błąd logowania' });
        }

        if (user.isBanned) {
            return res.status(403).json({ message: 'Konto zbanowane' });
        }

        // Generujemy Access Token (krótki czas życia, np. 15 minut)
        const accessToken = jwt.sign(
            { id: user.id, role: user.role }, 
            ACCESS_TOKEN_SECRET, 
            { expiresIn: '2m' } 
        );

        // Generujemy Refresh Token (długi czas życia, np. 7 dni)
        const refreshToken = jwt.sign(
            { id: user.id, role: user.role }, 
            REFRESH_TOKEN_SECRET, 
            { expiresIn: '7d' }
        );

        // Zapisujemy Refresh Token w bazie (żeby móc go unieważnić przy wylogowaniu)
        user.refreshToken = refreshToken;
        await user.save();

        // Pobieramy aktualne ustawienie trybu autoryzacji
        const authSetting = await Setting.findOne({ where: { key: 'AUTH_MODE' } });
        const authMode = authSetting ? authSetting.value : 'LOCAL';

        res.json({ 
            accessToken, 
            refreshToken, 
            role: user.role, 
            username: user.username, 
            id: user.id,
            authMode // Wysyłamy info do frontendu, jak ma zapisać token
        });

    } catch (e) { res.status(500).json({ error: e.message }); }
};

// NOWE: Odświeżanie tokena (Zadanie 2)
exports.refreshToken = async (req, res) => {
    const { token } = req.body; // Client wysyła refresh token
    if (!token) return res.sendStatus(401);

    try {
        // Sprawdź czy token jest w bazie
        const user = await User.findOne({ where: { refreshToken: token } });
        if (!user) return res.sendStatus(403); // Token nie istnieje w bazie (np. po wylogowaniu)

        // Weryfikacja kryptograficzna
        jwt.verify(token, REFRESH_TOKEN_SECRET, (err, decoded) => {
            if (err) return res.sendStatus(403);

            // Generuj nowy Access Token
            const newAccessToken = jwt.sign(
                { id: user.id, role: user.role }, 
                ACCESS_TOKEN_SECRET, 
                { expiresIn: '2m' }
            );

            res.json({ accessToken: newAccessToken });
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// NOWE: Wylogowanie (usuwa refresh token z bazy)
exports.logout = async (req, res) => {
    const { token } = req.body;
    if (!token) return res.sendStatus(204);

    try {
        const user = await User.findOne({ where: { refreshToken: token } });
        if (user) {
            user.refreshToken = null;
            await user.save();
        }
        res.sendStatus(204);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// NOWE: Pobieranie aktualnego trybu auth (dla frontendu przy starcie)
exports.getAuthSettings = async (req, res) => {
    try {
        const setting = await Setting.findOne({ where: { key: 'AUTH_MODE' } });
        res.json({ mode: setting ? setting.value : 'LOCAL' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};