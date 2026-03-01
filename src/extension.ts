/**
 * Adapt Icons - VSCode Extension
 * A dynamic icon theme that converts icons to monochrome using system accent color
 * 
 * The extension watches for system accent color changes and automatically
 * regenerates icons when the accent changes.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getSystemAccent, clearAccentCache, startAccentWatcher, stopAccentWatcher, getWatchPaths } from './accentDetector';
import { generateAdaptIconTheme, getLastGeneratedAccent } from './iconThemeGenerator';
import { isValidHex, normalizeHex } from './colorUtils';

let statusBarItem: vscode.StatusBarItem | null = null;
let currentAccent: string | null = null;
let watchInterval: NodeJS.Timeout | null = null;
let fileWatchers: fs.FSWatcher[] = [];
let nativeWatcherActive = false;

// Mutex to prevent concurrent icon regeneration from multiple watchers
let isRegenerating = false;
// Debounce timer for auto-refresh
let autoRefreshDebounceTimer: NodeJS.Timeout | null = null;
const AUTO_REFRESH_DEBOUNCE_MS = 1000;

/**
 * Activate the extension
 */
export function activate(context: vscode.ExtensionContext) {
	console.log('Adapt Icons: Activating...');

	// Create status bar item
	statusBarItem = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Right,
		99,
	);
	statusBarItem.command = 'adaptIcons.refresh';
	context.subscriptions.push(statusBarItem);

	// Register commands
	const refreshCommand = vscode.commands.registerCommand(
		'adaptIcons.refresh',
		() => refreshIcons(context),
	);

	const setAccentCommand = vscode.commands.registerCommand(
		'adaptIcons.setAccent',
		async () => {
			const currentAccent = getConfiguredAccent();
			const input = await vscode.window.showInputBox({
				prompt: 'Enter a hex color (e.g., #3daee9) or leave empty to use system accent',
				placeHolder: '#3daee9',
				value: vscode.workspace.getConfiguration('adaptIcons').get<string>('accentColor') || '',
				validateInput: (value) => {
					if (value === '') return null;
					if (!isValidHex(value)) {
						return 'Please enter a valid hex color (e.g., #3daee9)';
					}
					return null;
				},
			});

			if (input !== undefined) {
				const config = vscode.workspace.getConfiguration('adaptIcons');
				await config.update(
					'accentColor',
					input,
					vscode.ConfigurationTarget.Global,
				);
				// Refresh after setting
				refreshIcons(context);
			}
		},
	);

	const debugCommand = vscode.commands.registerCommand(
		'adaptIcons.debug',
		() => showDebugInfo(context),
	);

	context.subscriptions.push(refreshCommand, setAccentCommand, debugCommand);

	// Update status bar with current state
	updateStatusBar(context);
	
	// Store current accent for change detection
	currentAccent = getConfiguredAccent();

	// Set up watching for system accent changes
	setupWatching(context);

	// Listen for configuration changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('adaptIcons')) {
				// Re-setup watching if config changed
				setupWatching(context);
				updateStatusBar(context);
			}
		}),
	);

	console.log('Adapt Icons: Activated successfully');
}

/**
 * Deactivate the extension
 */
export function deactivate() {
	stopWatching();
	if (statusBarItem) {
		statusBarItem.dispose();
		statusBarItem = null;
	}
}

/**
 * Set up file watching and polling for accent changes
 */
function setupWatching(context: vscode.ExtensionContext) {
	stopWatching();

	const config = vscode.workspace.getConfiguration('adaptIcons');
	const customAccent = config.get<string>('accentColor');

	// Only set up watchers if using system accent (not custom)
	if (customAccent && isValidHex(customAccent)) {
		console.log('Adapt Icons: Using custom accent, skipping system watchers');
		return;
	}

	// Try to start native accent watcher first (most responsive)
	nativeWatcherActive = startAccentWatcher((newAccent: string) => {
		console.log(`Adapt Icons: Native watcher detected accent change to ${newAccent}`);
		if (newAccent !== currentAccent) {
			currentAccent = newAccent;
			refreshIconsAuto(context);
		}
	});

	if (nativeWatcherActive) {
		console.log('Adapt Icons: Native accent watcher started successfully');
	}

	// Set up file watchers for config files as a fallback
	const watchPaths = getWatchPaths();
	for (const watchPath of watchPaths) {
		try {
			const watcher = fs.watch(watchPath, { persistent: false }, () => {
				// Debounce by waiting a short time before refreshing
				setTimeout(() => {
					const newAccent = getSystemAccent();
					if (newAccent !== currentAccent) {
						currentAccent = newAccent;
						refreshIconsAuto(context);
					}
				}, 500);
			});
			fileWatchers.push(watcher);
		} catch (err) {
			// File might not exist or not be watchable, that's ok
			console.log(`Adapt Icons: Could not watch ${watchPath}`);
		}
	}

	// Also poll periodically as a final fallback
	// Use a longer interval if native watcher is active
	const pollInterval = nativeWatcherActive ? 10000 : 5000;
	watchInterval = setInterval(() => {
		const config = vscode.workspace.getConfiguration('adaptIcons');
		const customAccent = config.get<string>('accentColor');

		// Only poll if using system accent (not custom)
		if (!customAccent || !isValidHex(customAccent)) {
			clearAccentCache(); // Clear cache to get fresh value
			const newAccent = getSystemAccent();
			if (newAccent !== currentAccent) {
				currentAccent = newAccent;
				refreshIconsAuto(context);
			}
		}
	}, pollInterval);
}

/**
 * Stop all watching
 */
function stopWatching() {
	if (watchInterval) {
		clearInterval(watchInterval);
		watchInterval = null;
	}

	// Cancel any pending auto-refresh debounce
	if (autoRefreshDebounceTimer) {
		clearTimeout(autoRefreshDebounceTimer);
		autoRefreshDebounceTimer = null;
	}

	for (const watcher of fileWatchers) {
		try {
			watcher.close();
		} catch {
			// Ignore errors closing watchers
		}
	}
	fileWatchers = [];

	// Stop native accent watchers
	if (nativeWatcherActive) {
		stopAccentWatcher();
		nativeWatcherActive = false;
	}
}

/**
 * Automatically refresh icons when accent changes (no user prompt).
 * Debounced to coalesce rapid-fire triggers from multiple watchers.
 */
function refreshIconsAuto(context: vscode.ExtensionContext) {
	// Clear any pending debounce timer
	if (autoRefreshDebounceTimer) {
		clearTimeout(autoRefreshDebounceTimer);
		autoRefreshDebounceTimer = null;
	}

	autoRefreshDebounceTimer = setTimeout(async () => {
		autoRefreshDebounceTimer = null;
		await doRefreshIconsAuto(context);
	}, AUTO_REFRESH_DEBOUNCE_MS);
}

/**
 * Actual auto-refresh implementation, guarded by a mutex to prevent
 * concurrent regeneration from multiple watcher triggers.
 */
async function doRefreshIconsAuto(context: vscode.ExtensionContext) {
	// Prevent concurrent regeneration
	if (isRegenerating) {
		console.log('Adapt Icons: Regeneration already in progress, skipping');
		return;
	}

	const accent = getConfiguredAccent();
	const lastAccent = getLastGeneratedAccent(context.extensionPath);

	// Skip if already up to date
	if (lastAccent === accent) {
		return;
	}

	isRegenerating = true;
	console.log(`Adapt Icons: Auto-refreshing icons from ${lastAccent} to ${accent}`);

	try {
		await generateAdaptIconTheme(context.extensionPath, accent);
		updateStatusBar(context);
		
		// Try automatic theme refresh
		const refreshed = await forceIconThemeRefresh();
		
		if (refreshed) {
			vscode.window.showInformationMessage(
				`Adapt Icons: Updated to ${accent}.`,
			);
		} else {
			// Fallback: offer manual window reload if auto-refresh failed
			vscode.window
				.showInformationMessage(
					`Adapt Icons: Icons updated to ${accent}. Reload to apply.`,
					'Reload Window',
				)
				.then((selection) => {
					if (selection === 'Reload Window') {
						vscode.commands.executeCommand('workbench.action.reloadWindow');
					}
				});
		}
	} catch (error) {
		console.error('Adapt Icons: Auto-refresh failed', error);
	} finally {
		isRegenerating = false;
	}
}

/**
 * Get the configured accent color (custom or system)
 */
function getConfiguredAccent(): string {
	const config = vscode.workspace.getConfiguration('adaptIcons');
	const customAccent = config.get<string>('accentColor');

	if (customAccent && isValidHex(customAccent)) {
		return normalizeHex(customAccent);
	}

	return getSystemAccent();
}

/**
 * Refresh the icons (manual user-triggered refresh)
 */
async function refreshIcons(context: vscode.ExtensionContext) {
	// Prevent concurrent regeneration
	if (isRegenerating) {
		vscode.window.showInformationMessage(
			'Adapt Icons: Icon regeneration already in progress, please wait...',
		);
		return;
	}

	// Cancel any pending auto-refresh debounce
	if (autoRefreshDebounceTimer) {
		clearTimeout(autoRefreshDebounceTimer);
		autoRefreshDebounceTimer = null;
	}

	// Clear accent cache to ensure we get the latest system accent
	clearAccentCache();
	
	const accent = getConfiguredAccent();
	const lastAccent = getLastGeneratedAccent(context.extensionPath);

	// Check if already up to date
	if (lastAccent === accent) {
		const choice = await vscode.window.showInformationMessage(
			`Adapt Icons: Already using ${accent}. Regenerate anyway?`,
			'Regenerate',
			'Cancel',
		);
		if (choice !== 'Regenerate') {
			return;
		}
	}

	isRegenerating = true;

	// Generate icons with progress
	const success = await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: `Adapt Icons: Generating icons with ${accent}...`,
			cancellable: false,
		},
		async (progress) => {
			try {
				progress.report({ increment: 0, message: 'Processing files...' });
				await generateAdaptIconTheme(context.extensionPath, accent);
				progress.report({ increment: 100, message: 'Done!' });
				return true;
			} catch (error) {
				console.error('Adapt Icons: Generation failed', error);
				vscode.window.showErrorMessage(
					`Adapt Icons: Failed to generate icons - ${error}`,
				);
				return false;
			}
		},
	);

	if (success) {
		updateStatusBar(context);
		await promptForReload(accent);
	}

	isRegenerating = false;
}

/**
 * Force VS Code to refresh the icon theme by toggling it off and back on.
 * 
 * VS Code aggressively caches icon theme SVGs. To reliably bust this cache,
 * we switch to a completely different icon theme (not just null), wait for
 * VS Code to fully unload the current theme, then switch back. The delays
 * give VS Code enough time to flush its internal caches and re-read the
 * theme JSON and all referenced SVGs from disk.
 */
async function forceIconThemeRefresh(): Promise<boolean> {
	const workbenchConfig = vscode.workspace.getConfiguration('workbench');
	const currentTheme = workbenchConfig.get<string>('iconTheme');

	if (currentTheme !== 'adapt-icons') {
		return false;
	}

	try {
		// Step 1: Switch to no icon theme to force VS Code to unload all cached SVGs
		await workbenchConfig.update('iconTheme', null, vscode.ConfigurationTarget.Global);
		
		// Step 2: Wait for VS Code to fully process the theme removal.
		// VS Code needs time to: persist the setting, unload theme JSON, release SVG caches.
		// 300ms is enough for the config write + internal cache invalidation.
		await new Promise(resolve => setTimeout(resolve, 300));
		
		// Step 3: Switch back to adapt-icons, which forces a full reload from disk
		await workbenchConfig.update('iconTheme', 'adapt-icons', vscode.ConfigurationTarget.Global);
		
		// Step 4: Give VS Code time to re-read and render the theme before
		// we consider the refresh complete. This prevents any subsequent
		// operations from interfering with the theme load.
		await new Promise(resolve => setTimeout(resolve, 200));
		
		return true;
	} catch (error) {
		console.error('Adapt Icons: Failed to refresh theme', error);
		return false;
	}
}

/**
 * Prompt user to reload VS Code or attempt automatic refresh
 */
async function promptForReload(accent: string) {
	const workbenchConfig = vscode.workspace.getConfiguration('workbench');
	const currentTheme = workbenchConfig.get<string>('iconTheme');

	if (currentTheme !== 'adapt-icons') {
		vscode.window.showInformationMessage(
			`Adapt Icons: Icons generated with ${accent}. Select "Adapt Icons" as your icon theme to use them.`,
		);
		return;
	}

	// Try automatic refresh first
	const refreshed = await forceIconThemeRefresh();
	
	if (refreshed) {
		vscode.window.showInformationMessage(
			`Adapt Icons: Updated to ${accent}.`,
		);
	} else {
		// Fallback to manual reload if automatic refresh fails
		vscode.window
			.showInformationMessage(
				`Adapt Icons: Icons updated to ${accent}. Reload to apply.`,
				'Reload Window',
			)
			.then((selection) => {
				if (selection === 'Reload Window') {
					vscode.commands.executeCommand('workbench.action.reloadWindow');
				}
			});
	}
}

/**
 * Update the status bar item
 */
function updateStatusBar(context: vscode.ExtensionContext) {
	if (!statusBarItem) return;

	const configuredAccent = getConfiguredAccent();
	const lastGenerated = getLastGeneratedAccent(context.extensionPath);

	if (lastGenerated && lastGenerated === configuredAccent) {
		statusBarItem.text = `$(symbol-color) ${configuredAccent}`;
		statusBarItem.tooltip = 'Adapt Icons: Click to refresh icons';
		statusBarItem.backgroundColor = undefined;
	} else if (lastGenerated) {
		statusBarItem.text = `$(sync~spin) ${configuredAccent}`;
		statusBarItem.tooltip = `Adapt Icons: Click to update from ${lastGenerated} to ${configuredAccent}`;
		statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
	} else {
		statusBarItem.text = `$(symbol-color) ${configuredAccent}`;
		statusBarItem.tooltip = 'Adapt Icons: Click to generate icons';
		statusBarItem.backgroundColor = undefined;
	}

	statusBarItem.show();
}

/**
 * Show debug information
 */
function showDebugInfo(context: vscode.ExtensionContext) {
	const configuredAccent = getConfiguredAccent();
	const lastGenerated = getLastGeneratedAccent(context.extensionPath);
	const workbenchConfig = vscode.workspace.getConfiguration('workbench');
	const currentTheme = workbenchConfig.get<string>('iconTheme');
	const config = vscode.workspace.getConfiguration('adaptIcons');

	const debugInfo = [
		'=== Adapt Icons Debug Info ===',
		'',
		`Extension Path: ${context.extensionPath}`,
		`Current Icon Theme: ${currentTheme}`,
		`Using Adapt Icons: ${currentTheme === 'adapt-icons' ? 'Yes' : 'No'}`,
		'',
		`Configured Accent: ${configuredAccent}`,
		`Custom Accent Setting: ${config.get<string>('accentColor') || '(empty - using system)'}`,
		`System Accent: ${getSystemAccent()}`,
		`Last Generated Accent: ${lastGenerated || '(never generated)'}`,
		`Needs Update: ${lastGenerated !== configuredAccent ? 'Yes' : 'No'}`,
		'',
		'To update icons:',
		'1. Run "Adapt Icons: Refresh from System Accent" command',
		'2. Or click the accent color in the status bar',
		'3. Reload window when prompted',
	];

	const outputChannel = vscode.window.createOutputChannel('Adapt Icons');
	outputChannel.clear();
	for (const line of debugInfo) {
		outputChannel.appendLine(line);
	}
	outputChannel.show();
}
