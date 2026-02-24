import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { ApprovalService } from "../services/approval-service";
import { isCommandApprovalDecision, isFileApprovalDecision } from "../utils/approval-decision";

const commandApprovalSchema = z.object({
  requestId: z.string().min(1),
  decision: z.unknown(),
});

const fileApprovalSchema = z.object({
  requestId: z.string().min(1),
  decision: z.unknown(),
});

export function registerApprovalRoutes(app: FastifyInstance, approvalService: ApprovalService): void {
  app.post("/v1/approvals/command", async (request, reply) => {
    const body = commandApprovalSchema.parse(request.body ?? {});

    if (!isCommandApprovalDecision(body.decision)) {
      return reply.status(400).send({
        code: "INVALID_REQUEST",
        message: "Invalid command approval decision",
      });
    }

    await approvalService.approveCommand(body.requestId, body.decision);
    return {};
  });

  app.post("/v1/approvals/file-change", async (request, reply) => {
    const body = fileApprovalSchema.parse(request.body ?? {});

    if (!isFileApprovalDecision(body.decision)) {
      return reply.status(400).send({
        code: "INVALID_REQUEST",
        message: "Invalid file-change approval decision",
      });
    }

    await approvalService.approveFileChange(body.requestId, body.decision);
    return {};
  });
}
