import os

from strands import Agent
from strands_tools import retrieve
from strands_sqlite_session_manager import SQLiteSessionManager

KNOWLEDGE_BASE_ID = os.environ["KNOWLEDGE_BASE_ID"]

SYSTEM_PROMPT = f"""You are an evaluation results assistant for the Strands Agents project.
You help users understand their agent evaluation results by searching the knowledge base.

When answering questions:
- Use the retrieve tool to search the knowledge base (ID: {KNOWLEDGE_BASE_ID}) for relevant evaluation data
- Cite specific scores, metrics, and test case names when available
- Summarize trends and patterns across evaluation runs
- Be concise and direct in your responses

If you cannot find relevant information in the knowledge base, say so clearly."""


def get_agent_response(message: str, session_id: str) -> str:
    session_manager = SQLiteSessionManager(
        session_id=session_id,
        db_path=os.getenv("SESSIONS_DB_PATH", "./sessions.db"),
    )

    agent = Agent(
        tools=[retrieve],
        session_manager=session_manager,
        system_prompt=SYSTEM_PROMPT,
    )

    result = agent(message)
    return str(result)
