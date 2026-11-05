import { Router } from "express";
import {
    listValidations, getValidation, getValidationStatus, getMyValidation, approveValidation, rejectValidation,
} from "../controllers/validation.controller.js";
import { requireRequestAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", requireRequestAuth, listValidations);

// Must precede "/:pk" or Express would treat "status" and "mine" as :pk values.
router.get("/status/:pk", getValidationStatus);

router.get("/mine", requireRequestAuth, getMyValidation);

router.get("/:pk", requireRequestAuth, getValidation);

router.post("/:pk/approve", requireRequestAuth, approveValidation);

router.post("/:pk/reject", requireRequestAuth, rejectValidation);

export default router;
