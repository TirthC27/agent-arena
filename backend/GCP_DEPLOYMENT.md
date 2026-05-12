# Google Cloud Platform (GCP) Deployment Guide for Agent Arena Backend

This guide outlines the steps to deploy the Agent Arena backend to **Google Cloud Run**, a fully managed serverless platform perfect for Node.js/Express applications.

## Prerequisites

1.  **Google Cloud Project:** You need a GCP project with billing enabled.
2.  **Google Cloud CLI (`gcloud`):** Install the [gcloud CLI](https://cloud.google.com/sdk/docs/install) and authenticate:
    ```bash
    gcloud auth login
    gcloud config set project YOUR_PROJECT_ID
    ```
3.  **Enable Required APIs:**
    ```bash
    gcloud services enable run.googleapis.com \
                           cloudbuild.googleapis.com \
                           secretmanager.googleapis.com \
                           redis.googleapis.com \
                           sqladmin.googleapis.com
    ```

## 1. Prepare Docker Configuration

Cloud Run requires your application to run in a Docker container. Create the following files in the `backend` directory if they don't already exist.

**`Dockerfile`**
```dockerfile
# Build Stage
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy the rest of the application
COPY . .

# Generate Prisma Client and Build TypeScript
RUN npx prisma generate
RUN npm run build

# Production Stage
FROM node:20-alpine AS runner
WORKDIR /app

# Copy package files and install ONLY production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy generated Prisma client, build output, and prisma schema
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Cloud Run defaults to port 8080
ENV PORT=8080
EXPOSE 8080

# Start the application
CMD ["npm", "start"]
```

**`.dockerignore`**
```text
node_modules
dist
.env
.git
npm-debug.log
```

## 2. Infrastructure Setup (Database & Redis)

### A. Database (PostgreSQL)
If you are using Supabase (as configured locally), you can simply use your Supabase `DATABASE_URL`. 
If you want to host it entirely on GCP, you can provision **Cloud SQL for PostgreSQL**:
```bash
gcloud sql instances create agent-arena-db \
    --database-version=POSTGRES_15 \
    --cpu=1 --memory=4GB \
    --region=us-central1
```

### B. Redis (Cloud Memorystore)
Agent Arena uses Redis for caching, Bull queues, and Socket.io. Provision a Memorystore instance:
```bash
gcloud redis instances create agent-arena-redis \
    --size=1 --region=us-central1 \
    --redis-version=redis_7_0
```
Get the Redis connection details:
```bash
gcloud redis instances describe agent-arena-redis --region=us-central1 --format="value(host,port)"
```

## 3. Deployment Configuration

We use Google Cloud Build to build the container and Cloud Run to deploy it from source.

### Step 3.1: Deploying to Cloud Run

Run the following command from the `backend` directory. Replace the placeholder environment variables with your actual production values.

```bash
gcloud run deploy agent-arena-backend \
    --source . \
    --region us-central1 \
    --allow-unauthenticated \
    --port 8080 \
    --set-env-vars="NODE_ENV=production" \
    --set-env-vars="FRONTEND_URL=https://your-frontend-domain.com" \
    --set-env-vars="REDIS_URL=redis://<YOUR_REDIS_IP>:<YOUR_REDIS_PORT>" \
    --set-env-vars="SOLANA_RPC_URL=your_rpc_url" \
    --set-env-vars="DATABASE_URL=your_db_url" \
    --set-env-vars="JWT_SECRET=your_jwt_secret" \
    --set-env-vars="ANTHROPIC_API_KEY=your_anthropic_key" \
    --set-env-vars="OPENAI_API_KEY=your_openai_key" \
    --set-env-vars="TORQUE_API_KEY=your_torque_api_key"
```

*Note: For enhanced security in production, it's highly recommended to use `--set-secrets` and **Google Cloud Secret Manager** for variables like `DATABASE_URL`, `JWT_SECRET`, and API Keys instead of plaintext `--set-env-vars`.*

### Step 3.2: VPC Connector (Important for internal Redis/DB)
If your Cloud Memorystore (Redis) or Cloud SQL uses Private IPs, Cloud Run needs a Serverless VPC Access Connector to reach them.

1.  **Create a VPC Connector:**
    ```bash
    gcloud compute networks vpc-access connectors create my-vpc-connector \
        --network default --region us-central1 --range 10.8.0.0/28
    ```
2.  **Add to Deploy Command:** Add `--vpc-connector my-vpc-connector` to your `gcloud run deploy` command.

## 4. Post-Deployment

### Prisma Migrations
To run database migrations in production, you can temporarily connect your local machine using the **Cloud SQL Auth Proxy** (if using Cloud SQL) or run it against your Supabase instance by running:
```bash
DATABASE_URL="your-production-db-url" npx prisma migrate deploy
```

### CI/CD Pipeline
For an automated workflow, you can connect your GitHub repository directly to Google Cloud Run. 
1. Go to the Cloud Run Console.
2. Click **Create Service**.
3. Select **Continuously deploy new revisions from a source repository**.
4. Link your GitHub repo and select the `main` branch. Every push will trigger a new deployment.
