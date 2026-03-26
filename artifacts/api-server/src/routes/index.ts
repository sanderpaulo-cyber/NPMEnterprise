import { Router, type IRouter } from "express";
import healthRouter from "./health";
import nodesRouter from "./nodes";
import metricsRouter from "./metrics";
import topologyRouter from "./topology";
import flowsRouter from "./flows";
import alertsRouter from "./alerts";
import pollerRouter from "./poller";
import discoveryRouter from "./discovery";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/nodes", nodesRouter);
router.use("/metrics", metricsRouter);
router.use("/topology", topologyRouter);
router.use("/flows", flowsRouter);
router.use("/alerts", alertsRouter);
router.use("/poller", pollerRouter);
router.use("/discovery", discoveryRouter);

export default router;
