/**
 * System accent color detection for multiple platforms
 */

import { execSync, spawn, ChildProcess } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { isValidHex, normalizeHex } from './colorUtils';

// Store active watcher processes for cleanup
let watcherProcesses: ChildProcess[] = [];

const DEFAULT_ACCENT = '#5B9BD5';

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
 */
function execCommand(command: string): string | null {
  try {
    const result = execSync(command, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim();
  } catch {
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
    // GNOME returns named colors like 'blue', 'green', etc.
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
        
        // Look for accent color definitions
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
  // macOS accent color from defaults
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
    // Format: "r g b" where values are 0.0-1.0
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
  // Windows stores accent color in registry
  const result = execCommand(
    'reg query "HKEY_CURRENT_USER\\SOFTWARE\\Microsoft\\Windows\\DWM" /v AccentColor 2>nul'
  );
  
  if (result) {
    // Format: AccentColor    REG_DWORD    0xaabbggrr (ABGR format)
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
  
  // Try PowerShell approach
  const psResult = execCommand(
    'powershell -Command "[Windows.UI.ViewManagement.UISettings,Windows.UI.ViewManagement,ContentType=WindowsRuntime]::new().GetColorValue([Windows.UI.ViewManagement.UIColorType]::Accent).ToString()" 2>nul'
  );
  
  if (psResult) {
    // Format: #AARRGGBB
    const match = psResult.match(/#[0-9A-Fa-f]{8}/);
    if (match) {
      // Remove alpha channel
      return '#' + match[0].substring(3);
    }
  }
  
  return null;
}

/**
 * Detect the system accent color
 * Tries multiple methods in order of reliability
 */
export function getSystemAccent(): string {
  const platform = process.platform;

  if (platform === 'linux') {
    // Try KDE first (most reliable on KDE)
    const kdeAccent = getKdeAccent();
    if (kdeAccent && isValidHex(kdeAccent)) {
      return normalizeHex(kdeAccent);
    }

    // Try GNOME
    const gnomeAccent = getGnomeAccent();
    if (gnomeAccent && isValidHex(gnomeAccent)) {
      return normalizeHex(gnomeAccent);
    }

    // Try GTK CSS files
    const gtkAccent = getGtkCssAccent();
    if (gtkAccent && isValidHex(gtkAccent)) {
      return normalizeHex(gtkAccent);
    }
  } else if (platform === 'darwin') {
    const macAccent = getMacosAccent();
    if (macAccent && isValidHex(macAccent)) {
      return normalizeHex(macAccent);
    }
  } else if (platform === 'win32') {
    const winAccent = getWindowsAccent();
    if (winAccent && isValidHex(winAccent)) {
      return normalizeHex(winAccent);
    }
  }

  // Default fallback
  return DEFAULT_ACCENT;
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
    // GNOME dconf (harder to watch, but we can try)
    paths.push(join(home, '.config/dconf/user'));
  } else if (platform === 'darwin') {
    // macOS preferences
    paths.push(join(home, 'Library/Preferences/.GlobalPreferences.plist'));
  }
  // Windows uses registry, which we poll instead of watching

  return paths.filter(p => existsSync(p));
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
    // Check if gsettings/dconf is available
    const testResult = execCommand('which dconf 2>/dev/null');
    if (!testResult) {
      return null;
    }

    const proc = spawn('dconf', ['watch', '/org/gnome/desktop/interface/accent-color'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

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
 * Watch for KDE Plasma accent color changes using dbus
 */
function watchKdeAccent(callback: AccentChangeCallback): ChildProcess | null {
  try {
    // Use dbus-monitor to watch for KDE color scheme changes
    const proc = spawn('dbus-monitor', [
      '--session',
      "type='signal',interface='org.kde.KGlobalSettings',member='notifyChange'",
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

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
 * Watch for macOS accent color changes
 */
function watchMacosAccent(callback: AccentChangeCallback): ChildProcess | null {
  try {
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
