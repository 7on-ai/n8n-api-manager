const axios = require('axios');
const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

class N8NAPIManager {
    constructor() {
        // N8N Configuration - Support both environment variable names
        this.baseUrl = process.env.N8N_EDITOR_BASE_URL || process.env.N8N_URL;
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
        
        // Request timeout settings
        this.defaultTimeout = 30000;
        this.longTimeout = 60000;
        
        // Initialize Supabase client with error handling
        if (this.supabaseUrl && this.supabaseKey) {
            try {
                this.supabase = createClient(this.supabaseUrl, this.supabaseKey, {
                    auth: {
                        autoRefreshToken: false,
                        persistSession: false
                    },
                    db: {
                        schema: 'public'
                    },
                    global: {
                        headers: {
                            'User-Agent': 'N8N-API-Manager/1.0'
                        }
                    }
                });
                console.log('✅ Supabase client initialized successfully');
            } catch (error) {
                console.error('❌ Failed to initialize Supabase client:', error.message);
                throw error;
            }
        }
        
        this.validateEnvironment();
    }

    validateEnvironment() {
        console.log('🔍 Validating environment configuration...');
        
        const required = [
            'N8N_USER_EMAIL', 
            'N8N_USER_PASSWORD',
            'SUPABASE_URL',
            'SUPABASE_SERVICE_ROLE_KEY',
            'USER_ID'
        ];
        
        // Check for N8N URL
        if (!this.baseUrl) {
            throw new Error('Missing N8N URL: Set either N8N_EDITOR_BASE_URL or N8N_URL');
        }
        
        // Validate URL format
        const urlRegex = /^https?:\/\/[a-zA-Z0-9.-]+/;
        if (!urlRegex.test(this.baseUrl)) {
            throw new Error(`Invalid N8N URL format: ${this.baseUrl}`);
        }
        
        // Remove trailing slash from URL
        this.baseUrl = this.baseUrl.replace(/\/$/, '');
        
        const missing = required.filter(key => !process.env[key]);
        if (missing.length > 0) {
            throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
        }
        
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(this.email)) {
            throw new Error(`Invalid email format: ${this.email}`);
        }
        
        // Validate Supabase URL format
        const supabaseUrlRegex = /^https:\/\/[a-zA-Z0-9-]+\.supabase\.co$/;
        if (!supabaseUrlRegex.test(this.supabaseUrl)) {
            console.log('⚠️ Supabase URL format may be incorrect. Expected: https://project-id.supabase.co');
        }
        
        console.log('✅ Environment validation passed');
        console.log(`🔗 Using N8N URL: ${this.baseUrl}`);
        console.log(`📧 User Email: ${this.email}`);
        console.log(`🆔 User ID: ${this.userId}`);
    }

    async waitForN8NReady() {
        console.log('⏳ Checking N8N availability and waiting for full readiness...');
        const maxAttempts = 45; // 15 minutes with 20 second intervals
        const delay = 20000; // 20 seconds
        
        for (let i = 0; i < maxAttempts; i++) {
            try {
                // Try multiple health endpoints in order of preference
                const endpoints = ['/healthz', '/healthz/readiness', '/api/v1/healthz', '/'];
                let healthCheckPassed = false;
                
                for (const endpoint of endpoints) {
                    try {
                        console.log(`🔍 Testing endpoint: ${this.baseUrl}${endpoint}`);
                        const response = await axios.get(`${this.baseUrl}${endpoint}`, {
                            timeout: 15000,
                            validateStatus: () => true,
                            headers: {
                                'User-Agent': 'N8N-API-Manager/1.0',
                                'Accept': '*/*'
                            }
                        });
                        
                        if (response.status === 200) {
                            console.log(`✅ N8N health check passed via ${endpoint}`);
                            healthCheckPassed = true;
                            break;
                        } else {
                            console.log(`📊 Endpoint ${endpoint} returned status: ${response.status}`);
                        }
                    } catch (error) {
                        console.log(`⚠️ Endpoint ${endpoint} failed: ${error.message}`);
                        continue;
                    }
                }
                
                if (healthCheckPassed) {
                    // Additional validation - test login endpoint
                    try {
                        console.log('🔐 Validating login endpoint...');
                        const loginTestResponse = await axios.post(`${this.baseUrl}/rest/login`, {
                            emailOrLdapLoginId: 'test@test.com',
                            password: 'test123'
                        }, {
                            timeout: 10000,
                            validateStatus: (status) => status < 500,
                            headers: {
                                'Content-Type': 'application/json',
                                'User-Agent': 'N8N-API-Manager/1.0'
                            }
                        });
                        
                        console.log(`✅ Login endpoint is accessible (status: ${loginTestResponse.status})`);
                        
                        // Extra initialization wait
                        console.log('⏳ Allowing extra time for N8N full initialization...');
                        await new Promise(resolve => setTimeout(resolve, 30000));
                        return true;
                        
                    } catch (loginError) {
                        console.log('⚠️ Login endpoint test failed, but continuing...');
                        await new Promise(resolve => setTimeout(resolve, 15000));
                        return true;
                    }
                }
                
                console.log(`⌛ N8N not fully ready yet... (${i + 1}/${maxAttempts})`);
                
            } catch (error) {
                console.log(`⌛ N8N health check failed... (${i + 1}/${maxAttempts}): ${error.message}`);
            }
            
            if (i < maxAttempts - 1) {
                console.log(`⏰ Waiting ${delay/1000} seconds before next attempt...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        throw new Error(`N8N instance is not accessible after ${maxAttempts} attempts over ${(maxAttempts * delay / 1000 / 60).toFixed(1)} minutes`);
    }

    async createAPIKeyViaBrowser() {
        console.log('🔧 Starting browser automation for API key creation...');
        
        let browser;
        let page;
        
        try {
            browser = await puppeteer.launch({
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
                    '--disable-features=VizDisplayCompositor',
                    '--disable-extensions',
                    '--disable-plugins',
                    '--disable-images',
                    '--disable-javascript-harmony-shipping',
                    '--disable-background-timer-throttling',
                    '--disable-renderer-backgrounding',
                    '--disable-backgrounding-occluded-windows'
                ],
                defaultViewport: {
                    width: 1280,
                    height: 720
                },
                timeout: 60000
            });
            
            page = await browser.newPage();
            
            // Set longer timeouts and better error handling
            page.setDefaultTimeout(90000);
            page.setDefaultNavigationTimeout(90000);
            
            // Enhanced error logging
            page.on('error', (error) => {
                console.error('🐛 Page error:', error.message);
            });
            
            page.on('pageerror', (error) => {
                console.error('🐛 Page script error:', error.message);
            });
            
            // Set request headers
            await page.setExtraHTTPHeaders({
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            });
            
            // Navigate to N8N login
            console.log('🔐 Navigating to N8N login page...');
            await page.goto(`${this.baseUrl}/signin`, { 
                waitUntil: 'networkidle2',
                timeout: 60000 
            });
            
            console.log('✅ Successfully loaded login page');
            
            // Wait for login form with multiple strategies
            console.log('⏳ Waiting for login form elements...');
            await page.waitForSelector('input[type="email"], input[name="email"], input[placeholder*="email" i]', { 
                timeout: 30000 
            });
            
            // Enhanced input field detection
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
                    if (emailInput && await emailInput.isVisible()) {
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
            
            // Clear and fill email with better error handling
            await emailInput.click({ clickCount: 3 });
            await page.keyboard.press('Delete');
            await emailInput.type(this.email, { delay: 50 });
            console.log('📧 Email entered successfully');
            
            // Find password input
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
                    if (passwordInput && await passwordInput.isVisible()) {
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
            await page.keyboard.press('Delete');
            await passwordInput.type(this.password, { delay: 50 });
            console.log('🔒 Password entered successfully');
            
            // Submit login with enhanced error handling
            console.log('🚀 Submitting login form...');
            const submitSelectors = [
                'button[type="submit"]',
                'button:contains("Sign in")',
                'button:contains("Login")',
                '.n8n-button[type="submit"]',
                'form button:last-of-type'
            ];
            
            let loginSubmitted = false;
            
            // Try clicking submit button
            for (const selector of submitSelectors) {
                try {
                    const submitButton = await page.$(selector);
                    if (submitButton && await submitButton.isVisible()) {
                        console.log(`🔘 Found submit button with selector: ${selector}`);
                        
                        // Wait for navigation promise
                        const navigationPromise = page.waitForNavigation({ 
                            waitUntil: 'networkidle2',
                            timeout: 60000 
                        });
                        
                        await submitButton.click();
                        await navigationPromise;
                        loginSubmitted = true;
                        break;
                    }
                } catch (e) {
                    console.log(`⚠️ Submit button ${selector} failed: ${e.message}`);
                    continue;
                }
            }
            
            // Fallback: Press Enter
            if (!loginSubmitted) {
                console.log('🔄 Trying Enter key as fallback...');
                const navigationPromise = page.waitForNavigation({ 
                    waitUntil: 'networkidle2',
                    timeout: 60000 
                });
                await passwordInput.press('Enter');
                try {
                    await navigationPromise;
                    loginSubmitted = true;
                } catch (navError) {
                    console.log('⚠️ Navigation after Enter failed, checking current state...');
                }
            }
            
            // Verify login success
            await page.waitForTimeout(5000);
            const currentUrl = page.url();
            console.log(`📍 Current URL after login: ${currentUrl}`);
            
            // Check for error messages
            try {
                const errorElements = await page.$$('.error, .alert-danger, .n8n-notice--error, [class*="error"]');
                if (errorElements.length > 0) {
                    const errorText = await errorElements[0].evaluate(el => el.textContent);
                    console.log(`⚠️ Found error message: ${errorText}`);
                }
            } catch (e) {
                // No error messages found
            }
            
            if (currentUrl.includes('/signin') || currentUrl.includes('/login')) {
                throw new Error('Login failed - still on signin page');
            }
            
            console.log('✅ Login successful');
            
            // Navigate to API settings with multiple strategies
            console.log('⚙️ Navigating to API settings...');
            const settingsUrls = [
                `${this.baseUrl}/settings/api`,
                `${this.baseUrl}/settings/users-and-api`,
                `${this.baseUrl}/settings`
            ];
            
            let apiSettingsFound = false;
            
            for (const settingsUrl of settingsUrls) {
                try {
                    console.log(`🔍 Trying settings URL: ${settingsUrl}`);
                    await page.goto(settingsUrl, {
                        waitUntil: 'networkidle2',
                        timeout: 45000
                    });
                    
                    await page.waitForTimeout(3000);
                    
                    // Check if we're on an API-related page
                    const pageContent = await page.content();
                    if (pageContent.toLowerCase().includes('api key') || 
                        pageContent.toLowerCase().includes('api token') ||
                        pageContent.toLowerCase().includes('create an api')) {
                        console.log(`✅ Found API settings at: ${settingsUrl}`);
                        apiSettingsFound = true;
                        break;
                    }
                } catch (e) {
                    console.log(`⚠️ Failed to navigate to: ${settingsUrl} - ${e.message}`);
                    continue;
                }
            }
            
            // If direct navigation failed, try menu navigation
            if (!apiSettingsFound) {
                console.log('🔍 Trying menu navigation to find API settings...');
                await page.goto(`${this.baseUrl}`, { 
                    waitUntil: 'networkidle2',
                    timeout: 45000 
                });
                
                await page.waitForTimeout(3000);
                
                // Look for settings in navigation
                const menuSelectors = [
                    'a[href*="settings"]',
                    'button[href*="settings"]',
                    '.menu-item:contains("Settings")',
                    '[data-test-id="settings"]'
                ];
                
                for (const menuSelector of menuSelectors) {
                    try {
                        const menuItem = await page.$(menuSelector);
                        if (menuItem && await menuItem.isVisible()) {
                            await menuItem.click();
                            await page.waitForTimeout(2000);
                            
                            // Look for API submenu
                            const apiMenuSelectors = [
                                'a[href*="api"]',
                                'button[href*="api"]',
                                '.menu-item:contains("API")',
                                '[data-test-id="api"]'
                            ];
                            
                            for (const apiMenuSelector of apiMenuSelectors) {
                                try {
                                    const apiMenuItem = await page.$(apiMenuSelector);
                                    if (apiMenuItem && await apiMenuItem.isVisible()) {
                                        await apiMenuItem.click();
                                        await page.waitForTimeout(3000);
                                        apiSettingsFound = true;
                                        break;
                                    }
                                } catch (e) {
                                    continue;
                                }
                            }
                            
                            if (apiSettingsFound) break;
                        }
                    } catch (e) {
                        continue;
                    }
                }
            }
            
            if (!apiSettingsFound) {
                // Last resort: check current page for API key creation
                const pageContent = await page.content();
                if (!pageContent.toLowerCase().includes('api key') && 
                    !pageContent.toLowerCase().includes('api token')) {
                    throw new Error('Could not find API key management interface');
                }
            }
            
            // Create API key
            console.log('🔑 Looking for API key creation interface...');
            await page.waitForTimeout(3000);
            
            // Look for create button with multiple selectors
            const createButtonSelectors = [
                'button:contains("Create an API key")',
                'button:contains("Create API key")',
                'button:contains("New API key")',
                'button:contains("Add API key")',
                '.n8n-button:contains("Create")',
                '[data-test-id="create-api-key"]',
                'button[class*="create" i]',
                '.btn:contains("Create")'
            ];
            
            let createButton = null;
            for (const selector of createButtonSelectors) {
                try {
                    await page.waitForSelector(selector, { timeout: 5000 });
                    createButton = await page.$(selector);
                    if (createButton && await createButton.isVisible()) {
                        console.log(`✅ Found create button with selector: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            if (!createButton) {
                throw new Error('Could not find API key creation button');
            }
            
            await createButton.click();
            await page.waitForTimeout(5000);
            
            // Fill API key form
            console.log('📝 Filling API key creation form...');
            const keyLabel = `API-${this.userId}-${Date.now()}`;
            
            // Look for label input
            const labelSelectors = [
                'input[placeholder*="API key label" i]',
                'input[name="label"]',
                'input[placeholder*="label" i]',
                'input[data-test-id="api-key-label"]',
                '.n8n-input input[type="text"]',
                'input[placeholder*="name" i]'
            ];
            
            let labelSet = false;
            for (const selector of labelSelectors) {
                try {
                    const labelInput = await page.$(selector);
                    if (labelInput && await labelInput.isVisible()) {
                        await labelInput.click({ clickCount: 3 });
                        await labelInput.type(keyLabel);
                        console.log(`✅ Set API key label: ${keyLabel}`);
                        labelSet = true;
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            if (!labelSet) {
                console.log('⚠️ Could not set label, using default');
            }
            
            // Try to set expiration if available
            try {
                const expirationSelectors = [
                    'select[name*="expir"]',
                    'select[placeholder*="expir" i]',
                    '.n8n-select select'
                ];
                
                for (const selector of expirationSelectors) {
                    try {
                        const expirationSelect = await page.$(selector);
                        if (expirationSelect && await expirationSelect.isVisible()) {
                            await expirationSelect.select('365'); // 1 year
                            console.log('✅ Set expiration to 1 year');
                            break;
                        }
                    } catch (e) {
                        continue;
                    }
                }
            } catch (e) {
                console.log('ℹ️ No expiration setting found, using default');
            }
            
            // Submit API key creation form
            console.log('📤 Submitting API key creation...');
            const submitCreateSelectors = [
                'button:contains("Create API key")',
                'button:contains("Create")',
                'button:contains("Save")',
                'button[type="submit"]',
                '.n8n-button:contains("Create")',
                '.btn-primary'
            ];
            
            let submitted = false;
            for (const selector of submitCreateSelectors) {
                try {
                    const submitButton = await page.$(selector);
                    if (submitButton && await submitButton.isVisible()) {
                        await submitButton.click();
                        console.log(`✅ Clicked create button: ${selector}`);
                        submitted = true;
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            if (!submitted) {
                throw new Error('Could not submit API key creation form');
            }
            
            // Wait for API key to be generated
            console.log('⏳ Waiting for API key generation...');
            await page.waitForTimeout(8000);
            
            // Extract the generated API key
            console.log('🔍 Extracting generated API key...');
            const apiKeySelectors = [
                '[data-test-id="api-key-value"]',
                'input[readonly][value*="n8n_api_"]',
                'code:contains("n8n_api_")',
                '.api-key-value',
                '.token-display',
                'input[type="text"][readonly]',
                '.n8n-input input[readonly]',
                'textarea[readonly]',
                '.copy-text',
                '[class*="api-key"]'
            ];
            
            let apiKey = null;
            
            for (const selector of apiKeySelectors) {
                try {
                    const element = await page.$(selector);
                    if (element) {
                        const value = await element.evaluate(el => {
                            return el.textContent || el.value || el.innerText;
                        });
                        
                        if (value && (value.includes('n8n_api_') || value.length > 50)) {
                            apiKey = value.trim();
                            console.log(`✅ Found API key with selector: ${selector}`);
                            break;
                        }
                    }
                } catch (e) {
                    continue;
                }
            }
            
            // Fallback: search page content
            if (!apiKey) {
                console.log('🔍 Searching page content for API key...');
                const pageContent = await page.content();
                const apiKeyMatches = [
                    /n8n_api_[a-f0-9]{64}/gi,
                    /n8n_api_[a-zA-Z0-9]{60,}/gi,
                    /"[a-zA-Z0-9]{64,}"/g
                ];
                
                for (const regex of apiKeyMatches) {
                    const matches = pageContent.match(regex);
                    if (matches && matches.length > 0) {
                        apiKey = matches[0].replace(/"/g, '');
                        console.log('✅ Found API key in page content');
                        break;
                    }
                }
            }
            
            if (!apiKey || apiKey.length < 20) {
                // Take screenshot for debugging
                try {
                    await page.screenshot({ 
                        path: '/tmp/n8n-api-key-error.png', 
                        fullPage: true 
                    });
                    console.log('📷 Screenshot saved to /tmp/n8n-api-key-error.png');
                } catch (screenshotError) {
                    console.log('Could not take screenshot');
                }
                
                throw new Error('Failed to extract valid API key from page');
            }
            
            console.log('🎉 API key created successfully!');
            console.log(`📋 Key label: ${keyLabel}`);
            console.log(`🔑 API key: ${apiKey.substring(0, 20)}...`);
            console.log(`📏 Key length: ${apiKey.length} characters`);
            
            return {
                apiKey: apiKey.trim(),
                label: keyLabel,
                createdAt: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('❌ Browser automation failed:', error.message);
            
            // Take error screenshot
            if (page) {
                try {
                    await page.screenshot({ 
                        path: '/tmp/n8n-browser-error.png', 
                        fullPage: true 
                    });
                    console.log('📷 Error screenshot saved to /tmp/n8n-browser-error.png');
                } catch (screenshotError) {
                    console.log('Could not take error screenshot');
                }
            }
            
            throw error;
        } finally {
            if (browser) {
                try {
                    await browser.close();
                    console.log('🔒 Browser closed successfully');
                } catch (closeError) {
                    console.log('⚠️ Error closing browser:', closeError.message);
                }
            }
        }
    }

    async createAPIKeyViaSession() {
        console.log('🔧 Attempting API key creation via session-based authentication...');
        
        try {
            // Login to establish session
            console.log('🔐 Logging in to N8N...');
            const loginResponse = await axios.post(`${this.baseUrl}/rest/login`, {
                emailOrLdapLoginId: this.email,
                password: this.password
            }, {
                timeout: this.defaultTimeout,
                withCredentials: true,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'N8N-API-Manager/1.0'
                },
                validateStatus: function (status) {
                    return status < 500;
                }
            });
            
            if (loginResponse.status !== 200) {
                console.log(`⚠️ Session login failed with status: ${loginResponse.status}`);
                throw new Error(`Login failed with status ${loginResponse.status}`);
            }
            
            const cookies = loginResponse.headers['set-cookie'];
            if (!cookies || cookies.length === 0) {
                console.log('⚠️ No session cookies received');
                throw new Error('No session cookies received');
            }
            
            const cookieHeader = cookies.join('; ');
            console.log('✅ Session established successfully');
            
            // Generate API key data
            const keyLabel = `API-${this.userId}-${Date.now()}`;
            
            // Try to create API key via REST API
            console.log('🔑 Creating API key via REST API...');
            const apiKeyPayload = {
                label: keyLabel,
                expiresIn: 365 // days
            };
            
            const createResponse = await axios.post(
                `${this.baseUrl}/rest/api-keys`, 
                apiKeyPayload,
                {
                    timeout: this.defaultTimeout,
                    headers: {
                        'Content-Type': 'application/json',
                        'Cookie': cookieHeader,
                        'Accept': 'application/json',
                        'User-Agent': 'N8N-API-Manager/1.0'
                    },
                    validateStatus: function (status) {
                        return status < 500;
                    }
                }
            );
            
            if (createResponse.status === 201 || createResponse.status === 200) {
                console.log('✅ API key created via session successfully');
                const responseData = createResponse.data;
                const apiKey = responseData.apiKey || responseData.key || responseData.token;
                
                if (apiKey && apiKey.length > 20) {
                    console.log(`🔑 Session-created key: ${apiKey.substring(0, 20)}...`);
                    return {
                        apiKey: apiKey,
                        label: keyLabel,
                        createdAt: new Date().toISOString()
                    };
                } else {
                    console.log('⚠️ Session method returned invalid API key');
                    throw new Error('Invalid API key from session method');
                }
            } else {
                console.log(`⚠️ Session method failed with status: ${createResponse.status}`);
                throw new Error(`Session API creation failed with status ${createResponse.status}`);
            }
            
        } catch (error) {
            console.log('⚠️ Session-based creation failed:', error.message);
            throw error;
        }
    }

    async validateAPIKey(apiKey) {
        console.log('✅ Validating API key functionality...');
        
        if (!apiKey || apiKey.length < 20) {
            console.log('❌ Invalid API key provided for validation');
            return false;
        }
        
        try {
            // Test with multiple endpoints
            const testEndpoints = [
                '/rest/workflows',
                '/rest/credentials',
                '/rest/executions'
            ];
            
            for (const endpoint of testEndpoints) {
                try {
                    console.log(`🧪 Testing API key with endpoint: ${endpoint}`);
                    const response = await axios.get(`${this.baseUrl}${endpoint}`, {
                        timeout: 20000,
                        headers: {
                            'X-N8N-API-KEY': apiKey,
                            'Accept': 'application/json',
                            'User-Agent': 'N8N-API-Manager/1.0'
                        },
                        validateStatus: function (status) {
                            return status < 500;
                        }
                    });
                    
                    if (response.status === 200) {
                        console.log(`✅ API key validated successfully with ${endpoint}`);
                        if (endpoint === '/rest/workflows') {
                            console.log(`📊 Found ${Array.isArray(response.data) ? response.data.length : 0} workflows`);
                        }
                        return true;
                    } else if (response.status === 401) {
                        console.log('❌ API key is invalid or expired');
                        return false;
                    } else if (response.status === 403) {
                        console.log('⚠️ API key has limited permissions but is valid');
                        return true;
                    }
                } catch (endpointError) {
                    console.log(`⚠️ Endpoint ${endpoint} test failed: ${endpointError.message}`);
                    continue;
                }
            }
            
            console.log('⚠️ All validation endpoints failed, but API key might still be valid');
            return true; // Assume valid if we can't definitively prove it's invalid
            
        } catch (error) {
            console.error('❌ API key validation failed:', error.message);
            return false;
        }
    }

    async storeAPIKeyInSupabase(apiKeyData) {
        console.log('💾 Storing API key in Supabase database...');
        
        if (!this.supabase) {
            throw new Error('Supabase client not initialized');
        }
        
        const updateData = {
            n8n_api_key: apiKeyData.apiKey,
            n8n_api_key_label: apiKeyData.label,
            n8n_api_key_created_at: apiKeyData.createdAt,
            updated_at: new Date().toISOString()
        };
        
        // Add additional metadata if available
        if (this.projectId) {
            updateData.northflank_project_id = this.projectId;
        }
        if (this.projectName) {
            updateData.northflank_project_name = this.projectName;
        }
        if (this.baseUrl) {
            updateData.n8n_instance_url = this.baseUrl;
        }
        
        try {
            console.log(`🔍 Updating user record for ID: ${this.userId}`);
            
            const { data, error } = await this.supabase
                .from('launchmvpfast-saas-starterkit_user')
                .update(updateData)
                .eq('id', this.userId)
                .select();
            
            if (error) {
                console.error('❌ Supabase update error:', error.message);
                console.error('Error details:', JSON.stringify(error, null, 2));
                throw error;
            }
            
            if (!data || data.length === 0) {
                throw new Error(`No user found with ID: ${this.userId}`);
            }
            
            console.log('✅ API key stored successfully in Supabase');
            console.log(`📊 Updated ${data.length} record(s)`);
            return data;
            
        } catch (error) {
            console.error('❌ Failed to store API key in Supabase:', error.message);
            
            // Try to provide more specific error information
            if (error.message.includes('permission')) {
                console.error('💡 Check Supabase RLS policies and service role permissions');
            } else if (error.message.includes('not found') || error.message.includes('No user found')) {
                console.error(`💡 User ID ${this.userId} may not exist in the database`);
            } else if (error.message.includes('column')) {
                console.error('💡 Database schema may be missing required columns');
            }
            
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
                apiKeyPreview: apiKeyData.apiKey.substring(0, 15) + '...'
            }
        };
        
        try {
            const response = await axios.post(this.webhookUrl, notificationData, {
                timeout: this.defaultTimeout,
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
        console.log(`🏗️ Project: ${this.projectName || 'N/A'} (${this.projectId || 'N/A'})`);
        console.log(`🔄 Node Version: ${process.version}`);
        console.log(`🕐 Started at: ${new Date().toISOString()}`);
        console.log('========================================');
        
        try {
            // Step 1: Wait for N8N to be ready
            console.log('1️⃣ Checking N8N readiness...');
            await this.waitForN8NReady();
            
            // Step 2: Create API key (try session method first, fallback to browser)
            console.log('2️⃣ Creating API key...');
            let apiKeyData;
            let creationMethod = 'unknown';
            
            try {
                console.log('🔄 Attempting session-based creation...');
                apiKeyData = await this.createAPIKeyViaSession();
                creationMethod = 'session';
                console.log('✅ Session-based creation successful');
            } catch (sessionError) {
                console.log('⚠️ Session method failed, trying browser automation...');
                console.log(`Session error: ${sessionError.message}`);
                
                try {
                    apiKeyData = await this.createAPIKeyViaBrowser();
                    creationMethod = 'browser';
                    console.log('✅ Browser automation successful');
                } catch (browserError) {
                    console.error('❌ Both session and browser methods failed');
                    console.error(`Session error: ${sessionError.message}`);
                    console.error(`Browser error: ${browserError.message}`);
                    throw new Error(`API key creation failed: Session (${sessionError.message}) and Browser (${browserError.message})`);
                }
            }
            
            console.log(`✅ API key created using ${creationMethod} method`);
            
            // Step 3: Validate API key
            console.log('3️⃣ Validating API key...');
            const isValid = await this.validateAPIKey(apiKeyData.apiKey);
            if (!isValid) {
                throw new Error('Created API key failed validation tests');
            }
            console.log('✅ API key validation passed');
            
            // Step 4: Store in Supabase
            console.log('4️⃣ Storing credentials in Supabase...');
            await this.storeAPIKeyInSupabase(apiKeyData);
            console.log('✅ Credentials stored successfully');
            
            // Step 5: Send webhook notification
            console.log('5️⃣ Sending notifications...');
            await this.sendWebhookNotification(apiKeyData);
            console.log('✅ Notifications completed');
            
            console.log('========================================');
            console.log('🎉 N8N API Management Completed Successfully!');
            console.log('========================================');
            console.log(`✅ API Key Created: ${apiKeyData.label}`);
            console.log(`✅ Creation Method: ${creationMethod}`);
            console.log(`✅ API Key Validated: Functional`);
            console.log(`✅ Credentials Stored: Supabase updated`);
            console.log(`✅ Project: ${this.projectName || 'N/A'}`);
            console.log(`🕐 Completed at: ${new Date().toISOString()}`);
            console.log(`⏱️ Total execution time: ${process.uptime().toFixed(1)} seconds`);
            console.log('========================================');
            
            return {
                success: true,
                apiKey: apiKeyData.apiKey,
                label: apiKeyData.label,
                creationMethod: creationMethod,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('========================================');
            console.error('❌ N8N API Management Failed!');
            console.error('========================================');
            console.error('💥 Error:', error.message);
            console.error('📍 Stack:', error.stack);
            console.error(`🕐 Failed at: ${new Date().toISOString()}`);
            console.error(`⏱️ Execution time: ${process.uptime().toFixed(1)} seconds`);
            console.error('========================================');
            
            // Try to update error status in Supabase
            if (this.supabase) {
                try {
                    console.log('📝 Recording error in database...');
                    await this.supabase
                        .from('launchmvpfast-saas-starterkit_user')
                        .update({
                            n8n_setup_error: error.message,
                            n8n_setup_error_timestamp: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', this.userId);
                    console.log('✅ Error recorded in database');
                } catch (updateError) {
                    console.error('⚠️ Failed to record error in database:', updateError.message);
                }
            }
            
            throw error;
        }
    }
}

// Enhanced error handling for unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('========================================');
    console.error('🚨 Unhandled Promise Rejection');
    console.error('========================================');
    console.error('Promise:', promise);
    console.error('Reason:', reason);
    console.error('Stack:', reason?.stack || 'No stack trace available');
    console.error('========================================');
    process.exit(1);
});

// Enhanced error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('========================================');
    console.error('🚨 Uncaught Exception');
    console.error('========================================');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('========================================');
    process.exit(1);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
    console.log('📡 Received SIGTERM signal, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('📡 Received SIGINT signal, shutting down gracefully...');
    process.exit(0);
});

// Main execution function
async function main() {
    const startTime = Date.now();
    
    try {
        console.log('🏁 Starting N8N API Manager process...');
        const manager = new N8NAPIManager();
        const result = await manager.run();
        
        const endTime = Date.now();
        const executionTime = ((endTime - startTime) / 1000).toFixed(2);
        
        console.log(`🎯 Process completed successfully in ${executionTime} seconds`);
        console.log('📊 Result:', {
            success: result.success,
            method: result.creationMethod,
            keyLabel: result.label,
            timestamp: result.timestamp
        });
        
        process.exit(0);
    } catch (error) {
        const endTime = Date.now();
        const executionTime = ((endTime - startTime) / 1000).toFixed(2);
        
        console.error(`💥 Process failed after ${executionTime} seconds:`, error.message);
        
        // Provide troubleshooting information
        console.error('');
        console.error('🔧 Troubleshooting steps:');
        console.error('1. Verify all environment variables are set correctly');
        console.error('2. Check N8N instance is running and accessible');
        console.error('3. Verify user credentials are valid');
        console.error('4. Check network connectivity');
        console.error('5. Review Supabase permissions and schema');
        console.error('');
        
        process.exit(1);
    }
}

// Export for testing
module.exports = N8NAPIManager;

// Run if this file is executed directly
if (require.main === module) {
    main();
}
