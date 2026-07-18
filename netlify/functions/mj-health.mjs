import { handleAiGatewayHealthRequest } from "../../server/ai/health.mjs";

export const config = {
  path: "/api/mj-health",
  method: ["GET", "OPTIONS"],
};

export default function handler(request) {
  return handleAiGatewayHealthRequest(request, { environment: process.env });
}
