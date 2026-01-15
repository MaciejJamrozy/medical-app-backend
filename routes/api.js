const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/auth');

const authCtrl = require('../controllers/authController');
const adminCtrl = require('../controllers/adminController');
const doctorCtrl = require('../controllers/doctorController');
const patientCtrl = require('../controllers/patientController');
const publicCtrl = require('../controllers/publicController');

// --- AUTH ---
router.post('/auth/register', authCtrl.register);
router.post('/auth/login', authCtrl.login);
router.post('/auth/refresh', authCtrl.refreshToken); // NOWE
router.post('/auth/logout', authCtrl.logout);        // NOWE
router.get('/auth/settings', authCtrl.getAuthSettings); // NOWE

// --- PUBLIC ---
router.get('/doctors', publicCtrl.getDoctors);
router.get('/doctors/:id/ratings', publicCtrl.getDoctorRatings);

// --- ADMIN ---
router.post('/admin/doctors', authenticateToken, authorizeRole(['admin']), adminCtrl.createDoctor);
router.get('/admin/users', authenticateToken, authorizeRole(['admin']), adminCtrl.getUsers);
router.put('/admin/users/:id/ban', authenticateToken, authorizeRole(['admin']), adminCtrl.toggleBan);
router.get('/admin/ratings', authenticateToken, authorizeRole(['admin']), adminCtrl.getAllRatings);
router.delete('/admin/ratings/:id', authenticateToken, authorizeRole(['admin']), adminCtrl.deleteRating);
router.post('/admin/settings/auth-mode', authenticateToken, authorizeRole(['admin']), adminCtrl.updateAuthMode); // NOWE

// --- DOCTOR ---
router.post('/availability', authenticateToken, authorizeRole(['doctor']), doctorCtrl.addAvailability);
router.post('/availability/cyclical', authenticateToken, authorizeRole(['doctor']), doctorCtrl.addCyclicalAvailability);
router.post('/doctor/absence', authenticateToken, authorizeRole(['doctor']), doctorCtrl.addAbsence);
router.get('/doctor/my-appointments', authenticateToken, authorizeRole(['doctor']), doctorCtrl.getMyAppointments);
router.get('/doctor/:id/absences', doctorCtrl.getAbsences);
router.get('/doctor/schedule', authenticateToken, doctorCtrl.getSchedule);

// --- PATIENT / CART ---
router.post('/cart/add', authenticateToken, patientCtrl.addToCart);
router.get('/cart', authenticateToken, patientCtrl.getCart);
router.delete('/cart/:slotId', authenticateToken, patientCtrl.removeFromCart);
router.post('/cart/checkout', authenticateToken, patientCtrl.checkout);
router.get('/appointments/my', authenticateToken, patientCtrl.getMyAppointments);
router.post('/appointments/:id/cancel', authenticateToken, patientCtrl.cancelAppointment);
router.post('/ratings', authenticateToken, authorizeRole(['patient']), patientCtrl.addRating);

module.exports = router;