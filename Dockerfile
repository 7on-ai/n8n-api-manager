# N8N API Manager Dockerfile - Fixed Version
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
    dumb-init \
    && fc-cache -f \
    && rm -rf /var/cache/apk/*

# Tell Puppeteer to skip installing Chromium. We'll be using the installed package.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    CHROME_BIN=/usr/bin/chromium-browser \
    CHROME_PATH=/usr/bin/chromium-browser

# Create app directory
WORKDIR /app

# Create non-root user for security first
RUN addgroup -g 1001 -S nodejs && \
    adduser -S apimanager -u 1001 -G nodejs

# Copy package.json first for better Docker layer caching
COPY --chown=apimanager:nodejs package.json ./

# Install Node.js dependencies with proper error handling
RUN npm ci --only=production --no-audit --no-fund && \
    npm cache clean --force

# Copy application files with proper ownership
COPY --chown=apimanager:nodejs scripts/ ./scripts/
COPY --chown=apimanager:nodejs README.md ./

# Make scripts executable
RUN chmod +x ./scripts/*.sh && \
    chmod +x ./scripts/*.js

# Create necessary directories for Puppeteer and temp files
RUN mkdir -p /app/.cache/puppeteer \
    /app/.cache/chromium \
    /tmp \
    /app/logs && \
    chown -R apimanager:nodejs /app && \
    chown -R apimanager:nodejs /tmp && \
    chmod 755 /app/scripts/* && \
    chmod 1777 /tmp

# Switch to non-root user
USER apimanager

# Set environment variables for Node.js and Chrome
ENV NODE_PATH=/app/node_modules \
    NODE_ENV=production \
    HOME=/app \
    PUPPETEER_CACHE_DIR=/app/.cache/puppeteer \
    CHROME_DEVEL_SANDBOX=/usr/bin/chromium-browser \
    NODE_OPTIONS="--max-old-space-size=2048"

# Health check for container
HEALTHCHECK --interval=30s --timeout=30s --start-period=60s --retries=3 \
    CMD node -e "console.log('Container is healthy'); process.exit(0)" || exit 1

# Use dumb-init for proper signal handling
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Default command runs the main setup script
CMD ["./scripts/setup-api.sh"]

# Labels for container metadata
LABEL maintainer="N8N API Management Team" \
      version="1.0.1" \
      description="N8N API Key Creation and Management Container" \
      org.opencontainers.image.title="N8N API Manager" \
      org.opencontainers.image.description="Automated N8N API key creation and management for Northflank deployments" \
      org.opencontainers.image.version="1.0.1" \
      org.opencontainers.image.vendor="N8N API Management Team" \
      org.opencontainers.image.source="https://github.com/7on-ai/n8n-api-manager"
