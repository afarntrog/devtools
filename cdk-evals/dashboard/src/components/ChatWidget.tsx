import { useEffect } from "react";

export default function ChatWidget() {
  useEffect(() => {
    if (document.querySelector("langflow-chat")) return;

    const el = document.createElement("langflow-chat");
    el.setAttribute("host_url", "");
    el.setAttribute("flow_id", "evals-chatbot");
    el.setAttribute("window_title", "Evals Assistant");
    el.setAttribute("placeholder", "Ask about your evaluation results...");
    el.setAttribute("chat_position", "top-left");
    document.body.appendChild(el);

    return () => {
      el.remove();
    };
  }, []);

  return null;
}
