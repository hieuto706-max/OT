const fs = require('fs');
const path = require('path');

const OWNER = 'hieuto706-max';
const REPO = 'OT';
const TAG = 'v1.3.7';

const ASSETS = [
    {
        name: 'ot-manager-Setup-1.3.7.exe',
        path: path.join(__dirname, '..', 'dist', 'ot-manager-Setup-1.3.7.exe'),
        mime: 'application/octet-stream'
    },
    {
        name: 'OT-Manager-mobile.apk',
        path: path.join(__dirname, '..', 'mobile', 'OT-Manager-mobile.apk'),
        mime: 'application/vnd.android.package-archive'
    }
];

async function main() {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        console.error('Error: GITHUB_TOKEN environment variable is required.');
        process.exit(1);
    }

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
                    body: `Automated release for version ${TAG}\n\nOptimized WebView settings, removed unused permissions, and resolved session bug.`,
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

        const cleanUploadUrl = uploadUrl.replace(/\{\?name,label\}/, '');

        for (const asset of ASSETS) {
            if (!fs.existsSync(asset.path)) {
                console.warn(`[Warning] Asset file not found: ${asset.path}. Skipping...`);
                continue;
            }

            const stats = fs.statSync(asset.path);
            const fileSize = stats.size;
            console.log(`\nUploading asset: ${asset.name} (${(fileSize / 1024 / 1024).toFixed(2)} MB)...`);

            // Check if asset already exists in the release and delete it first if it does
            const assetsRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/${releaseId}/assets`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github+json',
                    'User-Agent': 'Node.js-Fetch'
                }
            });

            if (assetsRes.ok) {
                const existingAssets = await assetsRes.json();
                const duplicate = existingAssets.find(a => a.name === asset.name);
                if (duplicate) {
                    console.log(`Asset ${asset.name} already exists in release. Deleting existing asset...`);
                    const deleteRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/assets/${duplicate.id}`, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'User-Agent': 'Node.js-Fetch'
                        }
                    });
                    if (deleteRes.ok) {
                        console.log(`Deleted existing asset ${asset.name}.`);
                    } else {
                        console.warn(`Failed to delete existing asset ${asset.name}: ${deleteRes.statusText}`);
                    }
                }
            }

            const fileStream = fs.createReadStream(asset.path);
            const uploadRes = await fetch(`${cleanUploadUrl}?name=${asset.name}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': asset.mime,
                    'Content-Length': fileSize,
                    'User-Agent': 'Node.js-Fetch'
                },
                body: fileStream,
                duplex: 'half'
            });

            if (!uploadRes.ok) {
                const errorData = await uploadRes.text();
                throw new Error(`Failed to upload asset ${asset.name}: ${uploadRes.statusText}. Details: ${errorData}`);
            }

            const assetData = await uploadRes.json();
            console.log(`Asset ${asset.name} uploaded successfully!`);
            console.log(`Download URL: ${assetData.browser_download_url}`);
        }

        console.log('\nGitHub Release Process COMPLETED.');

    } catch (err) {
        console.error('An error occurred during the GitHub Release process:', err.message);
        process.exit(1);
    }
}

main();
