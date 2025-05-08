// ==UserScript==
// @name         Web Page Assistant (Compact)
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  Compact UI with always-visible prompt
// @author       You
// @match        *://*/*
// @exclude      *://localhost*
// @exclude      *://127.0.0.1*
// @exclude      *://chatgpt.com*
// @grant        GM_xmlhttpRequest
// @connect      localhost
// ==/UserScript==

(function() {
    'use strict';

    // Configuration
    const CONFIG = {
        serverUrl: 'http://localhost:8765',
        analyzeEndpoint: '/analyze',
        statusEndpoint: '/status',
        resultsEndpoint: '/results',
        // Content extraction settings
        extractHTML: true,
        chunkSize: 100000,
        uiSettings: {
            width: '280px',
            height: 'auto',
            maxHeight: '400px',
            position: 'bottom-right',
            colors: {
                background: '#10a37f',
                text: 'white',
                error: '#e34234',
                button: '#0e8c6d',
                buttonHover: '#0a6d55',
                secondaryBtn: '#3a3a3a',
                secondaryBtnHover: '#555555',
                inputBg: '#f0f0f0',
                responseBg: '#f9f9f9',
                border: '#ddd'
            },
            fonts: {
                main: "'Segoe UI', -apple-system, system-ui, BlinkMacSystemFont, Arial, sans-serif",
                size: {
                    small: '12px',
                    normal: '13px',
                    title: '14px'
                }
            }
        }
    };

    // State variables
    const STATE = {
        isServerAvailable: false,
        connectionRetries: 0,
        maxRetries: 5,
        isProcessing: false,
        currentRequestId: null,
        isMinimized: false,
        lastResponse: null
    };

    // UI Elements
    let uiElements = {
        container: null,
        statusBar: null,
        contentArea: null,
        promptInput: null,
        analyzeButton: null,
        chatgptButton: null,
        responseArea: null,
        minimizeButton: null
    };

    // Initialize the assistant
    function initAssistant() {
        console.log('Initializing Web Page Assistant...');
        createUI();
        checkServerConnection();
    }

    // 1. Modify the checkServerConnection function to use a different message
    function checkServerConnection() {
        GM_xmlhttpRequest({
            method: 'GET',
            url: `${CONFIG.serverUrl}${CONFIG.statusEndpoint}`,
            onload: (response) => {
                if (response.status === 200) {
                    STATE.isServerAvailable = true;
                    STATE.connectionRetries = 0;
                    updateStatusText('Web Assistant'); // Changed from 'Ready'
                } else {
                    handleConnectionError();
                }
            },
            onerror: handleConnectionError
        });
    }

    // Handle connection errors
    function handleConnectionError() {
        STATE.connectionRetries++;
        if (STATE.connectionRetries <= STATE.maxRetries) {
            updateStatusText(`Connecting (${STATE.connectionRetries}/${STATE.maxRetries})...`, true);
            setTimeout(checkServerConnection, 3000);
        } else {
            STATE.isServerAvailable = false;
            updateStatusText('Connection failed', true);
        }
    }

    // Create the UI elements with enhanced design
    function createUI() {
        // Create main container
        const container = document.createElement('div');
        container.id = 'web-assistant-container';
        Object.assign(container.style, {
            position: 'fixed',
            zIndex: '10000',
            width: CONFIG.uiSettings.width,
            maxHeight: CONFIG.uiSettings.maxHeight,
            fontFamily: CONFIG.uiSettings.fonts.main,
            fontSize: CONFIG.uiSettings.fonts.size.normal,
            boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
            borderRadius: '8px',
            display: 'flex',
            flexDirection: 'column',
            transition: 'all 0.3s ease',
            overflow: 'hidden'
        });

        // Position the container based on settings
        setContainerPosition(container);

        // Create status bar
        const statusBar = document.createElement('div');
        statusBar.id = 'web-assistant-status';
        Object.assign(statusBar.style, {
            padding: '8px 12px',
            background: CONFIG.uiSettings.colors.background,
            color: CONFIG.uiSettings.colors.text,
            fontWeight: 'bold',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'move',
            fontSize: CONFIG.uiSettings.fonts.size.title,
            borderBottom: '1px solid rgba(255,255,255,0.1)'
        });

        // Create minimize button
        const minimizeButton = document.createElement('button');
        minimizeButton.id = 'web-assistant-minimize';
        minimizeButton.textContent = '_';
        minimizeButton.title = 'Minimize';
        Object.assign(minimizeButton.style, {
            background: 'transparent',
            border: 'none',
            color: CONFIG.uiSettings.colors.text,
            fontWeight: 'bold',
            cursor: 'pointer',
            paddingLeft: '10px',
            fontSize: '14px'
        });

        // Add status text and button to status bar
        const statusText = document.createElement('span');
        statusText.id = 'web-assistant-status-text';
        statusText.textContent = 'Web Assistant';
        statusBar.appendChild(statusText);
        statusBar.appendChild(minimizeButton);

        // Create content area
        const contentArea = document.createElement('div');
        contentArea.id = 'web-assistant-content';
        Object.assign(contentArea.style, {
            padding: '10px',
            background: 'white',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
        });

        // Create prompt input - ALWAYS VISIBLE
        const promptInput = document.createElement('textarea');
        promptInput.id = 'web-assistant-prompt';
        promptInput.placeholder = 'Ask anything about this page...';
        promptInput.rows = 2;
        Object.assign(promptInput.style, {
            padding: '8px 10px',
            borderRadius: '6px',
            border: `1px solid ${CONFIG.uiSettings.colors.border}`,
            width: '100%',
            boxSizing: 'border-box',
            resize: 'vertical',
            fontFamily: 'inherit',
            fontSize: CONFIG.uiSettings.fonts.size.normal,
            background: CONFIG.uiSettings.colors.inputBg
        });

        // Create button container with a more compact layout
        const buttonContainer = document.createElement('div');
        buttonContainer.id = 'web-assistant-buttons';
        Object.assign(buttonContainer.style, {
            display: 'flex',
            gap: '6px',
            justifyContent: 'space-between',
            alignItems: 'center'
        });

        // Create analyze button with compact styling
        const analyzeButton = document.createElement('button');
        analyzeButton.id = 'web-assistant-analyze';
        analyzeButton.textContent = 'Analyze';
        Object.assign(analyzeButton.style, {
            padding: '6px 10px',
            borderRadius: '4px',
            border: 'none',
            background: CONFIG.uiSettings.colors.button,
            color: 'white',
            fontWeight: 'bold',
            cursor: 'pointer',
            flex: '1',
            transition: 'background 0.2s',
            fontSize: CONFIG.uiSettings.fonts.size.small
        });

        // Create ChatGPT button with compact styling
        const chatgptButton = document.createElement('button');
        chatgptButton.id = 'web-assistant-chatgpt';
        chatgptButton.textContent = 'Open in ChatGPT';
        Object.assign(chatgptButton.style, {
            padding: '6px 10px',
            borderRadius: '4px',
            border: 'none',
            background: CONFIG.uiSettings.colors.secondaryBtn,
            color: 'white',
            fontWeight: 'bold',
            cursor: 'pointer',
            flex: '1.2',
            transition: 'background 0.2s',
            fontSize: CONFIG.uiSettings.fonts.size.small
        });

        // Add hover effects to buttons
        analyzeButton.addEventListener('mouseover', () => {
            analyzeButton.style.background = CONFIG.uiSettings.colors.buttonHover;
        });
        analyzeButton.addEventListener('mouseout', () => {
            analyzeButton.style.background = CONFIG.uiSettings.colors.button;
        });

        chatgptButton.addEventListener('mouseover', () => {
            chatgptButton.style.background = CONFIG.uiSettings.colors.secondaryBtnHover;
        });
        chatgptButton.addEventListener('mouseout', () => {
            chatgptButton.style.background = CONFIG.uiSettings.colors.secondaryBtn;
        });

        // Create response area (initially empty)
        const responseArea = document.createElement('div');
        responseArea.id = 'web-assistant-response';
        Object.assign(responseArea.style, {
            padding: '8px 10px',
            borderRadius: '6px',
            background: CONFIG.uiSettings.colors.responseBg,
            border: `1px solid ${CONFIG.uiSettings.colors.border}`,
            maxHeight: '150px',
            overflowY: 'auto',
            display: 'none',
            fontSize: CONFIG.uiSettings.fonts.size.normal,
            lineHeight: '1.4'
        });

        // Add buttons to button container
        buttonContainer.appendChild(analyzeButton);
        buttonContainer.appendChild(chatgptButton);

        // Add elements to content area (prompt first, then buttons, then response)
        contentArea.appendChild(promptInput);
        contentArea.appendChild(buttonContainer);
        contentArea.appendChild(responseArea);

        // Add everything to the container
        container.appendChild(statusBar);
        container.appendChild(contentArea);
        document.body.appendChild(container);

        // Store references to UI elements
        uiElements.container = container;
        uiElements.statusBar = statusBar;
        uiElements.contentArea = contentArea;
        uiElements.promptInput = promptInput;
        uiElements.analyzeButton = analyzeButton;
        uiElements.chatgptButton = chatgptButton;
        uiElements.responseArea = responseArea;
        uiElements.minimizeButton = minimizeButton;

        // Add event listeners
        analyzeButton.addEventListener('click', () => handleAnalyzeClick(false));
        chatgptButton.addEventListener('click', () => handleAnalyzeClick(true));
        minimizeButton.addEventListener('click', toggleMinimize);

        // Make the status bar draggable
        makeDraggable(container, statusBar);
    }

    // Toggle minimize/maximize state
    function toggleMinimize() {
        STATE.isMinimized = !STATE.isMinimized;

        if (STATE.isMinimized) {
            uiElements.contentArea.style.display = 'none';
            uiElements.minimizeButton.textContent = '□';
            uiElements.minimizeButton.title = 'Maximize';
        } else {
            uiElements.contentArea.style.display = 'flex';
            uiElements.minimizeButton.textContent = '_';
            uiElements.minimizeButton.title = 'Minimize';
        }
    }

    // Set the position of the container based on settings
    function setContainerPosition(container) {
        switch(CONFIG.uiSettings.position) {
            case 'top-left':
                Object.assign(container.style, {
                    top: '10px',
                    left: '10px'
                });
                break;
            case 'top-right':
                Object.assign(container.style, {
                    top: '10px',
                    right: '10px'
                });
                break;
            case 'bottom-left':
                Object.assign(container.style, {
                    bottom: '10px',
                    left: '10px'
                });
                break;
            case 'bottom-right':
            default:
                Object.assign(container.style, {
                    bottom: '10px',
                    right: '10px'
                });
                break;
        }
    }

    // REPLACEMENT: Ultra-simple direct mouse following
    function makeDraggable(container, handle) {
        let offsetX, offsetY;

        handle.style.cursor = 'move';

        handle.onmousedown = function(e) {
            // Don't drag when clicking minimize button
            if (e.target === uiElements.minimizeButton) {
                return;
            }

            e.preventDefault();

            // Calculate the offset of the mouse cursor relative to the container
            offsetX = e.clientX - container.getBoundingClientRect().left;
            offsetY = e.clientY - container.getBoundingClientRect().top;

            // Add mouse move and mouse up handlers
            document.onmousemove = moveAt;
            document.onmouseup = stopDrag;

            // Make sure this element is on top
            container.style.zIndex = "10001";
        };

        function moveAt(e) {
            // Direct positioning based on mouse position
            container.style.left = (e.clientX - offsetX) + 'px';
            container.style.top = (e.clientY - offsetY) + 'px';
            container.style.right = 'auto';
            container.style.bottom = 'auto';
        }

        function stopDrag() {
            document.onmousemove = null;
            document.onmouseup = null;
        }
    }

    // REPLACEMENT #2: Corrected handleAnalyzeClick with proper loading indicators
    function handleAnalyzeClick(viewInChatGPT = false) {
        if (!STATE.isServerAvailable) {
            showResponse('Error: Server not available. Please check the connection.', true);
            return;
        }

        if (STATE.isProcessing) {
            showResponse('Already processing a request. Please wait...', true);
            return;
        }

        // Get prompt
        const prompt = uiElements.promptInput.value.trim();

        // Update state
        STATE.isProcessing = true;
        updateStatusText('Extracting content...');

        // Disable both buttons
        uiElements.analyzeButton.disabled = true;
        uiElements.chatgptButton.disabled = true;

        // Store original text
        const originalAnalyzeText = 'Analyze';
        const originalChatGPTText = 'Open in ChatGPT';

        // Set loading text only on the clicked button
        if (viewInChatGPT) {
            uiElements.chatgptButton.textContent = 'Loading...';
        } else {
            uiElements.analyzeButton.textContent = 'Loading...';
        }

        // Extract and analyze content
        try {
            // Extract content
            const content = extractPageContent();
            const chunks = chunkContent(content);

            // Generate a unique request ID
            const requestId = Date.now().toString();
            STATE.currentRequestId = requestId;

            // Update status
            const chunkText = chunks.length > 1 ? ` (${chunks.length} chunks)` : '';
            updateStatusText(`Analyzing${chunkText}...`);

            // Send first chunk to start the process
            sendContentChunk(requestId, prompt, chunks, 0, viewInChatGPT, originalAnalyzeText, originalChatGPTText);
        } catch (error) {
            console.error('Error extracting content:', error);
            updateStatusText('Extraction error', true);
            showResponse(`Error: ${error.message}`, true);
            STATE.isProcessing = false;
            resetUI(originalAnalyzeText, originalChatGPTText);
        }
    }

    // Update status text
    function updateStatusText(message, isError = false) {
        const statusText = document.getElementById('web-assistant-status-text');
        if (statusText) {
            statusText.textContent = message;
            uiElements.statusBar.style.background = isError ?
                CONFIG.uiSettings.colors.error :
                CONFIG.uiSettings.colors.background;
        }
    }

    // Show response in the response area
    function showResponse(message, isError = false) {
        if (!uiElements.responseArea) return;

        // Show the response area if hidden
        uiElements.responseArea.style.display = 'block';

        // Update content
        uiElements.responseArea.innerHTML = '';

        const messageEl = document.createElement('div');
        messageEl.style.color = isError ? '#e34234' : '#333';
        messageEl.textContent = message;

        uiElements.responseArea.appendChild(messageEl);

        // Store response
        STATE.lastResponse = {
            message,
            isError
        };
    }

    // Extract page content (both visible text and HTML if configured)
    function extractPageContent() {
        // Create content object
        const content = {
            url: window.location.href,
            title: document.title || '',
            text: document.body.innerText || '',
            html: CONFIG.extractHTML ? document.documentElement.outerHTML : null
        };

        // Add metadata
        content.h1 = Array.from(document.querySelectorAll('h1'))
            .map(h => h.textContent)
            .join('\n');

        // Get meta description
        const metaDescription = document.querySelector('meta[name="description"]');
        if (metaDescription) {
            content.description = metaDescription.getAttribute('content');
        }

        return content;
    }

    // Check if content needs chunking based on size
    function needsChunking(contentObj) {
        // Convert to JSON string to check actual size
        const contentString = JSON.stringify(contentObj);
        return contentString.length > CONFIG.chunkSize;
    }

    // Chunk content if needed
    function chunkContent(contentObj) {
        const contentString = JSON.stringify(contentObj);

        // If no chunking needed, return as single chunk
        if (contentString.length <= CONFIG.chunkSize) {
            return [{
                type: 'complete',
                content: contentObj
            }];
        }

        // Chunking needed - create chunks
        const chunks = [];

        // Always send metadata in first chunk
        const baseMetadata = {
            url: contentObj.url,
            title: contentObj.title,
            description: contentObj.description || ''
        };

        // Split text content if too large
        const textContent = contentObj.text || '';
        if (textContent.length > CONFIG.chunkSize / 2) {
            // Calculate roughly how many chunks needed for text
            const textChunkSize = CONFIG.chunkSize / 2;
            const numTextChunks = Math.ceil(textContent.length / textChunkSize);

            for (let i = 0; i < numTextChunks; i++) {
                const start = i * textChunkSize;
                const end = Math.min(start + textChunkSize, textContent.length);

                chunks.push({
                    type: 'text',
                    chunkIndex: i,
                    totalChunks: numTextChunks,
                    metadata: i === 0 ? baseMetadata : { url: contentObj.url },
                    content: textContent.substring(start, end)
                });
            }
        } else {
            // Text fits in one chunk
            chunks.push({
                type: 'text',
                chunkIndex: 0,
                totalChunks: 1,
                metadata: baseMetadata,
                content: textContent
            });
        }

        // Split HTML content if too large and if extraction is enabled
        if (CONFIG.extractHTML && contentObj.html) {
            const htmlContent = contentObj.html;
            if (htmlContent.length > CONFIG.chunkSize) {
                // Calculate roughly how many chunks needed for HTML
                const htmlChunkSize = CONFIG.chunkSize;
                const numHtmlChunks = Math.ceil(htmlContent.length / htmlChunkSize);

                for (let i = 0; i < numHtmlChunks; i++) {
                    const start = i * htmlChunkSize;
                    const end = Math.min(start + htmlChunkSize, htmlContent.length);

                    chunks.push({
                        type: 'html',
                        chunkIndex: i,
                        totalChunks: numHtmlChunks,
                        metadata: { url: contentObj.url },
                        content: htmlContent.substring(start, end)
                    });
                }
            } else {
                // HTML fits in one chunk
                chunks.push({
                    type: 'html',
                    chunkIndex: 0,
                    totalChunks: 1,
                    metadata: { url: contentObj.url },
                    content: htmlContent
                });
            }
        }

        return chunks;
    }

    // REPLACE THIS ENTIRE FUNCTION with a simpler version that just calls handleAnalyzeClick
    function analyzePageContent(prompt, viewInChatGPT) {
        // This function is now just a wrapper that calls handleAnalyzeClick
        // All the logic has been moved to handleAnalyzeClick and sendContentChunk
        const originalAnalyzeText = 'Analyze';
        const originalChatGPTText = 'Open in ChatGPT';

        try {
            // Extract content
            const content = extractPageContent();
            const chunks = chunkContent(content);

            // Generate a unique request ID
            const requestId = Date.now().toString();
            STATE.currentRequestId = requestId;

            // Update status
            const chunkText = chunks.length > 1 ? ` (${chunks.length} chunks)` : '';
            updateStatusText(`Analyzing${chunkText}...`);

            // Send first chunk to start the process with the right parameters
            sendContentChunk(requestId, prompt, chunks, 0, viewInChatGPT, originalAnalyzeText, originalChatGPTText);

        } catch (error) {
            console.error('Error extracting content:', error);
            updateStatusText('Extraction error', true);
            showResponse(`Error: ${error.message}`, true);
            STATE.isProcessing = false;
            resetUI('Analyze', 'Open in ChatGPT');
        }
    }
    // REPLACEMENT #3: Modified sendContentChunk to pass through the original button text
    function sendContentChunk(requestId, prompt, chunks, chunkIndex, viewInChatGPT, originalAnalyzeText, originalChatGPTText) {
        if (chunkIndex >= chunks.length) {
            // All chunks sent
            if (!viewInChatGPT) {
                // If not viewing in ChatGPT, start polling for results
                pollForResults(requestId, originalAnalyzeText, originalChatGPTText);
            } else {
                // If viewing in ChatGPT, we're done here
                updateStatusText('Opened in ChatGPT');
                showResponse('Content is being processed in ChatGPT. Please check the new browser tab.');
                STATE.isProcessing = false;
                resetUI(originalAnalyzeText, originalChatGPTText);
            }
            return;
        }

        const chunk = chunks[chunkIndex];

        // Prepare data for this chunk
        const data = {
            requestId: requestId,
            prompt: prompt,
            chunkIndex: chunkIndex,
            totalChunks: chunks.length,
            isLastChunk: chunkIndex === chunks.length - 1,
            viewInChatGPT: viewInChatGPT,
            chunk: chunk
        };

        // Update status
        if (chunks.length > 1) {
            updateStatusText(`Sending ${chunkIndex + 1}/${chunks.length}...`);
        } else {
            updateStatusText('Processing...');
        }

        // Send to server
        GM_xmlhttpRequest({
            method: 'POST',
            url: `${CONFIG.serverUrl}${CONFIG.analyzeEndpoint}`,
            data: JSON.stringify(data),
            headers: {
                'Content-Type': 'application/json'
            },
            onload: (response) => {
                try {
                    const result = JSON.parse(response.responseText);

                    if (result.success) {
                        // Send next chunk
                        sendContentChunk(requestId, prompt, chunks, chunkIndex + 1, viewInChatGPT, originalAnalyzeText, originalChatGPTText);
                    } else {
                        console.error('Error sending chunk:', result.error);
                        updateStatusText('Server error', true);
                        showResponse(`Error: ${result.error}`, true);
                        STATE.isProcessing = false;
                        resetUI(originalAnalyzeText, originalChatGPTText);
                    }
                } catch (e) {
                    console.error('Error parsing response:', e);
                    updateStatusText('Response error', true);
                    showResponse('Server returned an invalid response', true);
                    STATE.isProcessing = false;
                    resetUI(originalAnalyzeText, originalChatGPTText);
                }
            },
            onerror: (error) => {
                console.error('Request error:', error);
                updateStatusText('Connection error', true);
                showResponse('Failed to connect to the server', true);
                STATE.isProcessing = false;
                resetUI(originalAnalyzeText, originalChatGPTText);
            }
        });
    }
    // 2. Modify the pollForResults function to avoid showing "Complete" status
    function pollForResults(requestId, originalAnalyzeText, originalChatGPTText) {
        updateStatusText('Processing...');
        showResponse('ChatGPT is analyzing the page content...');

        // Start polling with exponential backoff
        const backoff = 2000; // Start with 2 seconds
        let pollCount = 0;

        // Start polling
        const pollInterval = setInterval(() => {
            pollCount++;

            // Check if we've been polling for too long (2 minutes)
            if (pollCount > 60) { // 2s * 60 = 2 minutes max polling time
                clearInterval(pollInterval);
                updateStatusText('Analysis timed out', true);
                showResponse('The analysis request timed out. Please try again.', true);
                STATE.isProcessing = false;
                resetUI(originalAnalyzeText, originalChatGPTText);
                return;
            }

            // Make the request
            GM_xmlhttpRequest({
                method: 'GET',
                url: `${CONFIG.serverUrl}${CONFIG.resultsEndpoint}/${requestId}`,
                onload: (response) => {
                    try {
                        if (response.status === 404) {
                            // No results yet, continue polling
                            const waitTime = pollCount * 2;
                            if (waitTime % 10 === 0) { // Update status every 10 seconds
                                updateStatusText(`Waiting (${waitTime}s)...`);
                            }
                            return;
                        }

                        if (response.status === 200) {
                            const result = JSON.parse(response.responseText);

                            if (result.success && result.response) {
                                // Process is complete
                                clearInterval(pollInterval);
                                updateStatusText('Web Assistant'); // Changed from 'Complete ✓'
                                showResponse(result.response);
                                STATE.isProcessing = false;
                                resetUI(originalAnalyzeText, originalChatGPTText);
                            }
                        } else {
                            // Server error
                            updateStatusText('Server error', true);
                        }
                    } catch (e) {
                        console.error('Error parsing poll response:', e);
                    }
                },
                onerror: () => {
                    // Connection error
                    updateStatusText('Connection error', true);
                }
            });
        }, backoff);
    }

    // Reset UI after processing
    function resetUI(analyzeText, chatgptText) {
        uiElements.analyzeButton.disabled = false;
        uiElements.chatgptButton.disabled = false;
        uiElements.analyzeButton.textContent = analyzeText || 'Analyze';
        uiElements.chatgptButton.textContent = chatgptText || 'Open in ChatGPT';
    }

    // Wait for DOM to be fully loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAssistant);
    } else {
        initAssistant();
    }
})();