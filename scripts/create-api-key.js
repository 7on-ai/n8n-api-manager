const axios = require('axios');
const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

class N8NAPIManager {
    constructor() {
        // N8N Configuration
        this.baseUrl = process.env.N8N_EDITOR_BASE_URL;
        this.email = process.env.N8N_USER_EMAIL;
        this.password = process.env.N8N_USER_PASSWORD;
        this.encryptionKey = process.env.N8N_ENCRYPTION_KEY;
        
        // Supabase Configuration
        this.supabaseUrl = process.env.SUPABASE_URL;
        this.supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        
        // User Information
        this.userId = process.env.USER_ID;
        this.projectId = process.env.NORTHFLANK_PROJECT_ID;
        this.projectName = process.env.NORTHFLANK_PROJECT_NAME;
        
        // Optional webhook
        this.webhookUrl = process.env.WEBHOOK_URL;
        
        // Mode flag - if true, also store all credentials
        this.storeCredentials = process.env.STORE_API_KEY_MODE === 'true';
        
        // Initialize Supabase client
        if (this.supabaseUrl && this.supabaseKey) {
            this.supabase = createClient(this.supabaseUrl, this.supabaseKey, {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            });
        }
        
        this.validateEnvironment();
    }

    validateEnvironment() {
        const required = [
            'N8N_EDITOR_BASE_URL',
            'N8N_USER_EMAIL', 
            'N8N_USER_PASSWORD',
            'SUPABASE_URL',
            'SUPABASE_SERVICE_ROLE_KEY',
            'USER_ID'
        ];
        
        const missing = required.filter(key => !process.env[key]);
        if (missing.length > 0) {
            throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
        }
        
        console.log('✅ Environment validation passed');
        if (this.storeCredentials) {
            console.log('📦 Running in credentials storage mode');
        }
    }

    async waitForN8NReady() {
        console.log('⏳ Checking N8N availability...');
        const maxAttempts = 30;
        const delay = 10000; // 10 seconds
        
        for (let i = 0; i < maxAttempts; i++) {
            try {
                const response = await axios.get(`${this.baseUrl}/healthz`, {
                    timeout: 5000,
                    validateStatus: () => true
                });
                
                if (response.status === 200) {
                    console.log('✅ N8N is ready and accessible');
                    return true;
                }
            } catch (error) {
                console.log(`⌛ N8N not ready yet... (${i + 1}/${maxAttempts})`);
            }
            
            if (i < maxAttempts - 1) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        throw new Error('N8N instance is not accessible after maximum attempts');
    }

    async createAPIKeyViaBrowser() {
        console.log('🔧 Starting browser automation for API key creation...');
        
        const browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        });
        
        try {
            const page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 720 });
            
            // Navigate to N8N login
            console.log('🔐 Navigating to N8N login page...');
            await page.goto(`${this.baseUrl}/signin`, { 
                waitUntil: 'networkidle0',
                timeout: 30000 
            });
            
            // Login
            console.log('📝 Filling login credentials...');
            await page.waitForSelector('input[name="email"]', { timeout: 10000 });
            await page.type('input[name="email"]', this.email);
            await page.type('input[name="password"]', this.password);
            
            // Submit login
            console.log('🚀 Submitting login form...');
            await Promise.all([
                page.click('button[type="submit"]'),
                page.waitForNavigation({ waitUntil: 'networkidle0' })
            ]);
            
            // Check if login was successful
            await page.waitForTimeout(3000);
            const currentUrl = page.url();
            if (currentUrl.includes('/signin')) {
                throw new Error('Login failed - still on signin page');
            }
            
            console.log('✅ Login successful');
            
            // Navigate to settings
            console.log('⚙️ Navigating to settings...');
            await page.goto(`${this.baseUrl}/settings/api`, {
                waitUntil: 'networkidle0'
            });
            
            // Create API key
            console.log('🔑 Creating API key...');
            await page.waitForSelector('button:contains("Create an API key")', { timeout: 10000 });
            await page.click('button:contains("Create an API key")');
            
            // Fill API key form
            await page.waitForSelector('input[placeholder="API key label"]', { timeout: 5000 });
            const keyLabel = `API-${this.userId}-${Date.now()}`;
            await page.type('input[placeholder="API key label"]', keyLabel);
            
            // Set expiration (1 year)
            await page.select('select[name="expiration"]', '365');
            
            // Create the key
            await page.click('button:contains("Create API key")');
            
            // Extract the API key
            await page.waitForSelector('[data-test-id="api-key-value"]', { timeout: 10000 });
            const apiKey = await page.$eval('[data-test-id="api-key-value"]', el => el.textContent);
            
            if (!apiKey || apiKey.length < 10) {
                throw new Error('Failed to extract API key from page');
            }
            
            console.log('✅ API key created successfully');
            console.log(`📋 Key label: ${keyLabel}`);
            console.log(`🔑 API key: ${apiKey.substring(0, 10)}...`);
            
            return {
                apiKey: apiKey.trim(),
                label: keyLabel,
                createdAt: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('❌ Browser automation failed:', error.message);
            throw error;
        } finally {
            await browser.close();
        }
    }

    async createAPIKeyViaSession() {
        console.log('🔧 Creating API key via session-based authentication...');
        
        try {
            // Login to get session
            console.log('🔐 Logging in to N8N...');
            const loginResponse = await axios.post(`${this.baseUrl}/rest/login`, {
                emailOrLdapLoginId: this.email,
                password: this.password
            }, {
                timeout: 30000,
                withCredentials: true
            });
            
            if (loginResponse.status !== 200) {
                throw new Error(`Login failed with status: ${loginResponse.status}`);
            }
            
            const cookies = loginResponse.headers['set-cookie'];
            const cookieHeader = cookies?.join('; ') || '';
            console.log('✅ Session established');
            
            // Generate API key data
            const keyLabel = `API-${this.userId}-${Date.now()}`;
            const apiKey = this.generateSecureApiKey();
            
            // Try to create API key via internal endpoint
            console.log('🔑 Attempting to create API key...');
            
            const apiKeyPayload = {
                label: keyLabel,
                expiresIn: 365, // days
                scopes: ['*'] // full access for non-enterprise
            };
            
            const createResponse = await axios.post(
                `${this.baseUrl}/rest/api-keys`, 
                apiKeyPayload,
                {
                    timeout: 30000,
                    headers: {
                        'Content-Type': 'application/json',
                        'Cookie': cookieHeader
                    }
                }
            );
            
            if (createResponse.status === 201 || createResponse.status === 200) {
                console.log('✅ API key created via session');
                return {
                    apiKey: createResponse.data.apiKey || apiKey,
                    label: keyLabel,
                    createdAt: new Date().toISOString()
                };
            }
            
            throw new Error(`API key creation failed with status: ${createResponse.status}`);
            
        } catch (error) {
            console.log('⚠️ Session-based creation failed, trying browser automation...');
            return await this.createAPIKeyViaBrowser();
        }
    }

    generateSecureApiKey() {
        // Generate a secure API key similar to N8N format
        const prefix = 'n8n_api_';
        const randomBytes = crypto.randomBytes(32).toString('hex');
        return `${prefix}${randomBytes}`;
    }

    async validateAPIKey(apiKey) {
        console.log('✅ Validating API key...');
        
        try {
            const response = await axios.get(`${this.baseUrl}/rest/workflows`, {
                timeout: 15000,
                headers: {
                    'X-N8N-API-KEY': apiKey,
                    'Accept': 'application/json'
                },
                validateStatus: function (status) {
                    return status < 500; // Accept 4xx as valid responses
                }
            });
            
            if (response.status === 200 || response.status === 401 || response.status === 403) {
                console.log('✅ API key format is valid');
                return true;
            }
            
            throw new Error(`Unexpected validation response: ${response.status}`);
            
        } catch (error) {
            console.error('❌ API key validation failed:', error.message);
            return false;
        }
    }

    async checkExistingUser() {
        if (!this.supabase) {
            return null;
        }
        
        try {
            console.log('🔍 Checking if user record exists...');
            
            const { data, error } = await this.supabase
                .from('launchmvpfast-saas-starterkit_user')
                .select('id, email, n8n_api_key, n8n_api_key_label')
                .eq('id', this.userId)
                .single();
            
            if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
                throw error;
            }
            
            return data;
        } catch (error) {
            console.error('⚠️ Failed to check existing user:', error.message);
            return null;
        }
    }

    async storeCredentialsInSupabase(apiKeyData) {
        console.log('💾 Storing credentials in Supabase...');
        
        if (!this.supabase) {
            throw new Error('Supabase client not initialized');
        }
        
        const existingUser = await this.checkExistingUser();
        
        const credentialsData = {
            email: this.email,
            n8n_url: this.baseUrl,
            n8n_user_email: this.email,
            n8n_user_password: this.password,
            n8n_encryption_key: this.encryptionKey,
            n8n_api_key: apiKeyData.apiKey,
            n8n_api_key_label: apiKeyData.label,
            n8n_api_key_created_at: apiKeyData.createdAt,
            northflank_project_id: this.projectId,
            northflank_project_name: this.projectName,
            northflank_project_status: 'ready',
            template_completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        
        try {
            let result;
            
            if (existingUser) {
                console.log('📝 Updating existing user record...');
                const { data, error } = await this.supabase
                    .from('launchmvpfast-saas-starterkit_user')
                    .update(credentialsData)
                    .eq('id', this.userId)
                    .select();
                
                if (error) throw error;
                result = data;
            } else {
                console.log('🆕 Creating new user record...');
                credentialsData.id = this.userId;
                
                const { data, error } = await this.supabase
                    .from('launchmvpfast-saas-starterkit_user')
                    .insert(credentialsData)
                    .select();
                
                if (error) throw error;
                result = data;
            }
            
            console.log('✅ Credentials stored successfully');
            return result;
            
        } catch (error) {
            console.error('❌ Failed to store credentials:', error.message);
            throw error;
        }
    }

    async sendWebhookNotification(apiKeyData) {
        if (!this.webhookUrl) {
            console.log('ℹ️ No webhook URL configured, skipping notification');
            return;
        }
        
        console.log('📬 Sending webhook notification...');
        
        const notificationData = {
            status: 'success',
            message: 'N8N API key created and credentials stored successfully',
            timestamp: new Date().toISOString(),
            userId: this.userId,
            data: {
                n8nUrl: this.baseUrl,
                email: this.email,
                projectId: this.projectId,
                projectName: this.projectName,
                apiKeyLabel: apiKeyData.label,
                apiKeyCreated: apiKeyData.createdAt,
                credentialsStored: this.storeCredentials
            }
        };
        
        try {
            const response = await axios.post(this.webhookUrl, notificationData, {
                timeout: 30000,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'N8N-API-Manager/1.0'
                }
            });
            
            if (response.status >= 200 && response.status < 300) {
                console.log('✅ Webhook notification sent successfully');
            } else {
                console.log(`⚠️ Webhook returned status: ${response.status}`);
            }
            
        } catch (error) {
            console.error('❌ Webhook notification failed:', error.message);
            // Don't fail the whole process for webhook errors
        }
    }

    async run() {
        console.log('========================================');
        console.log('🚀 N8N API Manager & Credentials Storage');
        console.log('========================================');
        console.log(`📧 User Email: ${this.email}`);
        console.log(`🔗 N8N URL: ${this.baseUrl}`);
        console.log(`🆔 User ID: ${this.userId}`);
        console.log(`🏗️ Project: ${this.projectName} (${this.projectId})`);
        console.log(`📦 Store Credentials: ${this.storeCredentials ? 'Yes' : 'No'}`);
        console.log('========================================');
        
        try {
            // Wait for N8N to be ready
            await this.waitForN8NReady();
            
            // Create API key
            const apiKeyData = await this.createAPIKeyViaSession();
            
            // Validate API key
            const isValid = await this.validateAPIKey(apiKeyData.apiKey);
            if (!isValid) {
                throw new Error('Created API key failed validation');
            }
            
            // Store credentials in Supabase (this replaces the need for store-credentials-job)
            if (this.storeCredentials) {
                await this.storeCredentialsInSupabase(apiKeyData);
            }
            
            // Send webhook notification
            await this.sendWebhookNotification(apiKeyData);
            
            console.log('========================================');
            console.log('🎉 All Operations Completed Successfully!');
            console.log('========================================');
            console.log(`✅ API Key Created: ${apiKeyData.label}`);
            if (this.storeCredentials) {
                console.log(`✅ Credentials Stored in Supabase`);
            }
            console.log(`✅ Project: ${this.projectName}`);
            console.log(`✅ N8N URL: ${this.baseUrl}`);
            console.log(`✅ User: ${this.email}`);
            console.log('========================================');
            
            return {
                success: true,
                apiKey: apiKeyData.apiKey,
                label: apiKeyData.label
            };
            
        } catch (error) {
            console.error('========================================');
            console.error('❌ N8N API Management Failed!');
            console.error('========================================');
            console.error('Error:', error.message);
            
            // Try to update status as failed in Supabase
            if (this.storeCredentials && this.supabase) {
                try {
                    await this.supabase
                        .from('launchmvpfast-saas-starterkit_user')
                        .update({
                            northflank_project_status: 'failed',
                            n8n_setup_error: error.message,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', this.userId);
                } catch (updateError) {
                    console.error('Failed to update error status:', updateError.message);
                }
            }
            
            console.error('========================================');
            throw error;
        }
    }
}

// Main execution
async function main() {
    try {
        const manager = new N8NAPIManager();
        await manager.run();
        process.exit(0);
    } catch (error) {
        console.error('💥 Process failed:', error.message);
        process.exit(1);
    }
}

// Run if this file is executed directly
if (require.main === module) {
    main();
}

module.exports = N8NAPIManager;
