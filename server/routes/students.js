import express from "express";
import {
    getStudents,
    bulkImportStudents,
    updateStudent,
    deleteStudent
} from "../controllers/studentController.js";

import { protect, authorize } from "../middleware/auth.js";
import {uploadStudents} from "../middleware/upload.js"

    const router = express.Router();

/**
 * GET ALL STUDENTS
 * Admin only
 */
router.get(
    "/",
    protect,
    authorize("admin"),
    getStudents
);

/**
 * BULK IMPORT STUDENTS
 * Admin only
 */
router.post(
    "/upload",
    protect,
    authorize("admin"),
    uploadStudents.single("file"),
    bulkImportStudents
);


/**
 * UPDATE STUDENT
 * Admin only
 */
router.put(
    "/:id",
    protect,
    authorize("admin"),
    updateStudent
);

/**
 * DELETE STUDENT
 * Admin only
 */
router.delete(
    "/:id",
    protect,
    authorize("admin"),
    deleteStudent
);

export default router;