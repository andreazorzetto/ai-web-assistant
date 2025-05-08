// ==UserScript==
// @name         Web Page Assistant (Enhanced)
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Single status bar with optional prompts and ChatGPT viewing option
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
        extractHTML: true,       // Also extract page HTML
        chunkSize: 100000,       // Initial chunk size (~100KB)
        uiSettings: {
            width: '320px',
            height: 'auto',
            maxHeight: '400px',
            position: 'bottom-right', // 'top-left', 'top-right', 'bottom-left', 'bottom-right'
            colors: {
                background: '#10a37f',
                text: 'white',
                error: '#e34234',
                button: '#0e8c6d',
                buttonHover: '#0a6d55',
                secondaryBtn: '#3a3a3a',
                secondaryBtnHover: '#555555',
                inputBg: '#f0f0f0',
                responseBg: '#f9f9f9'
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
        isPromptExpanded: false,
        lastResponse: null
    };

    // UI Elements
    let uiElements = {
        container: null,
        statusBar: null,
        contentArea: null,
        buttonContainer: null,
        analyzeButton: null,
        chatgptButton: null,
        promptToggleBtn: null,
        promptContainer: null,
        promptInput: null,
        responseArea: null,
        minimizeButton: null
    };

    // Initialize the assistant
    function initAssistant() {
        console.log('Initializing Web Page Assistant...');
        createUI();
        checkServerConnection();
    }

    // Check if the server is available
    function checkServerConnection() {
        GM_xmlhttpRequest({
            method: 'GET',
            url: `${CONFIG.serverUrl}${CONFIG.statusEndpoint}`,
            onload: (response) => {
                if (response.status === 200) {
                    STATE.isServerAvailable = true;
                    STATE.connectionRetries = 0;
                    updateStatusText('Web Assistant ready');
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
            updateStatusText(`Connecting to server (attempt ${STATE.connectionRetries}/${STATE.maxRetries})...`, true);
            setTimeout(checkServerConnection, 3000);
        } else {
            STATE.isServerAvailable = false;
            updateStatusText('Failed to connect to AI assistant server', true);
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
            fontFamily: 'Arial, sans-serif',
            fontSize: '14px',
            boxShadow: '0 2px 20px rgba(0,0,0,0.2)',
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
            padding: '10px 15px',
            background: CONFIG.uiSettings.colors.background,
            color: CONFIG.uiSettings.colors.text,
            fontWeight: 'bold',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'move'
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
        statusText.textContent = 'Starting Web Assistant...';
        statusBar.appendChild(statusText);
        statusBar.appendChild(minimizeButton);

        // Create content area
        const contentArea = document.createElement('div');
        contentArea.id = 'web-assistant-content';
        Object.assign(contentArea.style, {
            padding: '15px',
            background: 'white',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
        });

        // Create button container
        const buttonContainer = document.createElement('div');
        buttonContainer.id = 'web-assistant-buttons';
        Object.assign(buttonContainer.style, {
            display: 'flex',
            gap: '10px',
            justifyContent: 'space-between',
            alignItems: 'center'
        });

        // Create analyze button
        const analyzeButton = document.createElement('button');
        analyzeButton.id = 'web-assistant-analyze';
        analyzeButton.textContent = 'Analyze Page';
        Object.assign(analyzeButton.style, {
            padding: '8px 12px',
            borderRadius: '6px',
            border: 'none',
            background: CONFIG.uiSettings.colors.button,
            color: 'white',
            fontWeight: 'bold',
            cursor: 'pointer',
            flex: '1',
            transition: 'background 0.2s'
        });

        // Create ChatGPT button
        const chatgptButton = document.createElement('button');
        chatgptButton.id = 'web-assistant-chatgpt';
        chatgptButton.textContent = 'See in ChatGPT';
        Object.assign(chatgptButton.style, {
            padding: '8px 12px',
            borderRadius: '6px',
            border: 'none',
            background: CONFIG.uiSettings.colors.secondaryBtn,
            color: 'white',
            fontWeight: 'bold',
            cursor: 'pointer',
            flex: '1',
            transition: 'background 0.2s'
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

        // Create prompt toggle button
        const promptToggleBtn = document.createElement('button');
        promptToggleBtn.id = 'web-assistant-prompt-toggle';
        promptToggleBtn.innerHTML = '➕ Add prompt';
        promptToggleBtn.title = 'Add a custom prompt';
        Object.assign(promptToggleBtn.style, {
            background: 'transparent',
            border: 'none',
            color: '#555',
            fontSize: '13px',
            cursor: 'pointer',
            padding: '5px 0',
            marginTop: '5px',
            textAlign: 'left'
        });

        // Create prompt container (initially hidden)
        const promptContainer = document.createElement('div');
        promptContainer.id = 'web-assistant-prompt-container';
        Object.assign(promptContainer.style, {
            marginTop: '10px',
            display: 'none'
        });

        // Create prompt input
        const promptInput = document.createElement('textarea');
        promptInput.id = 'web-assistant-prompt';
        promptInput.placeholder = 'Enter your question about this page (optional)...';
        promptInput.rows = 2;
        Object.assign(promptInput.style, {
            padding: '10px',
            borderRadius: '6px',
            border: '1px solid #ddd',
            width: '100%',
            boxSizing: 'border-box',
            resize: 'vertical',
            fontFamily: 'inherit',
            fontSize: '14px',
            background: CONFIG.uiSettings.colors.inputBg
        });

        // Create response area (initially empty)
        const responseArea = document.createElement('div');
        responseArea.id = 'web-assistant-response';
        Object.assign(responseArea.style, {
            padding: '10px',
            borderRadius: '6px',
            background: CONFIG.uiSettings.colors.responseBg,
            border: '1px solid #ddd',
            marginTop: '5px',
            maxHeight: '200px',
            overflowY: 'auto',
            display: 'none'
        });

        // Add buttons to button container
        buttonContainer.appendChild(analyzeButton);
        buttonContainer.appendChild(chatgptButton);

        // Add prompt input to prompt container
        promptContainer.appendChild(promptInput);

        // Add elements to content area
        contentArea.appendChild(buttonContainer);
        contentArea.appendChild(promptToggleBtn);
        contentArea.appendChild(promptContainer);
        contentArea.appendChild(responseArea);

        // Add everything to the container
        container.appendChild(statusBar);
        container.appendChild(contentArea);
        document.body.appendChild(container);

        // Store references to UI elements
        uiElements.container = container;
        uiElements.statusBar = statusBar;
        uiElements.contentArea = contentArea;
        uiElements.buttonContainer = buttonContainer;
        uiElements.analyzeButton = analyzeButton;
        uiElements.chatgptButton = chatgptButton;
        uiElements.promptToggleBtn = promptToggleBtn;
        uiElements.promptContainer = promptContainer;
        uiElements.promptInput = promptInput;
        uiElements.responseArea = responseArea;
        uiElements.minimizeButton = minimizeButton;

        // Add event listeners
        analyzeButton.addEventListener('click', () => handleAnalyzeClick(false));
        chatgptButton.addEventListener('click', () => handleAnalyzeClick(true));
        minimizeButton.addEventListener('click', toggleMinimize);
        promptToggleBtn.addEventListener('click', togglePromptInput);

        // Make the status bar draggable
        makeDraggable(container, statusBar);
    }

    // Toggle prompt input visibility
    function togglePromptInput() {
        STATE.isPromptExpanded = !STATE.isPromptExpanded;

        if (STATE.isPromptExpanded) {
            uiElements.promptContainer.style.display = 'block';
            uiElements.promptToggleBtn.innerHTML = '➖ Hide prompt';
            // Focus the prompt input
            setTimeout(() => uiElements.promptInput.focus(), 0);
        } else {
            uiElements.promptContainer.style.display = 'none';
            uiElements.promptToggleBtn.innerHTML = '➕ Add prompt';
        }
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

    // Make an element draggable
    function makeDraggable(container, handle) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

        handle.style.cursor = 'move';
        handle.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            // Don't drag when clicking minimize button
            if (e.target === uiElements.minimizeButton) {
                return;
            }

            e = e || window.event;
            e.preventDefault();
            // Get the mouse cursor position at startup
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            // Call a function whenever the cursor moves
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault();
            // Calculate the new cursor position
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            // Set the element's new position
            container.style.top = (container.offsetTop - pos2) + "px";
            container.style.left = (container.offsetLeft - pos1) + "px";

            // Reset other positioning to allow manual positioning
            container.style.bottom = 'auto';
            container.style.right = 'auto';
        }

        function closeDragElement() {
            // Stop moving when mouse button is released
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }

    // Handle analyze button click
    function handleAnalyzeClick(viewInChatGPT = false) {
        if (!STATE.isServerAvailable) {
            showResponse('Error: Server not available. Please check the connection.', true);
            return;
        }

        if (STATE.isProcessing) {
            showResponse('Already processing a request. Please wait...', true);
            return;
        }

        // Get prompt if provided (optional)
        const prompt = STATE.isPromptExpanded ? uiElements.promptInput.value.trim() : '';

        // Extract and analyze content
        analyzePageContent(prompt, viewInChatGPT);
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

    // Analyze the page content with user prompt
    function analyzePageContent(prompt, viewInChatGPT) {
        // Update state and UI
        STATE.isProcessing = true;
        updateStatusText('Extracting page content...');
        uiElements.analyzeButton.disabled = true;
        uiElements.chatgptButton.disabled = true;
        uiElements.analyzeButton.textContent = 'Processing...';
        uiElements.chatgptButton.textContent = 'Processing...';

        try {
            // Extract content
            const content = extractPageContent();
            const chunks = chunkContent(content);

            // Generate a unique request ID
            const requestId = Date.now().toString();
            STATE.currentRequestId = requestId;

            // Update status
            updateStatusText(`Analyzing page content (${chunks.length} chunks)...`);

            // Send first chunk to start the process
            sendContentChunk(requestId, prompt, chunks, 0, viewInChatGPT);

        } catch (error) {
            console.error('Error extracting content:', error);
            updateStatusText('Error extracting content', true);
            showResponse(`Error extracting content: ${error.message}`, true);
            STATE.isProcessing = false;
            resetUI();
        }
    }

    // Send a content chunk to the server
    function sendContentChunk(requestId, prompt, chunks, chunkIndex, viewInChatGPT) {
        if (chunkIndex >= chunks.length) {
            // All chunks sent
            if (!viewInChatGPT) {
                // If not viewing in ChatGPT, start polling for results
                pollForResults(requestId);
            } else {
                // If viewing in ChatGPT, we're done here
                updateStatusText('Opened in ChatGPT');
                showResponse('Content is being processed in ChatGPT. Please check the new browser tab.');
                STATE.isProcessing = false;
                resetUI();
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
        updateStatusText(`Sending chunk ${chunkIndex + 1}/${chunks.length}...`);

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
                        sendContentChunk(requestId, prompt, chunks, chunkIndex + 1, viewInChatGPT);
                    } else {
                        console.error('Error sending chunk:', result.error);
                        updateStatusText('Error sending content', true);
                        showResponse(`Error sending chunk ${chunkIndex + 1}: ${result.error}`, true);
                        STATE.isProcessing = false;
                        resetUI();
                    }
                } catch (e) {
                    console.error('Error parsing response:', e);
                    updateStatusText('Error processing response', true);
                    showResponse('Server returned an invalid response', true);
                    STATE.isProcessing = false;
                    resetUI();
                }
            },
            onerror: (error) => {
                console.error('Request error:', error);
                updateStatusText('Connection error', true);
                showResponse('Failed to connect to the server', true);
                STATE.isProcessing = false;
                resetUI();
            }
        });
    }

    // Poll for results from the server
    function pollForResults(requestId) {
        updateStatusText('Waiting for ChatGPT analysis...');
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
                resetUI();
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
                            updateStatusText(`Waiting for analysis... (${pollCount * 2}s)`);
                            return;
                        }

                        if (response.status === 200) {
                            const result = JSON.parse(response.responseText);

                            if (result.success && result.response) {
                                // Process is complete
                                clearInterval(pollInterval);
                                updateStatusText('Analysis complete');
                                showResponse(result.response);
                                STATE.isProcessing = false;
                                resetUI();
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
    function resetUI() {
        uiElements.analyzeButton.disabled = false;
        uiElements.chatgptButton.disabled = false;
        uiElements.analyzeButton.textContent = 'Analyze Page';
        uiElements.chatgptButton.textContent = 'See in ChatGPT';
    }

    // Wait for DOM to be fully loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAssistant);
    } else {
        initAssistant();
    }
})();