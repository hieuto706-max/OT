const fs = require('fs');
const path = require('path');
const vm = require('vm');

const jsPath = path.join(__dirname, '..', 'desktop', 'app.js');
const jsCode = fs.readFileSync(jsPath, 'utf8');

const elementsById = {};
const getMockElement = (id) => {
    if (!elementsById[id]) {
        elementsById[id] = {
            id: id,
            addEventListener: () => {},
            value: '',
            style: {},
            classList: { 
                add: (cls) => { console.log(`[DOM ${id}] classList.add(${cls})`); }, 
                remove: (cls) => { console.log(`[DOM ${id}] classList.remove(${cls})`); } 
            },
            textContent: '',
            innerHTML: '',
            appendChild: (child) => {
                console.log(`[DOM ${id}] appendChild`);
            },
            remove: () => {}
        };
    }
    return elementsById[id];
};

const domMock = {
    addEventListener: (event, callback) => {
        if (event === 'DOMContentLoaded') {
            setTimeout(callback, 10);
        }
    },
    createElement: (tag) => {
        const el = getMockElement(`new-${tag}-${Math.random().toString(36).substring(2, 6)}`);
        el.tagName = tag.toUpperCase();
        return el;
    },
    head: getMockElement('head'),
    body: getMockElement('body'),
    documentElement: getMockElement('html'),
    getElementById: (id) => {
        return getMockElement(id);
    },
    querySelectorAll: (selector) => {
        return [getMockElement('selector-match')];
    }
};

const windowMock = {
    document: domMock,
    navigator: {
        userAgent: 'Electron'
    },
    location: {
        hostname: 'localhost',
        origin: 'http://localhost:3456',
        protocol: 'http:'
    },
    localStorage: {
        getItem: (key) => {
            if (key === 'ot_current_user') {
                return JSON.stringify({ username: 'admin', fullname: 'Admin User', role: 'admin' });
            }
            return null;
        },
        setItem: () => {},
        removeItem: () => {}
    },
    sessionStorage: {
        getItem: () => null,
        setItem: () => {}
    },
    addEventListener: () => {},
    fetch: global.fetch,
    EventSource: function() { return { onmessage: null }; }
};

const context = vm.createContext({
    window: windowMock,
    document: domMock,
    navigator: windowMock.navigator,
    localStorage: windowMock.localStorage,
    sessionStorage: windowMock.sessionStorage,
    setTimeout: setTimeout,
    setInterval: () => {},
    console: console,
    fetch: global.fetch,
    EventSource: windowMock.EventSource
});

try {
    vm.runInContext(jsCode, context);
    
    // Wait for DOMContentLoaded to fire and initialize
    setTimeout(() => {
        try {
            console.log('DOMContentLoaded fired.');
            
            // Set TEAMS manually since network fetch might be skipped/failed in VM
            context.TEAMS = ['Team A', 'Team B', 'Team C'];
            
            if (typeof context.openTeamSettingsModal === 'function') {
                console.log('Calling openTeamSettingsModal...');
                context.openTeamSettingsModal();
                
                console.log('--- MODAL RESULTS ---');
                console.log('Modal Title:', elementsById['modal-title'] ? elementsById['modal-title'].textContent : 'Not Set');
                console.log('Modal Body:\n', elementsById['modal-body'] ? elementsById['modal-body'].innerHTML : 'Not Set');
            } else {
                console.log('openTeamSettingsModal is not a function in context');
            }
        } catch (innerEx) {
            console.error('Error during test execution:', innerEx);
        }
    }, 50);

} catch (e) {
    console.error('Error running obfuscated code in VM:', e);
}
