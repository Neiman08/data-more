const express = require('express');
const router = express.Router();
const User = require('../../public/models/User');
const bcrypt = require('bcrypt');

router.post('/register', async (req, res) => {
    try {
        const { nombre, email, telefono, password } = req.body;

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ ok: false, message: 'Email is already registered' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            nombre,
            email,
            telefono,
            password: hashedPassword
        });

        await newUser.save();

        res.status(201).json({ ok: true, message: 'User created successfully' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: 'Server error' });
    }
});

module.exports = router;