const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

const authCtrl = require('../controllers/authController');
const adminCtrl = require('../controllers/adminController');
const doctorCtrl = require('../controllers/doctorController');
const patientCtrl = require('../controllers/patientController');
const publicCtrl = require('../controllers/publicController');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); // Folder docelowy
    },
    filename: function (req, file, cb) {
        // Unikalna nazwa pliku: timestamp + oryginalna nazwa
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // Limit 5MB
});

// AUTH
router.post('/auth/register', authCtrl.register);
router.post('/auth/login', authCtrl.login);
router.post('/auth/refresh', authCtrl.refreshToken);
router.post('/auth/logout', authCtrl.logout);
router.get('/auth/settings', authCtrl.getAuthSettings);

// PUBLIC
router.get('/doctors', publicCtrl.getDoctors);
router.get('/doctors/:id/ratings', publicCtrl.getDoctorRatings);

// ADMIN
router.post('/admin/doctors', authenticateToken, authorizeRole(['admin']), adminCtrl.createDoctor);
router.get('/admin/users', authenticateToken, authorizeRole(['admin']), adminCtrl.getUsers);
router.put('/admin/users/:id/ban', authenticateToken, authorizeRole(['admin']), adminCtrl.toggleBan);
router.get('/admin/ratings', authenticateToken, authorizeRole(['admin']), adminCtrl.getAllRatings);
router.delete('/admin/ratings/:id', authenticateToken, authorizeRole(['admin']), adminCtrl.deleteRating);
router.post('/admin/settings/auth-mode', authenticateToken, authorizeRole(['admin']), adminCtrl.updateAuthMode);

// DOCTOR
router.post('/availability', authenticateToken, authorizeRole(['doctor']), doctorCtrl.addAvailability);
router.post('/availability/cyclical', authenticateToken, authorizeRole(['doctor']), doctorCtrl.addCyclicalAvailability);
router.post('/doctor/absence', authenticateToken, authorizeRole(['doctor']), doctorCtrl.addAbsence);
router.get('/doctor/my-appointments', authenticateToken, authorizeRole(['doctor']), doctorCtrl.getMyAppointments);
router.get('/doctor/:id/absences', authenticateToken, doctorCtrl.getAbsences);
router.get('/doctor/schedule', authenticateToken, doctorCtrl.getSchedule);

// PATIENT
// router.post('/cart/add', authenticateToken, authorizeRole(['patient']), patientCtrl.addToCart);
router.post('/cart/add', authenticateToken, authorizeRole(['patient']), upload.single('file'), patientCtrl.addToCart);
router.get('/cart', authenticateToken, authorizeRole(['patient']), patientCtrl.getCart);
router.delete('/cart/:slotId', authenticateToken, authorizeRole(['patient']), patientCtrl.removeFromCart);
router.post('/cart/checkout', authenticateToken, authorizeRole(['patient']), patientCtrl.checkout);
router.get('/appointments/my', authenticateToken, authorizeRole(['patient']), patientCtrl.getMyAppointments);
router.post('/appointments/:id/cancel', authenticateToken, authorizeRole(['patient']), patientCtrl.cancelAppointment);
router.post('/ratings', authenticateToken, authorizeRole(['patient']), patientCtrl.addRating);
router.get('/ratings', authenticateToken, patientCtrl.getRatings);

module.exports = router;