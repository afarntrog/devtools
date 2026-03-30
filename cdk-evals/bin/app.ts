#!/usr/bin/env node
import "source-map-support/register";
import * as dotenv from "dotenv";
import * as cdk from "aws-cdk-lib";
import { ChatbotStack } from "../lib/chatbot-stack";
import { DashboardStack } from "../lib/dashboard-stack";
import { EvalPipelineStack } from "../lib/eval-pipeline-stack";

// Load environment variables from .env file (if present)
dotenv.config();

const app = new cdk.App();

// Both stacks must be in us-east-1 because:
// - Lambda@Edge requires deployment in us-east-1
// - CloudFront OAC works best with same-region resources
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: "us-east-1",
};

// Chatbot Stack: EC2 + Elastic IP for Strands Agent backend (default VPC)
const chatbotStack = new ChatbotStack(app, "ChatbotStack", {
  env,
  description: "Strands Evals Chatbot - EC2 + Elastic IP",
  tags: {
    Project: "strands-evals-dashboard",
  },
  knowledgeBaseId: process.env.KNOWLEDGE_BASE_ID!,
});

// Dashboard Stack: S3 + CloudFront + Lambda@Edge for basic auth
// Routes /api/v1/run/* to chatbot EC2 via CloudFront behavior
const dashboardStack = new DashboardStack(app, "DashboardStack", {
  env,
  description: "Strands Evals Dashboard - S3, CloudFront, and Lambda@Edge",
  tags: {
    Project: "strands-evals-dashboard",
  },
  chatbotOriginDomain: chatbotStack.publicIp,
});

// Eval Pipeline Stack: SQS + Lambda + Secrets Manager
new EvalPipelineStack(app, "EvalPipelineStack", {
  env,
  description: "Strands Evals Pipeline - SQS, Lambda, and Secrets Manager",
  tags: {
    Project: "strands-evals-dashboard",
  },
  dashboardBucket: dashboardStack.bucket,
  distributionId: dashboardStack.distribution.distributionId,
});
