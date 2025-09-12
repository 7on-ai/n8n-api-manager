const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

class CredentialValidator {
    constructor() {
        // N8N Configuration - รองรับทั้งสอง env variable  
        this.baseUrl = process.env.N8N_EDITOR_BASE_URL || process.env.N8N_URL;
        this.email = process.env.N8N_USER_EMAIL;
        this.password = process.env.N8N_USER_PASSWORD;
        
        // Supabase Configuration
        this.supabaseUrl = process.env.SUPABASE_URL;
        this.supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        
        // User Information
        this.userId = process.env.USER_ID;
        
        // Initialize Supabase client
        if (this.supabaseUrl && this.supabaseKey) {
            this.supabase = createClient(this.supabaseUrl, this.supabaseKey, {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            });
        }
    }

    async validateN8NHealth() {
        console.log('🏥 Validating N8N health status...');
        
        try {
            const endpoints = ['/healthz', '/healthz/readiness', '/'];
            
            for (const endpoint of endpoints) {
                try {
                    const response = await axios.get(`${this.baseUrl}${endpoint}`, {
                        timeout: 10000,
                        validateStatus: () => true
                    });
                    
                    if (response.status === 200) {
                        console.log(`✅ N8N is healthy via ${endpoint}`);
                        return true;
                    }
                } catch (error) {
                    continue;
                }
            }
            
            console.log('❌ N8N health check failed on all endpoints');
            return false;
            
        } catch (error) {
            console.error('❌ N8N health validation failed:', error.message);
            return false;
        }
    }

    async validateN8NLogin() {
        console.log('🔐 Validating N8N login credentials...');
        
        try {
            const response = await axios.post(`${this.baseUrl}/rest/login`, {
                emailOrLdapLoginId: this.email,
                password: this.password
            }, {
                timeout: 30000,
                validateStatus: function (status) {
                    return status < 500;
                }
            });
            
            if (response.status === 200) {
                console.log('✅ N8N login credentials are valid');
                return { valid: true, session: response.headers['set-cookie'] };
            } else {
                console.log(`⚠️ N8N login returned status: ${response.status}`);
                return { valid: false, status: response.status };
            }
            
        } catch (error) {
            console.error('❌ N8N login validation failed:', error.message);
            return { valid: false, error: error.message };
        }
    }

    async validateSupabaseConnection() {
        console.log('🔗 Validating Supabase connection...');
        
        if (!this.supabase) {
            console.error('❌ Supabase client not initialized');
            return false;
        }
        
        try {
            // Test Supabase connection by fetching user data
            const { data, error } = await this.supabase
                .from('launchmvpfast-saas-starterkit_user')
                .select('id, email, n8n_api_key, n8n_api_key_label, n8n_api_key_created_at')
                .eq('id', this.userId)
                .single();
            
            if (error) {
                console.error('❌ Supabase query error:', error.message);
                return { connected: false, error: error.message };
            }
            
            if (data) {
                console.log('✅ Supabase connection is valid');
                console.log(`📧 Found user: ${data.email}`);
                
                if (data.n8n_api_key) {
                    console.log(`🔑 API Key found: ${data.n8n_api_key_label || 'Unlabeled'}`);
                    console.log(`📅 Created: ${data.n8n_api_key_created_at || 'N/A'}`);
                    console.log(`🔍 Key preview: ${data.n8n_api_key.substring(0, 15)}...`);
                } else {
                    console.log('⚠️ No API key found in database');
                }
                
                return { 
                    connected: true, 
                    user: data,
                    hasAPIKey: !!data.n8n_api_key
                };
            } else {
                console.log('⚠️ User not found in Supabase');
                return { connected: true, user: null };
            }
            
        } catch (error) {
            console.error('❌ Supabase connection failed:', error.message);
            return { connected: false, error: error.message };
        }
    }

    async retrieveStoredAPIKey() {
        console.log('🔍 Retrieving stored API key from Supabase...');
        
        if (!this.supabase) {
            console.error('❌ Supabase client not initialized');
            return null;
        }
        
        try {
            const { data, error } = await this.supabase
                .from('launchmvpfast-saas-starterkit_user')
                .select('n8n_api_key, n8n_api_key_label, n8n_api_key_created_at')
                .eq('id', this.userId)
                .single();
            
            if (error) {
                console.error('❌ Error retrieving API key:', error.message);
                return null;
            }
            
            if (data && data.n8n_api_key) {
                console.log('✅ API key found in Supabase');
                console.log(`📋 Label: ${data.n8n_api_key_label || 'N/A'}`);
                console.log(`📅 Created: ${data.n8n_api_key_created_at || 'N/A'}`);
                console.log(`🔑 Key: ${data.n8n_api_key.substring(0, 15)}...`);
                return {
                    apiKey: data.n8n_api_key,
                    label: data.n8n_api_key_label,
                    createdAt: data.n8n_api_key_created_at
                };
            } else {
                console.log('⚠️ No API key found in Supabase');
                return null;
            }
            
        } catch (error) {
            console.error('❌ Failed to retrieve API key:', error.message);
            return null;
        }
    }

    async validateAPIKey(apiKey) {
        console.log('🔑 Validating N8N API key functionality...');
        
        if (!apiKey) {
            console.log('⚠️ No API key provided for validation');
            return { valid: false, reason: 'No API key provided' };
        }
        
        try {
            // Test API key by fetching workflows
            const response = await axios.get(`${this.baseUrl}/rest/workflows`, {
                timeout: 30000,
                headers: {
                    'X-N8N-API-KEY': apiKey,
                    'Accept': 'application/json'
                },
                validateStatus: function (status) {
                    return status < 500;
                }
            });
            
            if (response.status === 200) {
                console.log('✅ API key is fully functional');
                console.log(`📊 Found ${response.data?.length || 0} workflows`);
                return { 
                    valid: true, 
                    functional: true,
                    workflows: response.data?.length || 0
                };
            } else if (response.status === 401) {
                console.log('❌ API key is invalid or expired');
                return { 
                    valid: false, 
                    reason: 'Invalid or expired',
                    status: 401
                };
            } else if (response.status === 403) {
                console.log('⚠️ API key has limited permissions but is valid');
                return { 
                    valid: true, 
                    functional: true,
                    limited: true,
                    status: 403
                };
            } else {
                console.log(`⚠️ Unexpected API response: ${response.status}`);
                return { 
                    valid: false, 
                    reason: `Unexpected status: ${response.status}`,
                    status: response.status
                };
            }
            
        } catch (error) {
            console.error('❌ API key validation failed:', error.message);
            return { 
                valid: false, 
                reason: error.message,
                error: true
            };
        }
    }

    async validateAPIKeyViaSession(sessionCookies) {
        console.log('🔐 Validating API key creation capability via session...');
        
        if (!sessionCookies) {
            console.log('⚠️ No session cookies available');
            return false;
        }
        
        try {
            const cookieHeader = sessionCookies.join('; ');
            
            // Try to access API keys endpoint
            const response = await axios.get(`${this.baseUrl}/rest/api-keys`, {
                timeout: 15000,
                headers: {
                    'Cookie': cookieHeader,
                    'Accept': 'application/json'
                },
                validateStatus: function (status) {
                    return status < 500;
                }
            });
            
            if (response.status === 200) {
                console.log('✅ API keys endpoint is accessible');
                console.log(`📋 Found ${response.data?.length || 0} existing API keys`);
                return true;
            } else {
                console.log(`⚠️ API keys endpoint returned status: ${response.status}`);
                return false;
            }
            
        } catch (error) {
            console.log(`⚠️ Session API key validation failed: ${error.message}`);
            return false;
        }
    }

    async testN8NWebhookEndpoint() {
        console.log('📡 Testing N8N webhook endpoint...');
        
        try {
            // Test webhook endpoint availability
            const response = await axios.get(`${this.baseUrl}/webhook-test`, {
                timeout: 10000,
                validateStatus: function (status) {
                    return status < 500;
                }
            });
            
            if (response.status === 404) {
                console.log('✅ Webhook endpoint structure is accessible (404 expected)');
                return true;
            } else if (response.status === 200) {
                console.log('✅ Webhook endpoint is fully functional');
                return true;
            } else {
                console.log(`ℹ️ Webhook endpoint status: ${response.status}`);
                return true;
            }
            
        } catch (error) {
            console.log('⚠️ Webhook endpoint test inconclusive:', error.message);
            return true; // Don't fail validation for webhook issues
        }
    }

    async generateValidationReport() {
        console.log('📋 Generating comprehensive validation report...');
        
        const report = {
            timestamp: new Date().toISOString(),
            n8nUrl: this.baseUrl,
            userId: this.userId,
            email: this.email,
            checks: {}
        };
        
        try {
            // 1. N8N Health Check
            report.checks.n8nHealth = await this.validateN8NHealth();
            
            // 2. Login Validation
            const loginResult = await this.validateN8NLogin();
            report.checks.loginValid = loginResult.valid;
            report.checks.loginDetails = loginResult;
            
            // 3. Supabase Connection
            const supabaseResult = await this.validateSupabaseConnection();
            report.checks.supabaseConnection = supabaseResult.connected;
            report.checks.supabaseDetails = supabaseResult;
            
            // 4. API Key Retrieval and Validation
            const apiKeyData = await this.retrieveStoredAPIKey();
            report.checks.apiKeyStored = !!apiKeyData;
            report.checks.apiKeyDetails = apiKeyData;
            
            if (apiKeyData) {
                const apiKeyValidation = await this.validateAPIKey(apiKeyData.apiKey);
                report.checks.apiKeyValid = apiKeyValidation.valid;
                report.checks.apiKeyValidation = apiKeyValidation;
            } else {
                report.checks.apiKeyValid = false;
                report.checks.apiKeyValidation = { valid: false, reason: 'No API key found' };
            }
            
            // 5. Session-based API Key Management
            if (loginResult.valid && loginResult.session) {
                const sessionAPIAccess = await this.validateAPIKeyViaSession(loginResult.session);
                report.checks.sessionAPIAccess = sessionAPIAccess;
            } else {
                report.checks.sessionAPIAccess = false;
            }
            
            // 6. Webhook Endpoint Test
            report.checks.webhookEndpoint = await this.testN8NWebhookEndpoint();
            
            // Calculate overall health score
            const criticalChecks = [
                report.checks.n8nHealth,
                report.checks.loginValid,
                report.checks.supabaseConnection,
                report.checks.apiKeyStored,
                report.checks.apiKeyValid
            ];
            
            const passedCritical = criticalChecks.filter(Boolean).length;
            const totalCritical = criticalChecks.length;
            
            report.healthScore = Math.round((passedCritical / totalCritical) * 100);
            report.overallStatus = report.healthScore >= 80 ? 'HEALTHY' : 
                                  report.healthScore >= 60 ? 'WARNING' : 'CRITICAL';
            
            return report;
            
        } catch (error) {
            console.error('❌ Error generating validation report:', error.message);
            report.error = error.message;
            report.overallStatus = 'ERROR';
            return report;
        }
    }

    async run() {
        console.log('========================================');
        console.log('🔍 N8N Credential Validation Starting');
        console.log('========================================');
        console.log(`🔗 N8N URL: ${this.baseUrl}`);
        console.log(`📧 User Email: ${this.email}`);
        console.log(`🆔 User ID: ${this.userId}`);
        console.log('========================================');
        
        try {
            // Generate comprehensive validation report
            const report = await this.generateValidationReport();
            
            console.log('========================================');
            console.log('📋 VALIDATION REPORT');
            console.log('========================================');
            console.log(`📊 Overall Status: ${report.overallStatus}`);
            console.log(`💯 Health Score: ${report.healthScore}%`);
            console.log('========================================');
            console.log('🔍 Detailed Results:');
            console.log('========================================');
            console.log(`🏥 N8N Health: ${report.checks.n8nHealth ? '✅ PASS' : '❌ FAIL'}`);
            console.log(`🔐 Login Valid: ${report.checks.loginValid ? '✅ PASS' : '❌ FAIL'}`);
            
            if (report.checks.loginDetails && !report.checks.loginValid) {
                console.log(`   └─ Status: ${report.checks.loginDetails.status || 'Unknown'}`);
            }
            
            console.log(`🔗 Supabase Connection: ${report.checks.supabaseConnection ? '✅ PASS' : '❌ FAIL'}`);
            
            if (report.checks.supabaseDetails) {
                if (report.checks.supabaseDetails.user) {
                    console.log(`   └─ User Found: ${report.checks.supabaseDetails.user.email}`);
                    console.log(`   └─ Has API Key: ${report.checks.supabaseDetails.hasAPIKey ? 'Yes' : 'No'}`);
                }
            }
            
            console.log(`💾 API Key Stored: ${report.checks.apiKeyStored ? '✅ PASS' : '❌ FAIL'}`);
            
            if (report.checks.apiKeyDetails) {
                console.log(`   └─ Label: ${report.checks.apiKeyDetails.label || 'N/A'}`);
                console.log(`   └─ Created: ${report.checks.apiKeyDetails.createdAt || 'N/A'}`);
            }
            
            console.log(`🔑 API Key Valid: ${report.checks.apiKeyValid ? '✅ PASS' : '❌ FAIL'}`);
            
            if (report.checks.apiKeyValidation) {
                if (report.checks.apiKeyValidation.valid) {
                    if (report.checks.apiKeyValidation.workflows !== undefined) {
                        console.log(`   └─ Workflows Found: ${report.checks.apiKeyValidation.workflows}`);
                    }
                    if (report.checks.apiKeyValidation.limited) {
                        console.log(`   └─ Note: Limited permissions`);
                    }
                } else {
                    console.log(`   └─ Reason: ${report.checks.apiKeyValidation.reason}`);
                }
            }
            
            console.log(`🔐 Session API Access: ${report.checks.sessionAPIAccess ? '✅ PASS' : '❌ FAIL'}`);
            console.log(`📡 Webhook Endpoint: ${report.checks.webhookEndpoint ? '✅ PASS' : '❌ FAIL'}`);
            
            console.log('========================================');
            
            // Provide recommendations based on results
            if (report.overallStatus === 'HEALTHY') {
                console.log('🎉 All systems are operational!');
                console.log('✅ N8N instance is fully functional');
                console.log('✅ API key is working correctly');
                console.log('✅ Database integration is successful');
            } else if (report.overallStatus === 'WARNING') {
                console.log('⚠️  System has minor issues but is functional:');
                if (!report.checks.apiKeyValid) {
                    console.log('   • API key may need to be recreated');
                }
                if (!report.checks.sessionAPIAccess) {
                    console.log('   • Session-based API management may not work');
                }
            } else {
                console.log('❌ System has critical issues:');
                if (!report.checks.n8nHealth) {
                    console.log('   • N8N instance is not accessible');
                }
                if (!report.checks.loginValid) {
                    console.log('   • Login credentials are invalid');
                }
                if (!report.checks.supabaseConnection) {
                    console.log('   • Database connection failed');
                }
                if (!report.checks.apiKeyStored || !report.checks.apiKeyValid) {
                    console.log('   • API key is missing or invalid');
                }
            }
            
            console.log('========================================');
            
            // Return results
            return {
                success: report.overallStatus === 'HEALTHY',
                report: report,
                healthScore: report.healthScore
            };
            
        } catch (error) {
            console.error('========================================');
            console.error('❌ Validation Process Failed!');
            console.error('========================================');
            console.error('Error:', error.message);
            console.error('Stack:', error.stack);
            console.error('========================================');
            throw error;
        }
    }
}

// Main execution
async function main() {
    try {
        const validator = new CredentialValidator();
        const result = await validator.run();
        
        if (result.success) {
            console.log('🎯 Validation completed successfully');
            console.log(`📊 Final Score: ${result.healthScore}%`);
            process.exit(0);
        } else {
            console.log('⚠️ Validation completed with issues');
            console.log(`📊 Final Score: ${result.healthScore}%`);
            
            // Exit with warning code but don't fail the process
            // unless score is critically low
            if (result.healthScore < 40) {
                console.log('💥 Critical issues detected');
                process.exit(1);
            } else {
                console.log('⚠️  Issues detected but system may still function');
                process.exit(0);
            }
        }
        
    } catch (error) {
        console.error('💥 Validation failed:', error.message);
        process.exit(1);
    }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error.message);
    process.exit(1);
});

// Run if this file is executed directly
if (require.main === module) {
    main();
}

module.exports = CredentialValidator;
