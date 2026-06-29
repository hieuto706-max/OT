const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(() => {
    // Create a headless browser window
    const win = new BrowserWindow({
        show: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    const svgPath = path.join(__dirname, '..', 'favicon.svg');
    const pngPath = path.join(__dirname, '..', 'favicon.png');

    if (!fs.existsSync(svgPath)) {
        console.error('Error: favicon.svg not found!');
        app.exit(1);
        return;
    }

    const svgContent = fs.readFileSync(svgPath, 'utf-8');

    // Create a simple page that renders the SVG to a canvas
    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { margin: 0; padding: 0; background: transparent; }
                canvas { display: block; }
            </style>
        </head>
        <body>
            <canvas id="canvas" width="512" height="512"></canvas>
            <script>
                const { ipcRenderer } = require('electron');
                const canvas = document.getElementById('canvas');
                const ctx = canvas.getContext('2d');
                
                // SVG content string
                const svgString = \`${svgContent.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`;
                
                // Load SVG as image
                const img = new Image();
                const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
                const url = URL.createObjectURL(svgBlob);
                
                img.onload = function() {
                    ctx.drawImage(img, 0, 0, 512, 512);
                    URL.revokeObjectURL(url);
                    
                    // Export canvas to PNG data URL
                    const dataUrl = canvas.toDataURL('image/png');
                    ipcRenderer.send('png-export', dataUrl);
                };
                img.onerror = function(err) {
                    ipcRenderer.send('png-export-error', err.toString());
                };
                img.src = url;
            </script>
        </body>
        </html>
    `;

    // Load the HTML content directly
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));

    // Handle export message from renderer process
    ipcMain.on('png-export', (event, dataUrl) => {
        try {
            const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
            fs.writeFileSync(pngPath, Buffer.from(base64Data, 'base64'));
            console.log('Successfully rendered SVG to PNG at 512x512!');
            app.exit(0);
        } catch (err) {
            console.error('Failed to write PNG:', err);
            app.exit(1);
        }
    });

    ipcMain.on('png-export-error', (event, errStr) => {
        console.error('Renderer error:', errStr);
        app.exit(1);
    });
});
