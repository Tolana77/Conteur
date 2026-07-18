import { handleAiGatewayRequest } from "../server/ai/gateway.mjs";

export default {
  fetch(request) {
    return handleAiGatewayRequest(request, { environment: process.env });
  },
};
