const fs = require('fs');
const path = require('path');
const readline = require('readline');

const OWNER = 'hieuto706-max';
const REPO = 'OT';
const TAG = 'v1.3.6';
const ASSET_PATH = path.join(__dirname, '..', 'dist', 'ot-manager-Setup-1.3.6.exe');

async function main() {
    let token = process.env.GITHUB_TOKEN;
    if (!token || token.includes('dummy')) {
        console.log('No valid GITHUB_TOKEN found in environment variables.');
        token = await new Promise((resolve) => {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            rl.question('Please enter your GitHub Personal Access Token (PAT) with repo scope: ', (answer) => {
                rl.close();
                resolve(answer.trim());
            });
        });
    }

    if (!token) {
        console.error('Error: GitHub token is required.');
        process.exit(1);
    }

    if (!fs.existsSync(ASSET_PATH)) {
        console.error(`Error: Asset file not found at ${ASSET_PATH}`);
        process.exit(1);
    }

    const stats = fs.statSync(ASSET_PATH);
    const fileSize = stats.size;
    console.log(`Asset found: ${ASSET_PATH} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);

    console.log(`Checking if release ${TAG} already exists...`);
    let releaseId = null;
    let uploadUrl = null;

    try {
        const checkRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/tags/${TAG}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json',
                'User-Agent': 'Node.js-Fetch'
            }
        });

        if (checkRes.status === 200) {
            const existingRelease = await checkRes.json();
            releaseId = existingRelease.id;
            uploadUrl = existingRelease.upload_url;
            console.log(`Release ${TAG} already exists (ID: ${releaseId}).`);
        } else if (checkRes.status === 404) {
            console.log(`Release ${TAG} does not exist. Creating new release...`);
            const createRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github+json',
                    'Content-Type': 'application/json',
                    'User-Agent': 'Node.js-Fetch'
                },
                body: JSON.stringify({
                    tag_name: TAG,
                    target_commitish: 'main',
                    name: TAG,
                    body: `Automated release for version ${TAG}`,
                    draft: false,
                    prerelease: false
                })
            });

            if (!createRes.ok) {
                const errorData = await createRes.text();
                throw new Error(`Failed to create release: ${createRes.statusText}. Details: ${errorData}`);
            }

            const newRelease = await createRes.json();
            releaseId = newRelease.id;
            uploadUrl = newRelease.upload_url;
            console.log(`Release ${TAG} created successfully (ID: ${releaseId}).`);
        } else {
            const errorText = await checkRes.text();
            throw new Error(`Failed to check existing release: ${checkRes.statusText}. Details: ${errorText}`);
        }

        // Clean up template from uploadUrl: e.g. "https://uploads.github.com/repos/.../assets{?name,label}"
        const cleanUploadUrl = uploadUrl.replace(/\{\?name,label\}/, '');

        console.log(`Uploading asset to release ${TAG}...`);
        const fileStream = fs.createReadStream(ASSET_PATH);

        const uploadRes = await fetch(`${cleanUploadUrl}?name=${path.basename(ASSET_PATH)}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/octet-stream',
                'Content-Length': fileSize,
                'User-Agent': 'Node.js-Fetch'
            },
            body: fileStream,
            duplex: 'half' // Required for streaming request bodies in modern fetch
        });

        if (!uploadRes.ok) {
            const errorData = await uploadRes.text();
            throw new Error(`Failed to upload asset: ${uploadRes.statusText}. Details: ${errorData}`);
        }

        const assetData = await uploadRes.json();
        console.log(`Asset uploaded successfully! Download URL: ${assetData.browser_download_url}`);
        console.log('GitHub Release Process COMPLETED.');

    } catch (err) {
        console.error('An error occurred during the GitHub Release process:', err.message);
        process.exit(1);
    }
}

main();
