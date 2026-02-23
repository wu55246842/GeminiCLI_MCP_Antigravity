document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chatForm');
    const messageInput = document.getElementById('messageInput');
    const fileInput = document.getElementById('fileInput');
    const filePreviewContainer = document.getElementById('filePreviewContainer');
    const chatWindow = document.getElementById('chatWindow');
    const sendBtn = document.getElementById('sendBtn');

    // Dual Engine Features
    const engineToggle = document.getElementById('engineToggle');
    const apiLabel = document.querySelector('.api-label');
    const cliLabel = document.querySelector('.cli-label');
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const closeBtn = document.querySelector('.close-btn');
    const saveKeyBtn = document.getElementById('saveKeyBtn');
    const privateKeyInput = document.getElementById('privateKeyInput');
    const keyStatusMsg = document.getElementById('keyStatusMsg');

    let currentEngine = 'cli'; // 'api' or 'cli'
    let eventSource = null;
    let currentCLIStreamBlock = null;

    let selectedFiles = [];
    let chatHistory = []; // { role: 'user' | 'model', parts: [{text: ""}] }

    // marked.js configuration for highlight.js
    marked.setOptions({
        highlight: function (code, lang) {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
        },
        langPrefix: 'hljs language-'
    });

    // Handle Engine Toggle
    engineToggle.addEventListener('change', (e) => {
        if (e.target.checked) {
            currentEngine = 'cli';
            apiLabel.classList.remove('active');
            cliLabel.classList.add('active');
            chatForm.setAttribute('data-engine', 'cli');
            messageInput.placeholder = "Message Local Gemini CLI...";
            // Disable file upload visibly
            selectedFiles = [];
            filePreviewContainer.innerHTML = '';

            // Connect to SSE stream
            initSSE();
        } else {
            currentEngine = 'api';
            apiLabel.classList.add('active');
            cliLabel.classList.remove('active');
            chatForm.removeAttribute('data-engine');
            messageInput.placeholder = "Message Gemini...";

            if (eventSource) {
                eventSource.close();
                eventSource = null;
            }
        }
        updateSendButtonState();
    });

    // Initialize default engine mode (CLI) on load
    engineToggle.dispatchEvent(new Event('change'));

    function initSSE() {
        if (eventSource) return;

        const timestamp = new Date().toISOString();
        const payloadToSign = `GET:/api/chat/stream:${timestamp}`;

        signData(payloadToSign).then(signatureBase64 => {
            if (signatureBase64 === "UNSUPPORTED_CONTEXT") {
                console.warn("Cannot initialize SSE stream over insecure HTTP.");
                alert("Security Error: SSE stream cannot be established. Please use localhost or setup HTTPS, as mobile browsers block cryptographic APIs on plain HTTP.");
                // Fall back visually to API mode if they can't use CLI
                engineToggle.click();
                return;
            }

            if (!signatureBase64) {
                console.warn("No private key configured, SSE stream will likely be rejected.");
                // We let it try anyway so the backend 401 shows up or if the system disables auth
            }
            // Unfortunately EventSource doesn't support custom headers natively.
            // But we must send auth. The closest native alternative is fetch with streams.
            // However, to keep it simple and maintain EventSource, we can append it as a query param 
            // OR we can switch to `fetch` for streaming.
            // We'll reimplement streaming via `fetch` since security headers are mandatory now.
            startFetchStream(timestamp, signatureBase64);
        });
    }

    async function startFetchStream(timestamp, signatureBase64) {
        try {
            const response = await fetch('/api/chat/stream', {
                method: 'GET',
                headers: {
                    'x-timestamp': timestamp,
                    'x-signature': signatureBase64
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    alert("Unauthorized. Your Private Key is invalid or expired.");
                }
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");

            eventSource = { close: () => { reader.cancel(); } }; // mock closeable object

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                // Parse standard SSE payload "data: {text: ...}\n\n"
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.substring(6));
                            if (data.text) handleStreamChunk(data.text);
                        } catch (e) {
                            console.error("SSE Parse Error", e);
                        }
                    }
                }
            }
        } catch (err) {
            console.error("Fetch Stream Error:", err);
        }
    }

    function handleStreamChunk(text) {
        removeLoadingIndicator();
        if (!currentCLIStreamBlock) {
            currentCLIStreamBlock = createModelMessageBlock();
            currentCLIStreamBlock.rawText = "";
        }

        currentCLIStreamBlock.rawText += text;
        const html = marked.parse(currentCLIStreamBlock.rawText);
        // add blinker
        currentCLIStreamBlock.contentDiv.innerHTML = html + '<span class="cli-typing"></span>';
        scrollToBottom();
    }

    // Handle auto-resizing textarea
    messageInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        updateSendButtonState();
    });

    // Handle Enter key for multiline formats (Enter -> submit, Shift+Enter -> newline)
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (e.shiftKey) {
                // Natural 'Shift+Enter' just inserts a new line. We let it propagate.
                // We don't preventDefault() here, letting the textarea behave like an IDE.
            } else {
                // Just Enter -> send
                e.preventDefault();
                if (messageInput.value.trim() || selectedFiles.length > 0) {
                    chatForm.dispatchEvent(new Event('submit'));
                }
            }
        }
    });

    // ----------------------------------------------------
    // SECURITY AUTHENTICATION (RSA Public Key pairing)
    // ----------------------------------------------------

    // Settings Modal Handlers
    settingsBtn.addEventListener('click', () => {
        privateKeyInput.value = localStorage.getItem('gemini_cli_private_key') || '';
        keyStatusMsg.textContent = '';
        settingsModal.style.display = 'block';
    });

    closeBtn.addEventListener('click', () => {
        settingsModal.style.display = 'none';
    });

    window.addEventListener('click', (e) => {
        if (e.target == settingsModal) {
            settingsModal.style.display = 'none';
        }
    });

    saveKeyBtn.addEventListener('click', () => {
        const val = privateKeyInput.value.trim();
        if (val) {
            localStorage.setItem('gemini_cli_private_key', val);
            keyStatusMsg.textContent = 'Key saved securely in LocalStorage.';
            keyStatusMsg.style.color = '#4ade80';
        } else {
            localStorage.removeItem('gemini_cli_private_key');
            keyStatusMsg.textContent = 'Key removed.';
            keyStatusMsg.style.color = '#a0aec0';
        }
        setTimeout(() => settingsModal.style.display = 'none', 1000);
    });

    function str2ab(str) {
        const buf = new ArrayBuffer(str.length);
        const bufView = new Uint8Array(buf);
        for (let i = 0, strLen = str.length; i < strLen; i++) {
            bufView[i] = str.charCodeAt(i);
        }
        return buf;
    }

    async function importPrivateKey(pem) {
        // Fetch the part of the PEM string between header and footer
        const pemHeader = "-----BEGIN PRIVATE KEY-----";
        const pemFooter = "-----END PRIVATE KEY-----";

        if (!pem.includes(pemHeader) || !pem.includes(pemFooter)) {
            throw new Error("Invalid PEM format.");
        }

        const pemContents = pem.substring(
            pem.indexOf(pemHeader) + pemHeader.length,
            pem.indexOf(pemFooter)
        ).replace(/\s/g, ''); // remove newlines/spaces

        const binaryDerString = window.atob(pemContents);
        const binaryDer = str2ab(binaryDerString);

        return await window.crypto.subtle.importKey(
            "pkcs8",
            binaryDer,
            {
                name: "RSA-PSS",
                hash: "SHA-256",
            },
            true,
            ["sign"]
        );
    }

    async function signData(payload) {
        const pemKey = localStorage.getItem('gemini_cli_private_key');
        if (!pemKey) return null;

        if (!window.crypto || !window.crypto.subtle) {
            console.error("Web Crypto API is not available. This is usually because you are accessing the site via HTTP instead of HTTPS or localhost.");
            return "UNSUPPORTED_CONTEXT";
        }

        try {
            const privateKey = await importPrivateKey(pemKey);
            const enc = new TextEncoder();

            const signature = await window.crypto.subtle.sign(
                {
                    name: "RSA-PSS",
                    saltLength: 32, // required parameter
                },
                privateKey,
                enc.encode(payload)
            );

            // Convert ArrayBuffer to Base64
            let binary = '';
            const bytes = new Uint8Array(signature);
            const len = bytes.byteLength;
            for (let i = 0; i < len; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            return window.btoa(binary);
        } catch (e) {
            console.error("Signature creation failed:", e);
            return null;
        }
    }

    // File input handling
    fileInput.addEventListener('change', handleFiles);

    function handleFiles(e) {
        if (currentEngine === 'cli') {
            e.target.value = '';
            alert("File upload is not supported in Local CLI mode.");
            return;
        }
        const files = Array.from(e.target.files);
        files.forEach(file => {
            selectedFiles.push(file);
            renderFileChip(file);
        });
        fileInput.value = ''; // Reset
        updateSendButtonState();
    }

    // Drag and drop support
    chatWindow.addEventListener('dragover', (e) => {
        e.preventDefault();
        chatWindow.style.opacity = '0.5';
    });
    chatWindow.addEventListener('dragleave', () => {
        chatWindow.style.opacity = '1';
    });
    chatWindow.addEventListener('drop', (e) => {
        e.preventDefault();
        chatWindow.style.opacity = '1';
        if (e.dataTransfer.files.length) {
            const files = Array.from(e.dataTransfer.files);
            files.forEach(file => {
                selectedFiles.push(file);
                renderFileChip(file);
            });
            updateSendButtonState();
        }
    });

    // Paste image support
    messageInput.addEventListener('paste', (e) => {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const blob = items[i].getAsFile();
                selectedFiles.push(blob);
                renderFileChip(blob);
                updateSendButtonState();
            }
        }
    });

    function renderFileChip(file) {
        const chip = document.createElement('div');
        chip.className = 'file-chip';

        let previewHtml = '';
        if (file.type.startsWith('image/')) {
            const tempUrl = URL.createObjectURL(file);
            previewHtml = `<img src="${tempUrl}" alt="Preview">`;
        }

        chip.innerHTML = `
            ${previewHtml}
            <span>${file.name || 'Pasted Image'}</span>
            <span class="remove-file">&times;</span>
        `;

        chip.querySelector('.remove-file').addEventListener('click', () => {
            selectedFiles = selectedFiles.filter(f => f !== file);
            chip.remove();
            updateSendButtonState();
        });

        filePreviewContainer.appendChild(chip);
    }

    function updateSendButtonState() {
        const hasText = messageInput.value.trim().length > 0;
        const hasFiles = selectedFiles.length > 0;
        sendBtn.disabled = !(hasText || hasFiles);
    }

    // Chat functionality
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const text = messageInput.value.trim();
        if (!text && selectedFiles.length === 0) return;

        // 1. Render User Message immediately
        appendUserMessage(text, selectedFiles);

        // 2. Prepare Form Data
        const formData = new FormData();
        formData.append('text', text);
        formData.append('engine', currentEngine);
        formData.append('history', JSON.stringify(chatHistory));
        selectedFiles.forEach(file => {
            formData.append('files', file);
        });

        // 3. Update History local state (for context)
        const userParts = [];
        if (text) userParts.push({ text });
        // (We don't append file objects to local history for simplicity, let the backend see text context)
        chatHistory.push({ role: 'user', parts: userParts });

        // 4. Cleanup Input
        messageInput.value = '';
        messageInput.style.height = 'auto'; // Reset size
        selectedFiles = [];
        filePreviewContainer.innerHTML = '';
        updateSendButtonState();

        // Remove welcome message
        const welcome = document.querySelector('.welcome-message');
        if (welcome) welcome.remove();

        // 5. Show Loading
        const indicator = showLoadingIndicator();
        scrollToBottom();

        // 6. Security Authentication (Generate Signature)
        const timestamp = new Date().toISOString();
        const payloadToSign = `POST:/api/chat:${timestamp}`;
        let signatureBase64 = await signData(payloadToSign);

        if (signatureBase64 === "UNSUPPORTED_CONTEXT") {
            indicator.remove();
            alert("Security Error: The Cryptographic Security module requires a Secure Context. You cannot use this app over plain HTTP (like 192.168.x.x) on mobile devices due to browser restrictions. Please use localhost or setup HTTPS.");
            return;
        }

        if (!signatureBase64) {
            indicator.remove();
            alert("Error: Missing Private Key. Please add your Private Key in settings to send commands.");
            return;
        }

        // 7. Send Request
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'x-timestamp': timestamp,
                    'x-signature': signatureBase64
                },
                body: formData
            });

            const data = await response.json();

            if (currentEngine === 'api') {
                indicator.remove();
                if (data.error) {
                    appendModelMessage(`Error: ${data.error}`);
                } else {
                    appendModelMessage(data.text);
                    chatHistory.push({ role: 'model', parts: [{ text: data.text }] });
                }
            } else if (currentEngine === 'cli') {
                // CLI mode: the response just says "ok, streaming". 
                // We keep the loading indicator until the first SSE chunk arrives.
                // Reset the stream block for the new message
                currentCLIStreamBlock = null;
            }
        } catch (error) {
            indicator.remove();
            appendModelMessage("Network error: Could not reach the server.");
            console.error(error);
        }

        scrollToBottom();
    });

    function appendUserMessage(text, files) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message user';
        msgDiv.style.position = 'relative';

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        if (text) {
            contentDiv.textContent = text; // Secure from XSS
        }

        files.forEach(file => {
            if (file.type.startsWith('image/')) {
                const img = document.createElement('img');
                img.src = URL.createObjectURL(file);
                contentDiv.appendChild(img);
            } else {
                const p = document.createElement('p');
                p.textContent = `📎 ${file.name}`;
                p.style.fontSize = '0.8rem';
                p.style.opacity = '0.8';
                contentDiv.appendChild(p);
            }
        });

        msgDiv.appendChild(contentDiv);

        // Add copy button
        if (text) {
            const copyBtn = createCopyButton(text);
            msgDiv.appendChild(copyBtn);
        }

        chatWindow.appendChild(msgDiv);
        scrollToBottom();
    }

    function appendModelMessage(markdownText) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message model';

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.innerHTML = marked.parse(markdownText); // Render Markdown

        msgDiv.appendChild(contentDiv);

        // Add copy button
        if (markdownText) {
            const copyBtn = createCopyButton(markdownText);
            msgDiv.appendChild(copyBtn);
        }

        chatWindow.appendChild(msgDiv);
    }

    function createModelMessageBlock() {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message model';

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        msgDiv.appendChild(contentDiv);

        // The copy button might need to copy dynamically updating text
        const copyBtn = createCopyButton("");
        msgDiv.appendChild(copyBtn);

        chatWindow.appendChild(msgDiv);

        return {
            element: msgDiv,
            contentDiv: contentDiv,
            copyBtn: copyBtn,
            rawText: ""
        };
    }

    function createCopyButton(initialText) {
        const btn = document.createElement('button');
        btn.className = 'copy-btn';
        // SVG Icon for copy
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        btn.title = "Copy message";

        // Store text on the element so it can be updated dynamically for streaming chunks
        btn.dataset.text = initialText;

        btn.addEventListener('click', async () => {
            try {
                // If it's a CLI streaming block, grab the latest rawText from parent scope or dataset
                let textToCopy = btn.dataset.text;

                // For dynamic streaming messages where dataset isn't updated every chunk
                if (!textToCopy && btn.parentElement.parentElement) {
                    // Get all text content from the message-content div
                    const contentDiv = btn.parentElement.parentElement.querySelector('.message-content');
                    if (contentDiv) textToCopy = contentDiv.innerText;
                }

                await navigator.clipboard.writeText(textToCopy);

                // Show success feedback
                const originalHtml = btn.innerHTML;
                btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                setTimeout(() => {
                    btn.innerHTML = originalHtml;
                }, 2000);
            } catch (err) {
                console.error('Failed to copy text: ', err);
            }
        });
        return btn;
    }

    function showLoadingIndicator() {
        if (document.querySelector('.typing-indicator')) return null; // Avoid duplicates
        const indicator = document.createElement('div');
        indicator.className = 'typing-indicator';
        indicator.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
        chatWindow.appendChild(indicator);
        return indicator;
    }

    function removeLoadingIndicator() {
        const indicator = document.querySelector('.typing-indicator');
        if (indicator) indicator.remove();

        // Also remove any existing CLI typing carot from prev blocks
        document.querySelectorAll('.cli-typing').forEach(el => el.remove());
    }

    function scrollToBottom() {
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }
});
