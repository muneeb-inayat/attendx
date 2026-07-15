import { Session, Attendance, AuditLog } from '../models/index.js';
import { redisService } from '../config/redis.js';

/**
 * Closes out any session still marked active whose endTime has passed —
 * mirrors what stopSession does for a manual stop (Redis cache invalidated,
 * final stats captured, audit log written), just triggered by a timer
 * instead of a professor click.
 *
 * Safe to call repeatedly/concurrently: each session is only closed once,
 * since the update only matches documents still isActive:true, and a
 * concurrent manual stopSession() call for the same session will simply
 * lose the race harmlessly (findOneAndUpdate returns null, we skip it).
 */
export const closeExpiredSessions = async () => {
    const expiredSessions = await Session.find({
        isActive: true,
        endTime: { $lt: new Date() }
    }).select('_id course endTime');

    if (expiredSessions.length === 0) return { closedCount: 0 };

    let closedCount = 0;

    for (const session of expiredSessions) {
        try {
            const updated = await Session.findOneAndUpdate(
                { _id: session._id, isActive: true },
                { isActive: false },
                { new: true }
            );
            if (!updated) continue; // already closed elsewhere (e.g. manual stop) — skip

            await redisService.invalidateSession(updated._id.toString());

            const stats = await Attendance.getSessionStats(updated._id);

            // NOTE: add 'SESSION_AUTO_ENDED' to AuditLog's eventType enum
            // if that schema restricts allowed values (same caveat as the
            // ATTENDANCE_OVERRIDDEN note in overrideAttendance).
            await AuditLog.log({
                eventType: 'SESSION_AUTO_ENDED',
                sessionId: updated._id,
                courseId: updated.course,
                metadata: {
                    reason: 'Session duration elapsed',
                    endTime: updated.endTime,
                    attendanceCount: stats.total,
                    stats
                }
            });

            closedCount++;
        } catch (err) {
            console.error(`Failed to auto-close session ${session._id}:`, err.message);
        }
    }

    if (closedCount > 0) {
        console.log(`⏱  Auto-closed ${closedCount} expired session(s)`);
    }

    return { closedCount };
};