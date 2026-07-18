import { handleAiGatewayHealthRequest } from "../server/ai/health.mjs";

export default {
  fetch(request) {
    return handleAiGatewayHealthRequest(request, { environment: process.env });
  },
};
