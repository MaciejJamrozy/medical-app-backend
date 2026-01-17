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

exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ where: { username } });
        
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: 'Błąd logowania' });
        }

        user.tokenVersion += 1;
        await user.save();

        const accessToken = jwt.sign(
            { id: user.id, role: user.role, version: user.tokenVersion }, 
            ACCESS_TOKEN_SECRET, 
            { expiresIn: '10m' } 
        );

        const refreshToken = jwt.sign(
            { id: user.id, role: user.role }, 
            REFRESH_TOKEN_SECRET, 
            { expiresIn: '7d' }
        );

        user.refreshToken = refreshToken;
        await user.save();

        // Pobieramy aktualne ustawienie trybu autoryzacji
        const authSetting = await Setting.findOne({ where: { key: 'AUTH_MODE' } });
        const authMode = authSetting ? authSetting.value : 'LOCAL';

        res.json({ 
            accessToken, 
            refreshToken, 
            role: user.role, 
            id: user.id,
            name: user.name,
            username: user.username,
            isBanned: user.isBanned,
            authMode // Wysyłamy info do frontendu, jak ma zapisać token
        });

    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.refreshToken = async (req, res) => {
    const { token } = req.body; // Client wysyła refresh token
    if (!token) return res.sendStatus(401);

    try {
        // 1. Szukamy użytkownika, który posiada ten konkretny Refresh Token
        // To zabezpiecza przed użyciem starych tokenów (Single Session)
        const user = await User.findOne({ where: { refreshToken: token } });
        
        if (!user) return res.sendStatus(403); // Token nie istnieje w bazie (np. został nadpisany przez logowanie na innym urządzeniu)

        // 2. Weryfikacja kryptograficzna (czy token nie wygasł i jest poprawny)
        jwt.verify(token, REFRESH_TOKEN_SECRET, (err, decoded) => {
            if (err) return res.sendStatus(403);

            // 3. Generuj nowy Access Token
            // WAŻNE: Musimy w nim zawrzeć AKTUALNĄ wersję sesji z bazy (user.tokenVersion)
            const newAccessToken = jwt.sign(
                { 
                    id: user.id, 
                    role: user.role, 
                    version: user.tokenVersion // <--- KLUCZOWY ELEMENT
                }, 
                ACCESS_TOKEN_SECRET, 
                { expiresIn: '10m' } // Ustaw taki czas, jaki preferujesz (np. '15m')
            );

            res.json({ accessToken: newAccessToken });
        });
    } catch (e) {
        console.error(e);
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