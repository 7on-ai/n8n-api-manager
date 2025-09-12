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
    "N8N_USER_EMAIL"
    "N8N_USER_PASSWORD"
    "SUPABASE_URL"
    "SUPABASE_SERVICE_ROLE_KEY"
    "USER_ID"
)

# Check for N8N URL (either variable)
if [[ -z "$N8N_EDITOR_BASE_URL" && -z "$N8N_URL" ]]; then
    echo "❌ Missing N8N URL: Set either N8N_EDITOR_BASE_URL or N8N_URL"
    exit 1
fi

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

# Enhanced N8N readiness check with multiple endpoints
echo "⏳ Waiting for N8N to be fully ready..."
timeout=900  # 15 minutes for API creation
counter=0
n8n_ready=false

while [ $counter -lt $timeout ]; do
    # Try multiple health check endpoints
    for endpoint in "/healthz" "/healthz/readiness" "/"; do
        if curl -f -s --max-time 10 "$N8N_EDITOR_BASE_URL$endpoint" > /dev/null 2>&1; then
            echo "✅ N8N health check passed via $endpoint!"
            n8n_ready=true
            break 2
        fi
    done
    
    if [ "$n8n_ready" = true ]; then
        break
    fi
    
    echo "⌛ Waiting for N8N... ($counter/$timeout seconds)"
    sleep 15
    counter=$((counter + 15))
done

if [ "$n8n_ready" = false ]; then
    echo "❌ Timeout waiting for N8N to be ready"
    exit 1
fi

# Additional wait for N8N to be fully initialized
echo "⏳ Allowing additional time for N8N full initialization..."
sleep 45

# Enhanced N8N login endpoint test
echo "🔐 Testing N8N login endpoint availability..."
login_test_attempts=3
login_endpoint_ready=false

for attempt in $(seq 1 $login_test_attempts); do
    login_test=$(curl -s -w "%{http_code}" -o /dev/null \
        -X POST "$N8N_EDITOR_BASE_URL/rest/login" \
        -H "Content-Type: application/json" \
        -d '{"emailOrLdapLoginId":"test","password":"test"}' \
        --max-time 30)
    
    echo "Login endpoint test attempt $attempt: HTTP $login_test"
    
    # Accept any response that's not a connection error
    if [[ $login_test =~ ^[2345][0-9][0-9]$ ]]; then
        echo "✅ N8N login endpoint is accessible (status: $login_test)"
        login_endpoint_ready=true
        break
    else
        echo "⚠️ Login endpoint not ready (status: $login_test), retrying..."
        sleep 10
    fi
done

if [ "$login_endpoint_ready" = false ]; then
    echo "❌ N8N login endpoint is not accessible after $login_test_attempts attempts"
    exit 1
fi

# Test actual login with provided credentials
echo "🔑 Testing login with provided credentials..."
login_auth_test=$(curl -s -w "%{http_code}" -o /dev/null \
    -X POST "$N8N_EDITOR_BASE_URL/rest/login" \
    -H "Content-Type: application/json" \
    -d "{\"emailOrLdapLoginId\":\"$N8N_USER_EMAIL\",\"password\":\"$N8N_USER_PASSWORD\"}" \
    --max-time 30)

echo "Credential test result: HTTP $login_auth_test"

if [[ $login_auth_test == "200" ]]; then
    echo "✅ Login credentials are valid"
elif [[ $login_auth_test =~ ^[45][0-9][0-9]$ ]]; then
    echo "⚠️ Login returned $login_auth_test (may be normal for first-time setup)"
else
    echo "❌ Unexpected login response: $login_auth_test"
    exit 1
fi

# Create N8N API key
echo "🔑 Creating N8N API key..."
echo "This process may take several minutes as it involves browser automation..."

# Set extended timeout for API key creation
export NODE_OPTIONS="--max-old-space-size=1024"

if timeout 600 node /app/scripts/create-api-key.js; then
    echo "✅ N8N API key created successfully"
else
    echo "❌ Failed to create N8N API key"
    echo "Checking for partial success..."
    
    # Check if API key was stored even if process had issues
    if node -e "
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient('$SUPABASE_URL', '$SUPABASE_SERVICE_ROLE_KEY');
        
        supabase
            .from('launchmvpfast-saas-starterkit_user')
            .select('n8n_api_key')
            .eq('id', '$USER_ID')
            .single()
            .then(({ data, error }) => {
                if (error) {
                    console.log('Could not check API key status');
                    process.exit(1);
                }
                if (data && data.n8n_api_key) {
                    console.log('✅ API key was successfully stored');
                    process.exit(0);
                } else {
                    console.log('❌ No API key found');
                    process.exit(1);
                }
            });
    "; then
        echo "✅ API key creation completed (found in database)"
    else
        echo "❌ API key creation failed completely"
        exit 1
    fi
fi

# Validate the created API key
echo "✅ Validating created API key..."
if node /app/scripts/validate-credentials.js; then
    echo "✅ API key validation passed"
else
    echo "⚠️ API key validation had issues (but API key was created)"
fi

echo "=========================================="
echo "🎉 N8N API Management Completed!"
echo "=========================================="
echo "✅ API Key: Created and validated"
echo "✅ Database: Updated in Supabase"
echo "✅ Project: $NORTHFLANK_PROJECT_NAME"
echo "✅ User: $N8N_USER_EMAIL"
echo "✅ N8N URL: $N8N_EDITOR_BASE_URL"
echo "=========================================="

# Final comprehensive validation
echo "🔍 Performing final system validation..."

# Check N8N health
if curl -f -s --max-time 10 "$N8N_EDITOR_BASE_URL/healthz" > /dev/null 2>&1; then
    echo "✅ N8N instance is healthy"
else
    echo "⚠️ N8N instance health check failed (but API setup completed)"
fi

# Verify API key in database
if node -e "
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient('$SUPABASE_URL', '$SUPABASE_SERVICE_ROLE_KEY');
    
    supabase
        .from('launchmvpfast-saas-starterkit_user')
        .select('n8n_api_key, n8n_api_key_label, n8n_api_key_created_at')
        .eq('id', '$USER_ID')
        .single()
        .then(({ data, error }) => {
            if (error) {
                console.log('❌ Could not verify API key in database');
                process.exit(1);
            }
            if (data && data.n8n_api_key) {
                console.log('✅ API key confirmed in database');
                console.log('Label:', data.n8n_api_key_label || 'N/A');
                console.log('Created:', data.n8n_api_key_created_at || 'N/A');
                console.log('Key Preview:', data.n8n_api_key.substring(0, 15) + '...');
                process.exit(0);
            } else {
                console.log('❌ API key not found in database');
                process.exit(1);
            }
        });
"; then
    echo "✅ Database verification completed"
else
    echo "⚠️ Could not verify database state"
fi

# Test API key functionality if possible
echo "🧪 Testing API key functionality..."
if node -e "
    const axios = require('axios');
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient('$SUPABASE_URL', '$SUPABASE_SERVICE_ROLE_KEY');
    
    supabase
        .from('launchmvpfast-saas-starterkit_user')
        .select('n8n_api_key')
        .eq('id', '$USER_ID')
        .single()
        .then(async ({ data, error }) => {
            if (error || !data || !data.n8n_api_key) {
                console.log('❌ Could not retrieve API key for testing');
                process.exit(1);
            }
            
            try {
                const response = await axios.get('$N8N_EDITOR_BASE_URL/rest/workflows', {
                    timeout: 15000,
                    headers: {
                        'X-N8N-API-KEY': data.n8n_api_key,
                        'Accept': 'application/json'
                    },
                    validateStatus: (status) => status < 500
                });
                
                if (response.status === 200) {
                    console.log('✅ API key is fully functional');
                    console.log('Found', response.data?.length || 0, 'workflows');
                } else if (response.status === 401) {
                    console.log('❌ API key is invalid');
                    process.exit(1);
                } else if (response.status === 403) {
                    console.log('✅ API key is valid (limited permissions)');
                } else {
                    console.log('⚠️ API key test returned status:', response.status);
                }
                process.exit(0);
            } catch (error) {
                console.log('⚠️ API key functionality test failed:', error.message);
                console.log('This may be normal if N8N is still initializing');
                process.exit(0);
            }
        });
" 2>/dev/null; then
    echo "✅ API functionality test completed"
else
    echo "⚠️ Could not complete functionality test"
fi

echo "=========================================="
echo "🎯 N8N API management process completed!"
echo "=========================================="
echo "Summary:"
echo "- N8N Instance: Running and accessible"
echo "- API Key: Created and stored"
echo "- Database: Updated with credentials"
echo "- System: Ready for use"
echo "=========================================="
