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
            'N8N_USER_EMAIL', 
            'N8N_USER_PASSWORD',
            'SUPABASE_URL',
            'SUPABASE_SERVICE_ROLE_KEY',
            'USER_ID'
        ];
        
        // Check for N8N URL (either variable name)
        if (!this.baseUrl) {
            throw new Error('Missing N8N URL: Set either N8N_EDITOR_BASE_URL or N8N_URL');
        }
        
        const missing = required.filter(key => !process.env[key]);
        if (missing.length > 0) {
            throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
        }
        
        console.log('✅ Environment validation passed');
        console.log(`🔗 Using N8N URL: ${this.baseUrl}`);
    }

    async waitForN8NReady() {
        console.log('⏳ Checking N8N availability...');
        const maxAttempts = 30;
        const delay = 10000; // 10 seconds
        
        for (let i = 0; i < maxAttempts; i++) {
            try {
                // Try multiple health endpoints
                const endpoints = ['/healthz', '/healthz/readiness', '/'];
                
                for (const endpoint of endpoints) {
                    try {
                        const response = await axios.get(`${this.baseUrl}${endpoint}`, {
                            timeout: 8000,
                            validateStatus: () => true
                        });
                        
                        if (response.status === 200) {
                            console.log(`✅ N8N is ready and accessible via ${endpoint}`);
                            // Additional wait for full initialization
                            await new Promise(resolve => setTimeout(resolve, 15000));
                            return true;
                        }
                    } catch (error) {
                        continue;
                    }
                }
                
                console.log(`⌛ N8N not ready yet... (${i + 1}/${maxAttempts})`);
                
            } catch (error) {
                console.log(`⌛ N8N health check failed... (${i + 1}/${maxAttempts})`);
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
                '--disable-gpu',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor'
            ]
        });
        
        try {
            const page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 720 });
            
            // Set longer timeouts
            page.setDefaultTimeout(60000);
            page.setDefaultNavigationTimeout(60000);
            
            // Navigate to N8N login
            console.log('🔐 Navigating to N8N login page...');
            await page.goto(`${this.baseUrl}/signin`, { 
                waitUntil: 'networkidle2',
                timeout: 45000 
            });
            
            // Wait for login form to be fully loaded
            console.log('⏳ Waiting for login form...');
            await page.waitForSelector('input[name="email"], input[type="email"], input[placeholder*="email" i]', { 
                timeout: 20000 
            });
            
            // Try multiple selectors for email input
            const emailSelectors = [
                'input[name="email"]',
                'input[type="email"]',
                'input[placeholder*="email" i]',
                'input[data-test-id="email"]',
                '.n8n-input input[type="email"]',
                '#email'
            ];
            
            let emailInput = null;
            for (const selector of emailSelectors) {
                try {
                    emailInput = await page.$(selector);
                    if (emailInput) {
                        console.log(`📧 Found email input with selector: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            if (!emailInput) {
                throw new Error('Could not find email input field');
            }
            
            // Clear and fill email
            await emailInput.click({ clickCount: 3 });
            await emailInput.type(this.email);
            
            // Try multiple selectors for password input
            const passwordSelectors = [
                'input[name="password"]',
                'input[type="password"]',
                'input[placeholder*="password" i]',
                'input[data-test-id="password"]',
                '.n8n-input input[type="password"]',
                '#password'
            ];
            
            let passwordInput = null;
            for (const selector of passwordSelectors) {
                try {
                    passwordInput = await page.$(selector);
                    if (passwordInput) {
                        console.log(`🔒 Found password input with selector: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            if (!passwordInput) {
                throw new Error('Could not find password input field');
            }
            
            // Clear and fill password
            await passwordInput.click({ clickCount: 3 });
            await passwordInput.type(this.password);
            
            console.log('📝 Credentials filled successfully');
            
            // Submit login with multiple strategies
            console.log('🚀 Submitting login form...');
            const submitSelectors = [
                'button[type="submit"]',
                'button:contains("Sign in")',
                'button:contains("Login")',
                '.n8n-button[type="submit"]',
                'form button:last-of-type'
            ];
            
            let loginSubmitted = false;
            for (const selector of submitSelectors) {
                try {
                    const submitButton = await page.$(selector);
                    if (submitButton) {
                        console.log(`🔘 Found submit button with selector: ${selector}`);
                        await Promise.all([
                            submitButton.click(),
                            page.waitForNavigation({ 
                                waitUntil: 'networkidle2',
                                timeout: 45000 
                            })
                        ]);
                        loginSubmitted = true;
                        break;
                    }
                } catch (e) {
                    console.log(`Failed submit strategy: ${selector}`);
                    continue;
                }
            }
            
            if (!loginSubmitted) {
                // Try Enter key as fallback
                await passwordInput.press('Enter');
                await page.waitForNavigation({ 
                    waitUntil: 'networkidle2',
                    timeout: 45000 
                });
            }
            
            // Check if login was successful
            await page.waitForTimeout(5000);
            const currentUrl = page.url();
            console.log(`Current URL after login: ${currentUrl}`);
            
            if (currentUrl.includes('/signin') || currentUrl.includes('/login')) {
                // Try to get error messages
                const errorElements = await page.$$('.error, .alert, .warning, [class*="error"]');
                if (errorElements.length > 0) {
                    const errorText = await errorElements[0].textContent();
                    throw new Error(`Login failed with error: ${errorText}`);
                }
                throw new Error('Login failed - still on signin page');
            }
            
            console.log('✅ Login successful');
            
            // Navigate to settings/api with retries
            console.log('⚙️ Navigating to API settings...');
            let settingsNavigated = false;
            const settingsUrls = [
                `${this.baseUrl}/settings/api`,
                `${this.baseUrl}/settings/users-and-api`,
                `${this.baseUrl}/settings`
            ];
            
            for (const settingsUrl of settingsUrls) {
                try {
                    await page.goto(settingsUrl, {
                        waitUntil: 'networkidle2',
                        timeout: 30000
                    });
                    
                    // Check if we're on the right page
                    const pageContent = await page.content();
                    if (pageContent.includes('API') || pageContent.includes('api')) {
                        console.log(`✅ Successfully navigated to: ${settingsUrl}`);
                        settingsNavigated = true;
                        break;
                    }
                } catch (e) {
                    console.log(`Failed to navigate to: ${settingsUrl}`);
                    continue;
                }
            }
            
            if (!settingsNavigated) {
                // Try to find API settings via menu navigation
                console.log('🔍 Trying to find API settings via navigation...');
                await page.goto(`${this.baseUrl}`, { waitUntil: 'networkidle2' });
                
                // Look for settings menu
                const settingsLinks = await page.$$('a[href*="settings"], button[href*="settings"], .menu-item:contains("Settings")');
                if (settingsLinks.length > 0) {
                    await settingsLinks[0].click();
                    await page.waitForTimeout(3000);
                    
                    // Look for API submenu
                    const apiLinks = await page.$$('a[href*="api"], button[href*="api"], .menu-item:contains("API")');
                    if (apiLinks.length > 0) {
                        await apiLinks[0].click();
                        await page.waitForTimeout(3000);
                    }
                }
            }
            
            // Create API key with multiple strategies
            console.log('🔑 Creating API key...');
            const createButtonSelectors = [
                'button:contains("Create an API key")',
                'button:contains("Create API key")',
                'button:contains("New API key")',
                'button:contains("Add API key")',
                '.n8n-button:contains("Create")',
                '[data-test-id="create-api-key"]',
                'button[class*="create"]'
            ];
            
            let createButtonFound = false;
            for (const selector of createButtonSelectors) {
                try {
                    await page.waitForSelector(selector, { timeout: 5000 });
                    await page.click(selector);
                    console.log(`✅ Found create button with selector: ${selector}`);
                    createButtonFound = true;
                    break;
                } catch (e) {
                    continue;
                }
            }
            
            if (!createButtonFound) {
                throw new Error('Could not find API key creation button');
            }
            
            await page.waitForTimeout(3000);
            
            // Fill API key form
            console.log('📝 Filling API key form...');
            const keyLabel = `API-${this.userId}-${Date.now()}`;
            
            const labelSelectors = [
                'input[placeholder="API key label"]',
                'input[name="label"]',
                'input[placeholder*="label" i]',
                'input[data-test-id="api-key-label"]',
                '.n8n-input input[type="text"]'
            ];
            
            let labelInput = null;
            for (const selector of labelSelectors) {
                try {
                    labelInput = await page.$(selector);
                    if (labelInput) {
                        console.log(`📋 Found label input with selector: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            if (labelInput) {
                await labelInput.click({ clickCount: 3 });
                await labelInput.type(keyLabel);
                console.log(`✅ Set API key label: ${keyLabel}`);
            } else {
                console.log('⚠️ Could not find label input, proceeding without custom label');
            }
            
            // Set expiration if available
            try {
                const expirationSelectors = [
                    'select[name="expiration"]',
                    'select[placeholder*="expiration" i]',
                    '.n8n-select select'
                ];
                
                for (const selector of expirationSelectors) {
                    try {
                        const expirationSelect = await page.$(selector);
                        if (expirationSelect) {
                            await expirationSelect.select('365'); // 1 year
                            console.log('✅ Set expiration to 1 year');
                            break;
                        }
                    } catch (e) {
                        continue;
                    }
                }
            } catch (e) {
                console.log('⚠️ Could not set expiration, using default');
            }
            
            // Submit API key creation
            const submitCreateSelectors = [
                'button:contains("Create API key")',
                'button:contains("Create")',
                'button:contains("Save")',
                'button[type="submit"]',
                '.n8n-button:contains("Create")'
            ];
            
            let createSubmitted = false;
            for (const selector of submitCreateSelectors) {
                try {
                    const submitButton = await page.$(selector);
                    if (submitButton) {
                        await submitButton.click();
                        console.log(`✅ Clicked create button: ${selector}`);
                        createSubmitted = true;
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            if (!createSubmitted) {
                throw new Error('Could not submit API key creation form');
            }
            
            // Wait for API key to be generated
            await page.waitForTimeout(5000);
            
            // Extract the API key with multiple strategies
            console.log('🔍 Extracting API key...');
            const apiKeySelectors = [
                '[data-test-id="api-key-value"]',
                'input[readonly][value*="n8n_api_"]',
                'code:contains("n8n_api_")',
                '.api-key-value',
                '.token-display',
                'input[type="text"][readonly]',
                '.n8n-input input[readonly]'
            ];
            
            let apiKey = null;
            for (const selector of apiKeySelectors) {
                try {
                    await page.waitForSelector(selector, { timeout: 10000 });
                    const element = await page.$(selector);
                    if (element) {
                        const value = await element.evaluate(el => {
                            return el.textContent || el.value || el.innerText;
                        });
                        if (value && value.includes('n8n_api_')) {
                            apiKey = value.trim();
                            console.log(`✅ Found API key with selector: ${selector}`);
                            break;
                        }
                    }
                } catch (e) {
                    continue;
                }
            }
            
            // Fallback: search for any text containing n8n_api_
            if (!apiKey) {
                console.log('🔍 Searching for API key in page content...');
                const pageContent = await page.content();
                const apiKeyMatch = pageContent.match(/n8n_api_[a-f0-9]{64}/i);
                if (apiKeyMatch) {
                    apiKey = apiKeyMatch[0];
                    console.log('✅ Found API key in page content');
                }
            }
            
            if (!apiKey || apiKey.length < 10) {
                throw new Error('Failed to extract API key from page');
            }
            
            console.log('✅ API key created successfully');
            console.log(`📋 Key label: ${keyLabel}`);
            console.log(`🔑 API key: ${apiKey.substring(0, 15)}...`);
            
            return {
                apiKey: apiKey.trim(),
                label: keyLabel,
                createdAt: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('❌ Browser automation failed:', error.message);
            
            // Take screenshot for debugging
            try {
                await page.screenshot({ 
                    path: '/tmp/n8n-error.png', 
                    fullPage: true 
                });
                console.log('📷 Error screenshot saved to /tmp/n8n-error.png');
            } catch (screenshotError) {
                console.log('Could not take error screenshot');
            }
            
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
                withCredentials: true,
                validateStatus: function (status) {
                    return status < 500;
                }
            });
            
            if (loginResponse.status !== 200) {
                console.log(`Login failed with status: ${loginResponse.status}, trying browser method...`);
                return await this.createAPIKeyViaBrowser();
            }
            
            const cookies = loginResponse.headers['set-cookie'];
            const cookieHeader = cookies?.join('; ') || '';
            console.log('✅ Session established');
            
            // Generate API key data
            const keyLabel = `API-${this.userId}-${Date.now()}`;
            
            // Try to create API key via internal endpoint
            console.log('🔑 Attempting to create API key...');
            
            const apiKeyPayload = {
                label: keyLabel,
                expiresIn: 365 // days
            };
            
            const createResponse = await axios.post(
                `${this.baseUrl}/rest/api-keys`, 
                apiKeyPayload,
                {
                    timeout: 30000,
                    headers: {
                        'Content-Type': 'application/json',
                        'Cookie': cookieHeader,
                        'Accept': 'application/json'
                    },
                    validateStatus: function (status) {
                        return status < 500;
                    }
                }
            );
            
            if (createResponse.status === 201 || createResponse.status === 200) {
                console.log('✅ API key created via session');
                const responseData = createResponse.data;
                const apiKey = responseData.apiKey || responseData.key || responseData.token;
                
                if (apiKey) {
                    return {
                        apiKey: apiKey,
                        label: keyLabel,
                        createdAt: new Date().toISOString()
                    };
                }
            }
            
            console.log(`Session method failed with status: ${createResponse.status}, trying browser automation...`);
            return await this.createAPIKeyViaBrowser();
            
        } catch (error) {
            console.log('⚠️ Session-based creation failed, trying browser automation...');
            console.log(`Error: ${error.message}`);
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
            
            if (response.status === 200) {
                console.log('✅ API key is fully functional');
                return true;
            } else if (response.status === 401) {
                console.log('❌ API key is invalid or expired');
                return false;
            } else if (response.status === 403) {
                console.log('✅ API key is valid but has limited permissions');
                return true; // Still functional, just limited
            }
            
            console.log(`⚠️ Unexpected validation response: ${response.status}`);
            return false;
            
        } catch (error) {
            console.error('❌ API key validation failed:', error.message);
            return false;
        }
    }

    async storeAPIKeyInSupabase(apiKeyData) {
        console.log('💾 Storing API key in Supabase...');
        
        if (!this.supabase) {
            throw new Error('Supabase client not initialized');
        }
        
        const updateData = {
            n8n_api_key: apiKeyData.apiKey,
            n8n_api_key_label: apiKeyData.label,
            n8n_api_key_created_at: apiKeyData.createdAt,
            updated_at: new Date().toISOString()
        };
        
        try {
            const { data, error } = await this.supabase
                .from('launchmvpfast-saas-starterkit_user')
                .update(updateData)
                .eq('id', this.userId)
                .select();
            
            if (error) {
                throw error;
            }
            
            console.log('✅ API key stored successfully in Supabase');
            return data;
            
        } catch (error) {
            console.error('❌ Failed to store API key:', error.message);
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
            message: 'N8N API key created successfully',
            timestamp: new Date().toISOString(),
            userId: this.userId,
            data: {
                n8nUrl: this.baseUrl,
                email: this.email,
                projectId: this.projectId,
                projectName: this.projectName,
                apiKeyLabel: apiKeyData.label,
                apiKeyCreated: apiKeyData.createdAt,
                apiKey: apiKeyData.apiKey.substring(0, 15) + '...' // Partial key for security
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
        console.log('🚀 N8N API Manager Starting...');
        console.log('========================================');
        console.log(`📧 User Email: ${this.email}`);
        console.log(`🔗 N8N URL: ${this.baseUrl}`);
        console.log(`🆔 User ID: ${this.userId}`);
        console.log(`🏗️ Project: ${this.projectName} (${this.projectId})`);
        console.log('========================================');
        
        try {
            // Wait for N8N to be ready
            await this.waitForN8NReady();
            
            // Create API key (try session method first, fallback to browser)
            let apiKeyData;
            try {
                apiKeyData = await this.createAPIKeyViaSession();
            } catch (error) {
                console.log('⚠️ Session method failed, using browser automation');
                apiKeyData = await this.createAPIKeyViaBrowser();
            }
            
            // Validate API key
            const isValid = await this.validateAPIKey(apiKeyData.apiKey);
            if (!isValid) {
                throw new Error('Created API key failed validation');
            }
            
            // Store in Supabase
            await this.storeAPIKeyInSupabase(apiKeyData);
            
            // Send webhook notification
            await this.sendWebhookNotification(apiKeyData);
            
            console.log('========================================');
            console.log('🎉 N8N API Management Completed Successfully!');
            console.log('========================================');
            console.log(`✅ API Key Created: ${apiKeyData.label}`);
            console.log(`✅ API Key Validated: Working correctly`);
            console.log(`✅ Credentials Stored in Supabase`);
            console.log(`✅ Project: ${this.projectName}`);
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
            console.error('Stack:', error.stack);
            console.error('========================================');
            
            // Try to update error status in Supabase
            if (this.supabase) {
                try {
                    await this.supabase
                        .from('launchmvpfast-saas-starterkit_user')
                        .update({
                            n8n_setup_error: error.message,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', this.userId);
                } catch (updateError) {
                    console.error('Failed to update error status:', updateError.message);
                }
            }
            
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

module.exports = N8NAPIManager;
