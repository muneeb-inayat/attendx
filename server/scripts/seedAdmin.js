/**
 * Seed Admin User Script
 * Run with: node scripts/seedAdmin.js
 * 
 * This script promotes a user to admin role or creates one if needed.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../models/index.js';

dotenv.config();

const ADMIN_EMAIL = 'admin@admin.in'; // Change this to your email

const seedAdmin = async () => {
    try {
        // Connect to MongoDB
        const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
        if (!mongoUri) {
            console.error('MongoDB URI not found in environment variables');
            process.exit(1);
        }

        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        // Check if user exists
        let user = await User.findOne({ email: ADMIN_EMAIL });

        if (user) {
            // Update existing user to admin
            user.role = 'admin';
            await user.save();
            console.log(`✅ User ${ADMIN_EMAIL} promoted to admin`);
        } else {
            // Create new admin user
            user = await User.create({
                email: ADMIN_EMAIL,
                name: 'System Admin',
                role: 'admin',
                googleId: 'manual-seed-admin'
            });
            console.log(`✅ Admin user created: ${ADMIN_EMAIL}`);
        }

        console.log('Admin Details:', {
            id: user._id,
            email: user.email,
            role: user.role
        });

        await mongoose.disconnect();
        console.log('Done!');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

seedAdmin();
