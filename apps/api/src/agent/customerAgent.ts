import type { Response } from "openai/resources/responses/responses";
import { customerAgentSystemPrompt } from "./prompts.js";
import { customerAgentTools } from "./toolSchemas.js";
import { runCustomerTool } from "./toolRouter.js";
import { defaultModel, openai } from "../integrations/openai.js";
import { conversationService } from "../services/conversation.service.js";

const MAX_TOOL_ROUNDS = 6;

type CustomerAgentInput = {
  businessId: string;
  conversationId?: string;
  customerMessage: string;
  imageUrl?: string;
};

export async function runCustomerAgent(input: CustomerAgentInput) {
  const conversation = await conversationService.ensureConversation({
    businessId: input.businessId,
    conversationId: input.conversationId
  });

  await conversationService.addMessage({
    businessId: input.businessId,
    conversationId: conversation.id,
    role: "CUSTOMER",
    content: input.customerMessage,
    imageUrl: input.imageUrl
  });

  const userContent = input.imageUrl
    ? `Customer message: ${input.customerMessage}\nCustomer image URL: ${input.imageUrl}`
    : input.customerMessage;

  let response = await openai.responses.create({
    model: defaultModel,
    instructions: customerAgentSystemPrompt,
    input: userContent,
    tools: customerAgentTools
  });

  const executedToolCalls: CustomerToolCall[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const toolCalls = extractToolCalls(response);

    if (toolCalls.length === 0) {
      break;
    }

    executedToolCalls.push(...toolCalls);

    const toolOutputs = await Promise.all(
      toolCalls.map(async (toolCall) => {
        const result = await runCustomerTool(
          { businessId: input.businessId, conversationId: conversation.id },
          toolCall
        );

        await conversationService.addMessage({
          businessId: input.businessId,
          conversationId: conversation.id,
          role: "TOOL",
          content: JSON.stringify(result),
          toolName: toolCall.name,
          toolPayload: result
        });

        return {
          type: "function_call_output" as const,
          call_id: toolCall.callId,
          output: JSON.stringify(result)
        };
      })
    );

    response = await openai.responses.create({
      model: defaultModel,
      instructions: customerAgentSystemPrompt,
      previous_response_id: response.id,
      input: toolOutputs,
      tools: customerAgentTools
    });
  }

  const assistantText = response.output_text || "I need a little more information to help with that.";

  await conversationService.addMessage({
    businessId: input.businessId,
    conversationId: conversation.id,
    role: "ASSISTANT",
    content: assistantText
  });

  return {
    conversationId: conversation.id,
    message: assistantText,
    toolCalls: executedToolCalls.map((toolCall) => ({
      callId: toolCall.callId,
      name: toolCall.name,
      arguments: toolCall.arguments
    }))
  };
}

type CustomerToolCall = {
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
};

function extractToolCalls(response: Response): CustomerToolCall[] {
  const calls: CustomerToolCall[] = [];

  for (const item of response.output) {
    const candidate = item as { type?: string; call_id?: string; name?: string; arguments?: string };
    if (candidate.type === "function_call" && candidate.name) {
      calls.push({
        callId: candidate.call_id ?? "",
        name: candidate.name,
        arguments: safeJson(candidate.arguments)
      });
    }
  }

  return calls;
}

function safeJson(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") {
    return {};
  }
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}
