/**
 * Security Maintenance Script
 * Runs periodic security-related cleanup tasks
 * 
 * Run with: node scripts/securityMaintenance.js
 * Or schedule with cron: 0 * * * * node /path/to/securityMaintenance.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const runMaintenance = async () => {
    try {
        const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
        await mongoose.connect(mongoUri);
        console.log('🔗 Connected to MongoDB');

        // Import models
        const Session = (await import('../models/Session.js')).default;
        const AuditLog = (await import('../models/AuditLog.js')).default;
        const DeviceRegistry = (await import('../models/DeviceRegistry.js')).default;

        console.log('\n📋 Running Security Maintenance Tasks...\n');

        // ========================================
        // TASK 1: End expired sessions
        // ========================================
        console.log('1️⃣ Ending expired sessions...');
        const expiredCount = await Session.endExpiredSessions();
        console.log(`   ✅ Ended ${expiredCount} expired sessions`);

        // ========================================
        // TASK 2: Get suspicious devices report
        // ========================================
        console.log('\n2️⃣ Checking suspicious devices...');
        const suspiciousDevices = await DeviceRegistry.getSuspiciousDevices(50);
        console.log(`   ⚠️ Found ${suspiciousDevices.length} devices with low trust scores`);

        if (suspiciousDevices.length > 0) {
            console.log('   Suspicious devices:');
            suspiciousDevices.slice(0, 5).forEach(device => {
                console.log(`     - ${device.student?.email || 'Unknown'}: Trust ${device.trustScore}/100`);
            });
            if (suspiciousDevices.length > 5) {
                console.log(`     ... and ${suspiciousDevices.length - 5} more`);
            }
        }

        // ========================================
        // TASK 3: Audit log statistics
        // ========================================
        console.log('\n3️⃣ Audit log statistics (last 24 hours)...');
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const auditStats = await AuditLog.aggregate([
            { $match: { timestamp: { $gte: yesterday } } },
            { $group: { _id: '$eventType', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        console.log('   Event counts:');
        auditStats.forEach(stat => {
            console.log(`     - ${stat._id}: ${stat.count}`);
        });

        // ========================================
        // TASK 4: Get suspicious attendance count
        // ========================================
        console.log('\n4️⃣ Checking suspicious activities...');
        const suspiciousActivities = await AuditLog.getSuspiciousActivities({
            startDate: yesterday,
            limit: 10
        });
        console.log(`   ⚠️ Found ${suspiciousActivities.length} suspicious activities in last 24h`);

        // ========================================
        // TASK 5: Clean up old indices (if needed)
        // ========================================
        console.log('\n5️⃣ Checking indexes...');
        try {
            const auditIndexes = await mongoose.connection.db.collection('audit_logs').indexes();
            console.log(`   📊 AuditLog collection has ${auditIndexes.length} indexes`);
        } catch (err) {
            console.log('   ℹ️ AuditLog collection not yet created');
        }

        // ========================================
        // SUMMARY
        // ========================================
        console.log('\n' + '='.repeat(50));
        console.log('📊 MAINTENANCE SUMMARY');
        console.log('='.repeat(50));
        console.log(`   Sessions ended: ${expiredCount}`);
        console.log(`   Suspicious devices: ${suspiciousDevices.length}`);
        console.log(`   Suspicious activities (24h): ${suspiciousActivities.length}`);
        console.log(`   Total audit events (24h): ${auditStats.reduce((sum, s) => sum + s.count, 0)}`);
        console.log('='.repeat(50));

        await mongoose.disconnect();
        console.log('\n✅ Maintenance complete!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Maintenance Error:', error);
        process.exit(1);
    }
};

runMaintenance();
