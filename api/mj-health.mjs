import { handleAiGatewayHealthRequest } from "../server/ai/health.mjs";

export function GET(request) {
  return handleAiGatewayHealthRequest(request, { environment: process.env });
}

export function OPTIONS(request) {
  return handleAiGatewayHealthRequest(request, { environment: process.env });
}
