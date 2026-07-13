import { User, Course } from "../models/index.js";
import fs from 'fs';
import csv from 'csv-parser';
import bcrypt from 'bcryptjs';
/**
 * GET ALL STUDENTS
 */
export const getStudents = async (req, res) => {
    try {

        const students = await User.find({ role: "student" })
            .sort({ rollNo: 1 })
            .select("-googleId");
        
        res.json({
            success: true,
            data: students,
        });

    } catch (error) {

        console.error("Get Students Error:", error);

        res.status(500).json({
            success: false,
            error: "Failed to fetch students"
        });

    }
};


/**
 * @route POST /api/admin/students/import
 * @desc Bulk import students from CSV
 * @access Private (Admin)
 */
export const bulkImportStudents = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'CSV file is required'
            });
        }

        // Parse CSV
        const students = await new Promise((resolve, reject) => {
            const data = [];

            fs.createReadStream(req.file.path)
                .pipe(csv())
                .on('data', row => {
                    // console.log(row);
                    data.push({
                        name: row.name?.trim(),
                        email: row.email?.trim().toLowerCase(),
                        rollNo: row.rollNo?.trim().toUpperCase(),
                        branch: row.branch?.trim().toLowerCase(),
                        admissionYear: Number(row.admissionYear),
                        semester: Number(row.semester),
                    });
                })
                .on('end', () => resolve(data))
                .on('error', reject);
        });

        const report = {
            total: students.length,
            imported: 0,
            skipped: [],
            failed: []
        };

        const validStudents = [];

        // Duplicate detection inside CSV
        const seenEmails = new Set();
        const seenRollNos = new Set();

        // Existing users lookup
        const emails = students.map(s => s.email);
        const rollNos = students.map(s => s.rollNo);

        const existingUsers = await User.find({
            $or: [
                { email: { $in: emails } },
                { rollNo: { $in: rollNos } }
            ]
        }).select('email rollNo');

        const existingEmails = new Set(existingUsers.map(u => u.email));
        const existingRollNos = new Set(existingUsers.map(u => u.rollNo));

        const currentYear = new Date().getFullYear();

        const allCourses = await Course.find({
            isArchived: false
        }).select("_id branch semester ");

        console.log(allCourses);

        for (let i = 0; i < students.length; i++) {
            const student = students[i];

            // Required fields
            if (
                !student.name ||
                !student.email ||
                !student.rollNo ||
                !student.branch ||
                !student.admissionYear 
            ) {
                report.failed.push({
                    row: i + 2,
                    reason: 'Missing required fields'
                });
                continue;
            }


            // Admission year validation
            if (
                student.admissionYear < 2000 ||
                student.admissionYear > currentYear + 1
            ) {
                report.failed.push({
                    row: i + 2,
                    rollNo: student.rollNo,
                    reason: 'Invalid admission year'
                });
                continue;
            }

            if (student.semester < 1 || student.semester > 8) {
                report.failed.push({
                    row: i + 2,
                    rollNo: student.rollNo,
                    reason: "Invalid semester"
                });
                continue;
            }

            // Duplicate in CSV
            if (seenEmails.has(student.email)) {
                report.failed.push({
                    row: i + 2,
                    email: student.email,
                    reason: 'Duplicate email in CSV'
                });
                continue;
            }

            if (seenRollNos.has(student.rollNo)) {
                report.failed.push({
                    row: i + 2,
                    rollNo: student.rollNo,
                    reason: 'Duplicate roll number in CSV'
                });
                continue;
            }

            seenEmails.add(student.email);
            seenRollNos.add(student.rollNo);

            // Already exists in DB
            if (existingEmails.has(student.email)) {
                report.skipped.push({
                    row: i + 2,
                    email: student.email,
                    reason: 'Email already exists'
                });
                continue;
            }

            if (existingRollNos.has(student.rollNo)) {
                report.skipped.push({
                    row: i + 2,
                    rollNo: student.rollNo,
                    reason: 'Roll number already exists'
                });
                continue;
            }


            console.log("Student:", {
                branch: student.branch,
                semester: student.semester,
            });

            const assignedCourses = allCourses.filter(course =>
                course.branch === student.branch &&
                course.semester === student.semester                
            );

            console.log(
                "Matched Courses:",
                assignedCourses.map(course => course._id)
            );
            const tempPassword = `${student.rollNo}@123`;
            const hashedPassword = await bcrypt.hash(tempPassword, 10);

            validStudents.push({
                ...student,
                semester: student.semester,
                password: hashedPassword,
                mustChangePassword: true,
                role: "student",
                pendingReview: false,
                assignedCourses: assignedCourses.map(course => course._id)
            });

        }

        if (validStudents.length > 0) {
            await User.insertMany(validStudents);
            report.imported = validStudents.length;
        }

        fs.unlink(req.file.path, () => { });

        return res.status(201).json({
            success: true,
            message: "Students imported successfully",
            data: {
                ...report,
                defaultPasswordPolicy: "Roll Number + @123"
            }
        });
    } catch (error) {
        console.error('Bulk Student Import Error:', error);

        if (req.file) {
            fs.unlink(req.file.path, () => { });
        }

        return res.status(500).json({
            success: false,
            error: 'Failed to import students'
        });
    }
};

/**
 * UPDATE STUDENT
 */
export const updateStudent = async (req, res) => {

    try {

        const student = await User.findByIdAndUpdate(

            req.params.id,

            req.body,

            {
                new: true,
                runValidators: true
            }

        );

        if (!student) {

            return res.status(404).json({

                success: false,

                error: "Student not found"

            });

        }

        res.json({

            success: true,

            student

        });

    } catch (error) {

        console.error(error);

        res.status(500).json({

            success: false,

            error: "Update failed"

        });

    }

};


/**
 * DELETE STUDENT
 */
export const deleteStudent = async (req, res) => {

    try {

        const student = await User.findByIdAndDelete(req.params.id);

        if (!student) {

            return res.status(404).json({

                success: false,

                error: "Student not found"

            });

        }

        res.json({

            success: true,

            message: "Student deleted"

        });

    } catch (error) {

        console.error(error);

        res.status(500).json({

            success: false,

            error: "Delete failed"

        });

    }

};