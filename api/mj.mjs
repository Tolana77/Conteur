import { handleAiGatewayRequest } from "../server/ai/gateway.mjs";

export function POST(request) {
  return handleAiGatewayRequest(request, { environment: process.env });
}

export function OPTIONS(request) {
  return handleAiGatewayRequest(request, { environment: process.env });
}
