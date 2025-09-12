#!/bin/bash
# setup-api.sh - N8N API Key Creation and Management Script
set -e

echo "=========================================="
echo "🚀 N8N API Manager Starting"
echo "=========================================="
echo "N8N URL: $N8N_EDITOR_BASE_URL"
echo "User Email: $N8N_USER_EMAIL"
echo "User ID: $USER_ID"
echo "Project ID: $NORTHFLANK_PROJECT_ID"
echo "Project Name: $NORTHFLANK_PROJECT_NAME"
echo "Supabase URL: $SUPABASE_URL"
echo "Webhook URL: ${WEBHOOK_URL:-'Not configured'}"
echo "=========================================="

# Environment validation
echo "🔍 Validating environment variables..."
required_vars=(
    "N8N_EDITOR_BASE_URL"
    "N8N_USER_EMAIL"
    "N8N_USER_PASSWORD"
    "SUPABASE_URL"
    "SUPABASE_SERVICE_ROLE_KEY"
    "USER_ID"
)

missing_vars=()
for var in "${required_vars[@]}"; do
    if [[ -z "${!var}" ]]; then
        missing_vars+=("$var")
    fi
done

if [[ ${#missing_vars[@]} -gt 0 ]]; then
    echo "❌ Missing required environment variables:"
    printf '   - %s\n' "${missing_vars[@]}"
    exit 1
fi

echo "✅ Environment validation passed"

# Wait for N8N to be ready with extended timeout
echo "⏳ Waiting for N8N to be fully ready..."
timeout=600  # 10 minutes
counter=0
while [ $counter -lt $timeout ]; do
    if curl -f -s "$N8N_EDITOR_BASE_URL/healthz" > /dev/null 2>&1; then
        echo "✅ N8N health check passed!"
        break
    fi
    echo "⌛ Waiting for N8N... ($counter/$timeout seconds)"
    sleep 15
    counter=$((counter + 15))
done

if [ $counter -ge $timeout ]; then
    echo "❌ Timeout waiting for N8N to be ready"
    exit 1
fi

# Additional wait for N8N to be fully initialized
echo "⏳ Allowing additional time for N8N initialization..."
sleep 30

# Test N8N login endpoint
echo "🔐 Testing N8N login endpoint..."
login_test=$(curl -s -w "%{http_code}" -o /dev/null \
    -X POST "$N8N_EDITOR_BASE_URL/rest/login" \
    -H "Content-Type: application/json" \
    -d "{\"emailOrLdapLoginId\":\"test\",\"password\":\"test\"}" \
    --max-time 30)

if [[ $login_test =~ ^[45] ]]; then
    echo "✅ N8N login endpoint is accessible (status: $login_test)"
else
    echo "❌ N8N login endpoint is not accessible (status: $login_test)"
    exit 1
fi

# Create N8N API key
echo "🔑 Creating N8N API key..."
if node /app/scripts/create-api-key.js; then
    echo "✅ N8N API key created successfully"
else
    echo "❌ Failed to create N8N API key"
    exit 1
fi

# Validate the created credentials
echo "✅ Validating created credentials..."
if node /app/scripts/validate-credentials.js; then
    echo "✅ Credentials validation passed"
else
    echo "⚠️ Credentials validation had issues (but API key was created)"
fi

echo "=========================================="
echo "🎉 N8N API Management Completed!"
echo "=========================================="
echo "✅ API Key: Created and stored"
echo "✅ Database: Updated in Supabase"
echo "✅ Project: $NORTHFLANK_PROJECT_NAME"
echo "✅ User: $N8N_USER_EMAIL"
echo "✅ N8N URL: $N8N_EDITOR_BASE_URL"
echo "=========================================="

# Final validation check
echo "🔍 Performing final system check..."
if curl -f -s "$N8N_EDITOR_BASE_URL/healthz" > /dev/null 2>&1; then
    echo "✅ N8N instance is healthy"
else
    echo "⚠️ N8N instance health check failed (but setup completed)"
fi

echo "🎯 N8N API management process completed successfully!"
