import logging
from uuid import uuid4

from ninja import NinjaAPI, Schema

from chat.agent import get_agent_response

logger = logging.getLogger(__name__)

api = NinjaAPI(urls_namespace="chat")


@api.get("/api/v1/run/health")
def health(request):
    return {"status": "ok"}


class ChatRequest(Schema):
    input_value: str
    input_type: str = "chat"
    output_type: str = "chat"
    session_id: str | None = None
    tweaks: dict | None = None
    output_component: str | None = None


@api.post("/api/v1/run/{flow_id}")
def run_flow(request, flow_id: str, payload: ChatRequest):
    session_id = payload.session_id or str(uuid4())

    try:
        response_text = get_agent_response(payload.input_value, session_id)
    except Exception:
        logger.exception("Agent error for session %s", session_id)
        response_text = "Sorry, I encountered an error processing your request. Please try again."

    return {
        "outputs": [
            {
                "outputs": [
                    {
                        "outputs": {
                            "message": {
                                "type": "message",
                                "message": {"text": response_text},
                            }
                        }
                    }
                ]
            }
        ],
        "session_id": session_id,
    }
