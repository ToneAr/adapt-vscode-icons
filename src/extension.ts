/**
 * Adaptive Icons - VSCode Extension
 * A dynamic icon theme that converts icons to monochrome using system accent color
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getSystemAccent, getWatchPaths, startAccentWatcher, stopAccentWatcher } from './accentDetector';
import { generateAdaptiveIconTheme, generateFallbackIconTheme } from './iconThemeGenerator';
import { isValidHex, normalizeHex } from './colorUtils';

let currentAccent: string | null = null;
let watchInterval: NodeJS.Timeout | null = null;
let fileWatchers: fs.FSWatcher[] = [];
let statusBarItem: vscode.StatusBarItem | null = null;
let nativeWatcherActive = false;

/**
 * Activate the extension
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('Adaptive Icons: Activating...');
  console.log('Adaptive Icons: Extension path:', context.extensionPath);

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
  statusBarItem.command = 'adaptiveIcons.refresh';
  statusBarItem.tooltip = 'Click to refresh Adaptive Icons';
  context.subscriptions.push(statusBarItem);

  // Register commands
  const refreshCommand = vscode.commands.registerCommand('adaptiveIcons.refresh', () => {
    refreshIcons(context, true);
  });

  const setAccentCommand = vscode.commands.registerCommand('adaptiveIcons.setAccent', async () => {
    const input = await vscode.window.showInputBox({
      prompt: 'Enter a hex color (e.g., #3daee9) or leave empty to use system accent',
      placeHolder: '#3daee9',
      validateInput: (value) => {
        if (value === '') return null;
        if (!isValidHex(value)) {
          return 'Please enter a valid hex color (e.g., #3daee9)';
        }
        return null;
      },
    });

    if (input !== undefined) {
      const config = vscode.workspace.getConfiguration('adaptiveIcons');
      await config.update('accentColor', input, vscode.ConfigurationTarget.Global);
      refreshIcons(context, true);
    }
  });

  const setIconSourceCommand = vscode.commands.registerCommand('adaptiveIcons.setIconSource', async () => {
    const options: vscode.OpenDialogOptions = {
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Select Icon Theme Source',
      title: 'Select the root folder of your icon theme (e.g., a-wl-file-icon-vscode)',
    };

    const folderUri = await vscode.window.showOpenDialog(options);
    if (folderUri && folderUri[0]) {
      const folderPath = folderUri[0].fsPath;
      
      // Validate that this looks like an icon theme
      const iconGeneratorPath = path.join(folderPath, 'iconGenerator', 'assets', 'icons');
      if (!fs.existsSync(iconGeneratorPath)) {
        vscode.window.showWarningMessage(
          `The selected folder doesn't appear to contain an icon theme. Expected to find: ${iconGeneratorPath}`
        );
        return;
      }

      const config = vscode.workspace.getConfiguration('adaptiveIcons');
      await config.update('iconThemeSourcePath', folderPath, vscode.ConfigurationTarget.Global);
      
      vscode.window.showInformationMessage(
        `Adaptive Icons: Icon theme source set to ${folderPath}. Regenerating icons...`
      );
      
      refreshIcons(context, true);
    }
  });

  const debugCommand = vscode.commands.registerCommand('adaptiveIcons.debug', async () => {
    const config = vscode.workspace.getConfiguration('adaptiveIcons');
    const iconThemeSourcePath = config.get<string>('iconThemeSourcePath', '');
    
    const debugInfo = [
      `Extension Path: ${context.extensionPath}`,
      `Icon Source Path: ${iconThemeSourcePath}`,
      `Current Accent: ${currentAccent}`,
      `Icons Directory: ${path.join(context.extensionPath, 'icons')}`,
      `Theme JSON: ${path.join(context.extensionPath, 'themes', 'adaptive-icons.json')}`,
    ];
    
    // Check if icons exist
    const iconsDir = path.join(context.extensionPath, 'icons', 'files');
    if (fs.existsSync(iconsDir)) {
      const files = fs.readdirSync(iconsDir);
      debugInfo.push(`Icon files count: ${files.length}`);
      
      // Check a sample icon color
      const sampleIcon = path.join(iconsDir, 'java.svg');
      if (fs.existsSync(sampleIcon)) {
        const content = fs.readFileSync(sampleIcon, 'utf-8');
        const fillMatch = content.match(/fill="(#[0-9a-fA-F]+)"/);
        debugInfo.push(`Sample icon (java.svg) color: ${fillMatch ? fillMatch[1] : 'not found'}`);
      }
    } else {
      debugInfo.push('Icons directory not found!');
    }
    
    // Show in output channel
    const outputChannel = vscode.window.createOutputChannel('Adaptive Icons Debug');
    outputChannel.clear();
    outputChannel.appendLine('=== Adaptive Icons Debug Info ===');
    for (const line of debugInfo) {
      outputChannel.appendLine(line);
    }
    outputChannel.show();
    
    vscode.window.showInformationMessage('Debug info written to Output panel (Adaptive Icons Debug)');
  });

  context.subscriptions.push(refreshCommand, setAccentCommand, setIconSourceCommand, debugCommand);

  // Listen for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('adaptiveIcons')) {
        refreshIcons(context, false);
        setupWatching(context);
      }
    })
  );

  // Initial icon generation
  refreshIcons(context, false);

  // Set up watching for system accent changes
  setupWatching(context);

  console.log('Adaptive Icons: Activated successfully');
}

/**
 * Deactivate the extension
 */
export function deactivate() {
  stopWatching();
  if (statusBarItem) {
    statusBarItem.dispose();
  }
}

/**
 * Refresh the icons
 */
function refreshIcons(context: vscode.ExtensionContext, showNotification: boolean) {
  const config = vscode.workspace.getConfiguration('adaptiveIcons');
  const customAccent = config.get<string>('accentColor');

  let accent: string;

  if (customAccent && isValidHex(customAccent)) {
    accent = normalizeHex(customAccent);
  } else {
    accent = getSystemAccent();
  }

  // Only regenerate if accent changed
  if (accent === currentAccent && !showNotification) {
    return;
  }

  const previousAccent = currentAccent;
  currentAccent = accent;

  // Generate icons
  try {
    const iconThemeSourcePath = config.get<string>('iconThemeSourcePath', '');
    
    console.log('Adaptive Icons: Generating icons...');
    console.log('Adaptive Icons: Extension path:', context.extensionPath);
    console.log('Adaptive Icons: Icon source path:', iconThemeSourcePath);
    console.log('Adaptive Icons: Accent color:', accent);
    
    if (iconThemeSourcePath && fs.existsSync(iconThemeSourcePath)) {
      const iconSourceDir = path.join(iconThemeSourcePath, 'iconGenerator', 'assets', 'icons');
      if (fs.existsSync(iconSourceDir)) {
        generateAdaptiveIconTheme(context.extensionPath, iconThemeSourcePath, accent);
        console.log('Adaptive Icons: Full icon theme generated successfully');
        
        // Log a sample icon to verify color
        const sampleIcon = path.join(context.extensionPath, 'icons', 'files', 'java.svg');
        if (fs.existsSync(sampleIcon)) {
          const content = fs.readFileSync(sampleIcon, 'utf-8');
          const fillMatch = content.match(/fill="(#[0-9a-fA-F]+)"/);
          console.log('Adaptive Icons: Sample icon (java.svg) fill color:', fillMatch ? fillMatch[1] : 'not found');
        }
      } else {
        console.log('Adaptive Icons: Icon source not found, using fallback icons');
        generateFallbackIconTheme(context.extensionPath, accent);
      }
    } else {
      generateFallbackIconTheme(context.extensionPath, accent);
      console.log('Adaptive Icons: Fallback icon theme generated');
    }

    // Update status bar
    if (statusBarItem) {
      statusBarItem.text = `$(file-media) ${accent}`;
      statusBarItem.show();
    }

    const accentChanged = previousAccent && previousAccent !== accent;
    
    if (showNotification || accentChanged) {
      vscode.window.showInformationMessage(
        `Adaptive Icons: Updated to accent color ${accent}`
      );
    }

    // Prompt to reload if necessary
    promptReloadIfNeeded(accentChanged || showNotification);
  } catch (error) {
    console.error('Adaptive Icons: Error generating icons', error);
    vscode.window.showErrorMessage(
      `Adaptive Icons: Failed to generate icons - ${error}`
    );
  }
}

/**
 * Prompt user to reload VSCode to apply icon changes
 */
function promptReloadIfNeeded(forceReload: boolean = false) {
  const currentIconTheme = vscode.workspace.getConfiguration('workbench').get<string>('iconTheme');
  const config = vscode.workspace.getConfiguration('adaptiveIcons');
  const autoReload = config.get<boolean>('autoReload', false);
  
  const usingAdaptiveIcons = currentIconTheme === 'adaptive-icons';
  
  // If auto-reload is enabled and we're using adaptive icons, reload automatically
  if (usingAdaptiveIcons && autoReload && forceReload) {
    vscode.commands.executeCommand('workbench.action.reloadWindow');
    return;
  }
  
  if (usingAdaptiveIcons) {
    vscode.window
      .showInformationMessage(
        'Adaptive Icons have been updated. Reload to apply changes?',
        'Reload Window',
        'Always Reload'
      )
      .then((selection) => {
        if (selection === 'Reload Window') {
          vscode.commands.executeCommand('workbench.action.reloadWindow');
        } else if (selection === 'Always Reload') {
          config.update('autoReload', true, vscode.ConfigurationTarget.Global);
          vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
      });
  }
}

/**
 * Set up file watching and polling for accent changes
 */
function setupWatching(context: vscode.ExtensionContext) {
  stopWatching();

  const config = vscode.workspace.getConfiguration('adaptiveIcons');
  const watchEnabled = config.get<boolean>('watchSystemAccent', true);

  if (!watchEnabled) {
    return;
  }

  const interval = config.get<number>('watchInterval', 5000);
  const customAccent = config.get<string>('accentColor');

  // Only set up watchers if using system accent (not custom)
  if (customAccent && isValidHex(customAccent)) {
    console.log('Adaptive Icons: Using custom accent, skipping system watchers');
    return;
  }

  // Try to start native accent watcher first
  nativeWatcherActive = startAccentWatcher((newAccent: string) => {
    console.log(`Adaptive Icons: Native watcher detected accent change to ${newAccent}`);
    if (newAccent !== currentAccent) {
      refreshIcons(context, false);
    }
  });

  if (nativeWatcherActive) {
    console.log('Adaptive Icons: Native accent watcher started successfully');
  }

  // Set up file watchers for config files as a fallback
  const watchPaths = getWatchPaths();
  for (const watchPath of watchPaths) {
    try {
      const watcher = fs.watch(watchPath, { persistent: false }, () => {
        setTimeout(() => {
          refreshIcons(context, false);
        }, 500);
      });
      fileWatchers.push(watcher);
    } catch (err) {
      console.log(`Adaptive Icons: Could not watch ${watchPath}`, err);
    }
  }

  // Also poll periodically as a final fallback
  const pollInterval = nativeWatcherActive ? interval * 2 : interval;
  watchInterval = setInterval(() => {
    const config = vscode.workspace.getConfiguration('adaptiveIcons');
    const customAccent = config.get<string>('accentColor');

    if (!customAccent || !isValidHex(customAccent)) {
      const newAccent = getSystemAccent();
      if (newAccent !== currentAccent) {
        refreshIcons(context, false);
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

  for (const watcher of fileWatchers) {
    try {
      watcher.close();
    } catch {
      // Ignore errors closing watchers
    }
  }
  fileWatchers = [];

  if (nativeWatcherActive) {
    stopAccentWatcher();
    nativeWatcherActive = false;
  }
}
