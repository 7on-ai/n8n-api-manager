# N8N API Manager Dockerfile
FROM node:18-alpine

# Install system dependencies including Chromium for Puppeteer
RUN apk add --no-cache \
    curl \
    bash \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    fontconfig \
    && fc-cache -f

# Tell Puppeteer to skip installing Chromium. We'll be using the installed package.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Create app directory
WORKDIR /app

# Copy package.json first for better Docker layer caching
COPY package.json ./

# Install Node.js dependencies
RUN npm install --only=production --no-cache && \
    # Clean up npm cache to reduce image size
    npm cache clean --force

# Copy application files
COPY scripts/ ./scripts/
COPY README.md ./

# Make scripts executable
RUN chmod +x ./scripts/*.sh && \
    chmod +x ./scripts/*.js

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S apimanager -u 1001 -G nodejs

# Create necessary directories for Puppeteer
RUN mkdir -p /app/.cache/puppeteer && \
    mkdir -p /tmp && \
    chown -R apimanager:nodejs /app && \
    chown -R apimanager:nodejs /tmp

# Switch to non-root user
USER apimanager

# Set environment variables for Node.js
ENV NODE_PATH=/app/node_modules \
    NODE_ENV=production \
    HOME=/app \
    PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

# Health check for container
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "console.log('Container is healthy')" || exit 1

# Default entrypoint runs the main setup script
ENTRYPOINT ["./scripts/setup-api.sh"]

# Labels for container metadata
LABEL maintainer="N8N API Management Team" \
      version="1.0.0" \
      description="N8N API Key Creation and Management Container" \
      org.opencontainers.image.title="N8N API Manager" \
      org.opencontainers.image.description="Automated N8N API key creation and management for Northflank deployments" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.vendor="N8N API Management Team" \
      org.opencontainers.image.source="https://github.com/7on-ai/n8n-api-manager"
