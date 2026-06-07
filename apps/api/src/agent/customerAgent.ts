import { customerAgentSystemPrompt } from "./prompts.js";
import { customerAgentTools } from "./toolSchemas.js";
import { runCustomerTool } from "./toolRouter.js";
import { defaultModel, openai } from "../integrations/openai.js";
import { conversationService } from "../services/conversation.service.js";

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

  const response = await openai.responses.create({
    model: defaultModel,
    instructions: customerAgentSystemPrompt,
    input: userContent,
    tools: customerAgentTools
  });

  // This file marks the orchestration boundary. In production, loop through
  // function calls until the model returns a final answer.
  const toolCalls = extractToolCalls(response);
  for (const toolCall of toolCalls) {
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
    toolCalls
  };
}

function extractToolCalls(response: unknown): Array<{ name: string; arguments: Record<string, unknown> }> {
  const output = (response as { output?: unknown[] }).output ?? [];
  const calls: Array<{ name: string; arguments: Record<string, unknown> }> = [];

  for (const item of output) {
    const candidate = item as { type?: string; name?: string; arguments?: string };
    if (candidate.type === "function_call" && candidate.name) {
      calls.push({
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

