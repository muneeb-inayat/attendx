/**
 * Returns the current academic year.
 *
 * Examples:
 * - July 2026  -> "2026-2027"
 * - February 2027 -> "2026-2027"
 */
export const getCurrentAcademicYear = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    return month >= 6
        ? `${year}-${year + 1}`
        : `${year - 1}-${year}`;
};

/**
 * Returns the year of study from the semester.
 *
 * Semester:
 * 1-2 -> Year 1
 * 3-4 -> Year 2
 * 5-6 -> Year 3
 * 7-8 -> Year 4
 */
export const getYearFromSemester = (semester) => {
    if (!semester || semester < 1 || semester > 8) {
        return null;
    }

    return Math.ceil(semester / 2);
};