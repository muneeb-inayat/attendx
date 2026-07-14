import { DeviceRegistry, User } from '../models/index.js';

/**
 * Shared device-approval gate used at BOTH login (studentLogin) and
 * attendance-marking (markAttendance). Do not duplicate this logic —
 * update it here and both call sites stay in sync.
 *
 * Expects deviceHash/deviceType/browser/os to already be computed
 * by the caller (hashDeviceFingerprint + parseDeviceInfo).
 */
export const evaluateStudentDevice = async ({
    studentId,
    deviceHash,
    fingerprintComponents = {},
    deviceType,
    browser,
    os,
    ip,
    location,
    currentDeviceSecurity // optional: pass if caller already fetched the user, avoids a duplicate query
}) => {
    // ========================================
    // Cross-account check: this device must not already be the ACTIVE
    // device of a DIFFERENT student. Checked first, so it also blocks
    // a device's very first login/attendance attempt on a second account
    // (checkOrRequestDevice alone can't catch this — it only looks
    // within one student's own device history).
    // ========================================
    const otherActiveOwners = await DeviceRegistry.find({
        deviceHash,
        status: 'active',
        student: { $ne: studentId }
    }).select('student');

    if (otherActiveOwners.length > 0) {
        return {
            ok: false,
            status: 409,
            code: 'DEVICE_LINKED_TO_ANOTHER_ACCOUNT',
            error: 'This device is already registered to another student account. Each device can only be used for one account.'
        };
    }

    let deviceSecurity = currentDeviceSecurity;
    if (deviceSecurity === undefined) {
        const student = await User.findById(studentId).select('deviceSecurity');
        if (!student) {
            return { ok: false, status: 404, code: 'STUDENT_NOT_FOUND', error: 'Student not found' };
        }
        deviceSecurity = student.deviceSecurity;
    }

    if (deviceSecurity?.blocked) {
        return {
            ok: false,
            status: 403,
            code: 'DEVICE_CHANGES_BLOCKED',
            error: 'Device changes are blocked. Please contact an administrator.'
        };
    }

    const deviceResult = await DeviceRegistry.checkOrRequestDevice(studentId, {
        deviceHash,
        fingerprintComponents,
        deviceType,
        browser,
        os,
        ip,
        location
    });

    if (!deviceResult.allowed) {
        let nowBlocked = false;

        if (deviceResult.isNewRequest) {
            const updatedStudent = await User.findByIdAndUpdate(
                studentId,
                { $inc: { 'deviceSecurity.changeAttempts': 1 } },
                { new: true }
            ).select('deviceSecurity');

            // Three distinct unapproved device changes block all further access.
            if (updatedStudent.deviceSecurity.changeAttempts >= 3) {
                nowBlocked = true;
                await User.findByIdAndUpdate(studentId, {
                    $set: {
                        'deviceSecurity.blocked': true,
                        'deviceSecurity.blockedAt': new Date(),
                        'deviceSecurity.blockedReason': 'Too many unapproved device changes'
                    }
                });
            }
        }

        return {
            ok: false,
            status: 403,
            code: nowBlocked ? 'DEVICE_CHANGES_BLOCKED' : 'DEVICE_CHANGE_PENDING',
            error: nowBlocked
                ? 'Too many device changes. Access is blocked until an administrator reviews your account.'
                : 'This device is awaiting administrator approval. Use your approved device or contact an administrator.'
        };
    }

    return { ok: true, device: deviceResult.device };
};