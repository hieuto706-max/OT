const fs = require('fs');
const path = require('path');
const vm = require('vm');

const jsPath = path.join(__dirname, '..', 'desktop', 'app.js');
const jsCode = fs.readFileSync(jsPath, 'utf8');

// Mock a basic browser environment
const domMock = {
    addEventListener: () => {},
    createElement: () => ({
        textContent: '',
        style: {}
    }),
    head: {
        appendChild: () => {}
    },
    body: {
        appendChild: () => {}
    },
    getElementById: (id) => {
        return {
            addEventListener: () => {},
            value: '',
            style: {},
            classList: { add: () => {}, remove: () => {} },
            textContent: '',
            innerHTML: ''
        };
    }
};

const windowMock = {
    document: domMock,
    navigator: {
        userAgent: 'NodeJS'
    },
    location: {
        hostname: 'localhost',
        origin: 'http://localhost:3456',
        protocol: 'http:'
    },
    localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
    },
    sessionStorage: {
        getItem: () => null,
        setItem: () => {}
    },
    addEventListener: () => {}
};

const context = vm.createContext({
    window: windowMock,
    document: domMock,
    navigator: windowMock.navigator,
    localStorage: windowMock.localStorage,
    sessionStorage: windowMock.sessionStorage,
    setTimeout: setTimeout,
    setInterval: setInterval,
    console: console,
    fetch: () => Promise.resolve({ json: () => Promise.resolve({}) }),
    EventSource: function() { return { onmessage: null }; }
});

try {
    vm.runInContext(jsCode, context);
    console.log('Obfuscated JS executed without errors.');
    
    // Now let's see if we can call the exposed functions
    console.log('Exposed on window:', Object.keys(windowMock).filter(k => typeof windowMock[k] === 'function'));
    
    // Let's print windowMock properties
    for (const key of ['addTeamFromModal', 'renameTeamFromModal', 'deleteTeamFromModal']) {
        console.log(`window.${key} exists:`, typeof windowMock[key]);
    }
} catch (e) {
    console.error('Error running obfuscated code in VM:', e);
}
