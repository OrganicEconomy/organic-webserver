import { Router } from "express";
import {
    listValidations, getValidation, getValidationStatus, approveValidation, rejectValidation,
} from "../controllers/validation.controller.js";
import { requireBlockAuth, requireTimestampAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", requireTimestampAuth, listValidations);

// Must precede "/:pk" or Express would treat "status" as a :pk value.
router.get("/status/:pk", getValidationStatus);

router.get("/:pk", requireTimestampAuth, getValidation);

router.post("/:pk/approve", requireBlockAuth, approveValidation);

router.post("/:pk/reject", requireTimestampAuth, rejectValidation);

export default router;
