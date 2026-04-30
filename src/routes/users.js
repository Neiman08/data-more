const express = require('express');
const router = express.Router();
const User = require('../../public/models/User'); // Ajusta la ruta según tu estructura
const bcrypt = require('bcrypt');

// Ruta para registrar usuario
router.post('/register', async (req, res) => {
    try {
        const { nombre, email, password } = req.body;

        // Verificar si el usuario ya existe
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ ok: false, message: 'El correo ya está registrado' });
        }

        // Encriptar la contraseña
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Crear nuevo usuario
        const newUser = new User({
            nombre,
            email,
            password: hashedPassword
        });

        await newUser.save();
        res.status(201).json({ ok: true, message: 'Usuario creado con éxito' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: 'Error en el servidor' });
    }
});

module.exports = router;
