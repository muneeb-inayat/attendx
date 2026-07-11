/**
 * Script to list all courses in MongoDB
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

async function listCourses() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB\n');

        const Course = mongoose.model('Course', new mongoose.Schema({}, { strict: false }), 'courses');

        const courses = await Course.find({}).select('courseCode courseName branch year batch').lean();

        console.log(`Total courses: ${courses.length}\n`);
        console.log('Branch | Year | Batch | Code | Name');
        console.log('-------|------|-------|------|-----');
        courses.forEach(c => {
            console.log(`${c.branch || '-'} | ${c.year || '-'} | ${c.batch || 'all'} | ${c.courseCode} | ${c.courseName}`);
        });

        // Count by branch
        console.log('\n--- Summary by Branch ---');
        const ucs = courses.filter(c => c.branch === 'ucs').length;
        const ucp = courses.filter(c => c.branch === 'ucp').length;
        console.log(`UCS courses: ${ucs}`);
        console.log(`UCP courses: ${ucp}`);

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

listCourses();
