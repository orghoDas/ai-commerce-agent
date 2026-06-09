import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ImagePlus, RotateCcw, Send } from "lucide-react";
import "./styles.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID ?? "cmq4w4tnf0000rt4rfr38t93b";
const CUSTOMER_ID_STORAGE_KEY = `aiCommerceCustomerId:${BUSINESS_ID}`;

type ChatMessage = {
  id?: string;
  role: "customer" | "assistant" | "system";
  content: string;
};

type ChatResponse = {
  conversationId: string;
  mode?: string;
  message?: string;
  state?: string;
};

type UploadImageResponse = {
  url: string;
  width: number;
  height: number;
};

type ConversationMessagesResponse = {
  id: string;
  status: string;
  handoffToHuman: boolean;
  messages: Array<{
    id: string;
    role: "CUSTOMER" | "ASSISTANT" | "ADMIN";
    content: string;
    imageUrl: string | null;
    createdAt: string;
  }>;
};

const quickPrompts = ["Do you have black Sony headphones?", "I want one", "confirm"];

function CustomerWidget() {
  const [customerExternalId] = useState(getOrCreateCustomerExternalId);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hi! What product are you looking for today?" }
  ]);
  const [message, setMessage] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageName, setImageName] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentState, setAgentState] = useState<string>("idle");
  const messagesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    let stopped = false;

    async function syncMessages() {
      try {
        const response = await fetch(`${API_BASE_URL}/v1/chat/${conversationId}/messages?businessId=${BUSINESS_ID}`, {
          cache: "no-store"
        });
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as ConversationMessagesResponse;
        if (stopped) {
          return;
        }

        setAgentState(data.handoffToHuman ? "human" : data.status.toLowerCase());
        setMessages(data.messages.map(toWidgetMessage));
      } catch {
        // Polling stays quiet; sendMessage handles user-visible errors.
      }
    }

    void syncMessages();
    const intervalId = window.setInterval(() => void syncMessages(), 3000);
    return () => {
      stopped = true;
      window.clearInterval(intervalId);
    };
  }, [conversationId]);

  async function sendMessage(nextMessage = message) {
    const trimmed = nextMessage.trim();
    const attachedImage = imageUrl.trim();

    if (!trimmed && !attachedImage) {
      return;
    }

    setIsSending(true);
    setError(null);
    setMessages((current) => [
      ...current,
      { role: "customer", content: trimmed || "Sent a product image." }
    ]);
    setMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/v1/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessId: BUSINESS_ID,
          conversationId,
          message: trimmed || "Can you identify this product?",
          imageUrl: attachedImage || undefined,
          customer: {
            externalId: customerExternalId
          }
        })
      });

      const data = (await response.json()) as ChatResponse | { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? `Request failed: ${response.status}`);
      }

      const chatData = data as ChatResponse;
      setConversationId(chatData.conversationId);
      setAgentState(chatData.state ?? "unknown");
      setImageUrl("");
      setImageName("");
      setMessages((current) => [
        ...current,
        { role: "assistant", content: chatData.message ?? "I need a little more information." }
      ]);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not reach the chat API.";
      setError(message);
      setMessages((current) => [...current, { role: "system", content: message }]);
    } finally {
      setIsSending(false);
    }
  }

  function resetConversation() {
    setConversationId(undefined);
    setMessage("");
    setImageUrl("");
    setImageName("");
    setError(null);
    setAgentState("idle");
    setMessages([{ role: "assistant", content: "Hi! What product are you looking for today?" }]);
  }

  async function uploadImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setIsUploadingImage(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${API_BASE_URL}/v1/uploads/images?businessId=${BUSINESS_ID}`, {
        method: "POST",
        body: formData
      });
      const data = (await response.json()) as UploadImageResponse | { message?: string };

      if (!response.ok) {
        throw new Error("message" in data && data.message ? data.message : `Upload failed: ${response.status}`);
      }

      setImageUrl((data as UploadImageResponse).url);
      setImageName(file.name);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not upload image.";
      setError(message);
      setMessages((current) => [...current, { role: "system", content: message }]);
    } finally {
      setIsUploadingImage(false);
    }
  }

  return (
    <main className="page">
      <section className="widget" aria-label="Customer chat">
        <header className="widgetHeader">
          <div>
            <strong>Shop Assistant</strong>
            <span>Connected to {API_BASE_URL}</span>
          </div>
          <button className="headerButton" type="button" title="Reset chat" onClick={resetConversation}>
            <RotateCcw size={17} aria-hidden="true" />
          </button>
        </header>

        <div className="statusBar">
          <span>Business: {BUSINESS_ID.slice(0, 8)}...</span>
          <span>State: {agentState}</span>
        </div>

        <div className="messages" ref={messagesRef}>
          {messages.map((item, index) => (
            <div className={`bubble ${item.role}`} key={`${item.role}-${index}`}>
              {item.content}
            </div>
          ))}
          {isSending ? <div className="bubble assistant">Checking...</div> : null}
        </div>

        <div className="quickPrompts" aria-label="Quick prompts">
          {quickPrompts.map((prompt) => (
            <button
              type="button"
              key={prompt}
	                  onClick={() => void sendMessage(prompt)}
	                  disabled={isSending || isUploadingImage}
            >
              {prompt}
            </button>
          ))}
        </div>

        {imageUrl ? <div className="imageHint">Image attached: {imageName || "product image"}</div> : null}
        {error ? <div className="errorHint">{error}</div> : null}

        <footer className="composer">
          <label className={`iconButton ${isUploadingImage ? "disabled" : ""}`} title="Attach image">
            <ImagePlus size={18} aria-hidden="true" />
            <input type="file" accept="image/*" onChange={(event) => void uploadImage(event)} disabled={isUploadingImage || isSending} />
          </label>
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) void sendMessage();
            }}
            placeholder="Ask about a product"
            disabled={isSending || isUploadingImage}
          />
          <button className="sendButton" type="button" onClick={() => void sendMessage()} disabled={isSending || isUploadingImage}>
            <Send size={18} aria-hidden="true" />
          </button>
        </footer>
      </section>
    </main>
  );
}

function toWidgetMessage(message: ConversationMessagesResponse["messages"][number]): ChatMessage {
  return {
    id: message.id,
    role: message.role === "CUSTOMER" ? "customer" : "assistant",
    content: message.imageUrl ? `${message.content}\nImage: ${message.imageUrl}` : message.content
  };
}

function getOrCreateCustomerExternalId() {
  if (typeof window === "undefined") {
    return `web_${Math.random().toString(36).slice(2)}`;
  }

  const existing = window.localStorage.getItem(CUSTOMER_ID_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const generated = `web_${crypto.randomUUID()}`;
  window.localStorage.setItem(CUSTOMER_ID_STORAGE_KEY, generated);
  return generated;
}

createRoot(document.getElementById("root")!).render(<CustomerWidget />);
