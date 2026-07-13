import { Course, Session, ClaimRequest, User } from '../models/index.js';

// ============================================
// PROFESSOR: GET COURSES
// ============================================

/**
 * @route   GET /api/courses
 * @desc    Get all courses claimed by this professor
 * @access  Private (Professor)
 */
export const getCourses = async (req, res) => {
    try {
        const { archived } = req.query;

        const query = { claimedBy: req.user._id };
        if (archived !== 'true') {
            query.isArchived = false;
        }

        const courses = await Course.find(query)
            .populate('claimedBy', 'name email')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: courses.length,
            data: courses
        });
    } catch (error) {
        console.error('Get Courses Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get courses'
        });
    }
};

/**
 * @route   GET /api/courses/claimable
 * @desc    Get courses available for claiming (not already claimed by this professor)
 * @access  Private (Professor)
 */
export const getClaimableCourses = async (req, res) => {
    try {
        const { branch, year, batch } = req.query;

        const query = {
            isArchived: false,
            claimedBy: { $ne: req.user._id } // Not already claimed by this professor
        };

        if (branch) query.branch = branch.toLowerCase();
        if (year) query.year = parseInt(year);
        if (batch) query.batch = batch;

        const courses = await Course.find(query)
            .populate('claimedBy', 'name email')
            .populate('createdBy', 'name')
            .sort({ branch: 1, year: 1, courseCode: 1 });

        res.json({
            success: true,
            count: courses.length,
            data: courses
        });
    } catch (error) {
        console.error('Get Claimable Courses Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get claimable courses'
        });
    }
};


/**
 * @route   GET /api/courses/branches
 * @desc    Get available branches
 * @access  Private (Professor/Admin)
 */
export const getAvailableBranches = async (req, res) => {
    try {
        const branches = await Course.distinct('branch');

        res.json({
            success: true,
            data: branches
                .filter(Boolean)
                .sort()
                .map(branch => ({
                    code: branch,
                    name: branch.toUpperCase()
                }))
        });
    } catch (error) {
        console.error('Get Branches Error:', error);

        res.status(500).json({
            success: false,
            error: 'Failed to get branches'
        });
    }
};
/**
 * @route   GET /api/courses/:id
 * @desc    Get course details (only if professor has claimed it)
 * @access  Private (Professor)
 */
export const getCourse = async (req, res) => {
    try {
        const course = await Course.findOne({
            _id: req.params.id,
            claimedBy: req.user._id
        }).populate('claimedBy', 'name email');

        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found or not claimed by you'
            });
        }

        // Get recent sessions
        const sessions = await Session.find({ course: course._id })
            .sort({ createdAt: -1 })
            .limit(10);

        res.json({
            success: true,
            data: {
                ...course.toObject(),
                sessions
            }
        });
    } catch (error) {
        console.error('Get Course Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get course'
        });
    }
};

// ============================================
// PROFESSOR: CLAIM/UNCLAIM COURSES
// ============================================

/**
 * @route   POST /api/courses/:id/claim
 * @desc    Request to claim a course (requires admin approval)
 * @access  Private (Professor)
 */
export const claimCourse = async (req, res) => {
    try {
        const { id } = req.params;
        const { message } = req.body;

        const course = await Course.findById(id);
        if (!course) {
            return res.status(404).json({ success: false, error: 'Course not found' });
        }

        // Check if already claimed by this professor
        if (course.claimedBy.includes(req.user._id)) {
            return res.status(400).json({
                success: false,
                error: 'You have already claimed this course'
            });
        }

        // Check for existing pending claim request
        const existingRequest = await ClaimRequest.findOne({
            professor: req.user._id,
            course: id,
            type: 'claim',
            status: 'pending'
        });

        if (existingRequest) {
            return res.status(400).json({
                success: false,
                error: 'You already have a pending claim request for this course'
            });
        }

        // Create claim request
        const claimRequest = await ClaimRequest.create({
            professor: req.user._id,
            course: id,
            type: 'claim',
            message: message || ''
        });

        res.status(201).json({
            success: true,
            message: 'Claim request submitted. Waiting for admin approval.',
            data: claimRequest
        });
    } catch (error) {
        console.error('Claim Course Error:', error);
        res.status(500).json({ success: false, error: 'Failed to submit claim request' });
    }
};

/**
 * @route   POST /api/courses/:id/unclaim
 * @desc    Request to unclaim a course (requires admin approval)
 * @access  Private (Professor)
 */
export const unclaimCourse = async (req, res) => {
    try {
        const { id } = req.params;
        const { message } = req.body;

        const course = await Course.findById(id);
        if (!course) {
            return res.status(404).json({ success: false, error: 'Course not found' });
        }

        // Check if claimed by this professor
        if (!course.claimedBy.includes(req.user._id)) {
            return res.status(400).json({
                success: false,
                error: 'You have not claimed this course'
            });
        }

        // Check for existing pending unclaim request
        const existingRequest = await ClaimRequest.findOne({
            professor: req.user._id,
            course: id,
            type: 'unclaim',
            status: 'pending'
        });

        if (existingRequest) {
            return res.status(400).json({
                success: false,
                error: 'You already have a pending unclaim request for this course'
            });
        }

        // Create unclaim request
        const unclaimRequest = await ClaimRequest.create({
            professor: req.user._id,
            course: id,
            type: 'unclaim',
            message: message || ''
        });

        res.status(201).json({
            success: true,
            message: 'Unclaim request submitted. Waiting for admin approval.',
            data: unclaimRequest
        });
    } catch (error) {
        console.error('Unclaim Course Error:', error);
        res.status(500).json({ success: false, error: 'Failed to submit unclaim request' });
    }
};

/**
 * @route   GET /api/courses/my-requests
 * @desc    Get all claim/unclaim requests by this professor
 * @access  Private (Professor)
 */
export const getMyClaimRequests = async (req, res) => {
    try {
        const requests = await ClaimRequest.find({ professor: req.user._id })
            .populate('course', 'courseCode courseName branch year')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: requests.length,
            data: requests
        });
    } catch (error) {
        console.error('Get Claim Requests Error:', error);
        res.status(500).json({ success: false, error: 'Failed to get requests' });
    }
};

// ============================================
// PROFESSOR: UPDATE COURSE (Limited)
// ============================================

/**
 * @route   PUT /api/courses/:id
 * @desc    Update course settings (professor can only update schedule/location)
 * @access  Private (Professor - must have claimed the course)
 */
export const updateCourse = async (req, res) => {
    try {
        // Professors can only update certain fields
        const allowedFields = [
            'schedule', 'defaultLocation', 'defaultDuration', 'lateThreshold'
        ];

        const updates = {};
        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        });

        const course = await Course.findOneAndUpdate(
            { _id: req.params.id, claimedBy: req.user._id },
            updates,
            { new: true, runValidators: true }
        );

        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found or not claimed by you'
            });
        }

        res.json({
            success: true,
            message: 'Course updated successfully',
            data: course
        });
    } catch (error) {
        console.error('Update Course Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update course'
        });
    }
};

// ============================================
// STUDENT: GET COURSES
// ============================================

/**
 * @route   GET /api/courses/my-courses
 * @desc    Get courses for the student (auto-enrolled + electives)
 * @access  Private (Student)
 */
export const getStudentCourses = async (req, res) => {
    try {

        const student = await User.findById(req.user._id)
            .populate({
                path: "assignedCourses",
                match: {
                    isArchived: false
                },
                populate: {
                    path: "claimedBy",
                    select: "name email"
                }
            })
            .populate({
                path: "electiveCourses",
                match: {
                    isArchived: false
                },
                populate: {
                    path: "claimedBy",
                    select: "name email"
                }
            });

        res.json({
            success: true,
            data: {
                autoEnrolled: student.assignedCourses || [],
                electives: student.electiveCourses || [],
                total:
                    (student.assignedCourses?.length || 0) +
                    (student.electiveCourses?.length || 0)
            }
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            error: "Failed to fetch courses"
        });

    }
};


export default {
    getCourses,
    getClaimableCourses,
    getAvailableBranches,
    getCourse,
    claimCourse,
    unclaimCourse,
    getMyClaimRequests,
    updateCourse,
    getStudentCourses
};
