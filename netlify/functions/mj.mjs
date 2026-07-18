import { handleAiGatewayRequest } from "../../server/ai/gateway.mjs";

export { getPayloadError } from "../../server/ai/gateway.mjs";

export const config = {
  path: "/api/mj",
  method: ["POST", "OPTIONS"],
};

export default function handler(request) {
  return handleAiGatewayRequest(request, { environment: process.env });
}
