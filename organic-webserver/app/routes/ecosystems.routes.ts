import { Router } from "express";
import {
    postCreateEcosystem, getEcosystemList, getMyEcosystems, getEcosystemInfo, putEcosystemMeta,
} from "../controllers/ecosystem.controller.js";
import { postEcosystemTx, postDistributeSalary } from "../controllers/ecosystem-tx.controller.js";
import { requireRequestAuth } from "../middleware/auth.middleware.js";
import { exclusively } from "../utils/exclusive-run.util.js";

const router = Router();

router.post("/", requireRequestAuth, postCreateEcosystem);

// Must precede "/:pk" or Express would treat "mine" as a :pk value.
router.get("/mine", getMyEcosystems);

router.get("/", getEcosystemList);

router.get("/:pk", getEcosystemInfo);

router.put("/:pk/meta", requireRequestAuth, putEcosystemMeta);

router.post("/:pk/tx", exclusively(postEcosystemTx));

router.post("/:pk/distribute", requireRequestAuth, exclusively(postDistributeSalary));

export default router;
