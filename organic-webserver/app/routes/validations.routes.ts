import { Router } from "express";
import {
    listValidations, getValidation, getValidationStatus, getMyValidation, approveValidation, rejectValidation,
} from "../controllers/validation.controller.js";
import { requireBlockAuth, requireTimestampAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", requireTimestampAuth, listValidations);

// Must precede "/:pk" or Express would treat "status" and "mine" as :pk values.
router.get("/status/:pk", getValidationStatus);

router.get("/mine", requireTimestampAuth, getMyValidation);

router.get("/:pk", requireTimestampAuth, getValidation);

router.post("/:pk/approve", requireBlockAuth, approveValidation);

router.post("/:pk/reject", requireTimestampAuth, rejectValidation);

export default router;
