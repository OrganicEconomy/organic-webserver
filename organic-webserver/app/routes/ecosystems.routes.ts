import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import {
    postCreateEcosystem, getEcosystemList, getMyEcosystems, getEcosystemInfo, putEcosystemMeta,
} from "../controllers/ecosystem.controller.js";
import { postEcosystemTx, postDistributeSalary } from "../controllers/ecosystem-tx.controller.js";
import { requireTimestampAuth } from "../middleware/auth.middleware.js";

const router = Router();

/**
 * EcosystemCreateBody names its authenticated field `founderPk` (clearer at
 * the call site than a generic `publickey` would be — this endpoint is the
 * one place a request body has two different keys in play, the founder's
 * and the not-yet-existing ecosystem's). requireTimestampAuth, shared with
 * every other route, only ever looks for `publickey` — bridge the two here
 * rather than teaching the shared middleware about one endpoint's field name.
 */
function mapFounderPkToPublickey(req: Request, _res: Response, next: NextFunction): void {
    if (req.body && req.body.founderPk && req.body.publickey === undefined) {
        req.body.publickey = req.body.founderPk
    }
    next()
}

router.post("/", mapFounderPkToPublickey, requireTimestampAuth, postCreateEcosystem);

// Must precede "/:pk" or Express would treat "mine" as a :pk value.
router.get("/mine", getMyEcosystems);

router.get("/", getEcosystemList);

router.get("/:pk", getEcosystemInfo);

router.put("/:pk/meta", requireTimestampAuth, putEcosystemMeta);

router.post("/:pk/tx", postEcosystemTx);

router.post("/:pk/distribute", requireTimestampAuth, postDistributeSalary);

export default router;
