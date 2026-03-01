/**
 * System accent color detection for multiple platforms
 * 
 * This module provides accent color detection and watching for changes.
 * 
 * All external command executions are wrapped in try-catch with timeouts
 * to prevent crashes if system state changes during detection.
 */

import { execSync, spawn, ChildProcess } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { isValidHex, normalizeHex } from './colorUtils';

// Store active watcher processes for cleanup
let watcherProcesses: ChildProcess[] = [];

const DEFAULT_ACCENT = '#5B9BD5';

// Cache the last successfully detected accent to prevent crashes on repeated failures
let cachedAccent: string | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 30000; // Cache for 30 seconds

// GNOME named accent colors mapping
const GNOME_COLORS: Record<string, string> = {
  blue: '#3584e4',
  green: '#33d17a',
  yellow: '#f6d32d',
  orange: '#ff7800',
  red: '#e01b24',
  purple: '#9141ac',
  pink: '#e5a8e8',
  brown: '#986a44',
  slate: '#99c1f1',
  teal: '#56b6c2',
};

/**
 * Execute a shell command and return the output
 * Wrapped in multiple layers of error handling to prevent crashes
 */
function execCommand(command: string): string | null {
  try {
    const result = execSync(command, {
      encoding: 'utf-8',
      timeout: 2000, // Reduced timeout to 2 seconds
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true, // Hide console window on Windows
      maxBuffer: 1024 * 1024, // 1MB buffer limit
    });
    return result?.trim() || null;
  } catch {
    // Silently fail - this is expected if the command doesn't exist or times out
    return null;
  }
}

/**
 * Try to get accent color from KDE Plasma
 */
function getKdeAccent(): string | null {
  // Try kreadconfig5 (KDE 5)
  let result = execCommand('kreadconfig5 --file kdeglobals --group General --key AccentColor 2>/dev/null');
  
  // Try kreadconfig6 (KDE 6)
  if (!result) {
    result = execCommand('kreadconfig6 --file kdeglobals --group General --key AccentColor 2>/dev/null');
  }

  if (result) {
    // KDE format: "r,g,b" - convert to hex
    const match = result.match(/(\d+),(\d+),(\d+)/);
    if (match) {
      const r = parseInt(match[1], 10);
      const g = parseInt(match[2], 10);
      const b = parseInt(match[3], 10);
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
  }
  return null;
}

/**
 * Try to get accent color from GNOME/GTK settings
 */
function getGnomeAccent(): string | null {
  const result = execCommand('gsettings get org.gnome.desktop.interface accent-color 2>/dev/null');
  
  if (result) {
    const colorName = result.replace(/['"]/g, '').trim();
    if (GNOME_COLORS[colorName]) {
      return GNOME_COLORS[colorName];
    }
  }
  return null;
}

/**
 * Try to get accent color from GTK CSS files
 */
function getGtkCssAccent(): string | null {
  const home = homedir();
  const gtkPaths = [
    join(home, '.config/gtk-3.0/gtk.css'),
    join(home, '.config/gtk-4.0/gtk.css'),
  ];

  for (const cssPath of gtkPaths) {
    if (existsSync(cssPath)) {
      try {
        const content = readFileSync(cssPath, 'utf-8');
        
        const patterns = [
          /@define-color\s+accent_color\s+(#[0-9a-fA-F]{6})/,
          /@define-color\s+accent_bg_color\s+(#[0-9a-fA-F]{6})/,
          /@define-color\s+theme_selected_bg_color\s+(#[0-9a-fA-F]{6})/,
        ];

        for (const pattern of patterns) {
          const match = content.match(pattern);
          if (match && match[1]) {
            return normalizeHex(match[1]);
          }
        }
      } catch {
        // Continue to next file
      }
    }
  }
  return null;
}

/**
 * Try to get accent color from macOS
 */
function getMacosAccent(): string | null {
  const result = execCommand('defaults read -g AppleAccentColor 2>/dev/null');
  
  if (result !== null) {
    const macosColors: Record<string, string> = {
      '-1': '#8e8e93', // Graphite
      '0': '#ff3b30',  // Red
      '1': '#ff9500',  // Orange
      '2': '#ffcc00',  // Yellow
      '3': '#28cd41',  // Green
      '4': '#007aff',  // Blue
      '5': '#af52de',  // Purple
      '6': '#ff2d55',  // Pink
    };
    
    if (macosColors[result]) {
      return macosColors[result];
    }
  }
  
  // Fallback: try reading from NSColorPanel
  const nsResult = execCommand('defaults read NSGlobalDomain AppleHighlightColor 2>/dev/null');
  if (nsResult) {
    const parts = nsResult.split(' ');
    if (parts.length >= 3) {
      const r = Math.round(parseFloat(parts[0]) * 255);
      const g = Math.round(parseFloat(parts[1]) * 255);
      const b = Math.round(parseFloat(parts[2]) * 255);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      }
    }
  }
  
  return null;
}

/**
 * Try to get accent color from Windows
 */
function getWindowsAccent(): string | null {
  const result = execCommand(
    'reg query "HKEY_CURRENT_USER\\SOFTWARE\\Microsoft\\Windows\\DWM" /v AccentColor 2>nul'
  );
  
  if (result) {
    const match = result.match(/AccentColor\s+REG_DWORD\s+0x([0-9a-fA-F]+)/i);
    if (match) {
      const abgr = parseInt(match[1], 16);
      // Extract RGB from ABGR (Windows stores as AABBGGRR)
      const r = abgr & 0xff;
      const g = (abgr >> 8) & 0xff;
      const b = (abgr >> 16) & 0xff;
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
  }
  
  return null;
}

/**
 * Detect the system accent color
 * Tries multiple methods in order of reliability
 * 
 * Uses caching to prevent excessive system calls and to provide
 * a stable fallback if detection fails during system changes.
 */
export function getSystemAccent(): string {
  // Return cached value if still valid
  const now = Date.now();
  if (cachedAccent && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedAccent;
  }

  let detectedAccent: string | null = null;

  try {
    const platform = process.platform;

    if (platform === 'linux') {
      // Try KDE first (most reliable on KDE)
      const kdeAccent = getKdeAccent();
      if (kdeAccent && isValidHex(kdeAccent)) {
        detectedAccent = normalizeHex(kdeAccent);
      }

      // Try GNOME
      if (!detectedAccent) {
        const gnomeAccent = getGnomeAccent();
        if (gnomeAccent && isValidHex(gnomeAccent)) {
          detectedAccent = normalizeHex(gnomeAccent);
        }
      }

      // Try GTK CSS files
      if (!detectedAccent) {
        const gtkAccent = getGtkCssAccent();
        if (gtkAccent && isValidHex(gtkAccent)) {
          detectedAccent = normalizeHex(gtkAccent);
        }
      }
    } else if (platform === 'darwin') {
      const macAccent = getMacosAccent();
      if (macAccent && isValidHex(macAccent)) {
        detectedAccent = normalizeHex(macAccent);
      }
    } else if (platform === 'win32') {
      const winAccent = getWindowsAccent();
      if (winAccent && isValidHex(winAccent)) {
        detectedAccent = normalizeHex(winAccent);
      }
    }
  } catch (error) {
    // If any error occurs during detection, fall back to cache or default
    console.error('Adapt Icons: Error detecting system accent', error);
  }

  // Update cache
  if (detectedAccent) {
    cachedAccent = detectedAccent;
    cacheTimestamp = now;
    return detectedAccent;
  }

  // If detection failed but we have a cached value, return it
  if (cachedAccent) {
    return cachedAccent;
  }

  // Final fallback
  return DEFAULT_ACCENT;
}

/**
 * Clear the accent cache - useful when the user explicitly wants to refresh
 */
export function clearAccentCache(): void {
  cachedAccent = null;
  cacheTimestamp = 0;
}

/**
 * Get paths to watch for accent color changes
 */
export function getWatchPaths(): string[] {
  const paths: string[] = [];
  const home = homedir();
  const platform = process.platform;

  if (platform === 'linux') {
    // KDE config
    paths.push(join(home, '.config/kdeglobals'));
    // GTK configs
    paths.push(join(home, '.config/gtk-3.0/gtk.css'));
    paths.push(join(home, '.config/gtk-4.0/gtk.css'));
    // GNOME dconf
    paths.push(join(home, '.config/dconf/user'));
  } else if (platform === 'darwin') {
    // macOS preferences
    paths.push(join(home, 'Library/Preferences/.GlobalPreferences.plist'));
  }
  // Windows uses registry, which we poll instead of watching

  return paths.filter((p) => existsSync(p));
}

/**
 * Callback type for accent change notifications
 */
export type AccentChangeCallback = (newAccent: string) => void;

/**
 * Watch for GNOME accent color changes using dconf watch
 */
function watchGnomeAccent(callback: AccentChangeCallback): ChildProcess | null {
  try {
    // Check if dconf is available
    const testResult = execCommand('which dconf 2>/dev/null');
    if (!testResult) {
      return null;
    }

    const proc = spawn(
      'dconf',
      ['watch', '/org/gnome/desktop/interface/accent-color'],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let buffer = '';
    proc.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString();
      // dconf watch outputs path on one line, then value on next
      const lines = buffer.split('\n');
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        // Look for the value line (starts with ')
        if (line.startsWith("'") && line.endsWith("'")) {
          const colorName = line.replace(/'/g, '');
          if (GNOME_COLORS[colorName]) {
            callback(GNOME_COLORS[colorName]);
          }
        }
      }
      // Keep incomplete line in buffer
      buffer = lines[lines.length - 1];
    });

    proc.on('error', () => {
      // Process failed to start, ignore
    });

    watcherProcesses.push(proc);
    return proc;
  } catch {
    return null;
  }
}

/**
 * Watch for KDE Plasma accent color changes using dbus-monitor
 */
function watchKdeAccent(callback: AccentChangeCallback): ChildProcess | null {
  try {
    // Use dbus-monitor to watch for KDE color scheme changes
    const proc = spawn(
      'dbus-monitor',
      [
        '--session',
        "type='signal',interface='org.kde.KGlobalSettings',member='notifyChange'",
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    proc.stdout?.on('data', () => {
      // When we get any signal, re-read the accent color
      const accent = getKdeAccent();
      if (accent && isValidHex(accent)) {
        callback(normalizeHex(accent));
      }
    });

    proc.on('error', () => {
      // Process failed to start, ignore
    });

    watcherProcesses.push(proc);
    return proc;
  } catch {
    return null;
  }
}

/**
 * Watch for macOS accent color changes using notifyutil
 */
function watchMacosAccent(callback: AccentChangeCallback): ChildProcess | null {
  try {
    // Use a background process that watches for AppleInterfaceThemeChangedNotification
    const script = `
      while true; do
        /usr/bin/notifyutil -1 "AppleInterfaceThemeChangedNotification"
        echo "CHANGED"
      done
    `;

    const proc = spawn('bash', ['-c', script], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.stdout?.on('data', (data: Buffer) => {
      if (data.toString().includes('CHANGED')) {
        const accent = getMacosAccent();
        if (accent && isValidHex(accent)) {
          callback(normalizeHex(accent));
        }
      }
    });

    proc.on('error', () => {
      // Process failed to start, ignore
    });

    watcherProcesses.push(proc);
    return proc;
  } catch {
    return null;
  }
}

/**
 * Watch for Windows accent color changes using PowerShell event subscription
 */
function watchWindowsAccent(callback: AccentChangeCallback): ChildProcess | null {
  try {
    // PowerShell script to watch for accent color changes via WMI events
    const psScript = `
      Add-Type -AssemblyName System.Windows.Forms
      $query = "SELECT * FROM RegistryValueChangeEvent WHERE Hive='HKEY_USERS' AND KeyPath='%s\\\\SOFTWARE\\\\Microsoft\\\\Windows\\\\DWM' AND ValueName='AccentColor'"
      $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
      $finalQuery = $query -replace '%s', $sid

      $watcher = New-Object System.Management.ManagementEventWatcher $finalQuery
      while ($true) {
        $event = $watcher.WaitForNextEvent()
        Write-Host "ACCENT_CHANGED"
      }
    `;

    const proc = spawn('powershell', ['-NoProfile', '-Command', psScript], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.stdout?.on('data', (data: Buffer) => {
      if (data.toString().includes('ACCENT_CHANGED')) {
        const accent = getWindowsAccent();
        if (accent && isValidHex(accent)) {
          callback(normalizeHex(accent));
        }
      }
    });

    proc.on('error', () => {
      // Process failed to start, ignore
    });

    watcherProcesses.push(proc);
    return proc;
  } catch {
    return null;
  }
}

/**
 * Start watching for system accent color changes
 * Returns true if at least one watcher was started successfully
 */
export function startAccentWatcher(callback: AccentChangeCallback): boolean {
  const platform = process.platform;
  let started = false;

  if (platform === 'linux') {
    // Try both GNOME and KDE watchers - one of them should work
    const gnomeProc = watchGnomeAccent(callback);
    const kdeProc = watchKdeAccent(callback);
    started = gnomeProc !== null || kdeProc !== null;
  } else if (platform === 'darwin') {
    const macProc = watchMacosAccent(callback);
    started = macProc !== null;
  } else if (platform === 'win32') {
    const winProc = watchWindowsAccent(callback);
    started = winProc !== null;
  }

  return started;
}

/**
 * Stop all accent color watchers and clean up processes
 */
export function stopAccentWatcher(): void {
  for (const proc of watcherProcesses) {
    try {
      proc.kill('SIGTERM');
    } catch {
      // Ignore errors when killing processes
    }
  }
  watcherProcesses = [];
}
