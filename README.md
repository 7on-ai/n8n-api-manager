# N8N API Manager

Automated N8N API key creation and management for Northflank deployments. This container creates API keys for N8N instances and stores credentials in Supabase.

## 🚀 Features

- **Automated API Key Creation**: Creates N8N API keys programmatically
- **Multiple Creation Methods**: Browser automation and session-based approaches
- **Credential Validation**: Tests API key functionality before storing
- **Supabase Integration**: Stores credentials securely in Supabase
- **Webhook Notifications**: Optional success/failure notifications
- **Error Recovery**: Robust error handling and retry mechanisms
- **Security First**: Non-root container execution and secure credential handling

## 📁 Repository Structure

```
n8n-api-manager/
├── .github/workflows/
│   └── docker-build.yml          # GitHub Actions for Docker builds
├── scripts/
│   ├── create-api-key.js         # Main API key creation logic
│   ├── setup-api.sh              # Main setup script
│   └── validate-credentials.js   # Credential validation
├── package.json                  # Node.js dependencies
├── Dockerfile                    # Container configuration
├── README.md                     # This documentation
└── .gitignore                    # Git ignore rules
```

## 🔧 Environment Variables

### Required Variables

```bash
# N8N Configuration
N8N_EDITOR_BASE_URL=https://your-n8n.example.com
N8N_USER_EMAIL=user@example.com
N8N_USER_PASSWORD=secure_password
N8N_ENCRYPTION_KEY=your_encryption_key

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# User Information
USER_ID=user_unique_id
NORTHFLANK_PROJECT_ID=project_id
NORTHFLANK_PROJECT_NAME=project_name
```

### Optional Variables

```bash
# Webhook Notification (optional)
WEBHOOK_URL=https://your-webhook.example.com/notify

# Additional N8N settings
N8N_USER_ID=user_id
```

## 🐳 Docker Usage

### Build Locally

```bash
# Clone the repository
git clone https://github.com/your-username/n8n-api-manager.git
cd n8n-api-manager

# Build the Docker image
docker build -t n8n-api-manager .
```

### Run Container

```bash
docker run --rm \
  -e N8N_EDITOR_BASE_URL=https://your-n8n.example.com \
  -e N8N_USER_EMAIL=user@example.com \
  -e N8N_USER_PASSWORD=secure_password \
  -e N8N_ENCRYPTION_KEY=your_encryption_key \
  -e SUPABASE_URL=https://your-project.supabase.co \
  -e SUPABASE_SERVICE_ROLE_KEY=your_service_role_key \
  -e USER_ID=user123 \
  -e NORTHFLANK_PROJECT_ID=project_id \
  -e NORTHFLANK_PROJECT_NAME=project_name \
  n8n-api-manager
```

### Using GitHub Container Registry

```bash
docker run --rm \
  -e N8N_EDITOR_BASE_URL=https://your-n8n.example.com \
  -e N8N_USER_EMAIL=user@example.com \
  -e N8N_USER_PASSWORD=secure_password \
  -e SUPABASE_URL=https://your-project.supabase.co \
  -e SUPABASE_SERVICE_ROLE_KEY=your_service_role_key \
  -e USER_ID=user123 \
  ghcr.io/your-username/n8n-api-manager:latest
```

## 🔄 Northflank Integration

### Template Integration

Add this ManualJob to your Northflank template after the N8N setup job:

```json
{
  "ref": "api-creation-job",
  "kind": "ManualJob",
  "spec": {
    "name": "n8n-api-creation",
    "runOnSourceChange": "never",
    "backoffLimit": 3,
    "activeDeadlineSeconds": 900,
    "deployment": {
      "storage": {
        "ephemeralStorage": {
          "storageSize": 1024
        },
        "shmSize": 128
      },
      "docker": {
        "configType": "default"
      },
      "external": {
        "imagePath": "ghcr.io/your-username/n8n-api-manager:latest"
      }
    },
    "infrastructure": {
      "architecture": "x86"
    },
    "billing": {
      "deploymentPlan": "nf-compute-20"
    },
    "runtimeEnvironment": {
      "secretGroups": "n8n-secrets"
    },
    "buildConfiguration": {
      "pathIgnoreRules": [],
      "isAllowList": false,
      "ciIgnoreFlagsEnabled": false
    },
    "buildArguments": {},
    "runtimeFiles": {}
  }
},
{
  "kind": "JobRun",
  "spec": {
    "jobId": "${refs.api-creation-job.id}"
  },
  "condition": "success",
  "ref": "api-creation-jobrun"
}
```

### Workflow Dependencies

```
setup-jobrun (success)
    ↓
api-creation-job
    ↓
api-creation-jobrun (success)
    ↓
store-credentials-job (existing)
    ↓
store-credentials-jobrun (existing)
```

## 🔑 API Key Creation Methods

### Method 1: Browser Automation (Primary)

Uses Puppeteer to automate the N8N web interface:
- Logs into N8N UI programmatically
- Navigates to Settings > n8n API
- Creates API key through the web interface
- Extracts the generated API key

**Advantages:**
- Works with all N8N versions
- Uses official UI workflow
- Most reliable method

**Requirements:**
- Chromium browser (included in container)
- Sufficient memory for browser operations

### Method 2: Session-based HTTP Requests (Fallback)

Uses HTTP requests with session cookies:
- Authenticates via login endpoint
- Uses session cookies for API requests
- Calls internal API endpoints

**Advantages:**
- Faster execution
- Lower resource usage
- No browser dependencies

**Limitations:**
- May not work with all N8N versions
- Depends on internal API endpoints

## 📊 Process Flow

1. **Environment Validation**
   - Validates all required environment variables
   - Checks N8N instance accessibility

2. **N8N Readiness Check**
   - Waits for N8N health endpoint
   - Validates login endpoint accessibility
   - Allows initialization time

3. **API Key Creation**
   - Attempts session-based creation first
   - Falls back to browser automation if needed
   - Generates secure API key

4. **Validation**
   - Tests API key functionality
   - Validates against N8N API endpoints
   - Ensures proper permissions

5. **Storage**
   - Updates user record in Supabase
   - Stores all relevant credentials
   - Includes metadata (label, creation time)

6. **Notification**
   - Sends webhook notification (if configured)
   - Includes success status and metadata

## 🛠️ Troubleshooting

### Common Issues

#### API Key Creation Fails

```bash
❌ Browser automation failed: Navigation timeout
```

**Solutions:**
- Increase job timeout in Northflank
- Check N8N instance health
- Verify user credentials
- Check available memory

#### Supabase Storage Fails

```bash
❌ Failed to store credentials: permission denied
```

**Solutions:**
- Verify Supabase service role key
- Check table permissions
- Validate user ID exists in database

#### N8N Not Accessible

```bash
❌ Timeout waiting for N8N to be ready
```

**Solutions:**
- Ensure N8N service is running
- Check network connectivity
- Verify base URL is correct
- Increase timeout values

### Debug Mode

Enable detailed logging by checking container logs:

```bash
# View logs in Northflank
# Or locally:
docker logs <container-id>
```

### Manual Validation

Run validation separately:

```bash
docker run --rm \
  -e N8N_EDITOR_BASE_URL=... \
  -e N8N_USER_EMAIL=... \
  # ... other env vars
  ghcr.io/your-username/n8n-api-manager:latest \
  node /app/scripts/validate-credentials.js
```

## 📋 Validation Checks

The validation script performs these checks:

- ✅ **N8N Health**: Instance is running and accessible
- ✅ **Login Valid**: User credentials work
- ✅ **Supabase Connection**: Database is accessible
- ✅ **API Key Stored**: Key is saved in database
- ✅ **API Key Valid**: Key works with N8N API
- ✅ **Webhook Endpoint**: N8N webhook system is functional

## 🔒 Security Considerations

### Container Security

- **Non-root execution**: Container runs as non-root user
- **Minimal dependencies**: Only essential packages installed
- **Security scanning**: Automated vulnerability scans
- **Read-only filesystem**: Where possible

### Data Security

- **Environment variables**: All secrets via env vars
- **No logging**: Sensitive data not logged
- **Encrypted transmission**: HTTPS only
- **Secure storage**: Encrypted in Supabase

### API Key Security

- **Strong generation**: Cryptographically secure tokens
- **Limited scope**: Minimum required permissions
- **Audit trail**: Creation time and metadata tracked
- **Rotation ready**: Support for future key rotation

## 📈 Monitoring

### Success Metrics

- API key creation success rate
- Validation success rate
- Supabase storage success rate
- Average execution time

### Log Monitoring

Monitor these log patterns:

- `✅ N8N API Management Completed Successfully!` - Success
- `❌ N8N API Management Failed!` - Critical failure
- `⚠️ Validation completed with warnings` - Partial success

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add your changes
4. Test with a real N8N instance
5. Submit a pull request

### Development Setup

```bash
# Clone and install dependencies
git clone https://github.com/your-username/n8n-api-manager.git
cd n8n-api-manager
npm install

# Set environment variables
export N8N_EDITOR_BASE_URL=...
export N8N_USER_EMAIL=...
# ... other variables

# Run locally
npm start
```

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For issues and questions:

1. Check the troubleshooting section
2. Review container logs
3. Open a GitHub issue
4. Check N8N and Supabase documentation

---

**Automated API Management Made Simple!** 🚀
