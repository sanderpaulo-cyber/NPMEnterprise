import { Router, type IRouter } from "express";
import { authGateway } from "../middleware/auth-gateway";
import healthRouter from "./health";
import authRouter from "./auth";
import nodesRouter from "./nodes";
import metricsRouter from "./metrics";
import topologyRouter from "./topology";
import flowsRouter from "./flows";
import alertsRouter from "./alerts";
import pollerRouter from "./poller";
import discoveryRouter from "./discovery";
import settingsRouter from "./settings";
import usersAdminRouter from "./users-admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use(authGateway);
router.use("/users", usersAdminRouter);
router.use("/nodes", nodesRouter);
router.use("/metrics", metricsRouter);
router.use("/topology", topologyRouter);
router.use("/flows", flowsRouter);
router.use("/alerts", alertsRouter);
router.use("/poller", pollerRouter);
router.use("/discovery", discoveryRouter);
router.use("/settings", settingsRouter);

export default router;
