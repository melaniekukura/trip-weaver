import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { handle as agentMailWebhook } from "./agentmailWebhook";

const http = httpRouter();
auth.addHttpRoutes(http);
http.route({ path: "/webhooks/agentmail", method: "POST", handler: agentMailWebhook });
export default http;
