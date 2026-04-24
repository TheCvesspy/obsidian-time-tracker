/**
 * Release script — builds the plugin and copies deployment files to _release/
 * Usage: node release.mjs
 */

import { execSync } from 'child_process';
import { mkdirSync, copyFileSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const releaseDir = join(__dirname, '_release');

console.log('Building plugin...');
try {
	execSync('npm run build', { cwd: __dirname, stdio: 'inherit' });
} catch {
	console.error('Build failed');
	process.exit(1);
}

// Clean and create _release folder
if (existsSync(releaseDir)) {
	rmSync(releaseDir, { recursive: true });
}
mkdirSync(releaseDir);

// Files required for Obsidian plugin deployment
const files = ['main.js', 'manifest.json', 'styles.css'];

for (const file of files) {
	const src = join(__dirname, file);
	const dst = join(releaseDir, file);
	if (existsSync(src)) {
		copyFileSync(src, dst);
		console.log(`  ${file}`);
	} else {
		console.warn(`  ${file} not found, skipping`);
	}
}

console.log(`\nRelease ready in _release/`);

// Deploy to Obsidian vault
const vaultPluginDir = 'C:/Users/on079542/Obsidian Vaults/QuillWork/.obsidian/plugins/obsidian-time-tracker';
if (existsSync(vaultPluginDir)) {
	console.log(`\nDeploying to ${vaultPluginDir}`);
	for (const file of files) {
		const src = join(__dirname, file);
		const dst = join(vaultPluginDir, file);
		if (existsSync(src)) {
			copyFileSync(src, dst);
			console.log(`  ${file}`);
		}
	}
	console.log('Deployed. Reload the plugin in Obsidian.');
} else {
	console.warn(`\nVault plugin dir not found: ${vaultPluginDir}`);
}
