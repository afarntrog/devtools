# Evals Dashboard Chatbot

A Strands agent backend that powers the chat widget in the evals dashboard. Uses AWS Bedrock Knowledge Base to answer questions about evaluation results.

## Infrastructure Overview

Three CDK stacks deploy the entire evals platform to `us-east-1`:

```
GitHub Actions
    │
    │  SQS SendMessage
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ EvalPipelineStack                                               │
│                                                                 │
│  SQS Queue ──► Lambda (Python 3.12) ──► S3 (dashboard bucket)  │
│                    │                        │                   │
│                    ├─► Bedrock (LLM evals)  ├─► CloudFront      │
│                    └─► Langfuse (traces)        invalidation    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ DashboardStack                                                  │
│                                                                 │
│  S3 Bucket ──► CloudFront Distribution                          │
│  (static assets)    │                                           │
│                     ├─► Lambda@Edge (basic auth)                │
│                     ├─► /* ──► S3 (dashboard SPA)               │
│                     └─► /api/v1/run/* ──► ChatbotStack EC2      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ ChatbotStack                                                    │
│                                                                 │
│  EC2 (t3.small, Amazon Linux 2023, default VPC)                 │
│    │  gunicorn :8000 ──► Django Ninja ──► Strands Agent         │
│    │                                        │                   │
│    │  SQLite sessions on disk (20GB gp3)    ├─► Bedrock KB      │
│    │                                        └─► Bedrock LLM     │
│    │                                                            │
│    └── Elastic IP (stable address for CloudFront origin)        │
│    └── IAM Role: bedrock:InvokeModel, bedrock:Retrieve          │
│    └── SSM Session Manager (no SSH keys needed)                 │
└─────────────────────────────────────────────────────────────────┘
```

### Request Flow (Chat)

1. User clicks chat bubble in dashboard (Langflow web component)
2. Browser sends `POST /api/v1/run/evals-chatbot` to CloudFront
3. CloudFront routes `/api/v1/run/*` to EC2 Elastic IP on port 8000
4. gunicorn hands request to Django Ninja API
5. Strands Agent queries Bedrock Knowledge Base via `retrieve` tool
6. Agent response flows back through the same path

### Request Flow (Evaluations)

1. GitHub Actions sends SQS message after a CI run
2. Lambda consumes the message, runs LLM-based evaluations via Bedrock
3. Lambda writes results to S3 dashboard bucket and invalidates CloudFront cache
4. Dashboard fetches updated results from S3 via CloudFront

### Why EC2 (not Lambda)?

SQLite requires a persistent filesystem. The session database stores conversation history across requests, and SQLite does not work on Lambda's ephemeral `/tmp` storage across invocations.

## Local Development

### Setup

```bash
cd cdk-evals/chatbot
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Running

**Terminal 1 -- Backend:**

```bash
cd cdk-evals/chatbot
source .venv/bin/activate
python manage.py runserver
```

**Terminal 2 -- Frontend:**

```bash
cd cdk-evals/dashboard
npm run dev
```

Open http://localhost:5173/#/chat

The Vite dev server proxies `/api/v1/run/*` to `localhost:8000` automatically.

## Environment Variables

Configure via `.env` file in the chatbot directory (loaded automatically):

| Variable | Default | Description |
|----------|---------|-------------|
| `KNOWLEDGE_BASE_ID` | *(required)* | AWS Bedrock Knowledge Base ID |
| `AWS_REGION` | `us-west-2` | AWS region for the Knowledge Base |
| `SESSIONS_DB_PATH` | `./sessions.db` | Path to SQLite session database |
| `DJANGO_SECRET_KEY` | dev default | Django secret key (set in production) |
| `DJANGO_DEBUG` | `True` | Django debug mode |
| `DASHBOARD_URL` | none | Production dashboard URL for CORS |

## Deployment

```bash
cd cdk-evals

# Deploy chatbot EC2 + Elastic IP
npm run deploy:chatbot

# Deploy dashboard (routes /api/v1/run/* to chatbot)
npm run deploy:dashboard

# Deploy eval pipeline
npm run deploy:pipeline
```

Deploy `ChatbotStack` first -- `DashboardStack` references its Elastic IP for the CloudFront origin.

### Verify

```bash
# Health check (replace with actual EIP)
curl http://<elastic-ip>:8000/api/v1/run/health

# Chat endpoint via CloudFront
curl -X POST https://<cloudfront-domain>/api/v1/run/evals-chatbot \
  -H "Content-Type: application/json" \
  -d '{"input_value": "What were the latest eval results?"}'
```

### SSM Access

Connect to the EC2 instance without SSH keys:

```bash
aws ssm start-session --target <instance-id> --region us-east-1
```

## Project Structure

```
chatbot/
  chat/
    agent.py       # Strands Agent with Bedrock KB retrieve tool
    api.py         # Django Ninja API (Langflow-compatible format)
  chatbot/
    settings.py    # Django settings, CORS, SQLite config
    urls.py        # URL routing
    wsgi.py        # WSGI entry point for gunicorn
  manage.py
  requirements.txt
```

The API mimics the Langflow format (`POST /api/v1/run/{flow_id}`) so the Langflow embedded chat widget works without modification.
