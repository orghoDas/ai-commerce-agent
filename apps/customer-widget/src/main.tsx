import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { ImagePlus, Send } from "lucide-react";
import "./styles.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID ?? "demo-business";

type ChatMessage = {
  role: "customer" | "assistant";
  content: string;
};

function CustomerWidget() {
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hi! What product are you looking for today?" }
  ]);
  const [message, setMessage] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [isSending, setIsSending] = useState(false);

  async function sendMessage() {
    const trimmed = message.trim();
    if (!trimmed && !imageUrl.trim()) {
      return;
    }

    setIsSending(true);
    setMessages((current) => [...current, { role: "customer", content: trimmed || "Sent a product image." }]);
    setMessage("");

    const response = await fetch(`${API_BASE_URL}/v1/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        businessId: BUSINESS_ID,
        conversationId,
        message: trimmed || "Can you identify this product?",
        imageUrl: imageUrl.trim() || undefined
      })
    });

    const data = await response.json();
    setConversationId(data.conversationId);
    setImageUrl("");
    setMessages((current) => [
      ...current,
      { role: "assistant", content: data.message ?? "I need a little more information." }
    ]);
    setIsSending(false);
  }

  return (
    <main className="page">
      <section className="widget" aria-label="Customer chat">
        <header className="widgetHeader">
          <div>
            <strong>Shop Assistant</strong>
            <span>Online now</span>
          </div>
        </header>

        <div className="messages">
          {messages.map((item, index) => (
            <div className={`bubble ${item.role}`} key={`${item.role}-${index}`}>
              {item.content}
            </div>
          ))}
        </div>

        {imageUrl ? <div className="imageHint">Image URL attached</div> : null}

        <footer className="composer">
          <button
            className="iconButton"
            type="button"
            title="Attach image URL"
            onClick={() => {
              const url = window.prompt("Paste a product image URL");
              if (url) setImageUrl(url);
            }}
          >
            <ImagePlus size={18} aria-hidden="true" />
          </button>
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void sendMessage();
            }}
            placeholder="Ask about a product"
          />
          <button className="sendButton" type="button" onClick={() => void sendMessage()} disabled={isSending}>
            <Send size={18} aria-hidden="true" />
          </button>
        </footer>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<CustomerWidget />);

