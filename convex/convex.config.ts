import { defineApp } from "convex/server";
import workpool from "@convex-dev/workpool/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";

const app = defineApp();
app.use(workpool, { name: "researchPool" });
app.use(rateLimiter);
export default app;
