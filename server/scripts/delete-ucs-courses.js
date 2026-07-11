/**
 * Script to delete all UCS courses (any year)
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

async function deleteUCSCourses() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        const Course = mongoose.model('Course', new mongoose.Schema({}, { strict: false }), 'courses');

        // Find UCS courses to delete
        const toDelete = await Course.find({ branch: 'ucs' });
        console.log(`\nFound ${toDelete.length} UCS courses to delete:`);
        toDelete.forEach(c => console.log(`  - ${c.courseCode}: ${c.courseName} (Year ${c.year})`));

        if (toDelete.length === 0) {
            console.log('No courses to delete.');
            process.exit(0);
        }

        // Delete
        console.log('\nDeleting all UCS courses...');
        const result = await Course.deleteMany({ branch: 'ucs' });
        console.log(`✅ Deleted ${result.deletedCount} UCS courses.`);

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

deleteUCSCourses();
