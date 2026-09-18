import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { httpRouter } from "convex/server";
import { components } from "./_generated/api";
import { auth } from "./auth";
import { handle as agentMailWebhook } from "./agentmailWebhook";

const http = httpRouter();
auth.addHttpRoutes(http);
http.route({ path: "/webhooks/agentmail", method: "POST", handler: agentMailWebhook });
registerStaticRoutes(http, components.staticHosting);
export default http;
