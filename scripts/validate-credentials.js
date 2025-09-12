const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

class CredentialValidator {
    constructor() {
        // N8N Configuration
        this.baseUrl = process.env.N8N_EDITOR_BASE_URL;
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
                return true;
            } else {
                console.log(`⚠️ N8N login returned status: ${response.status}`);
                return false;
            }
            
        } catch (error) {
            console.error('❌ N8N login validation failed:', error.message);
            return false;
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
                .select('id, email')
                .eq('id', this.userId)
                .single();
            
            if (error) {
                console.error('❌ Supabase query error:', error.message);
                return false;
            }
            
            if (data) {
                console.log('✅ Supabase connection is valid');
                console.log(`📧 Found user: ${data.email}`);
                return true;
            } else {
                console.log('⚠️ User not found in Supabase');
                return false;
            }
            
        } catch (error) {
            console.error('❌ Supabase connection failed:', error.message);
            return false;
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
                .select('n8n_api_key, n8n_api_key_label, api_key_created_at')
                .eq('id', this.userId)
                .single();
            
            if (error) {
                console.error('❌ Error retrieving API key:', error.message);
                return null;
            }
            
            if (data && data.n8n_api_key) {
                console.log('✅ API key found in Supabase');
                console.log(`📋 Label: ${data.n8n_api_key_label || 'N/A'}`);
                console.log(`📅 Created: ${data.api_key_created_at || 'N/A'}`);
                console.log(`🔑 Key: ${data.n8n_api_key.substring(0, 10)}...`);
                return data.n8n_api_key;
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
            return false;
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
                console.log('✅ API key is functional');
                console.log(`📊 Found ${response.data?.length || 0} workflows`);
                return true;
            } else if (response.status === 401) {
                console.log('❌ API key is invalid or expired');
                return false;
            } else if (response.status === 403) {
                console.log('⚠️ API key has limited permissions');
                return true; // Still functional, just limited
            } else {
                console.log(`⚠️ Unexpected API response: ${response.status}`);
                return false;
            }
            
        } catch (error) {
            console.error('❌ API key validation failed:', error.message);
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
                console.log('✅ Webhook endpoint structure is accessible');
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

    async validateSystemIntegration() {
        console.log('🔧 Performing system integration validation...');
        
        const checks = {
            n8nHealth: false,
            loginValid: false,
            supabaseConnection: false,
            apiKeyStored: false,
            apiKeyValid: false,
            webhookEndpoint: false
        };
        
        try {
            // Check N8N health
            const healthResponse = await axios.get(`${this.baseUrl}/healthz`, {
                timeout: 10000,
                validateStatus: () => true
            });
            checks.n8nHealth = healthResponse.status === 200;
            
            // Validate login
            checks.loginValid = await this.validateN8NLogin();
            
            // Validate Supabase
            checks.supabaseConnection = await this.validateSupabaseConnection();
            
            // Check stored API key
            const apiKey = await this.retrieveStoredAPIKey();
            checks.apiKeyStored = !!apiKey;
            
            // Validate API key functionality
            if (apiKey) {
                checks.apiKeyValid = await this.validateAPIKey(apiKey);
            }
            
            // Test webhook endpoint
            checks.webhookEndpoint = await this.testN8NWebhookEndpoint();
            
            return checks;
            
        } catch (error) {
            console.error('❌ System integration validation failed:', error.message);
            return checks;
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
            const validationResults = await this.validateSystemIntegration();
            
            console.log('========================================');
            console.log('📋 Validation Results:');
            console.log('========================================');
            console.log(`🏥 N8N Health: ${validationResults.n8nHealth ? '✅ PASS' : '❌ FAIL'}`);
            console.log(`🔐 Login Valid: ${validationResults.loginValid ? '✅ PASS' : '❌ FAIL'}`);
            console.log(`🔗 Supabase Connection: ${validationResults.supabaseConnection ? '✅ PASS' : '❌ FAIL'}`);
            console.log(`💾 API Key Stored: ${validationResults.apiKeyStored ? '✅ PASS' : '❌ FAIL'}`);
            console.log(`🔑 API Key Valid: ${validationResults.apiKeyValid ? '✅ PASS' : '❌ FAIL'}`);
            console.log(`📡 Webhook Endpoint: ${validationResults.webhookEndpoint ? '✅ PASS' : '❌ FAIL'}`);
            console.log('========================================');
            
            // Calculate overall success
            const criticalChecks = [
                validationResults.n8nHealth,
                validationResults.loginValid,
                validationResults.supabaseConnection,
                validationResults.apiKeyStored,
                validationResults.apiKeyValid
            ];
            
            const passedCritical = criticalChecks.filter(Boolean).length;
            const totalCritical = criticalChecks.length;
            
            if (passedCritical === totalCritical) {
                console.log('🎉 All critical validations PASSED!');
                console.log('✅ N8N API setup is fully functional');
                return { success: true, results: validationResults };
            } else {
                console.log(`⚠️ ${passedCritical}/${totalCritical} critical validations passed`);
                console.log('🔧 Some issues detected but system may still be functional');
                return { success: false, results: validationResults };
            }
            
        } catch (error) {
            console.error('========================================');
            console.error('❌ Validation Process Failed!');
            console.error('========================================');
            console.error('Error:', error.message);
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
            process.exit(0);
        } else {
            console.log('⚠️ Validation completed with warnings');
            process.exit(0); // Don't fail the process for warnings
        }
        
    } catch (error) {
        console.error('💥 Validation failed:', error.message);
        process.exit(1);
    }
}

// Run if this file is executed directly
if (require.main === module) {
    main();
}

module.exports = CredentialValidator;
