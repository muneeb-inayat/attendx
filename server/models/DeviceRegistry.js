import mongoose from 'mongoose';

/**
 * Device Registry Model
 * Tracks student devices for soft binding
 * Allows 2-3 devices per student
 */

const deviceRegistrySchema = new mongoose.Schema({
    // Owner
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    // Device identification
    deviceHash: {
        type: String,
        required: true,
        index: true
    },

    // Original fingerprint components (hashed for privacy)
    fingerprintComponents: {
        userAgent: String,
        screenResolution: String,
        platform: String,
        language: String,
        timezone: String,
        colorDepth: String,
        hardwareConcurrency: String,
        deviceMemory: String,
        webglVendor: String,
        webglRenderer: String
    },

    // Device metadata
    deviceType: {
        type: String,
        enum: ['mobile', 'tablet', 'desktop', 'unknown'],
        default: 'unknown'
    },
    browser: String,
    os: String,

    // Status
    status: {
        type: String,
        enum: ['active', 'blocked', 'revoked'],
        default: 'active'
    },
    blockedReason: String,

    // Trust level
    trustScore: {
        type: Number,
        default: 100,  // 0-100, decreases with suspicious activity
        min: 0,
        max: 100
    },

    // Usage statistics
    usageCount: {
        type: Number,
        default: 0
    },
    lastUsed: Date,
    lastLocation: {
        latitude: Number,
        longitude: Number
    },

    // First seen information
    firstSeenIp: String,
    firstSeenLocation: {
        latitude: Number,
        longitude: Number
    },

    // Security flags
    securityFlags: [{
        flag: String,
        timestamp: Date,
        details: String
    }],

    // Registration
    registeredAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Compound unique index - one device per student
deviceRegistrySchema.index({ student: 1, deviceHash: 1 }, { unique: true });

/**
 * Static: Get student's devices
 */
deviceRegistrySchema.statics.getStudentDevices = async function (studentId) {
    return await this.find({ student: studentId, status: 'active' })
        .sort({ lastUsed: -1 });
};

/**
 * Static: Check if device is registered and active
 */
deviceRegistrySchema.statics.isDeviceRegistered = async function (studentId, deviceHash) {
    const device = await this.findOne({
        student: studentId,
        deviceHash,
        status: 'active'
    });
    return !!device;
};

/**
 * Static: Register or update device
 */
deviceRegistrySchema.statics.registerDevice = async function (studentId, deviceData) {
    const { deviceHash, fingerprintComponents, deviceType, browser, os, ip, location } = deviceData;

    // Check existing devices
    const existingDevices = await this.find({ student: studentId, status: 'active' });
    const existingDevice = existingDevices.find(d => d.deviceHash === deviceHash);

    if (existingDevice) {
        // Update existing device
        existingDevice.usageCount += 1;
        existingDevice.lastUsed = new Date();
        if (location) {
            existingDevice.lastLocation = location;
        }
        await existingDevice.save();
        return {
            success: true,
            device: existingDevice,
            isNew: false,
            deviceCount: existingDevices.length
        };
    }

    // Check device limit (max 3)
    if (existingDevices.length >= 3) {
        return {
            success: false,
            reason: 'DEVICE_LIMIT_REACHED',
            deviceCount: existingDevices.length,
            message: 'Maximum 3 devices allowed per student'
        };
    }

    // Register new device
    const newDevice = await this.create({
        student: studentId,
        deviceHash,
        fingerprintComponents,
        deviceType: deviceType || 'unknown',
        browser,
        os,
        firstSeenIp: ip,
        firstSeenLocation: location,
        lastUsed: new Date(),
        usageCount: 1
    });

    return {
        success: true,
        device: newDevice,
        isNew: true,
        deviceCount: existingDevices.length + 1
    };
};

/**
 * Static: Block a device
 */
deviceRegistrySchema.statics.blockDevice = async function (studentId, deviceHash, reason) {
    const device = await this.findOneAndUpdate(
        { student: studentId, deviceHash },
        {
            status: 'blocked',
            blockedReason: reason,
            $push: {
                securityFlags: {
                    flag: 'BLOCKED',
                    timestamp: new Date(),
                    details: reason
                }
            }
        },
        { new: true }
    );
    return device;
};

/**
 * Static: Decrease trust score
 */
deviceRegistrySchema.statics.decreaseTrust = async function (studentId, deviceHash, amount = 10, reason = '') {
    const device = await this.findOne({ student: studentId, deviceHash });
    if (!device) return null;

    device.trustScore = Math.max(0, device.trustScore - amount);
    device.securityFlags.push({
        flag: 'TRUST_DECREASED',
        timestamp: new Date(),
        details: `Decreased by ${amount}: ${reason}`
    });

    // Auto-block if trust too low
    if (device.trustScore <= 20) {
        device.status = 'blocked';
        device.blockedReason = 'Trust score too low';
    }

    await device.save();
    return device;
};

/**
 * Static: Get devices with low trust
 */
deviceRegistrySchema.statics.getSuspiciousDevices = async function (threshold = 50) {
    return await this.find({ trustScore: { $lt: threshold } })
        .populate('student', 'name email rollNo')
        .sort({ trustScore: 1 });
};

/**
 * Static: Check if device is shared (used by multiple students)
 */
deviceRegistrySchema.statics.isSharedDevice = async function (deviceHash) {
    const count = await this.countDocuments({ deviceHash });
    return count > 1;
};

/**
 * Static: Get all students using a device
 */
deviceRegistrySchema.statics.getDeviceUsers = async function (deviceHash) {
    return await this.find({ deviceHash })
        .populate('student', 'name email rollNo')
        .select('student status trustScore usageCount lastUsed');
};

export default mongoose.model('DeviceRegistry', deviceRegistrySchema);
