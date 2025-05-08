// ==UserScript==
// @name         ChatGPT Connector (Enhanced)
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Connector script with status bar response formatting and view-only mode
// @author       You
// @match        https://chatgpt.com/*
// @grant        GM_xmlhttpRequest
// @connect      localhost
// ==/UserScript==

(function() {
    'use strict';

    const PORT = 8765;
    const SERVER_URL = `http://localhost:${PORT}/content`;
    const RESPONSE_URL = `http://localhost:${PORT}/response`;

    // Show status notifications
    const showStatus = (() => {
        const el = document.createElement('div');
        Object.assign(el.style, {
            position: 'fixed', top: '10px', left: '50%', transform: 'translateX(-50%)',
            zIndex: '10000', padding: '10px 15px', background: '#10a37f',
            borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
            color: 'white', fontFamily: 'Arial', fontSize: '14px', fontWeight: 'bold'
        });
        document.body.appendChild(el);

        return (msg, isError) => {
            el.textContent = msg;
            el.style.background = isError ? '#e34234' : '#10a37f';
        };
    })();

    // Wait for ChatGPT UI to load
    const waitForChatGPT = () => new Promise(resolve => {
        const interval = setInterval(() => {
            if (document.querySelector('textarea[placeholder^="Send a message"]') ||
                document.querySelector('div[contenteditable="true"]')) {
                clearInterval(interval);
                resolve();
            }
        }, 500);
    });

    // Get content from local server
    const fetchPageContent = () => new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'GET',
            url: SERVER_URL,
            onload: (response) => {
                if (response.status === 200) {
                    try {
                        const data = JSON.parse(response.responseText);
                        resolve({
                            content: data.content,
                            prompt: data.prompt,
                            requestId: data.requestId,
                            viewInChatGPT: data.viewInChatGPT || false
                        });
                    } catch (error) {
                        reject('Error parsing content: ' + error);
                    }
                } else {
                    reject(`Server error: ${response.status}`);
                }
            },
            onerror: (error) => reject('Connection error: ' + error)
        });
    });

    // Find the chat input field
    const findChatInput = () => {
        const selectors = [
            'textarea[placeholder^="Send a message"]',
            'div[contenteditable="true"]',
            'textarea.w-full'
        ];

        return selectors.map(s => document.querySelector(s)).find(el => el);
    };

    // Find the send button using multiple strategies
    const findSendButton = () => {
        const buttonSelectors = [
            'button[aria-label="Send message"]',
            'button[data-testid="send-button"]',
            'button.absolute.p-1.rounded-md',
            'button svg[data-testid="send-icon"]',
            'button.absolute.right-2',
            'button:has(svg)',
            'form button[type="submit"]'
        ];

        // Try each selector
        for (const selector of buttonSelectors) {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
                if (el.tagName === 'BUTTON' &&
                    (el.textContent.trim() === '' ||
                     el.textContent.toLowerCase().includes('send') ||
                     el.getAttribute('aria-label')?.toLowerCase().includes('send'))) {
                    return el;
                }

                if (el.querySelector('svg')) {
                    return el;
                }
            }
        }

        // Try the last button in the form as fallback
        const form = document.querySelector('form');
        if (form) {
            const buttons = form.querySelectorAll('button');
            if (buttons.length > 0) {
                return buttons[buttons.length - 1];
            }
        }

        return null;
    };

    // Fill the chat input with content
    const fillChatInput = (content) => {
        const input = findChatInput();
        if (!input) throw new Error('ChatGPT input not found');

        input.focus();
        if (input.tagName === 'TEXTAREA') {
            input.value = content;
        } else {
            input.innerText = content;
        }

        // Trigger input event to enable the send button
        input.dispatchEvent(new Event('input', { bubbles: true }));

        return input;
    };

    // Submit message to ChatGPT
    const submitMessage = async (message) => {
        return new Promise((resolve, reject) => {
            try {
                // Fill the input with the message
                fillChatInput(message);

                // Try to click the send button
                setTimeout(() => {
                    const sendButton = findSendButton();
                    if (sendButton) {
                        sendButton.click();
                        resolve(true);
                    } else {
                        // Fallback to Enter key
                        const input = findChatInput();
                        if (input) {
                            input.dispatchEvent(new KeyboardEvent('keydown', {
                                key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true
                            }));
                            resolve(true);
                        } else {
                            reject('Send button and input not found');
                        }
                    }
                }, 300);
            } catch (err) {
                reject(err);
            }
        });
    };

    // Wait for ChatGPT's response
    const waitForResponse = () => new Promise(resolve => {
        let started = false;
        let lastResponseText = '';
        let stableCount = 0;
        const MAX_WAIT_TIME = 180000; // 3 minutes
        const startTime = Date.now();

        // Create observer to watch for changes in ChatGPT's responses
        const observer = new MutationObserver(mutations => {
            // Check if maximum wait time exceeded
            if (Date.now() - startTime > MAX_WAIT_TIME) {
                observer.disconnect();
                showStatus('Maximum wait time exceeded, capturing current response');
                setTimeout(resolve, 1000);
                return;
            }

            // Check if response has started
            if (isThinking() || document.querySelectorAll('[data-message-author-role="assistant"]').length > 0) {
                started = true;
                const currentResponseText = getResponseText();

                if (currentResponseText === lastResponseText) {
                    stableCount++;

                    // Wait for completion indicators
                    const completionIndicators = document.querySelectorAll(
                        'button:not([disabled])[aria-label="Regenerate response"],' +
                        'button:not([disabled])[data-testid="regenerate-response-button"],' +
                        '.prose [id^="message-completion-status"]'
                    ).length > 0;

                    // Response is considered complete when stable for a while and not thinking
                    if (!isThinking() && (completionIndicators || stableCount >= 15)) {
                        observer.disconnect();
                        setTimeout(resolve, 1000);
                    }
                } else {
                    stableCount = 0;
                    lastResponseText = currentResponseText;
                }
            }
        });

        // Start observing
        const chatContainer = document.querySelector('main') || document.body;
        observer.observe(chatContainer, {
            childList: true, subtree: true, characterData: true, attributes: true
        });

        showStatus('Waiting for ChatGPT to respond...');

        // Timeout if response never starts
        setTimeout(() => {
            if (!started) {
                observer.disconnect();
                showStatus('No response detected after 30s, continuing...', true);
                resolve();
            }
        }, 30000);
    });

    // Check if ChatGPT is still generating a response
    const isThinking = () => {
        return document.querySelector('.result-thinking') !== null ||
               document.querySelector('[role="progressbar"]') !== null ||
               document.querySelector('.animate-spin') !== null ||
               document.querySelector('[data-state="loading"]') !== null;
    };

    // Get current response text from ChatGPT
    const getResponseText = () => {
        const responses = document.querySelectorAll('[data-message-author-role="assistant"]');
        if (!responses.length) return '';
        return responses[responses.length - 1].textContent;
    };

    // Send the response back to the server
    const sendResponseToServer = (response, requestId) => new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'POST',
            url: RESPONSE_URL,
            data: JSON.stringify({
                response,
                requestId
            }),
            headers: { 'Content-Type': 'application/json' },
            onload: (response) => {
                if (response.status === 200) resolve();
                else reject(`Server error: ${response.status}`);
            },
            onerror: () => reject('Connection error')
        });
    });

    // Process the page content
    const processPageContent = async (content, prompt, requestId, viewInChatGPT) => {
        try {
            showStatus('Preparing to analyze page content...');

            // Format the query differently based on mode
            let formattedPrompt;

            if (viewInChatGPT) {
                // Simple format for view-only mode
                formattedPrompt = `
User prompt: "${prompt || "Analyze this page content"}"

I'll share content from a webpage below. Please answer the user's prompt based on this content.
If the content doesn't contain information to answer the prompt, please state that clearly.

Page content:
${content}
`;
            } else {
                // Format with instruction to format response for status bar
                formattedPrompt = `
User prompt: "${prompt || "Analyze this page content"}"

I'll share content from a webpage below. Please answer the user's prompt based on this content.
If the content doesn't contain information to answer the prompt, please state that clearly.

IMPORTANT: Your response will be displayed in a small status bar, so please:
1. Keep your response concise and to the point (ideally under 200 characters)
2. Format it to be easily readable in a small space
3. Focus on the most important insights or actionable information
4. Avoid unnecessary explanations or verbosity

Page content:
${content}

Remember to provide ONLY the final, concise response formatted for display in a small status bar.
`;
            }

            // Submit the message to ChatGPT
            showStatus('Sending content to ChatGPT...');
            await submitMessage(formattedPrompt);

            // Wait for the response
            showStatus('Waiting for ChatGPT to analyze...');
            await waitForResponse();

            // Get the response
            const response = getResponseText();

            if (!viewInChatGPT) {
                // If not in view-only mode, send the response back to the server
                showStatus('Sending response back to server...');
                await sendResponseToServer(response, requestId);

                showStatus('Analysis complete! This tab is about to close.');

                // Close this tab automatically after a delay
                setTimeout(() => window.close(), 3000);
            } else {
                // In view-only mode, just show a status message
                showStatus('Analysis complete in ChatGPT! This tab will remain open.');
            }

            return response;
        } catch (error) {
            showStatus(`Error: ${error}`, true);
            console.error('Error processing page content:', error);

            // If not in view-only mode, try to send an error message
            if (!viewInChatGPT) {
                try {
                    await sendResponseToServer(`Error processing content: ${error}`, requestId);
                } catch (e) {
                    console.error('Failed to send error to server:', e);
                }
            }
        }
    };

    // Main workflow
    const run = async () => {
        try {
            await waitForChatGPT();
            showStatus('Fetching page content to analyze...');

            const { content, prompt, requestId, viewInChatGPT } = await fetchPageContent();

            const actionType = viewInChatGPT ? "viewing in ChatGPT" : "analyzing";
            showStatus(`${actionType} content with prompt: "${prompt || "No prompt (default analysis)"}"...`);

            await processPageContent(content, prompt, requestId, viewInChatGPT);

        } catch (err) {
            showStatus(`Error: ${err}`, true);
            console.error('Web Assistant error:', err);
        }
    };

    // Start the process
    run();
})();