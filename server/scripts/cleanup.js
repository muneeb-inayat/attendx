/**
 * Cleanup Script - Remove all non-admin users
 * Run with: node scripts/cleanup.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const cleanup = async () => {
    try {
        const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        // Delete all non-admin users
        const result = await mongoose.connection.db.collection('users').deleteMany({
            role: { $ne: 'admin' }
        });

        console.log(`✅ Deleted ${result.deletedCount} non-admin users`);

        // Also clear courses and sessions for fresh start
        const coursesResult = await mongoose.connection.db.collection('courses').deleteMany({});
        console.log(`✅ Deleted ${coursesResult.deletedCount} courses`);

        const sessionsResult = await mongoose.connection.db.collection('sessions').deleteMany({});
        console.log(`✅ Deleted ${sessionsResult.deletedCount} sessions`);

        const attendanceResult = await mongoose.connection.db.collection('attendances').deleteMany({});
        console.log(`✅ Deleted ${attendanceResult.deletedCount} attendance records`);

        await mongoose.disconnect();
        console.log('Done!');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

cleanup();
